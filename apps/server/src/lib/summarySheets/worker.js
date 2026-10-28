import fs from 'node:fs';
import path from 'node:path';
import { extractPdfPages } from './pdf.js';
import { resolveSummaryKey, removeSummaryKey } from './storage.js';

const MAX_CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.SUMMARY_SHEET_CONCURRENCY ?? 2)));
const MAX_ATTEMPTS = Math.max(1, Number(process.env.SUMMARY_SHEET_MAX_ATTEMPTS ?? 3));
const STALL_MINUTES = Math.max(5, Number(process.env.SUMMARY_SHEET_STALL_TIMEOUT_MINUTES ?? 60));

const queue = [];
const queued = new Set();
let active = 0;
let prismaRef = null;
let initialized = false;
let pumping = false;

export function initSummarySheetWorker(prisma) {
  prismaRef = prisma;
  if (initialized) return;
  initialized = true;

  ensureSearchIndexes(prisma).catch(err => {
    console.warn('[summary-sheets] search index setup skipped:', err?.message ?? err);
  });
  recoverQueue(prisma).catch(err => {
    console.warn('[summary-sheets] recovery failed:', err?.message ?? err);
  });
  recoverStalled(prisma).catch(() => {});
  setInterval(() => recoverStalled(prisma).catch(() => {}), 10 * 60 * 1000).unref?.();
}

async function ensureSearchIndexes(prisma) {
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm').catch(() => {});
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "SummarySheetPage_fts_idx" ON "SummarySheetPage" USING GIN (to_tsvector('english', coalesce("text", '')))`
  ).catch(() => {});
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "SummarySheetPage_text_trgm_idx" ON "SummarySheetPage" USING GIN ("text" gin_trgm_ops)`
  ).catch(() => {});
}

export async function recoverQueue(prisma) {
  const pending = await prisma.summarySheet.findMany({
    where: { sourceType: 'UPLOADED_PDF', processingStatus: { in: ['UPLOADED', 'INDEXING'] } },
    select: { id: true }
  }).catch(() => []);
  pending.forEach(sheet => enqueueSummarySheet(sheet.id));
}

export async function recoverStalled(prisma) {
  const cutoff = new Date(Date.now() - STALL_MINUTES * 60 * 1000);
  const stalled = await prisma.summarySheet.findMany({
    where: {
      sourceType: 'UPLOADED_PDF',
      processingStatus: 'INDEXING',
      updatedAt: { lt: cutoff }
    },
    select: { id: true }
  }).catch(() => []);
  for (const sheet of stalled) {
    await prisma.summarySheet.update({
      where: { id: sheet.id },
      data: {
        processingStatus: 'FAILED',
        searchIndexStatus: 'FAILED',
        processingError: 'PDF indexing stalled or was interrupted. Retry indexing to try again.'
      }
    }).catch(() => {});
  }
  return stalled.length;
}

export function enqueueSummarySheet(id) {
  if (!prismaRef || !id || queued.has(id)) return;
  queued.add(id);
  queue.push(id);
  pump();
}

function pump() {
  if (!prismaRef || pumping) return;
  pumping = true;
  try {
    while (active < MAX_CONCURRENCY && queue.length) {
      const id = queue.shift();
      queued.delete(id);
      active += 1;
      processSummarySheet(prismaRef, id)
        .catch(err => console.error('[summary-sheets] processing error', id, err))
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  } finally {
    pumping = false;
  }
}

export async function processSummarySheet(prisma, id) {
  const sheet = await prisma.summarySheet.findUnique({
    where: { id },
    select: {
      id: true,
      pdfStorageKey: true,
      pendingPdfKey: true,
      pendingPdfHash: true,
      pendingPdfSize: true,
      pendingPdfVersion: true,
      pendingFilename: true,
      originalFilename: true,
      processingAttempts: true
    }
  });
  if (!sheet) return;

  const sourceKey = sheet.pendingPdfKey || sheet.pdfStorageKey;
  if (!sourceKey) {
    await prisma.summarySheet.update({
      where: { id },
      data: {
        processingStatus: 'FAILED',
        searchIndexStatus: 'FAILED',
        processingError: 'Original PDF file is missing.'
      }
    }).catch(() => {});
    return;
  }

  const attempts = (sheet.processingAttempts || 0) + 1;
  if (attempts > MAX_ATTEMPTS) {
    await prisma.summarySheet.update({
      where: { id },
      data: {
        processingStatus: 'FAILED',
        searchIndexStatus: 'FAILED',
        processingError: 'PDF indexing exceeded the maximum number of attempts.'
      }
    }).catch(() => {});
    return;
  }

  await prisma.summarySheet.update({
    where: { id },
    data: {
      processingStatus: 'INDEXING',
      searchIndexStatus: 'INDEXING',
      processingAttempts: attempts,
      processingError: null
    }
  });

  try {
    const absolute = resolveSummaryKey(sourceKey);
    if (!fs.existsSync(absolute)) throw new Error('Original PDF file is missing from storage.');
    const buffer = await fs.promises.readFile(absolute);
    const parsed = await extractPdfPages(buffer);
    if (!parsed.pages.length) throw new Error('No pages could be read from this PDF.');

    const previousKey = sheet.pdfStorageKey;
    const nextKey = sheet.pendingPdfKey || sheet.pdfStorageKey;
    const nextVersion = sheet.pendingPdfVersion || `pdf-${Date.now().toString(36)}`;

    await prisma.$transaction([
      prisma.summarySheetPage.deleteMany({ where: { summarySheetId: id } }),
      prisma.summarySheetPage.createMany({
        data: parsed.pages.map(page => ({
          summarySheetId: id,
          pageNumber: page.pageNumber,
          text: page.text || null,
          normalizedText: page.normalizedText || null
        }))
      }),
      prisma.summarySheet.update({
        where: { id },
        data: {
          pdfStorageKey: nextKey,
          originalFilename: sheet.pendingFilename || sheet.originalFilename,
          pdfFileHash: sheet.pendingPdfHash || undefined,
          pdfFileSize: sheet.pendingPdfSize ?? undefined,
          pdfVersion: nextVersion,
          pdfPageCount: parsed.pageCount,
          processingStatus: 'READY',
          searchIndexStatus: 'READY',
          processingError: null,
          processingWarning: parsed.warning,
          searchIndexedAt: new Date(),
          pendingPdfKey: null,
          pendingPdfHash: null,
          pendingPdfSize: null,
          pendingPdfVersion: null,
          pendingFilename: null
        }
      })
    ]);

    if (previousKey && previousKey !== nextKey) removeSummaryKey(previousKey);
    console.log(`[summary-sheets] indexed ${id}: ${parsed.pageCount} pages, ${parsed.textLength} chars`);
  } catch (err) {
    const message = String(err?.message || err).slice(0, 4000);
    await prisma.summarySheet.update({
      where: { id },
      data: {
        processingStatus: 'FAILED',
        searchIndexStatus: 'FAILED',
        processingError: message
      }
    }).catch(() => {});
    // Keep pending file/key so an administrator can retry after correcting
    // permissions or replacing the file. Never delete the old working PDF.
    console.error(`[summary-sheets] failed ${id}:`, message);
  }
}
