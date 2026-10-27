import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectPptx } from './pptx.js';
import { convertPptxToPdf, renderSlides, readPdfPageCount } from './renderer.js';
import {
  presentationDir,
  resolveStorageKey,
  storageKeyFor,
  ensureStorageDir,
  removeStorageKey
} from './storage.js';

const MAX_CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.SLIDES_CONCURRENCY ?? 2)));
const MAX_ATTEMPTS = Math.max(1, Number(process.env.SLIDES_MAX_ATTEMPTS ?? 3));
const queue = [];
const queued = new Set();
let active = 0;
let prismaRef = null;
let initialized = false;
let pumping = false;

export function initSlideWorker(prisma) {
  prismaRef = prisma;
  if (initialized) return;
  initialized = true;

  ensureSearchIndexes(prisma).catch((err) => {
    console.warn('[slides] search index setup skipped:', err?.message ?? err);
  });

  recoverQueue(prisma).catch((err) => {
    console.warn('[slides] queue recovery failed:', err?.message ?? err);
  });

  setInterval(() => {
    pruneQueueFiles(prisma).catch(() => {});
  }, 6 * 60 * 60 * 1000).unref?.();
}

async function ensureSearchIndexes(prisma) {
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm').catch(() => {});
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PresentationSlide_fts_idx" ON "PresentationSlide" USING GIN (to_tsvector('english', coalesce("text", '') || ' ' || coalesce("notes", '')))`
  ).catch(() => {});
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PresentationSlide_text_trgm_idx" ON "PresentationSlide" USING GIN ("text" gin_trgm_ops)`
  ).catch(() => {});
}

export async function recoverQueue(prisma) {
  const pending = await prisma.presentation.findMany({
    where: {
      deletedAt: null,
      processingStatus: { in: ['PENDING', 'PROCESSING'] }
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, processingStatus: true, processingAttempts: true }
  });

  for (const item of pending) {
    if (item.processingAttempts >= MAX_ATTEMPTS) {
      await prisma.presentation.update({
        where: { id: item.id },
        data: {
          processingStatus: 'FAILED',
          processingError: 'Processing exceeded the maximum number of attempts.'
        }
      }).catch(() => {});
      continue;
    }
    if (item.processingStatus === 'PROCESSING') {
      await prisma.presentation.update({
        where: { id: item.id },
        data: { processingStatus: 'PENDING' }
      }).catch(() => {});
    }
    enqueuePresentation(item.id);
  }
}

export function enqueuePresentation(presentationId) {
  if (!prismaRef || !presentationId) return;
  if (queued.has(presentationId)) return;
  queued.add(presentationId);
  queue.push(presentationId);
  pump();
}

function pump() {
  if (!prismaRef || pumping) return;
  pumping = true;
  try {
    while (active < MAX_CONCURRENCY && queue.length > 0) {
      const id = queue.shift();
      queued.delete(id);
      active += 1;
      processPresentation(prismaRef, id)
        .catch((err) => console.error('[slides] processing error', id, err))
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  } finally {
    pumping = false;
  }
}

function absoluteKey(key) {
  return resolveStorageKey(key);
}

async function refreshBatch(prisma, batchId) {
  if (!batchId) return;
  try {
    const [total, failed, ready, processing, slides] = await Promise.all([
      prisma.presentation.count({ where: { importBatchId: batchId, deletedAt: null } }),
      prisma.presentation.count({ where: { importBatchId: batchId, deletedAt: null, processingStatus: 'FAILED' } }),
      prisma.presentation.count({ where: { importBatchId: batchId, deletedAt: null, processingStatus: 'READY' } }),
      prisma.presentation.count({ where: { importBatchId: batchId, deletedAt: null, processingStatus: { in: ['PENDING', 'PROCESSING'] } } }),
      prisma.presentation.aggregate({
        where: { importBatchId: batchId, deletedAt: null },
        _sum: { slideCount: true }
      })
    ]);
    const status = processing > 0 ? 'PROCESSING' : (total > 0 && failed === total ? 'FAILED' : 'COMPLETED');
    await prisma.presentationBatch.update({
      where: { id: batchId },
      data: {
        imported: total,
        failed,
        totalSlides: slides._sum.slideCount || 0,
        status
      }
    }).catch(() => {});
  } catch {}
}

export async function processPresentation(prisma, presentationId) {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presentationId },
    select: {
      id: true,
      title: true,
      fileStorageKey: true,
      fileHash: true,
      processingAttempts: true,
      importBatchId: true,
      deletedAt: true,
      processingStatus: true,
      status: true,
      publishWhenReady: true,
      slideCount: true
    }
  });
  if (!presentation || presentation.deletedAt) return;
  if (presentation.processingAttempts >= MAX_ATTEMPTS) {
    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        processingStatus: 'FAILED',
        processingError: 'Processing exceeded the maximum number of attempts.'
      }
    }).catch(() => {});
    await refreshBatch(prisma, presentation.importBatchId);
    return;
  }

  const attempts = presentation.processingAttempts + 1;
  await prisma.presentation.update({
    where: { id: presentationId },
    data: {
      processingStatus: 'PROCESSING',
      processingError: null,
      processingAttempts: attempts
    }
  });

  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'milven-slides-'));
  const originalPath = absoluteKey(presentation.fileStorageKey);

  try {
    if (!fs.existsSync(originalPath)) {
      throw new Error('Original PowerPoint file is missing from storage.');
    }

    const parsed = await inspectPptx(originalPath);

    const pdfPath = await convertPptxToPdf(originalPath, workDir);
    const pdfPageCount = await readPdfPageCount(pdfPath);
    const dir = presentationDir(presentationId);
    const pdfKey = storageKeyFor('presentations', presentationId, 'presentation.pdf');
    const storedPdf = absoluteKey(pdfKey);
    ensureStorageDir(path.dirname(storedPdf));
    fs.copyFileSync(pdfPath, storedPdf);

    const previewDir = ensureStorageDir(path.join(dir, 'preview'));
    const thumbDir = ensureStorageDir(path.join(dir, 'thumbs'));
    removeStaleImages(previewDir, 'slide-');
    removeStaleImages(thumbDir, 'thumb-');

    const rendered = await renderSlides(pdfPath, previewDir, thumbDir);
    if (!rendered.previewFiles.length) {
      throw new Error('No slide previews were rendered. Verify LibreOffice and Poppler are installed.');
    }

    const total = Math.max(parsed.slides.length, rendered.pageCount, pdfPageCount || 0);
    const slides = [];
    for (let index = 0; index < total; index += 1) {
      const number = index + 1;
      const parsedSlide = parsed.slides[index] || { text: '', notes: '' };
      const previewFile = rendered.previewFiles[index] || null;
      const thumbFile = rendered.thumbFiles[index] || null;
      const previewKey = previewFile
        ? storageKeyFor('presentations', presentationId, 'preview', previewFile)
        : null;
      slides.push({
        presentationId,
        slideNumber: number,
        text: parsedSlide.text || null,
        notes: parsedSlide.notes || null,
        previewKey,
        thumbnailKey: thumbFile
          ? storageKeyFor('presentations', presentationId, 'thumbs', thumbFile)
          : previewKey
      });
    }

    const firstThumb = slides.find(s => s.thumbnailKey)?.thumbnailKey || null;

    await prisma.$transaction([
      prisma.presentationSlide.deleteMany({ where: { presentationId } }),
      prisma.presentationSlide.createMany({ data: slides }),
      prisma.presentation.update({
        where: { id: presentationId },
        data: {
          slideCount: slides.length,
          thumbnailKey: firstThumb,
          pdfKey,
          processingStatus: 'READY',
          processingError: null,
          publishWhenReady: false,
          ...(presentation.publishWhenReady ? { status: 'PUBLISHED' } : {})
        }
      })
    ]);

    await refreshBatch(prisma, presentation.importBatchId);
  } catch (err) {
    const message = String(err?.message || err || 'Slide processing failed.').slice(0, 4000);
    const existingSlides = await prisma.presentationSlide.count({ where: { presentationId } }).catch(() => 0);
    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        processingStatus: 'FAILED',
        processingError: message,
        ...(existingSlides < 1 ? { status: 'DRAFT' } : {})
      }
    }).catch(() => {});
    await refreshBatch(prisma, presentation.importBatchId);
    console.error(`[slides] failed presentation ${presentationId}:`, message);
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

function removeStaleImages(dir, prefix) {
  try {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(prefix) && /\.(jpe?g|png)$/i.test(name)) {
        try { fs.unlinkSync(path.join(dir, name)); } catch {}
      }
    }
  } catch {}
}

async function pruneQueueFiles(prisma) {
  if (!prismaRef) return;
  const cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
  const old = await prisma.presentationBatch.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, archiveStorageKey: true }
  }).catch(() => []);
  for (const batch of old) {
    removeStorageKey(batch.archiveStorageKey);
  }
}
