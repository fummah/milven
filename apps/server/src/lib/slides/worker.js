import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { inspectPptx } from './pptx.js';
import {
  convertPptxToPdf,
  renderSlides,
  readPdfInfo,
  readImageDimensions,
  detectFontSupport,
  getRendererInfo
} from './renderer.js';
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
    const [total, failed, processing, slides] = await Promise.all([
      prisma.presentation.count({ where: { importBatchId: batchId, deletedAt: null } }),
      prisma.presentation.count({ where: { importBatchId: batchId, deletedAt: null, processingStatus: 'FAILED' } }),
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

  const previousAssets = await prisma.presentation.findUnique({
    where: { id: presentationId },
    select: {
      thumbnailKey: true,
      pdfKey: true,
      renderVersion: true,
      slides: { select: { previewKey: true, thumbnailKey: true } }
    }
  }).catch(() => null);

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
  const version = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  const versionRoot = path.join(presentationDir(presentationId), 'versions', version);

  try {
    if (!fs.existsSync(originalPath)) {
      throw new Error('Original PowerPoint file is missing from storage.');
    }

    const startedAt = Date.now();
    const parsed = await inspectPptx(originalPath);
    const fontSupport = await detectFontSupport(parsed.requiredFonts || []);
    const rendererInfo = await getRendererInfo();

    const warnings = [];
    if (!fontSupport.available) {
      warnings.push('Font validation was unavailable on the rendering host. Preview fidelity could not be fully verified.');
    }
    if (fontSupport.missingFonts.length) {
      const substitutions = Object.entries(fontSupport.substitutions || {})
        .map(([from, to]) => `${from} → ${to}`)
        .join(', ');
      warnings.push(
        `Preview generated with font substitutions for: ${fontSupport.missingFonts.join(', ')}. ` +
        `Some PowerPoint text may differ from the original.` +
        (substitutions ? ` Substituted with: ${substitutions}.` : '')
      );
      console.warn(`[slides] ${presentationId} missing fonts: ${fontSupport.missingFonts.join(', ')}`);
    }

    const pdfPath = await convertPptxToPdf(originalPath, workDir);
    const pdfInfo = await readPdfInfo(pdfPath);
    const versionPreviews = ensureStorageDir(path.join(versionRoot, 'preview'));
    const versionThumbs = ensureStorageDir(path.join(versionRoot, 'thumbs'));
    const rendered = await renderSlides(pdfPath, versionPreviews, versionThumbs);
    if (!rendered.previewFiles.length) {
      throw new Error('No slide previews were rendered. Verify LibreOffice and Poppler are installed.');
    }

    const pdfKey = storageKeyFor('presentations', presentationId, 'versions', version, 'presentation.pdf');
    const storedPdf = absoluteKey(pdfKey);
    ensureStorageDir(path.dirname(storedPdf));
    fs.copyFileSync(pdfPath, storedPdf);

    const total = Math.max(
      parsed.slides.length,
      rendered.pageCount,
      pdfInfo.pageCount || 0
    );
    const slides = [];
    for (let index = 0; index < total; index += 1) {
      const number = index + 1;
      const parsedSlide = parsed.slides[index] || { text: '', notes: '' };
      const previewFile = rendered.previewFiles[index] || null;
      const thumbFile = rendered.thumbFiles[index] || null;
      const previewKey = previewFile
        ? storageKeyFor('presentations', presentationId, 'versions', version, 'preview', previewFile)
        : null;
      slides.push({
        presentationId,
        slideNumber: number,
        text: parsedSlide.text || null,
        notes: parsedSlide.notes || null,
        previewKey,
        thumbnailKey: thumbFile
          ? storageKeyFor('presentations', presentationId, 'versions', version, 'thumbs', thumbFile)
          : previewKey
      });
    }

    const firstPreview = rendered.previewFiles[0]
      ? path.join(versionPreviews, rendered.previewFiles[0])
      : null;
    const dimensions = firstPreview ? readImageDimensions(firstPreview) : null;
    const firstThumb = slides.find(s => s.thumbnailKey)?.thumbnailKey || null;
    const durationMs = Date.now() - startedAt;

    const diagnostics = {
      renderer: rendererInfo,
      requiredFonts: parsed.requiredFonts || [],
      missingFonts: fontSupport.missingFonts,
      fontSubstitutions: fontSupport.substitutions || {},
      fontValidation: {
        available: fontSupport.available,
        source: fontSupport.source,
        installedCount: fontSupport.installedCount,
        error: fontSupport.error
      },
      pdf: {
        pageCount: pdfInfo.pageCount,
        pageWidthPt: pdfInfo.pageWidthPt,
        pageHeightPt: pdfInfo.pageHeightPt
      },
      output: {
        format: rendered.previewFormat,
        width: dimensions?.width || null,
        height: dimensions?.height || null,
        thumbnailFormat: 'jpeg'
      },
      durationMs,
      warnings
    };

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
          ...(presentation.publishWhenReady ? { status: 'PUBLISHED' } : {}),
          renderVersion: version,
          requiredFonts: parsed.requiredFonts || [],
          missingFonts: fontSupport.missingFonts,
          renderingWarnings: warnings,
          renderingDiagnostics: diagnostics,
          previewWidth: dimensions?.width || null,
          previewHeight: dimensions?.height || null,
          previewFormat: rendered.previewFormat,
          renderDurationMs: durationMs
        }
      })
    ]);

    try { cleanupOldAssets(presentationId, previousAssets, version); } catch (cleanupErr) {
      console.warn('[slides] old preview cleanup failed:', cleanupErr?.message ?? cleanupErr);
    }
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
    // The failed version is never referenced by the database and can be
    // removed immediately. The previous working previews remain untouched.
    try { fs.rmSync(versionRoot, { recursive: true, force: true }); } catch {}
    await refreshBatch(prisma, presentation.importBatchId);
    console.error(`[slides] failed presentation ${presentationId}:`, message);
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

function cleanupOldAssets(presentationId, previous, currentVersion) {
  const keepPathFragment = `/versions/${currentVersion}/`;
  const oldKeys = new Set();
  if (previous?.pdfKey) oldKeys.add(previous.pdfKey);
  if (previous?.thumbnailKey) oldKeys.add(previous.thumbnailKey);
  for (const slide of previous?.slides || []) {
    if (slide.previewKey) oldKeys.add(slide.previewKey);
    if (slide.thumbnailKey) oldKeys.add(slide.thumbnailKey);
  }
  for (const key of oldKeys) {
    if (!key || key.includes(keepPathFragment)) continue;
    removeStorageKey(key);
  }

  const dir = presentationDir(presentationId);
  for (const legacy of ['preview', 'thumbs']) {
    try { fs.rmSync(path.join(dir, legacy), { recursive: true, force: true }); } catch {}
  }
  try { fs.rmSync(path.join(dir, 'presentation.pdf'), { force: true }); } catch {}

  const versionsRoot = path.join(dir, 'versions');
  try {
    for (const name of fs.readdirSync(versionsRoot)) {
      if (name === currentVersion) continue;
      try { fs.rmSync(path.join(versionsRoot, name), { recursive: true, force: true }); } catch {}
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
