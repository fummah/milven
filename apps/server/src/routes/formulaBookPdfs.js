import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { extractPdfPages, looksLikePdfBuffer } from '../lib/summarySheets/pdf.js';
import { searchFormulaBookPdfs, searchWithinFormulaBook, serializeBook } from '../lib/formulaBooks/search.js';
import { enqueueFormulaBookPdf } from '../lib/formulaBooks/worker.js';
import {
  formulaBookDir,
  formulaBookKey,
  safeFilename,
  moveFile,
  hashFile,
  signedFormulaBookPdfUrl,
  verifyFormulaBookPdfToken,
  resolveFormulaBookKey,
  removeFormulaBookStorage
} from '../lib/formulaBooks/storage.js';

const MAX_PDF_BYTES = Number(process.env.FORMULA_BOOK_PDF_MAX_BYTES ?? 250 * 1024 * 1024);
const tempDir = path.join(os.tmpdir(), 'milven-formula-book-uploads');
fs.mkdirSync(tempDir, { recursive: true });

const upload = multer({
  dest: tempDir,
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/\.pdf$/i.test(file.originalname || '')) return cb(new Error('Only PDF files are accepted.'));
    cb(null, true);
  }
});

const BOOK_INCLUDE = {
  course: { select: { id: true, name: true, level: true } },
  volume: { select: { id: true, name: true } },
  pageMaps: {
    include: {
      module: { select: { id: true, name: true } },
      topic: { select: { id: true, name: true } },
      concept: { select: { id: true, name: true } }
    }
  }
};

function stripBook(book) {
  if (!book) return book;
  const { storageKey, pendingStorageKey, fileHash, pendingFileHash, ...rest } = book;
  return { ...rest, hasPdf: Boolean(storageKey) };
}

function parseArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch { return String(value).split(',').map(v => v.trim()).filter(Boolean); }
}

async function validateCourseVolume(prisma, courseId, volumeId) {
  const errors = [];
  if (!courseId) errors.push('Course is required.');
  if (!volumeId) errors.push('Volume is required.');
  const [course, volume] = await Promise.all([
    courseId ? prisma.course.findUnique({ where: { id: courseId }, select: { id: true, level: true } }) : null,
    volumeId ? prisma.volume.findUnique({ where: { id: volumeId }, select: { id: true } }) : null
  ]);
  if (courseId && !course) errors.push('Course not found.');
  if (volumeId && !volume) errors.push('Volume not found.');
  if (course && volume) {
    const link = await prisma.courseVolume.findUnique({
      where: { courseId_volumeId: { courseId, volumeId } },
      select: { courseId: true }
    });
    if (!link) errors.push('The selected Volume is not linked to this Course.');
  }
  return { errors, course };
}

async function canAccess(prisma, user, book) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (book.publicationStatus !== 'PUBLISHED') return false;
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId: book.courseId } },
    select: { id: true }
  });
  return Boolean(enrollment);
}

function cleanupTemp(file) {
  if (file?.path) { try { fs.rmSync(file.path, { force: true }); } catch {} }
}

export function formulaBookPdfsRouter(prisma) {
  const router = Router();

  router.get('/assets/:id/pdf', async (req, res) => {
    const payload = verifyFormulaBookPdfToken(String(req.query.token || ''));
    if (!payload || payload.sid !== req.params.id) return res.status(401).json({ error: 'Invalid or expired PDF link' });
    const book = await prisma.formulaBookPdf.findUnique({
      where: { id: req.params.id },
      select: { id: true, publicationStatus: true, storageKey: true, originalFilename: true }
    });
    if (!book || !book.storageKey) return res.status(404).json({ error: 'PDF not found' });
    if (book.publicationStatus !== 'PUBLISHED' && !payload.adm) return res.status(403).json({ error: 'PDF is not published' });
    try {
      const absolute = resolveFormulaBookKey(book.storageKey);
      if (!fs.existsSync(absolute)) return res.status(404).json({ error: 'PDF file is missing' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${safeFilename(book.originalFilename || 'formula-book.pdf')}"`);
      res.setHeader('Cache-Control', req.query.v ? 'private, max-age=31536000, immutable' : 'private, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.sendFile(absolute);
    } catch {
      return res.status(400).json({ error: 'Invalid PDF storage path' });
    }
  });

  router.get('/search', requireAuth(), async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ q, results: [], total: 0 });
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 24));
    const page = Math.max(1, Number(req.query.page) || 1);
    const data = await searchFormulaBookPdfs(prisma, {
      q,
      user: req.user,
      courseId: req.query.courseId || null,
      volumeId: req.query.volumeId || null,
      moduleId: req.query.moduleId || null,
      topicId: req.query.topicId || null,
      conceptId: req.query.conceptId || null,
      year: req.query.year ? Number(req.query.year) : null,
      includeDrafts: req.user.role === 'ADMIN',
      limit,
      offset: (page - 1) * limit
    });
    return res.json({ q, page, limit, ...data });
  });

  router.get('/', requireAuth(), async (req, res) => {
    const allowed = req.user.role === 'ADMIN'
      ? null
      : (await prisma.enrollment.findMany({ where: { userId: req.user.id }, select: { courseId: true } })).map(row => row.courseId);
    const where = {
      ...(req.user.role === 'ADMIN' ? {} : { publicationStatus: 'PUBLISHED' }),
      ...(allowed ? { courseId: { in: allowed } } : {}),
      ...(req.query.courseId ? { courseId: req.query.courseId } : {}),
      ...(req.query.volumeId ? { volumeId: req.query.volumeId } : {}),
      ...(req.query.year ? { year: Number(req.query.year) } : {}),
      ...(req.query.q ? { OR: [{ title: { contains: String(req.query.q), mode: 'insensitive' } }, { description: { contains: String(req.query.q), mode: 'insensitive' } }] } : {})
    };
    const mapFilters = [];
    if (req.query.moduleId) mapFilters.push({ moduleId: req.query.moduleId });
    if (req.query.topicId) mapFilters.push({ topicId: req.query.topicId });
    if (req.query.conceptId) mapFilters.push({ conceptId: req.query.conceptId });
    if (mapFilters.length) where.AND = mapFilters.map(filter => ({ pageMaps: { some: filter } }));
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 24));
    const [total, books] = await Promise.all([
      prisma.formulaBookPdf.count({ where }),
      prisma.formulaBookPdf.findMany({ where, include: BOOK_INCLUDE, orderBy: { year: 'desc' }, skip: (page - 1) * limit, take: limit })
    ]);
    return res.json({ books: books.map(stripBook), total, page, limit });
  });

  router.get('/admin', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const q = String(req.query.q || '').trim();
    const where = {
      ...(req.query.courseId ? { courseId: req.query.courseId } : {}),
      ...(req.query.volumeId ? { volumeId: req.query.volumeId } : {}),
      ...(req.query.year ? { year: Number(req.query.year) } : {}),
      ...(req.query.status ? { publicationStatus: req.query.status } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { keywords: { has: q } }] } : {})
    };
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const [total, books] = await Promise.all([
      prisma.formulaBookPdf.count({ where }),
      prisma.formulaBookPdf.findMany({ where, include: BOOK_INCLUDE, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit })
    ]);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ books: books.map(stripBook), total, page, limit });
  });

  router.post('/upload', requireAuth(), requireRole('ADMIN'), upload.single('file'), async (req, res) => {
    const file = req.file;
    try {
      if (!file) return res.status(400).json({ error: 'A PDF file is required.' });
      const buffer = await fs.promises.readFile(file.path);
      if (!looksLikePdfBuffer(buffer)) return res.status(400).json({ error: 'The uploaded file is not a valid PDF.' });
      const courseId = String(req.body.courseId || '').trim();
      const volumeId = String(req.body.volumeId || '').trim();
      const validation = await validateCourseVolume(prisma, courseId, volumeId);
      if (validation.errors.length) return res.status(400).json({ error: validation.errors[0], errors: validation.errors });
      let parsed;
      try { parsed = await extractPdfPages(buffer); } catch (err) { return res.status(400).json({ error: err?.message || 'Could not read this PDF.' }); }

      const id = crypto.randomUUID();
      const version = `pdf-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
      const destination = path.join(formulaBookDir(id), 'versions', version, 'original.pdf');
      await moveFile(file.path, destination);
      const hash = await hashFile(destination);
      const stat = await fs.promises.stat(destination);
      const title = String(req.body.title || '').trim() || path.basename(file.originalname, path.extname(file.originalname)) || 'Formula Book';
      const book = await prisma.formulaBookPdf.create({
        data: {
          id,
          title: title.slice(0, 300),
          description: String(req.body.description || '').trim().slice(0, 10000) || null,
          level: validation.course.level,
          courseId,
          volumeId,
          year: Number(req.body.year) || 2026,
          keywords: parseArray(req.body.keywords).map(v => String(v).trim()).filter(Boolean).slice(0, 40),
          originalFilename: safeFilename(file.originalname),
          storageKey: formulaBookKey('books', id, 'versions', version, 'original.pdf'),
          fileHash: hash,
          fileSize: stat.size,
          pageCount: parsed.pageCount,
          pdfVersion: version,
          processingStatus: 'INDEXING',
          searchIndexStatus: 'INDEXING',
          publicationStatus: 'DRAFT',
          createdById: req.user.id
        },
        include: BOOK_INCLUDE
      });
      enqueueFormulaBookPdf(id);
      return res.status(201).json({ book: stripBook(book), message: 'Formula Book PDF uploaded. Indexing has started.' });
    } catch (err) {
      console.error('[formula-books.upload]', err);
      return res.status(500).json({ error: err?.message || 'Failed to upload formula book PDF' });
    } finally { cleanupTemp(file); }
  });

  router.get('/:id/pdf-access', requireAuth(), async (req, res) => {
    const book = await prisma.formulaBookPdf.findUnique({ where: { id: req.params.id }, include: BOOK_INCLUDE });
    if (!book) return res.status(404).json({ error: 'Formula Book not found' });
    if (!(await canAccess(prisma, req.user, book))) return res.status(403).json({ error: 'You do not have access to this Formula Book.' });
    if (!book.storageKey) return res.status(404).json({ error: 'PDF not found' });
    return res.json({
      book: stripBook(book),
      pdfUrl: signedFormulaBookPdfUrl({ id: book.id, userId: req.user.id, admin: req.user.role === 'ADMIN', version: book.pdfVersion }),
      pageCount: book.pageCount,
      processingStatus: book.processingStatus,
      searchIndexStatus: book.searchIndexStatus
    });
  });

  router.get('/:id/search', requireAuth(), async (req, res) => {
    const book = await prisma.formulaBookPdf.findUnique({ where: { id: req.params.id }, select: { id: true, courseId: true, publicationStatus: true } });
    if (!book) return res.status(404).json({ error: 'Formula Book not found' });
    if (!(await canAccess(prisma, req.user, book))) return res.status(403).json({ error: 'You do not have access to this Formula Book.' });
    return res.json({ q: req.query.q || '', results: await searchWithinFormulaBook(prisma, book.id, req.query.q) });
  });

  router.get('/:id/page-maps', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const maps = await prisma.formulaBookPdfPageMap.findMany({
      where: { formulaBookPdfId: req.params.id },
      include: { module: true, topic: true, concept: true },
      orderBy: { pageStart: 'asc' }
    });
    return res.json({ mappings: maps });
  });

  router.put('/:id/page-maps', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const book = await prisma.formulaBookPdf.findUnique({ where: { id: req.params.id }, select: { id: true, volumeId: true, pageCount: true } });
    if (!book) return res.status(404).json({ error: 'Formula Book not found' });
    const mappings = Array.isArray(req.body.mappings) ? req.body.mappings : [];
    const normalized = [];
    for (const raw of mappings) {
      const pageStart = Number(raw.pageStart);
      const pageEnd = Number(raw.pageEnd ?? raw.pageStart);
      if (!Number.isInteger(pageStart) || !Number.isInteger(pageEnd) || pageStart < 1 || pageEnd < pageStart || pageEnd > book.pageCount) {
        return res.status(400).json({ error: `Invalid page range: ${raw.pageStart}-${raw.pageEnd}` });
      }
      if (raw.moduleId) {
        const moduleRecord = await prisma.module.findUnique({ where: { id: raw.moduleId }, select: { id: true, volumeId: true } });
        if (!moduleRecord || moduleRecord.volumeId !== book.volumeId) return res.status(400).json({ error: 'Mapped module does not belong to this Formula Book Volume.' });
      }
      if (raw.topicId) {
        const topic = await prisma.topic.findUnique({ where: { id: raw.topicId }, select: { id: true, module: { select: { volumeId: true } } } });
        if (!topic || topic.module?.volumeId !== book.volumeId) return res.status(400).json({ error: 'Mapped topic does not belong to this Formula Book Volume.' });
      }
      if (raw.conceptId) {
        const concept = await prisma.concept.findUnique({ where: { id: raw.conceptId }, select: { id: true, topic: { select: { module: { select: { volumeId: true } } } } } });
        if (!concept || concept.topic?.module?.volumeId !== book.volumeId) return res.status(400).json({ error: 'Mapped concept does not belong to this Formula Book Volume.' });
      }
      normalized.push({ formulaBookPdfId: book.id, pageStart, pageEnd, moduleId: raw.moduleId || null, topicId: raw.topicId || null, conceptId: raw.conceptId || null });
    }
    await prisma.$transaction([
      prisma.formulaBookPdfPageMap.deleteMany({ where: { formulaBookPdfId: book.id } }),
      ...(normalized.length ? [prisma.formulaBookPdfPageMap.createMany({ data: normalized })] : [])
    ]);
    return res.json({ ok: true, count: normalized.length });
  });

  router.post('/:id/replace', requireAuth(), requireRole('ADMIN'), upload.single('file'), async (req, res) => {
    const file = req.file;
    try {
      const book = await prisma.formulaBookPdf.findUnique({ where: { id: req.params.id } });
      if (!book) return res.status(404).json({ error: 'Formula Book not found' });
      if (!file) return res.status(400).json({ error: 'A PDF file is required.' });
      const buffer = await fs.promises.readFile(file.path);
      if (!looksLikePdfBuffer(buffer)) return res.status(400).json({ error: 'The uploaded file is not a valid PDF.' });
      try { await extractPdfPages(buffer); } catch (err) { return res.status(400).json({ error: err?.message || 'Could not read this PDF.' }); }
      const version = `pdf-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
      const destination = path.join(formulaBookDir(book.id), 'versions', version, 'original.pdf');
      await moveFile(file.path, destination);
      const updated = await prisma.formulaBookPdf.update({
        where: { id: book.id },
        data: {
          pendingStorageKey: formulaBookKey('books', book.id, 'versions', version, 'original.pdf'),
          pendingFileHash: await hashFile(destination),
          pendingFileSize: (await fs.promises.stat(destination)).size,
          pendingPdfVersion: version,
          pendingFilename: safeFilename(file.originalname),
          processingStatus: 'INDEXING',
          searchIndexStatus: 'INDEXING',
          processingError: null,
          processingAttempts: 0
        },
        include: BOOK_INCLUDE
      });
      enqueueFormulaBookPdf(book.id);
      return res.json({ book: stripBook(updated), message: 'Replacement PDF uploaded. The current PDF stays available until indexing succeeds.' });
    } catch (err) {
      console.error('[formula-books.replace]', err);
      return res.status(500).json({ error: err?.message || 'Failed to replace PDF' });
    } finally { cleanupTemp(file); }
  });

  router.put('/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const book = await prisma.formulaBookPdf.findUnique({ where: { id: req.params.id } });
    if (!book) return res.status(404).json({ error: 'Formula Book not found' });
    const courseId = String(req.body.courseId || book.courseId);
    const volumeId = String(req.body.volumeId || book.volumeId);
    const validation = await validateCourseVolume(prisma, courseId, volumeId);
    if (validation.errors.length) return res.status(400).json({ error: validation.errors[0], errors: validation.errors });
    const nextStatus = req.body.publicationStatus ? String(req.body.publicationStatus).toUpperCase() : book.publicationStatus;
    if (nextStatus === 'PUBLISHED' && (book.processingStatus !== 'READY' || book.pageCount < 1)) {
      return res.status(400).json({ error: 'Only fully indexed Formula Book PDFs can be published.' });
    }
    const updated = await prisma.formulaBookPdf.update({
      where: { id: book.id },
      data: {
        ...(req.body.title ? { title: String(req.body.title).trim().slice(0, 300) } : {}),
        ...(typeof req.body.description !== 'undefined' ? { description: String(req.body.description || '').trim().slice(0, 10000) || null } : {}),
        ...(typeof req.body.keywords !== 'undefined' ? { keywords: parseArray(req.body.keywords) } : {}),
        ...(req.body.year ? { year: Number(req.body.year) } : {}),
        courseId, volumeId, level: validation.course.level,
        publicationStatus: nextStatus === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
      },
      include: BOOK_INCLUDE
    });
    return res.json({ book: stripBook(updated) });
  });

  router.post('/:id/reindex', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const book = await prisma.formulaBookPdf.findUnique({ where: { id: req.params.id } });
    if (!book) return res.status(404).json({ error: 'Formula Book not found' });
    await prisma.formulaBookPdf.update({ where: { id: book.id }, data: { processingStatus: 'INDEXING', searchIndexStatus: 'INDEXING', processingError: null, processingAttempts: 0 } });
    enqueueFormulaBookPdf(book.id);
    return res.json({ ok: true });
  });

  router.get('/:id/download', requireAuth(), async (req, res) => {
    const book = await prisma.formulaBookPdf.findUnique({ where: { id: req.params.id }, select: { id: true, courseId: true, publicationStatus: true, storageKey: true, originalFilename: true } });
    if (!book || !book.storageKey) return res.status(404).json({ error: 'PDF not found' });
    if (!(await canAccess(prisma, req.user, book))) return res.status(403).json({ error: 'You do not have access to this PDF.' });
    try { return res.download(resolveFormulaBookKey(book.storageKey), book.originalFilename || 'formula-book.pdf'); }
    catch { return res.status(400).json({ error: 'Invalid PDF storage path' }); }
  });

  router.get('/:id', requireAuth(), async (req, res) => {
    const book = await prisma.formulaBookPdf.findUnique({ where: { id: req.params.id }, include: BOOK_INCLUDE });
    if (!book) return res.status(404).json({ error: 'Formula Book not found' });
    if (!(await canAccess(prisma, req.user, book))) return res.status(403).json({ error: 'You do not have access to this Formula Book.' });
    return res.json({ book: stripBook(book) });
  });

  router.delete('/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const book = await prisma.formulaBookPdf.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!book) return res.status(404).json({ error: 'Formula Book not found' });
    await prisma.formulaBookPdf.delete({ where: { id: book.id } });
    removeFormulaBookStorage(book.id);
    return res.json({ ok: true });
  });

  return router;
}
