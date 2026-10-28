import fs from 'node:fs';
import path from 'node:path';
import { extractPdfPages } from './pdf.js';
import { resolveFormulaBookKey, removeFormulaBookKey } from './storage.js';

const MAX_CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.FORMULA_BOOK_CONCURRENCY ?? 2)));
const MAX_ATTEMPTS = Math.max(1, Number(process.env.FORMULA_BOOK_MAX_ATTEMPTS ?? 3));
const STALL_MINUTES = Math.max(5, Number(process.env.FORMULA_BOOK_STALL_TIMEOUT_MINUTES ?? 60));

const queue = [];
const queued = new Set();
let active = 0;
let prismaRef = null;
let initialized = false;
let pumping = false;

export function initFormulaBookPdfWorker(prisma) {
  prismaRef = prisma;
  if (initialized) return;
  initialized = true;

  ensureSearchIndexes(prisma).catch(err => {
    console.warn('[formula-books] search index setup skipped:', err?.message ?? err);
  });
  recoverQueue(prisma).catch(err => {
    console.warn('[formula-books] recovery failed:', err?.message ?? err);
  });
  recoverStalled(prisma).catch(() => {});
  setInterval(() => recoverStalled(prisma).catch(() => {}), 10 * 60 * 1000).unref?.();
}

async function ensureSearchIndexes(prisma) {
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm').catch(() => {});
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "FormulaBookPdfPage_fts_idx" ON "FormulaBookPdfPage" USING GIN (to_tsvector('english', coalesce("text", '')))`
  ).catch(() => {});
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "FormulaBookPdfPage_text_trgm_idx" ON "FormulaBookPdfPage" USING GIN ("text" gin_trgm_ops)`
  ).catch(() => {});
}

export async function recoverQueue(prisma) {
  const pending = await prisma.formulaBookPdf.findMany({
    where: { processingStatus: { in: ['UPLOADED', 'INDEXING'] } },
    select: { id: true }
  }).catch(() => []);
  pending.forEach(sheet => enqueueFormulaBookPdf(sheet.id));
}

export async function recoverStalled(prisma) {
  const cutoff = new Date(Date.now() - STALL_MINUTES * 60 * 1000);
  const stalled = await prisma.formulaBookPdf.findMany({
    where: {
      processingStatus: 'INDEXING',
      updatedAt: { lt: cutoff }
    },
    select: { id: true }
  }).catch(() => []);
  for (const sheet of stalled) {
    await prisma.formulaBookPdf.update({
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

export function enqueueFormulaBookPdf(id) {
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
      processFormulaBookPdf(prismaRef, id)
        .catch(err => console.error('[formula-books] processing error', id, err))
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  } finally {
    pumping = false;
  }
}

export async function processFormulaBookPdf(prisma, id) {
  const sheet = await prisma.formulaBookPdf.findUnique({
    where: { id },
    select: {
      id: true,
      storageKey: true,
      pendingStorageKey: true,
      pendingFileHash: true,
      pendingFileSize: true,
      pendingPdfVersion: true,
      pendingFilename: true,
      originalFilename: true,
      processingAttempts: true
    }
  });
  if (!sheet) return;

  const sourceKey = sheet.pendingStorageKey || sheet.storageKey;
  if (!sourceKey) {
    await prisma.formulaBookPdf.update({
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
    await prisma.formulaBookPdf.update({
      where: { id },
      data: {
        processingStatus: 'FAILED',
        searchIndexStatus: 'FAILED',
        processingError: 'PDF indexing exceeded the maximum number of attempts.'
      }
    }).catch(() => {});
    return;
  }

  await prisma.formulaBookPdf.update({
    where: { id },
    data: {
      processingStatus: 'INDEXING',
      searchIndexStatus: 'INDEXING',
      processingAttempts: attempts,
      processingError: null
    }
  });

  try {
    const absolute = resolveFormulaBookKey(sourceKey);
    if (!fs.existsSync(absolute)) throw new Error('Original PDF file is missing from storage.');
    const buffer = await fs.promises.readFile(absolute);
    const parsed = await extractPdfPages(buffer);
    if (!parsed.pages.length) throw new Error('No pages could be read from this PDF.');

    const previousKey = sheet.storageKey;
    const nextKey = sheet.pendingStorageKey || sheet.storageKey;
    const nextVersion = sheet.pendingPdfVersion || `pdf-${Date.now().toString(36)}`;

    await prisma.$transaction([
      prisma.formulaBookPdfPage.deleteMany({ where: { formulaBookPdfId: id } }),
      prisma.formulaBookPdfPage.createMany({
        data: parsed.pages.map(page => ({
          formulaBookPdfId: id,
          pageNumber: page.pageNumber,
          text: page.text || null,
          normalizedText: page.normalizedText || null
        }))
      }),
      prisma.formulaBookPdf.update({
        where: { id },
        data: {
          storageKey: nextKey,
          originalFilename: sheet.pendingFilename || sheet.originalFilename,
          fileHash: sheet.pendingFileHash || undefined,
          fileSize: sheet.pendingFileSize ?? undefined,
          pdfVersion: nextVersion,
          pageCount: parsed.pageCount,
          processingStatus: 'READY',
          searchIndexStatus: 'READY',
          processingError: null,
          processingWarning: parsed.warning,
          searchIndexedAt: new Date(),
          pendingStorageKey: null,
          pendingFileHash: null,
          pendingFileSize: null,
          pendingPdfVersion: null,
          pendingFilename: null
        }
      })
    ]);

    if (previousKey && previousKey !== nextKey) removeFormulaBookKey(previousKey);
    console.log(`[formula-books] indexed ${id}: ${parsed.pageCount} pages, ${parsed.textLength} chars`);
  } catch (err) {
    const message = String(err?.message || err).slice(0, 4000);
    await prisma.formulaBookPdf.update({
      where: { id },
      data: {
        processingStatus: 'FAILED',
        searchIndexStatus: 'FAILED',
        processingError: message
      }
    }).catch(() => {});
    // Keep pending file/key so an administrator can retry after correcting
    // permissions or replacing the file. Never delete the old working PDF.
    console.error(`[formula-books] failed ${id}:`, message);
  }
}
