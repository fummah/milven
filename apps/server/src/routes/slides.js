import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  presentationDir,
  batchDir,
  sanitizeFilename,
  storageKeyFor,
  resolveStorageKey,
  fileHash,
  moveFile,
  removePresentationStorage,
  signedAssetUrl,
  verifyAssetToken
} from '../lib/slides/storage.js';
import { inspectPptx, looksLikePptx } from '../lib/slides/pptx.js';
import { analyzeZip, importZipMappings, retryFailedBatch } from '../lib/slides/zipImport.js';
import { enqueuePresentation } from '../lib/slides/worker.js';
import {
  combinedSearch,
  searchWithinPresentation,
  allowedCourseIds,
  serializePresentation
} from '../lib/slides/search.js';
import { rendererStatus } from '../lib/slides/renderer.js';

const MAX_PPTX_BYTES = 500 * 1024 * 1024;
const MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024;
const uploadTempRoot = path.join(os.tmpdir(), 'milven-slides-uploads');
fs.mkdirSync(uploadTempRoot, { recursive: true });

const pptxUpload = multer({
  dest: uploadTempRoot,
  limits: { fileSize: MAX_PPTX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/\.pptx$/i.test(file.originalname || '')) {
      return cb(new Error('Only .pptx PowerPoint files are supported.'));
    }
    cb(null, true);
  }
});

const zipUpload = multer({
  dest: uploadTempRoot,
  limits: { fileSize: MAX_ZIP_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/\.zip$/i.test(file.originalname || '')) {
      return cb(new Error('Only .zip archives are supported for bulk upload.'));
    }
    cb(null, true);
  }
});

const PRESENTATION_INCLUDE = {
  course: { select: { id: true, name: true, level: true } },
  volume: { select: { id: true, name: true } },
  module: { select: { id: true, name: true, order: true } },
  topicLinks: { include: { topic: { select: { id: true, name: true, moduleId: true } } } },
  conceptLinks: { include: { concept: { select: { id: true, name: true, topicId: true } } } },
  importBatch: { select: { id: true, originalFilename: true, status: true } }
};

function parseArray(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return value.split(',').map(v => v.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseIntSafe(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function cleanupTemp(file) {
  if (!file?.path) return;
  try { fs.rmSync(file.path, { force: true }); } catch {}
}

async function validateMapping(prisma, {
  courseId,
  volumeId,
  moduleId,
  scope = 'LEARNING_MODULE',
  topicIds = [],
  conceptIds = []
}) {
  const errors = [];
  if (!courseId) errors.push('Course is required.');
  if (!volumeId) errors.push('Volume is required.');
  const course = courseId ? await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, level: true } }) : null;
  const volume = volumeId ? await prisma.volume.findUnique({ where: { id: volumeId }, select: { id: true, name: true } }) : null;
  if (courseId && !course) errors.push('Course not found.');
  if (volumeId && !volume) errors.push('Volume not found.');
  if (courseId && volumeId && course && volume) {
    const link = await prisma.courseVolume.findUnique({
      where: { courseId_volumeId: { courseId, volumeId } },
      select: { courseId: true }
    });
    if (!link) errors.push('The selected Volume is not linked to this Course. Configure the course volume in Courses ? Volumes first.');
  }

  let moduleRecord = null;
  if (scope === 'LEARNING_MODULE') {
    if (!moduleId) errors.push('Learning Module is required for a module presentation.');
    else {
      moduleRecord = await prisma.module.findUnique({
        where: { id: moduleId },
        select: { id: true, name: true, courseId: true, volumeId: true }
      });
      if (!moduleRecord) errors.push('Learning Module not found. Please create or configure it under Courses → Learning Modules before uploading.');
      else {
        if (courseId && moduleRecord.courseId !== courseId) errors.push('The Learning Module does not belong to the selected course.');
        if (volumeId && moduleRecord.volumeId !== volumeId) errors.push('The Learning Module does not belong to the selected volume.');
      }
    }
  } else if (moduleId) {
    errors.push('A Whole Volume Review must not be linked to a single Learning Module.');
  }

  if (topicIds.length) {
    const topics = await prisma.topic.findMany({
      where: { id: { in: topicIds } },
      select: { id: true, name: true, moduleId: true, module: { select: { volumeId: true, courseId: true } } }
    });
    if (topics.length !== topicIds.length) errors.push('One or more selected Topics no longer exist.');
    for (const topic of topics) {
      if (scope === 'LEARNING_MODULE' && moduleId && topic.moduleId !== moduleId) {
        errors.push(`Topic "${topic.name}" does not belong to the selected Learning Module.`);
      }
      if (scope === 'WHOLE_VOLUME' && volumeId && topic.module?.volumeId !== volumeId) {
        errors.push(`Topic "${topic.name}" does not belong to the selected Volume.`);
      }
    }
  }

  if (conceptIds.length) {
    const concepts = await prisma.concept.findMany({
      where: { id: { in: conceptIds } },
      select: { id: true, name: true, topic: { select: { moduleId: true, module: { select: { volumeId: true } } } } }
    });
    if (concepts.length !== conceptIds.length) errors.push('One or more selected Concepts no longer exist.');
    for (const concept of concepts) {
      if (scope === 'LEARNING_MODULE' && moduleId && concept.topic?.moduleId !== moduleId) {
        errors.push(`Concept "${concept.name}" does not belong to the selected Learning Module.`);
      }
      if (scope === 'WHOLE_VOLUME' && volumeId && concept.topic?.module?.volumeId !== volumeId) {
        errors.push(`Concept "${concept.name}" does not belong to the selected Volume.`);
      }
    }
  }

  return { errors, course, volume, module: moduleRecord };
}

function shape(presentation, user, { includeSlides = false } = {}) {
  if (!presentation) return null;
  const admin = user?.role === 'ADMIN';
  const data = serializePresentation(presentation, user?.id || null);
  data.thumbnailUrl = presentation.thumbnailKey && presentation.slideCount
    ? signedAssetUrl({
        presentationId: presentation.id,
        kind: 'thumbnail',
        slideNumber: 1,
        userId: user?.id,
        admin
      })
    : null;
  data.canDownloadOriginal = admin;
  if (includeSlides && Array.isArray(presentation.slides)) {
    data.slides = presentation.slides.map(slide => slideForUser(slide, presentation.id, user));
  }
  return data;
}

function slideForUser(slide, presentationId, user) {
  const admin = user?.role === 'ADMIN';
  return {
    id: slide.id,
    slideNumber: slide.slideNumber,
    text: slide.text || '',
    notes: slide.notes || '',
    previewUrl: slide.previewKey
      ? signedAssetUrl({ presentationId, kind: 'preview', slideNumber: slide.slideNumber, userId: user?.id, admin })
      : null,
    thumbnailUrl: slide.thumbnailKey
      ? signedAssetUrl({ presentationId, kind: 'thumbnail', slideNumber: slide.slideNumber, userId: user?.id, admin })
      : null
  };
}

async function ensureCourseAccess(prisma, user, courseId) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (!courseId) return false;
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
    select: { id: true }
  });
  return Boolean(enrollment);
}

async function getPresentation(prisma, id) {
  return prisma.presentation.findUnique({
    where: { id },
    include: {
      ...PRESENTATION_INCLUDE,
      slides: { orderBy: { slideNumber: 'asc' } }
    }
  });
}

function batchResultsShape(batch) {
  if (!batch) return null;
  return {
    ...batch,
    results: (batch.presentations || []).map(p => ({
      id: p.id,
      title: p.title,
      originalFilename: p.originalFilename,
      status: p.status,
      processingStatus: p.processingStatus,
      processingError: p.processingError,
      slideCount: p.slideCount,
      module: p.module,
      volume: p.volume,
      course: p.course
    }))
  };
}

export function slidesRouter(prisma) {
  const router = Router();

  /* ─────────────────────────────────────────────────────────────
     Signed slide assets (thumbnails / previews / PDFs)
  ───────────────────────────────────────────────────────────── */
  router.get('/assets/:presentationId/:kind/:slideNumber?', async (req, res) => {
    const token = String(req.query.token || '');
    const payload = verifyAssetToken(token);
    if (!payload || payload.pid !== req.params.presentationId) {
      return res.status(401).json({ error: 'Invalid or expired asset link' });
    }
    const presentation = await prisma.presentation.findUnique({
      where: { id: req.params.presentationId },
      select: { id: true, status: true, deletedAt: true, pdfKey: true }
    });
    if (!presentation || presentation.deletedAt) return res.status(404).json({ error: 'Presentation not found' });
    if (presentation.status !== 'PUBLISHED' && !payload.adm) {
      return res.status(403).json({ error: 'Presentation is not published' });
    }

    const kind = String(req.params.kind || '');
    if (payload.kind && payload.kind !== kind) {
      return res.status(401).json({ error: 'Asset link does not match the requested asset' });
    }
    let key = null;
    if (kind === 'pdf') {
      key = presentation.pdfKey;
    } else if (kind === 'thumbnail' || kind === 'preview') {
      const slideNumber = parseIntSafe(req.params.slideNumber, null);
      if (!slideNumber) return res.status(400).json({ error: 'Slide number is required' });
      const slide = await prisma.presentationSlide.findUnique({
        where: { presentationId_slideNumber: { presentationId: presentation.id, slideNumber } },
        select: { previewKey: true, thumbnailKey: true }
      });
      key = kind === 'thumbnail' ? slide?.thumbnailKey : slide?.previewKey;
    }
    if (!key) return res.status(404).json({ error: 'Asset not found' });

    try {
      const absolute = resolveStorageKey(key);
      if (!fs.existsSync(absolute)) return res.status(404).json({ error: 'Asset file is missing' });
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.sendFile(absolute);
    } catch {
      return res.status(400).json({ error: 'Invalid asset path' });
    }
  });

  /* ─────────────────────────────────────────────────────────────
     Admin library
  ───────────────────────────────────────────────────────────── */
  router.get('/admin/presentations', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const courseId = String(req.query.courseId || '').trim();
      const volumeId = String(req.query.volumeId || '').trim();
      const moduleId = String(req.query.moduleId || '').trim();
      const topicId = String(req.query.topicId || '').trim();
      const conceptId = String(req.query.conceptId || '').trim();
      const year = parseIntSafe(req.query.year, null);
      const status = String(req.query.status || '').trim();
      const processingStatus = String(req.query.processingStatus || '').trim();
      const scope = String(req.query.scope || '').trim();
      const page = Math.max(1, parseIntSafe(req.query.page, 1));
      const limit = Math.min(100, Math.max(1, parseIntSafe(req.query.limit, 24)));
      const skip = (page - 1) * limit;

      const where = {
        deletedAt: null,
        ...(courseId ? { courseId } : {}),
        ...(volumeId ? { volumeId } : {}),
        ...(moduleId ? { moduleId } : {}),
        ...(year ? { year } : {}),
        ...(status ? { status } : {}),
        ...(processingStatus ? { processingStatus } : {}),
        ...(scope ? { scope } : {}),
        ...(topicId ? { topicLinks: { some: { topicId } } } : {}),
        ...(conceptId ? { conceptLinks: { some: { conceptId } } } : {})
      };

      if (q) {
        where.OR = [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { tags: { has: q } },
          { module: { name: { contains: q, mode: 'insensitive' } } },
          { volume: { name: { contains: q, mode: 'insensitive' } } },
          { topicLinks: { some: { topic: { name: { contains: q, mode: 'insensitive' } } } } },
          { conceptLinks: { some: { concept: { name: { contains: q, mode: 'insensitive' } } } } },
          { slides: { some: { text: { contains: q, mode: 'insensitive' } } } }
        ];
      }

      const [total, rows] = await Promise.all([
        prisma.presentation.count({ where }),
        prisma.presentation.findMany({
          where,
          include: {
            ...PRESENTATION_INCLUDE,
            ...(q ? {
              slides: {
                where: {
                  OR: [
                    { text: { contains: q, mode: 'insensitive' } },
                    { notes: { contains: q, mode: 'insensitive' } }
                  ]
                },
                select: { slideNumber: true, text: true },
                take: 1
              }
            } : {})
          },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: limit
        })
      ]);

      return res.json({
        total,
        page,
        limit,
        presentations: rows.map(row => ({
          ...shape(row, req.user),
          matchSlide: row.slides?.[0]
            ? { slideNumber: row.slides[0].slideNumber, excerpt: String(row.slides[0].text || '').slice(0, 240) }
            : null,
          slides: undefined
        }))
      });
    } catch (err) {
      console.error('[slides.admin.list]', err);
      return res.status(500).json({ error: 'Failed to load presentations' });
    }
  });

  router.get('/admin/module-counts', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const courseId = String(req.query.courseId || '').trim();
    const volumeId = String(req.query.volumeId || '').trim();
    if (!courseId) return res.json({ counts: {} });
    const grouped = await prisma.presentation.groupBy({
      by: ['moduleId'],
      where: {
        deletedAt: null,
        courseId,
        moduleId: { not: null },
        ...(volumeId ? { volumeId } : {})
      },
      _count: { _all: true }
    });
    const counts = Object.fromEntries(grouped.map(g => [g.moduleId, g._count._all]));
    return res.json({ counts });
  });

  router.get('/admin/presentations/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const presentation = await getPresentation(prisma, req.params.id);
    if (!presentation || presentation.deletedAt) return res.status(404).json({ error: 'Not found' });
    return res.json({ presentation: shape(presentation, req.user, { includeSlides: true }) });
  });

  router.get('/admin/presentations/:id/slides', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const presentation = await prisma.presentation.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, deletedAt: true }
    });
    if (!presentation || presentation.deletedAt) return res.status(404).json({ error: 'Not found' });
    const slides = await prisma.presentationSlide.findMany({
      where: { presentationId: presentation.id },
      orderBy: { slideNumber: 'asc' }
    });
    return res.json({
      presentationId: presentation.id,
      slides: slides.map(slide => slideForUser(slide, presentation.id, req.user))
    });
  });

  router.post('/admin/presentations', requireAuth(), requireRole('ADMIN'), pptxUpload.single('file'), async (req, res) => {
    const file = req.file;
    try {
      if (!file) return res.status(400).json({ error: 'A .pptx file is required' });
      if (!looksLikePptx(file.path)) return res.status(400).json({ error: 'The uploaded file is not a valid PowerPoint (.pptx) file.' });

      const courseId = String(req.body.courseId || '').trim();
      const volumeId = String(req.body.volumeId || '').trim();
      const scope = String(req.body.scope || 'LEARNING_MODULE').trim() === 'WHOLE_VOLUME' ? 'WHOLE_VOLUME' : 'LEARNING_MODULE';
      const moduleId = scope === 'WHOLE_VOLUME' ? null : (String(req.body.moduleId || '').trim() || null);
      const topicIds = parseArray(req.body.topicIds);
      const conceptIds = parseArray(req.body.conceptIds);
      const tags = parseArray(req.body.tags).map(t => String(t).trim()).filter(Boolean).slice(0, 30);

      const validation = await validateMapping(prisma, { courseId, volumeId, moduleId, scope, topicIds, conceptIds });
      if (validation.errors.length) {
        return res.status(400).json({ error: validation.errors[0], errors: validation.errors });
      }

      let parsed = null;
      try {
        parsed = await inspectPptx(file.path);
      } catch (err) {
        return res.status(400).json({ error: err?.message || 'Invalid PowerPoint file' });
      }

      const id = crypto.randomUUID();
      const dir = presentationDir(id);
      const destination = path.join(dir, 'original.pptx');
      await moveFile(file.path, destination);
      const hash = await fileHash(destination);
      const stat = await fs.promises.stat(destination);

      const title = String(req.body.title || '').trim()
        || parsed.coreTitle
        || path.basename(file.originalname, path.extname(file.originalname)).replace(/[_-]+/g, ' ').trim()
        || 'Untitled presentation';
      const description = String(req.body.description || '').trim() || null;
      const year = parseIntSafe(req.body.year, 2027) || 2027;
      const publishWhenReady = String(req.body.status || 'DRAFT').toUpperCase() === 'PUBLISHED';

      const presentation = await prisma.$transaction(async (tx) => {
        const created = await tx.presentation.create({
          data: {
            id,
            title: title.slice(0, 300),
            description: description ? description.slice(0, 10000) : null,
            courseId,
            volumeId,
            moduleId,
            year,
            scope,
            originalFilename: sanitizeFilename(file.originalname),
            fileStorageKey: storageKeyFor('presentations', id, 'original.pptx'),
            fileHash: hash,
            fileSize: stat.size,
            slideCount: parsed.slideCount || 0,
            status: 'DRAFT',
            publishWhenReady,
            processingStatus: 'PENDING',
            tags: tags.length ? tags : (parsed.coreKeywords ? parsed.coreKeywords.split(/[,;]/).map(v => v.trim()).filter(Boolean).slice(0, 30) : []),
            createdById: req.user.id
          }
        });
        if (topicIds.length) {
          await tx.presentationTopic.createMany({
            data: topicIds.map(topicId => ({ presentationId: id, topicId })),
            skipDuplicates: true
          });
        }
        if (conceptIds.length) {
          await tx.presentationConcept.createMany({
            data: conceptIds.map(conceptId => ({ presentationId: id, conceptId })),
            skipDuplicates: true
          });
        }
        return created;
      });

      enqueuePresentation(id);

      const hydrated = await prisma.presentation.findUnique({ where: { id }, include: PRESENTATION_INCLUDE });
      return res.status(201).json({
        presentation: shape(hydrated, req.user),
        message: 'Presentation uploaded. Slide rendering and text indexing have started.'
      });
    } catch (err) {
      console.error('[slides.admin.create]', err);
      return res.status(500).json({ error: err?.message || 'Failed to upload presentation' });
    } finally {
      cleanupTemp(file);
    }
  });

  router.put('/admin/presentations/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    try {
      const existing = await prisma.presentation.findUnique({
        where: { id: req.params.id },
        select: { id: true, deletedAt: true, processingStatus: true, status: true, slideCount: true }
      });
      if (!existing || existing.deletedAt) return res.status(404).json({ error: 'Not found' });

      const courseId = String(req.body.courseId ?? '').trim();
      const volumeId = String(req.body.volumeId ?? '').trim();
      const scope = String(req.body.scope || 'LEARNING_MODULE').trim() === 'WHOLE_VOLUME' ? 'WHOLE_VOLUME' : 'LEARNING_MODULE';
      const moduleId = scope === 'WHOLE_VOLUME' ? null : (String(req.body.moduleId || '').trim() || null);
      const topicIds = parseArray(req.body.topicIds);
      const conceptIds = parseArray(req.body.conceptIds);

      const validation = await validateMapping(prisma, { courseId, volumeId, moduleId, scope, topicIds, conceptIds });
      if (validation.errors.length) {
        return res.status(400).json({ error: validation.errors[0], errors: validation.errors });
      }

      const nextStatus = req.body.status
        ? (String(req.body.status).toUpperCase() === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT')
        : existing.status;
      if (nextStatus === 'PUBLISHED' && (existing.processingStatus !== 'READY' || existing.slideCount < 1)) {
        return res.status(400).json({ error: 'Only successfully processed presentations can be published.' });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.presentation.update({
          where: { id: existing.id },
          data: {
            ...(typeof req.body.title !== 'undefined' ? { title: String(req.body.title).trim().slice(0, 300) || 'Untitled presentation' } : {}),
            ...(typeof req.body.description !== 'undefined' ? { description: String(req.body.description || '').trim().slice(0, 10000) || null } : {}),
            courseId,
            volumeId,
            moduleId,
            scope,
            ...(typeof req.body.year !== 'undefined' ? { year: parseIntSafe(req.body.year, 2027) || 2027 } : {}),
            ...(typeof req.body.tags !== 'undefined' ? { tags: parseArray(req.body.tags).map(t => String(t).trim()).filter(Boolean).slice(0, 30) } : {}),
            status: nextStatus
          }
        });
        if (Array.isArray(topicIds) && typeof req.body.topicIds !== 'undefined') {
          await tx.presentationTopic.deleteMany({ where: { presentationId: existing.id } });
          if (topicIds.length) {
            await tx.presentationTopic.createMany({
              data: topicIds.map(topicId => ({ presentationId: existing.id, topicId })),
              skipDuplicates: true
            });
          }
        }
        if (Array.isArray(conceptIds) && typeof req.body.conceptIds !== 'undefined') {
          await tx.presentationConcept.deleteMany({ where: { presentationId: existing.id } });
          if (conceptIds.length) {
            await tx.presentationConcept.createMany({
              data: conceptIds.map(conceptId => ({ presentationId: existing.id, conceptId })),
              skipDuplicates: true
            });
          }
        }
        return row;
      });

      const hydrated = await prisma.presentation.findUnique({ where: { id: updated.id }, include: PRESENTATION_INCLUDE });
      return res.json({ presentation: shape(hydrated, req.user) });
    } catch (err) {
      console.error('[slides.admin.update]', err);
      return res.status(500).json({ error: 'Failed to update presentation' });
    }
  });

  router.post('/admin/presentations/:id/replace', requireAuth(), requireRole('ADMIN'), pptxUpload.single('file'), async (req, res) => {
    const file = req.file;
    try {
      if (!file) return res.status(400).json({ error: 'A replacement .pptx file is required' });
      if (!looksLikePptx(file.path)) return res.status(400).json({ error: 'The uploaded file is not a valid PowerPoint (.pptx) file.' });
      const existing = await prisma.presentation.findUnique({ where: { id: req.params.id }, select: { id: true, deletedAt: true } });
      if (!existing || existing.deletedAt) return res.status(404).json({ error: 'Not found' });

      try {
        await inspectPptx(file.path);
      } catch (err) {
        return res.status(400).json({ error: err?.message || 'Invalid PowerPoint file' });
      }

      const destination = path.join(presentationDir(existing.id), 'original.pptx');
      await moveFile(file.path, destination);
      const hash = await fileHash(destination);
      const stat = await fs.promises.stat(destination);

      const updated = await prisma.presentation.update({
        where: { id: existing.id },
        data: {
          originalFilename: sanitizeFilename(file.originalname),
          fileHash: hash,
          fileSize: stat.size,
          processingStatus: 'PENDING',
          processingError: null,
          processingAttempts: 0
        }
      });
      enqueuePresentation(existing.id);

      return res.json({
        presentation: shape({ ...updated, ...(await prisma.presentation.findUnique({ where: { id: existing.id }, include: PRESENTATION_INCLUDE })) }, req.user),
        message: 'Replacement uploaded. Previews and the search index are being regenerated.'
      });
    } catch (err) {
      console.error('[slides.admin.replace]', err);
      return res.status(500).json({ error: err?.message || 'Failed to replace presentation' });
    } finally {
      cleanupTemp(file);
    }
  });

  router.patch('/admin/presentations/:id/publish', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const published = Boolean(req.body.published);
    const existing = await prisma.presentation.findUnique({
      where: { id: req.params.id },
      select: { id: true, deletedAt: true, processingStatus: true, slideCount: true }
    });
    if (!existing || existing.deletedAt) return res.status(404).json({ error: 'Not found' });
    if (published && (existing.processingStatus !== 'READY' || existing.slideCount < 1)) {
      return res.status(400).json({ error: 'Only successfully processed presentations can be published.' });
    }
    const updated = await prisma.presentation.update({
      where: { id: existing.id },
      data: { status: published ? 'PUBLISHED' : 'DRAFT' },
      include: PRESENTATION_INCLUDE
    });
    return res.json({ presentation: shape(updated, req.user) });
  });

  router.delete('/admin/presentations/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const existing = await prisma.presentation.findUnique({ where: { id: req.params.id }, select: { id: true, deletedAt: true } });
    if (!existing || existing.deletedAt) return res.status(404).json({ error: 'Not found' });
    await prisma.$transaction([
      prisma.presentationSlide.deleteMany({ where: { presentationId: existing.id } }),
      prisma.presentationTopic.deleteMany({ where: { presentationId: existing.id } }),
      prisma.presentationConcept.deleteMany({ where: { presentationId: existing.id } }),
      prisma.presentation.update({
        where: { id: existing.id },
        data: {
          deletedAt: new Date(),
          status: 'DRAFT',
          thumbnailKey: null,
          pdfKey: null,
          slideCount: 0
        }
      })
    ]);
    removePresentationStorage(existing.id);
    return res.json({ ok: true, message: 'Presentation deleted and removed from student views.' });
  });

  router.get('/admin/presentations/:id/download', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const presentation = await prisma.presentation.findUnique({
      where: { id: req.params.id },
      select: { id: true, originalFilename: true, fileStorageKey: true, deletedAt: true }
    });
    if (!presentation || presentation.deletedAt) return res.status(404).json({ error: 'Not found' });
    try {
      const absolute = resolveStorageKey(presentation.fileStorageKey);
      if (!fs.existsSync(absolute)) return res.status(404).json({ error: 'Original file is missing' });
      return res.download(absolute, presentation.originalFilename || 'presentation.pptx');
    } catch {
      return res.status(400).json({ error: 'Invalid download path' });
    }
  });

  router.get('/admin/stats', requireAuth(), requireRole('ADMIN'), async (_req, res) => {
    const [total, published, draft, processing, failed, slides] = await Promise.all([
      prisma.presentation.count({ where: { deletedAt: null } }),
      prisma.presentation.count({ where: { deletedAt: null, status: 'PUBLISHED' } }),
      prisma.presentation.count({ where: { deletedAt: null, status: 'DRAFT' } }),
      prisma.presentation.count({ where: { deletedAt: null, processingStatus: { in: ['PENDING', 'PROCESSING'] } } }),
      prisma.presentation.count({ where: { deletedAt: null, processingStatus: 'FAILED' } }),
      prisma.presentationSlide.count({ where: { presentation: { deletedAt: null } } })
    ]);
    return res.json({
      total,
      published,
      draft,
      processing,
      failed,
      slides,
      renderer: rendererStatus()
    });
  });

  /* ─────────────────────────────────────────────────────────────
     Bulk ZIP import
  ───────────────────────────────────────────────────────────── */
  router.post('/admin/zip/analyze', requireAuth(), requireRole('ADMIN'), zipUpload.single('file'), async (req, res) => {
    const file = req.file;
    try {
      if (!file) return res.status(400).json({ error: 'A .zip archive is required' });
      if (!looksLikePptx(file.path)) return res.status(400).json({ error: 'The uploaded file is not a valid ZIP archive.' });
      const courseId = String(req.body.courseId || '').trim() || null;
      const volumeId = String(req.body.volumeId || '').trim() || null;
      const year = parseIntSafe(req.body.year, 2027) || 2027;
      if (volumeId && !courseId) {
        return res.status(400).json({ error: 'Select a course before selecting a volume.' });
      }

      const batchId = crypto.randomUUID();
      const dir = batchDir(batchId);
      const archivePath = path.join(dir, 'archive.zip');
      await moveFile(file.path, archivePath);

      let analysis;
      try {
        analysis = await analyzeZip(archivePath, { courseId, volumeId, year }, prisma);
      } catch (err) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
        return res.status(400).json({ error: err?.message || 'Could not analyse ZIP archive' });
      }

      const batch = await prisma.presentationBatch.create({
        data: {
          id: batchId,
          originalFilename: sanitizeFilename(file.originalname),
          archiveStorageKey: storageKeyFor('imports', batchId, 'archive.zip'),
          status: 'ANALYZED',
          courseId: courseId || null,
          volumeId: volumeId || null,
          year,
          totalFiles: analysis.detectedFiles,
          analysisJson: analysis,
          createdById: req.user.id
        }
      });

      return res.json({ batch, analysis });
    } catch (err) {
      console.error('[slides.admin.zip.analyze]', err);
      return res.status(500).json({ error: err?.message || 'Failed to analyse ZIP archive' });
    } finally {
      cleanupTemp(file);
    }
  });

  router.post('/admin/zip/:batchId/import', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    try {
      const batch = await prisma.presentationBatch.findUnique({ where: { id: req.params.batchId } });
      if (!batch) return res.status(404).json({ error: 'Import batch not found' });
      if (batch.status === 'IMPORTING' || batch.status === 'PROCESSING') {
        return res.status(409).json({ error: 'This batch is already being imported or processed.' });
      }
      const mappings = Array.isArray(req.body.mappings) ? req.body.mappings : [];
      if (!mappings.length) return res.status(400).json({ error: 'No mappings were supplied.' });

      const analysis = batch.analysisJson || {};
      const known = new Map((analysis.entries || []).map(e => [e.zipPath, e]));
      for (const mapping of mappings) {
        if (!mapping?.zipPath || !known.has(mapping.zipPath)) {
          return res.status(400).json({ error: `Unknown ZIP entry: ${mapping?.zipPath || '(missing)'}` });
        }
        if (mapping.zipPath.includes('..') || mapping.zipPath.startsWith('/')) {
          return res.status(400).json({ error: 'Unsafe ZIP entry path' });
        }
      }

      await prisma.presentationBatch.update({ where: { id: batch.id }, data: { status: 'IMPORTING' } });

      const merged = mappings.map((mapping) => {
        const detected = known.get(mapping.zipPath) || {};
        return {
          ...detected,
          ...mapping,
          fileName: detected.fileName || mapping.fileName,
          title: mapping.title || detected.detectedTitle || detected.fileName,
          year: mapping.year || batch.year
        };
      });

      const result = await importZipMappings(prisma, { batch, mappings: merged, userId: req.user.id });
      result.created.forEach(p => enqueuePresentation(p.id));

      const updated = await prisma.presentationBatch.update({
        where: { id: batch.id },
        data: {
          status: result.created.length ? 'PROCESSING' : 'COMPLETED',
          imported: result.created.length,
          skipped: result.skipped,
          failed: 0
        }
      });

      return res.json({
        batch: updated,
        imported: result.created.length,
        skipped: result.skipped,
        problems: result.problems
      });
    } catch (err) {
      console.error('[slides.admin.zip.import]', err);
      await prisma.presentationBatch.update({
        where: { id: req.params.batchId },
        data: { status: 'FAILED' }
      }).catch(() => {});
      return res.status(500).json({ error: err?.message || 'Failed to import ZIP mappings' });
    }
  });

  router.get('/admin/batches/:batchId', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const batch = await prisma.presentationBatch.findUnique({
      where: { id: req.params.batchId },
      include: {
        presentations: {
          where: { deletedAt: null },
          include: {
            course: { select: { id: true, name: true, level: true } },
            volume: { select: { id: true, name: true } },
            module: { select: { id: true, name: true } }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });
    if (!batch) return res.status(404).json({ error: 'Not found' });
    return res.json({ batch: batchResultsShape(batch) });
  });

  router.post('/admin/batches/:batchId/retry', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const batch = await prisma.presentationBatch.findUnique({ where: { id: req.params.batchId }, select: { id: true } });
    if (!batch) return res.status(404).json({ error: 'Not found' });
    const result = await retryFailedBatch(prisma, batch.id, enqueuePresentation);
    return res.json(result);
  });

  router.post('/admin/presentations/:id/retry', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const existing = await prisma.presentation.findUnique({
      where: { id: req.params.id },
      select: { id: true, deletedAt: true }
    });
    if (!existing || existing.deletedAt) return res.status(404).json({ error: 'Not found' });
    await prisma.presentation.update({
      where: { id: existing.id },
      data: { processingStatus: 'PENDING', processingError: null, processingAttempts: 0 }
    });
    enqueuePresentation(existing.id);
    return res.json({ ok: true });
  });

  /* ─────────────────────────────────────────────────────────────
     Student library
  ───────────────────────────────────────────────────────────── */
  router.get('/library/hierarchy', requireAuth(), async (req, res) => {
    const courseId = String(req.query.courseId || '').trim();
    if (!courseId) return res.status(400).json({ error: 'courseId is required' });
    if (!(await ensureCourseAccess(prisma, req.user, courseId))) {
      return res.status(403).json({ error: 'You do not have access to this course.' });
    }

    const links = await prisma.courseVolume.findMany({
      where: { courseId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: {
        volume: {
          include: {
            modules: {
              where: { courseId },
              orderBy: [{ order: 'asc' }, { name: 'asc' }],
              select: { id: true, name: true, order: true }
            }
          }
        }
      }
    });

    const published = await prisma.presentation.findMany({
      where: { courseId, deletedAt: null, status: 'PUBLISHED', processingStatus: 'READY' },
      select: { id: true, volumeId: true, moduleId: true, scope: true, slideCount: true, title: true, thumbnailKey: true }
    });

    const byModule = new Map();
    const byVolume = new Map();
    for (const p of published) {
      byVolume.set(p.volumeId, (byVolume.get(p.volumeId) || 0) + 1);
      if (p.moduleId) byModule.set(p.moduleId, (byModule.get(p.moduleId) || 0) + 1);
    }

    const volumes = links.map(link => {
      const modulePresentations = link.volume.modules.reduce((sum, m) => sum + (byModule.get(m.id) || 0), 0);
      return {
        id: link.volume.id,
        name: link.volume.name,
        description: link.volume.description,
        order: link.order,
        presentationCount: byVolume.get(link.volume.id) || 0,
        wholeVolumeCount: Math.max(0, (byVolume.get(link.volume.id) || 0) - modulePresentations),
        modules: link.volume.modules.map(m => ({
          id: m.id,
          name: m.name,
          order: m.order,
          presentationCount: byModule.get(m.id) || 0
        }))
      };
    });

    return res.json({ courseId, volumes });
  });

  router.get('/library/presentations', requireAuth(), async (req, res) => {
    const courseId = String(req.query.courseId || '').trim();
    if (!courseId) return res.status(400).json({ error: 'courseId is required' });
    if (!(await ensureCourseAccess(prisma, req.user, courseId))) {
      return res.status(403).json({ error: 'You do not have access to this course.' });
    }
    const volumeId = String(req.query.volumeId || '').trim();
    const moduleId = String(req.query.moduleId || '').trim();
    const scope = String(req.query.scope || '').trim();
    const q = String(req.query.q || '').trim();
    const page = Math.max(1, parseIntSafe(req.query.page, 1));
    const limit = Math.min(60, Math.max(1, parseIntSafe(req.query.limit, 24)));

    const where = {
      courseId,
      deletedAt: null,
      status: 'PUBLISHED',
      processingStatus: 'READY',
      ...(volumeId ? { volumeId } : {}),
      ...(moduleId ? { moduleId } : {}),
      ...(scope ? { scope } : {}),
      ...(q ? {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { module: { name: { contains: q, mode: 'insensitive' } } },
          { slides: { some: { text: { contains: q, mode: 'insensitive' } } } }
        ]
      } : {})
    };

    const [total, rows] = await Promise.all([
      prisma.presentation.count({ where }),
      prisma.presentation.findMany({
        where,
        include: PRESENTATION_INCLUDE,
        orderBy: [{ scope: 'asc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    return res.json({
      total,
      page,
      limit,
      presentations: rows.map(row => shape(row, req.user))
    });
  });

  router.get('/presentations/:id', requireAuth(), async (req, res) => {
    const presentation = await getPresentation(prisma, req.params.id);
    if (!presentation || presentation.deletedAt) return res.status(404).json({ error: 'Presentation not found' });
    if (!(await ensureCourseAccess(prisma, req.user, presentation.courseId))) {
      return res.status(403).json({ error: 'You do not have access to this presentation.' });
    }
    if (presentation.status !== 'PUBLISHED' && req.user.role !== 'ADMIN') {
      return res.status(404).json({ error: 'Presentation not found' });
    }
    if (presentation.processingStatus === 'READY' || req.user.role === 'ADMIN') {
      return res.json({ presentation: shape(presentation, req.user, { includeSlides: true }) });
    }
    return res.status(409).json({ error: 'Presentation is still being processed.' });
  });

  router.get('/presentations/:id/slides', requireAuth(), async (req, res) => {
    const presentation = await prisma.presentation.findUnique({
      where: { id: req.params.id },
      select: { id: true, courseId: true, status: true, deletedAt: true, processingStatus: true }
    });
    if (!presentation || presentation.deletedAt) return res.status(404).json({ error: 'Not found' });
    if (!(await ensureCourseAccess(prisma, req.user, presentation.courseId))) {
      return res.status(403).json({ error: 'You do not have access to this presentation.' });
    }
    if (presentation.status !== 'PUBLISHED' && req.user.role !== 'ADMIN') {
      return res.status(404).json({ error: 'Not found' });
    }
    const slides = await prisma.presentationSlide.findMany({
      where: { presentationId: presentation.id },
      orderBy: { slideNumber: 'asc' }
    });
    return res.json({
      presentationId: presentation.id,
      slides: slides.map(slide => slideForUser(slide, presentation.id, req.user))
    });
  });

  router.get('/presentations/:id/search', requireAuth(), async (req, res) => {
    const presentation = await prisma.presentation.findUnique({
      where: { id: req.params.id },
      select: { id: true, courseId: true, status: true, deletedAt: true }
    });
    if (!presentation || presentation.deletedAt) return res.status(404).json({ error: 'Not found' });
    if (!(await ensureCourseAccess(prisma, req.user, presentation.courseId))) {
      return res.status(403).json({ error: 'You do not have access to this presentation.' });
    }
    if (presentation.status !== 'PUBLISHED' && req.user.role !== 'ADMIN') {
      return res.status(404).json({ error: 'Not found' });
    }
    const q = String(req.query.q || '').trim();
    const results = await searchWithinPresentation(prisma, presentation.id, q, 80);
    return res.json({ q, results });
  });

  router.get('/search', requireAuth(), async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ q, results: [], total: 0 });
    const courseId = String(req.query.courseId || '').trim();
    if (courseId && !(await ensureCourseAccess(prisma, req.user, courseId))) {
      return res.status(403).json({ error: 'You do not have access to this course.' });
    }
    const allowed = await allowedCourseIds(prisma, req.user);
    if (req.user.role !== 'ADMIN' && (!allowed || allowed.length === 0)) {
      return res.json({ q, results: [], total: 0 });
    }
    const page = Math.max(1, parseIntSafe(req.query.page, 1));
    const limit = Math.min(50, Math.max(1, parseIntSafe(req.query.limit, 24)));
    const offset = (page - 1) * limit;

    const data = await combinedSearch(prisma, {
      q,
      user: req.user,
      courseId: courseId || null,
      volumeId: String(req.query.volumeId || '').trim() || null,
      moduleId: String(req.query.moduleId || '').trim() || null,
      topicId: String(req.query.topicId || '').trim() || null,
      conceptId: String(req.query.conceptId || '').trim() || null,
      year: parseIntSafe(req.query.year, null),
      includeDrafts: req.user.role === 'ADMIN',
      limit,
      offset
    });
    return res.json({ q, page, limit, ...data });
  });

  router.get('/library/courses', requireAuth(), async (req, res) => {
    const ids = await allowedCourseIds(prisma, req.user);
    const courses = await prisma.course.findMany({
      where: {
        active: true,
        ...(ids ? { id: { in: ids } } : {})
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, level: true, description: true }
    });
    return res.json({ courses });
  });

  return router;
}
