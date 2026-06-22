import { Router } from 'express';
import Stripe from 'stripe';
import OpenAI from 'openai';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { getOpenAIApiKey, LATEX_SYSTEM_RULES, LATEX_PROMPT_SECTION } from '../lib/openai.js';

export function cmsRouter(prisma) {
	const router = Router();

  // Natural sort comparison - handles "Volume 1", "Volume 10" correctly
  function naturalCompare(a, b) {
    const ax = [], bx = [];
    (a || '').replace(/(\d+)|(\D+)/g, (_, $1, $2) => { ax.push([$1 || Infinity, $2 || '']); });
    (b || '').replace(/(\d+)|(\D+)/g, (_, $1, $2) => { bx.push([$1 || Infinity, $2 || '']); });
    while (ax.length && bx.length) {
      const an = ax.shift();
      const bn = bx.shift();
      const nn = (parseInt(an[0], 10) || 0) - (parseInt(bn[0], 10) || 0) || an[1].localeCompare(bn[1]);
      if (nn) return nn;
    }
    return ax.length - bx.length;
  }

  // Sort volumes by natural order (handles "Volume 1", "Volume 2", "Volume 10" correctly)
  function sortVolumes(volumes) {
    return volumes.slice().sort((a, b) => naturalCompare(a.name, b.name));
  }

  // Local Stripe helper (mirrors billing.ensureStripeProductAndPrice)
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: '2023-10-16' }) : null;

  async function getDefaultVolumeIdForCourse(courseId) {
    if (!courseId) return null;
    const existingLink = await prisma.courseVolume.findFirst({
      where: { courseId: String(courseId) },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { volumeId: true }
    });
    if (existingLink?.volumeId) return existingLink.volumeId;

    const createdVolume = await prisma.volume.create({
      data: { name: 'Volume 1' },
      select: { id: true }
    });
    await prisma.courseVolume.create({
      data: { courseId: String(courseId), volumeId: createdVolume.id, order: 1 }
    });
    return createdVolume.id;
  }

  async function getOrCreateUnassignedModuleForCourse(courseId) {
    if (!courseId) return null;
    const course = await prisma.course.findUnique({ where: { id: String(courseId) }, select: { id: true, level: true } });
    if (!course) return null;
    const volumeId = await getDefaultVolumeIdForCourse(course.id);
    if (!volumeId) return null;
    const existing = await prisma.module.findFirst({
      where: { volumeId, courseId: course.id, name: 'Unassigned' },
      select: { id: true }
    });
    if (existing?.id) return existing.id;
    const max = await prisma.module.findFirst({
      where: { volumeId, courseId: course.id },
      orderBy: [{ order: 'desc' }, { createdAt: 'desc' }],
      select: { order: true }
    });
    const created = await prisma.module.create({
      data: {
        name: 'Unassigned',
        level: course.level,
        courseId: course.id,
        volumeId,
        order: (max?.order ?? 0) + 1
      },
      select: { id: true }
    });
    return created.id;
  }

  async function deriveQuestionPathIdsFromTopic(topicId) {
    if (!topicId) return { courseId: null, volumeId: null, moduleId: null, level: null };
    const topic = await prisma.topic.findUnique({
      where: { id: String(topicId) },
      select: {
        moduleId: true,
        level: true,
        module: {
          select: {
            courseId: true,
            volumeId: true,
            course: {
              select: {
                level: true
              }
            }
          }
        }
      }
    });
    const moduleId = topic?.moduleId ?? null;
    const volumeId = topic?.module?.volumeId ?? null;
    const courseId = topic?.module?.courseId ?? null;
    const level = topic?.level ?? topic?.module?.course?.level ?? null;
    return { courseId, volumeId, moduleId, level };
  }

  async function assertVolumeLinkedToCourse({ courseId, volumeId }) {
    if (!courseId || !volumeId) return false;
    const link = await prisma.courseVolume.findUnique({
      where: { courseId_volumeId: { courseId: String(courseId), volumeId: String(volumeId) } },
      select: { courseId: true }
    }).catch(() => null);
    return !!link;
  }

  async function ensureStripeProductAndPriceLocal(p) {
    if (!stripe) return p;
    let sp = p.stripeProductId ? await stripe.products.retrieve(p.stripeProductId).catch(() => null) : null;
    if (!sp) {
      sp = await stripe.products.create({ name: p.name, active: p.active, description: p.description || undefined });
    } else {
      await stripe.products.update(sp.id, { name: p.name, active: p.active, description: p.description ?? undefined });
    }
    // Prices are immutable for amount/interval
    let needNewPrice = !p.stripePriceId;
    if (p.stripePriceId) {
      try {
        const existing = await stripe.prices.retrieve(p.stripePriceId);
        const recurring = (p.interval === 'MONTHLY' || p.interval === 'YEARLY');
        const intervalOk = recurring ? (existing.recurring && ((p.interval === 'MONTHLY' && existing.recurring.interval === 'month') || (p.interval === 'YEARLY' && existing.recurring.interval === 'year'))) : !existing.recurring;
        const amountOk = existing.unit_amount === p.priceCents;
        const activeOk = existing.active;
        if (!(intervalOk && amountOk && activeOk)) {
          needNewPrice = true;
          await stripe.prices.update(existing.id, { active: false });
        }
      } catch {
        needNewPrice = true;
      }
    }
    let priceId = p.stripePriceId || null;
    if (needNewPrice) {
      const base = { product: sp.id, unit_amount: p.priceCents, currency: 'usd', nickname: p.name };
      const created = await stripe.prices.create({
        ...base,
        ...(p.interval === 'ONE_TIME' ? {} : (p.interval === 'MONTHLY' ? { recurring: { interval: 'month' } } : { recurring: { interval: 'year' } }))
      });
      priceId = created.id;
    }
    if (sp.id !== p.stripeProductId || priceId !== p.stripePriceId) {
      const updated = await prisma.product.update({ where: { id: p.id }, data: { stripeProductId: sp.id, stripePriceId: priceId } });
      return updated;
    }
    return p;
  }
  /**
   * Helper: resolve the page number at a given character offset in the full text
   * by scanning backwards for the nearest [PAGE N] marker.
   */
  function getPageAtOffset(fullText, offset) {
    const before = fullText.substring(0, offset);
    const matches = [...before.matchAll(/\[PAGE (\d+)\]/g)];
    if (matches.length > 0) return parseInt(matches[matches.length - 1][1], 10);
    return null;
  }

  /**
   * LOS detection patterns — CFA Learning Outcome Statements typically start
   * with action verbs like "describe", "explain", "calculate", "compare", etc.
   */
  const LOS_VERBS = [
    'describe', 'explain', 'calculate', 'compare', 'contrast', 'evaluate',
    'discuss', 'distinguish', 'interpret', 'identify', 'define', 'determine',
    'demonstrate', 'formulate', 'recommend', 'justify', 'analyze', 'assess',
    'classify', 'construct', 'estimate', 'illustrate', 'measure', 'select',
    'support', 'critique'
  ];
  const LOS_PATTERN = new RegExp(
    `(?:^|\\n)\\s*(?:(?:the candidate should be able to|the member should be able to|learning outcome(?:s)?:?|los:?)\\s*)?` +
    `((?:${LOS_VERBS.join('|')})\\b[^\\n]{10,200})`,
    'gim'
  );

  /**
   * Formula detection — lines containing mathematical notation patterns
   * (=, /, ×, ^, subscripts, Greek letters, common finance abbreviations).
   */
  const FORMULA_PATTERN = /(?:^|\n)([^\n]*(?:[\=][\s]*[^\n]*[\+\-\*\/\^]|(?:PV|FV|NPV|IRR|WACC|EPS|ROE|ROA|CAPM|YTM|HPR|DDM|FCF|FCFE|FCFF|EVA|σ|β|α|μ|Σ|√|∑|∏|∫|Δ)\s*[=])[^\n]*)/gim;

  /**
   * Validate that traceSection is consistent with the assigned topic name.
   * If mismatch is detected (e.g. topic is "Standard I" but trace says "Standard VI"), correct it.
   */
  function validateTraceSection(traceSection, topicName) {
    if (!traceSection || !topicName) return traceSection || topicName || '';
    const traceLower = traceSection.toLowerCase().trim();
    const topicLower = topicName.toLowerCase().trim();
    // Extract key identifiers from topic name (e.g. "Standard I" from "Standard I: Professionalism")
    const topicKeyMatch = topicName.match(/^(standard\s+[ivxlcdm]+|reading\s+\d+|module\s+\d+|chapter\s+\d+|topic\s+\d+)/i);
    const topicKey = topicKeyMatch ? topicKeyMatch[1].toLowerCase() : null;
    if (topicKey) {
      // Check if traceSection references the same standard/reading/module
      if (traceLower.includes(topicKey)) return traceSection; // consistent
      // Check if traceSection references a DIFFERENT standard/reading (mismatch)
      const traceKeyMatch = traceSection.match(/^(standard\s+[ivxlcdm]+|reading\s+\d+|module\s+\d+|chapter\s+\d+|topic\s+\d+)/i);
      if (traceKeyMatch) {
        const traceKey = traceKeyMatch[1].toLowerCase();
        if (traceKey !== topicKey) {
          // Mismatch detected: replace with topic name as traceSection
          console.log(`[AI trace fix] traceSection "${traceSection}" does not match topic "${topicName}" — correcting`);
          return topicName;
        }
      }
    }
    // General check: does the topic name or a significant portion appear in the trace?
    const topicWords = topicLower.split(/[\s:,\-]+/).filter(w => w.length > 3);
    const matchCount = topicWords.filter(w => traceLower.includes(w)).length;
    if (topicWords.length > 0 && matchCount === 0) {
      // No overlap at all — likely a mismatch
      console.log(`[AI trace fix] traceSection "${traceSection}" has no overlap with topic "${topicName}" — correcting`);
      return `${topicName} — ${traceSection}`;
    }
    return traceSection;
  }

  /**
   * Build a topic-aware curriculum excerpt from extracted PDF text.
   * This enhanced version:
   * 1) Preserves [PAGE N] markers from the extracted text for accurate page references
   * 2) Extracts LOS (Learning Outcome Statements) near selected topics
   * 3) Prioritises formula-containing sections and topic-heading sections
   * 4) Uses larger context windows around high-value hits (LOS + formulas)
   * 5) Returns structured sections with page references
   */
  function buildCurriculumExcerpt(fullText, topicNames = [], conceptNames = [], maxChars = 40000) {
    if (!fullText) return '';
    if (fullText.length <= maxChars) return fullText;

    const keywords = [...topicNames, ...conceptNames]
      .flatMap(n => n.split(/[\s,;:()\-\/]+/).filter(w => w.length > 3))
      .map(w => w.toLowerCase());

    if (keywords.length === 0) {
      return fullText.substring(0, maxChars) + '\n... [document truncated]';
    }

    // ── Phase 1: Find all LOS statements near topics ──────────────────────
    const losHits = [];
    let m;
    while ((m = LOS_PATTERN.exec(fullText)) !== null) {
      const losText = (m[1] || m[0]).trim();
      const pos = m.index;
      const page = getPageAtOffset(fullText, pos);
      // Score: does this LOS relate to our topic keywords?
      const lower = losText.toLowerCase();
      const relevance = keywords.reduce((s, kw) => s + (lower.includes(kw) ? 3 : 0), 0);
      // Also check the surrounding 500 chars for keyword proximity
      const context = fullText.substring(Math.max(0, pos - 500), Math.min(fullText.length, pos + 500)).toLowerCase();
      const proximity = keywords.reduce((s, kw) => s + (context.includes(kw) ? 2 : 0), 0);
      losHits.push({ pos, losText, page, score: relevance + proximity });
    }

    // ── Phase 2: Find all formula sections ────────────────────────────────
    const formulaHits = [];
    while ((m = FORMULA_PATTERN.exec(fullText)) !== null) {
      const formulaText = (m[1] || m[0]).trim();
      const pos = m.index;
      const page = getPageAtOffset(fullText, pos);
      const context = fullText.substring(Math.max(0, pos - 500), Math.min(fullText.length, pos + 500)).toLowerCase();
      const relevance = keywords.reduce((s, kw) => s + (context.includes(kw) ? 2 : 0), 0);
      formulaHits.push({ pos, formulaText, page, score: relevance });
    }

    // ── Phase 3: Score windows with boosted weights for LOS + formulas ───
    const WINDOW = 2500;
    const STEP = 500;
    const windows = [];
    for (let i = 0; i < fullText.length; i += STEP) {
      const chunk = fullText.substring(i, i + WINDOW);
      const lower = chunk.toLowerCase();
      // Base keyword score
      let score = keywords.reduce((s, kw) => {
        let count = 0;
        let idx = 0;
        while ((idx = lower.indexOf(kw, idx)) !== -1) { count++; idx += kw.length; }
        return s + count;
      }, 0);

      // Boost: +10 for each LOS in this window
      for (const los of losHits) {
        if (los.pos >= i && los.pos < i + WINDOW && los.score > 0) score += 10;
      }

      // Boost: +5 for each formula in this window
      for (const f of formulaHits) {
        if (f.pos >= i && f.pos < i + WINDOW && f.score > 0) score += 5;
      }

      // Boost: topic name appears as a heading (all caps or followed by newline)
      for (const tn of topicNames) {
        const tnLower = tn.toLowerCase();
        if (lower.includes(tnLower)) {
          // Check if it looks like a heading (preceded by newline, followed by newline)
          const idx = lower.indexOf(tnLower);
          const before = lower.substring(Math.max(0, idx - 5), idx);
          if (before.includes('\n') || idx < 5) score += 8;
        }
      }

      windows.push({ start: i, score });
    }

    // Sort windows by score descending, take top-scoring until maxChars filled
    windows.sort((a, b) => b.score - a.score);

    const selectedRanges = [];
    let totalChars = 0;

    for (const w of windows) {
      if (totalChars >= maxChars) break;
      if (w.score === 0) break; // Don't include irrelevant sections
      const start = w.start;
      const end = Math.min(w.start + WINDOW, fullText.length);
      const budget = Math.min(end - start, maxChars - totalChars);
      selectedRanges.push({ start, end: start + budget, score: w.score });
      totalChars += budget;
    }

    // Sort selected ranges by position for coherent reading order
    selectedRanges.sort((a, b) => a.start - b.start);

    // Merge adjacent/overlapping ranges
    const merged = [];
    for (const r of selectedRanges) {
      if (merged.length > 0 && r.start <= merged[merged.length - 1].end + 300) {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end);
      } else {
        merged.push({ ...r });
      }
    }

    // Build excerpt with page references
    const excerpt = merged.map((r, i) => {
      const text = fullText.substring(r.start, r.end).trim();
      const page = getPageAtOffset(fullText, r.start);
      const prefix = page ? `[... content from page ${page} ...]\n` : (r.start > 0 ? '[...]\n' : '');
      const suffix = i < merged.length - 1 ? '\n[...]\n' : '';
      return prefix + text + suffix;
    }).join('\n');

    // Prepend a summary of found LOS for the AI
    const relevantLOS = losHits.filter(l => l.score > 0).sort((a, b) => b.score - a.score).slice(0, 20);
    let losSummary = '';
    if (relevantLOS.length > 0) {
      losSummary = 'LEARNING OUTCOME STATEMENTS (LOS) FOUND IN DOCUMENT:\n';
      for (const los of relevantLOS) {
        losSummary += `  • ${los.losText}${los.page ? ` (page ${los.page})` : ''}\n`;
      }
      losSummary += '\n';
    }

    // Prepend a summary of found formulas for the AI
    const relevantFormulas = formulaHits.filter(f => f.score > 0).sort((a, b) => b.score - a.score).slice(0, 15);
    let formulaSummary = '';
    if (relevantFormulas.length > 0) {
      formulaSummary = 'KEY FORMULAS FOUND IN DOCUMENT (use these EXACTLY as written — do not modify notation):\n';
      for (const f of relevantFormulas) {
        formulaSummary += `  • ${f.formulaText}${f.page ? ` (page ${f.page})` : ''}\n`;
      }
      formulaSummary += '\n';
    }

    return losSummary + formulaSummary + excerpt + (merged.length > 0 && merged[merged.length - 1]?.end < fullText.length ? '\n... [additional content omitted]' : '');
  }

  // file upload setup
  const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');
  try { fs.mkdirSync(uploadDir, { recursive: true }); } catch {}
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const base = path.basename(file.originalname || 'file', ext).replace(/[^\w\-]+/g, '');
      cb(null, `${Date.now()}_${base}${ext}`);
    }
  });
  const upload = multer({ storage });
  router.post('/upload', requireAuth(), requireRole('ADMIN'), upload.single('file'), (req, res) => {
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'file missing' });
    const fileUrl = `/uploads/${f.filename}`;
    return res.json({ url: fileUrl, filename: f.originalname, size: f.size, mime: f.mimetype });
  });

  // ── Curriculum Document endpoints (PDF upload for AI fine-tuning) ──
  const pdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

  // List all curriculum documents
  router.get('/curriculum-documents', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    try {
      const docs = await prisma.curriculumDocument.findMany({
        include: { course: { select: { id: true, name: true, level: true } }, volume: { select: { id: true, name: true, description: true } } },
        orderBy: { createdAt: 'desc' }
      });
      return res.json({ documents: docs.map(d => ({
        ...d,
        extractedText: undefined,
        hasText: !!d.extractedText,
        textLength: d.extractedText?.length || 0,
        pageCount: d.extractedText ? (d.extractedText.match(/\[PAGE \d+\]/g) || []).length : 0
      })) });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to list documents' });
    }
  });

  // Upload a curriculum PDF for a course + volume
  router.post('/curriculum-documents', requireAuth(), requireRole('ADMIN'), pdfUpload.single('file'), async (req, res) => {
    try {
      const { courseId, volumeId } = req.body;
      if (!courseId || !volumeId) return res.status(400).json({ error: 'courseId and volumeId are required' });
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'PDF file is required' });
      if (!file.originalname.toLowerCase().endsWith('.pdf')) return res.status(400).json({ error: 'Only PDF files are accepted' });

      // Verify course and volume exist
      const [course, volume] = await Promise.all([
        prisma.course.findUnique({ where: { id: courseId }, select: { id: true } }),
        prisma.volume.findUnique({ where: { id: volumeId }, select: { id: true } })
      ]);
      if (!course) return res.status(404).json({ error: 'Course not found' });
      if (!volume) return res.status(404).json({ error: 'Volume not found' });

      // Extract text from PDF with per-page markers for accurate page referencing
      // Also detect superscript/subscript via font-size and baseline comparisons
      let extractedText = '';
      try {
        const pageTexts = [];
        const result = await pdfParse(file.buffer, {
          pagerender: async function (pageData) {
            const textContent = await pageData.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
            let text = '';
            let lastY = null;
            let lastFontSize = null;
            for (const item of textContent.items) {
              const y = item.transform[5];
              const fontSize = Math.abs(item.transform[0]) || item.height || 12;
              if (lastY !== null && Math.abs(lastY - y) > 2) text += '\n';

              // Detect super/subscript: significantly smaller font AND on the same visual line
              const str = item.str;
              if (lastFontSize && fontSize > 0 && lastFontSize > 0) {
                const ratio = fontSize / lastFontSize;
                const yDiff = y - (lastY || y);
                // Superscript: smaller font, shifted up (higher y in PDF coords)
                if (ratio < 0.8 && yDiff > 1 && str.length <= 6) {
                  text += `^{${str}}`;
                  lastY = y;
                  continue;
                }
                // Subscript: smaller font, shifted down (lower y in PDF coords)
                if (ratio < 0.8 && yDiff < -1 && str.length <= 6) {
                  text += `_{${str}}`;
                  lastY = y;
                  continue;
                }
              }

              text += str;
              lastY = y;
              lastFontSize = fontSize;
            }
            const pageNum = pageTexts.length + 1;
            const pageText = text.trim();
            pageTexts.push(pageText);
            return `\n[PAGE ${pageNum}]\n${pageText}`;
          }
        });
        extractedText = result.text || '';
      } catch (pdfErr) {
        console.error('PDF parse error:', pdfErr.message, pdfErr.stack);
        return res.status(400).json({ error: 'Failed to extract text from PDF. Ensure it is a valid, non-encrypted PDF.' });
      }

      if (!extractedText || extractedText.trim().length < 100) {
        return res.status(400).json({ error: 'PDF appears to contain very little extractable text. Please upload a text-based PDF (not scanned images).' });
      }

      // Save the actual PDF file to disk for preview/serving
      const fsPromises = await import('fs/promises');
      const pathModule = await import('path');
      // Keep original filename but sanitize for filesystem safety
      const diskFilename = file.originalname
        .replace(/[^a-zA-Z0-9._\-\s]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_{2,}/g, '_') || 'document.pdf';
      const uploadDir = pathModule.default.join(process.cwd(), 'uploads', 'curriculum-pdfs');
      await fsPromises.default.mkdir(uploadDir, { recursive: true });
      await fsPromises.default.writeFile(pathModule.default.join(uploadDir, diskFilename), file.buffer);

      // Delete old file if it exists
      const existingDoc = await prisma.curriculumDocument.findUnique({
        where: { courseId_volumeId: { courseId, volumeId } },
        select: { filename: true }
      });
      if (existingDoc && existingDoc.filename && existingDoc.filename !== file.originalname) {
        try {
          await fsPromises.default.unlink(pathModule.default.join(uploadDir, existingDoc.filename));
        } catch (e) { /* old file may not exist on disk */ }
      }

      // Upsert: replace existing document for this course+volume
      const doc = await prisma.curriculumDocument.upsert({
        where: { courseId_volumeId: { courseId, volumeId } },
        create: {
          courseId,
          volumeId,
          filename: diskFilename,
          fileSize: file.size,
          extractedText,
          uploadedById: req.user?.id || null
        },
        update: {
          filename: diskFilename,
          fileSize: file.size,
          extractedText,
          uploadedById: req.user?.id || null
        },
        include: { course: { select: { id: true, name: true, level: true } }, volume: { select: { id: true, name: true, description: true } } }
      });

      // Count detected pages from [PAGE N] markers
      const pageCount = (extractedText.match(/\[PAGE \d+\]/g) || []).length;
      console.log(`[curriculum-upload] ${file.originalname}: ${pageCount} pages, ${extractedText.length} chars extracted`);

      return res.status(201).json({
        document: { ...doc, extractedText: undefined, hasText: true, textLength: extractedText.length, pageCount }
      });
    } catch (err) {
      if (err.code === 'P2002') return res.status(409).json({ error: 'A document already exists for this course + volume combination' });
      return res.status(500).json({ error: err.message || 'Failed to upload document' });
    }
  });

  // Delete a curriculum document
  router.delete('/curriculum-documents/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    try {
      await prisma.curriculumDocument.delete({ where: { id: req.params.id } });
      return res.json({ success: true });
    } catch (err) {
      if (err.code === 'P2025') return res.status(404).json({ error: 'Document not found' });
      return res.status(500).json({ error: err.message || 'Failed to delete document' });
    }
  });

  // ── Bulk Upload endpoints ──────────────────────────────────────────
  const xlsUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

  router.post('/bulk/volumes', requireAuth(), requireRole('ADMIN'), xlsUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'file missing' });
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      if (!rows.length) return res.status(400).json({ error: 'Empty spreadsheet' });
      const results = { created: 0, errors: [] };
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const courseName = (row['Course Name'] ?? '').toString().trim();
        const volName = (row['Volume Name/Description'] ?? row['Volume Name'] ?? '').toString().trim();
        const volNumberRaw = row['Volume Number'] != null ? String(row['Volume Number']).trim() : '';
        const volNumberInt = volNumberRaw && !isNaN(Number(volNumberRaw)) ? Number(volNumberRaw) : undefined;
        if (!courseName || !volName) { results.errors.push(`Row ${i + 2}: Missing Course Name or Volume Name`); continue; }
        const course = await prisma.course.findFirst({ where: { name: { equals: courseName, mode: 'insensitive' } } });
        if (!course) { results.errors.push(`Row ${i + 2}: Course "${courseName}" not found`); continue; }
        // Find volume scoped to this course (one volume per course, even if names match)
        const existingLink = await prisma.courseVolume.findFirst({
          where: { courseId: course.id, volume: { name: { equals: volName, mode: 'insensitive' } } },
          include: { volume: true }
        });
        let volume = existingLink?.volume;
        if (!volume) {
          // Create a new volume for this course (never reuse from another course)
          volume = await prisma.volume.create({ data: { name: volName, description: volNumberRaw || undefined } });
          const max = await prisma.courseVolume.findFirst({ where: { courseId: course.id }, orderBy: { order: 'desc' }, select: { order: true } });
          await prisma.courseVolume.create({ data: { courseId: course.id, volumeId: volume.id, order: volNumberInt ?? ((max?.order ?? 0) + 1) } });
        }
        results.created++;
      }
      return res.json({ ok: true, ...results });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  });

  router.post('/bulk/modules', requireAuth(), requireRole('ADMIN'), xlsUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'file missing' });
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      if (!rows.length) return res.status(400).json({ error: 'Empty spreadsheet' });
      const results = { created: 0, errors: [] };
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const courseName = (row['Course Name'] ?? '').toString().trim();
        const volName = (row['Volume Name/Description'] ?? row['Volume Name'] ?? '').toString().trim();
        const lmName = (row['LM Name/Description'] ?? row['LM Name'] ?? '').toString().trim();
        const orderNum = row['Order Number'] != null ? Number(row['Order Number']) : undefined;
        if (!courseName || !volName || !lmName) { results.errors.push(`Row ${i + 2}: Missing required field`); continue; }
        const course = await prisma.course.findFirst({ where: { name: { equals: courseName, mode: 'insensitive' } } });
        if (!course) { results.errors.push(`Row ${i + 2}: Course "${courseName}" not found`); continue; }
        // Find volume scoped to this course
        const volLink = await prisma.courseVolume.findFirst({
          where: { courseId: course.id, volume: { name: { equals: volName, mode: 'insensitive' } } },
          include: { volume: true }
        });
        const volume = volLink?.volume;
        if (!volume) { results.errors.push(`Row ${i + 2}: Volume "${volName}" not found for course "${courseName}"`); continue; }
        const max = await prisma.module.findFirst({ where: { volumeId: volume.id, courseId: course.id }, orderBy: { order: 'desc' }, select: { order: true } });
        const order = orderNum ?? ((max?.order ?? 0) + 1);
        await prisma.module.create({ data: { name: lmName, level: course.level, courseId: course.id, volumeId: volume.id, order } });
        results.created++;
      }
      return res.json({ ok: true, ...results });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  });

  router.post('/bulk/topics', requireAuth(), requireRole('ADMIN'), xlsUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'file missing' });
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      if (!rows.length) return res.status(400).json({ error: 'Empty spreadsheet' });
      const results = { created: 0, errors: [] };
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const courseName = (row['Course Name'] ?? '').toString().trim();
        const volName = (row['Volume Name/Description'] ?? row['Volume Name'] ?? '').toString().trim();
        const lmName = (row['LM Name/Description'] ?? row['LM Name'] ?? '').toString().trim();
        const topicName = (row['Topic Name/Description'] ?? row['Topic Name'] ?? '').toString().trim();
        const orderNum = row['Order Number'] != null ? Number(row['Order Number']) : undefined;
        if (!courseName || !lmName || !topicName) { results.errors.push(`Row ${i + 2}: Missing required field`); continue; }
        const course = await prisma.course.findFirst({ where: { name: { equals: courseName, mode: 'insensitive' } } });
        if (!course) { results.errors.push(`Row ${i + 2}: Course "${courseName}" not found`); continue; }
        const moduleWhere = { name: { equals: lmName, mode: 'insensitive' }, courseId: course.id };
        const mod = await prisma.module.findFirst({ where: moduleWhere });
        if (!mod) { results.errors.push(`Row ${i + 2}: Learning Module "${lmName}" not found for course "${courseName}"`); continue; }
        const losCode = (row['LOS Code'] ?? '').toString().trim() || undefined;
        const commandWord = (row['Command Word'] ?? '').toString().trim() || undefined;
        const learningOutcomeStatement = (row['Learning Outcome Statement'] ?? '').toString().trim() || undefined;
        const max = await prisma.topic.findFirst({ where: { moduleId: mod.id }, orderBy: { order: 'desc' }, select: { order: true } });
        const order = orderNum ?? ((max?.order ?? 0) + 1);
        await prisma.topic.create({ data: { name: topicName, level: course.level, courseId: course.id, moduleId: mod.id, order, losCode, commandWord, learningOutcomeStatement } });
        results.created++;
      }
      return res.json({ ok: true, ...results });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  });

  router.post('/bulk/concepts', requireAuth(), requireRole('ADMIN'), xlsUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'file missing' });
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      if (!rows.length) return res.status(400).json({ error: 'Empty spreadsheet' });
      const results = { created: 0, errors: [] };
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const courseName = (row['Course Name'] ?? '').toString().trim();
        const lmName = (row['LM Name/Description'] ?? row['LM Name'] ?? '').toString().trim();
        const topicName = (row['Topic Name/Description'] ?? row['Topic Name'] ?? '').toString().trim();
        const conceptName = (row['Concept Name/Description'] ?? row['Concept Name'] ?? '').toString().trim();
        const orderNum = row['Order Number'] != null ? Number(row['Order Number']) : undefined;
        if (!courseName || !topicName || !conceptName) { results.errors.push(`Row ${i + 2}: Missing required field`); continue; }
        const course = await prisma.course.findFirst({ where: { name: { equals: courseName, mode: 'insensitive' } } });
        if (!course) { results.errors.push(`Row ${i + 2}: Course "${courseName}" not found`); continue; }
        const topicWhere = { name: { equals: topicName, mode: 'insensitive' }, courseId: course.id };
        const topic = await prisma.topic.findFirst({ where: topicWhere });
        if (!topic) { results.errors.push(`Row ${i + 2}: Topic "${topicName}" not found for course "${courseName}"`); continue; }
        const max = await prisma.concept.findFirst({ where: { topicId: topic.id }, orderBy: { order: 'desc' }, select: { order: true } });
        const order = orderNum ?? ((max?.order ?? 0) + 1);
        const losCode = (row['LOS Code'] ?? '').toString().trim() || undefined;
        const commandWord = (row['Command Word'] ?? '').toString().trim() || undefined;
        const learningOutcomeStatement = (row['Learning Outcome Statement'] ?? '').toString().trim() || undefined;
        await prisma.concept.create({ data: { name: conceptName, topicId: topic.id, order, losCode, commandWord, learningOutcomeStatement } });
        results.created++;
      }
      return res.json({ ok: true, ...results });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  });

  // Levels
  router.get('/levels', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const levels = await prisma.levelDef.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] });
    return res.json({ levels });
  });
  router.post('/levels', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      code: z.string().min(2),
      order: z.number().int().optional(),
      active: z.boolean().optional()
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const level = await prisma.levelDef.create({ data: parse.data });
    return res.status(201).json({ level });
  });
  router.put('/levels/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const schema = z.object({
      name: z.string().min(2).optional(),
      code: z.string().min(2).optional(),
      order: z.number().int().optional(),
      active: z.boolean().optional()
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const level = await prisma.levelDef.update({ where: { id }, data: parse.data });
    return res.json({ level });
  });
  router.delete('/levels/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    await prisma.levelDef.delete({ where: { id } });
    return res.json({ ok: true });
  });

  // Courses
  router.get('/courses', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const q = (req.query.q ?? '').toString().trim();
    const level = req.query.level;
    const active = req.query.active;
    const where = {
      AND: [
        q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] } : {},
        level ? { level } : {},
        typeof active !== 'undefined' ? { active: active === 'true' } : {}
      ]
    };
    const [total, rows] = await Promise.all([
      prisma.course.count({ where }),
      prisma.course.findMany({
        where,
        orderBy: { name: 'asc' },
        include: { courseProducts: { include: { product: true } } }
      })
    ]);
    const courses = rows.map(c => ({
      ...c,
      products: (c.courseProducts || []).map(cp => cp.product)
    }));
    return res.json({ total, courses });
  });
  // Course detail
  router.get('/courses/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        courseProducts: { include: { product: true } },
        enrollments: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true, email: true, firstName: true, lastName: true, phone: true, country: true, createdAt: true
              }
            }
          }
        }
      }
    });
    if (!course) return res.status(404).json({ error: 'Not found' });
    const level = course.level;
    const [volLinks, modulesWithTopics, topics] = await Promise.all([
      prisma.courseVolume.findMany({
        where: { courseId: id },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: { volume: true }
      }),
      prisma.module.findMany({
        where: { courseId: id },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: {
          volume: { select: { id: true, name: true, description: true } },
          topics: {
            where: { courseId: id },
            orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
            include: {
              concepts: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true, order: true, topicId: true, losCode: true, commandWord: true, learningOutcomeStatement: true, createdAt: true } }
            }
          }
        }
      }),
      prisma.topic.findMany({
        where: { courseId: id },
        orderBy: [{ moduleId: 'asc' }, { moduleNumber: 'asc' }, { order: 'asc' }, { createdAt: 'desc' }],
        include: {
          module: true,
          concepts: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true, order: true, topicId: true, losCode: true, commandWord: true, learningOutcomeStatement: true, createdAt: true } }
        }
      })
    ]);
    const [revisionSummaries, exams] = await Promise.all([
      prisma.revisionSummary.findMany({ where: { level }, orderBy: { createdAt: 'desc' } }),
      prisma.exam.findMany({
        where: { courseId: id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, level: true, timeLimitMinutes: true, createdAt: true, type: true, topicId: true, courseId: true, active: true, startAt: true, endAt: true }
      })
    ]);
    // Subscriptions of enrolled users
    const userIds = (course.enrollments || []).map(e => e.userId);
    let subscriptions = [];
    if (userIds.length) {
      subscriptions = await prisma.subscription.findMany({
        where: { userId: { in: userIds } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, userId: true, provider: true, status: true, plan: true, currency: true, currentPeriodEnd: true, updatedAt: true }
      });
    }
    // Products
    const products = (course.courseProducts || []).map(cp => cp.product);
    // De-duplicate enrollments by userId (keep latest)
    const seen = new Map();
    for (const e of course.enrollments) {
      const prev = seen.get(e.userId);
      if (!prev || new Date(e.createdAt) > new Date(prev.createdAt)) {
        seen.set(e.userId, e);
      }
    }
    const uniqueEnrollments = Array.from(seen.values()).map(e => ({ id: e.id, createdAt: e.createdAt, user: e.user }));
    const volumes = sortVolumes((volLinks || []).map(l => ({ ...l.volume, order: l.order ?? null })));
    return res.json({
      course: {
        ...course,
        products,
        enrollments: uniqueEnrollments
      },
      volumes,
      modules: modulesWithTopics,
      topics,
      revisionSummaries,
      exams,
      subscriptions
    });
  });
  router.post('/courses', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const { name, level, description, examConditions, durationHours, active, createProduct, productName, productDescription, productPriceCents, productInterval, productActive } = req.body ?? {};
    if (!name || !level) return res.status(400).json({ error: 'name and level are required' });
    const created = await prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          name,
          level,
          description: description ?? null,
          examConditions: examConditions ?? null,
          durationHours: typeof durationHours === 'number' ? durationHours : null,
          active: typeof active === 'boolean' ? active : true
        }
      });
      let products = [];
      if (createProduct && productName && typeof productPriceCents === 'number' && productInterval) {
        const levelLabel =
          level === 'LEVEL1' ? 'Level I' :
          level === 'LEVEL2' ? 'Level II' :
          level === 'LEVEL3' ? 'Level III' :
          level === 'NONE' ? 'None' : level;
        const enforcedName = `${course.name} - ${levelLabel}`;
        const p = await tx.product.create({
          data: {
            // Enforce product name to include Course Name and Level
            name: enforcedName,
            description: productDescription ?? null,
            priceCents: productPriceCents,
            interval: productInterval,
            active: typeof productActive === 'boolean' ? productActive : true,
            courseLinks: { create: [{ courseId: course.id }] }
          }
        });
        products = [p];
      }
      return { ...course, products };
    });
    // If auto-created product, ensure Stripe linkage
    try {
      if (created?.products?.length) {
        const first = created.products[0];
        const synced = await ensureStripeProductAndPriceLocal(first);
        if (synced && (synced.stripeProductId || synced.stripePriceId)) {
          created.products = [synced];
        }
      }
    } catch (e) {
      console.warn('[cms] Stripe sync for auto-created product failed:', e?.message ?? e);
    }
    return res.status(201).json({ course: created });
  });
  router.put('/courses/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const { name, level, description, examConditions, durationHours, priceCents, active } = req.body ?? {};
    const course = await prisma.course.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(level ? { level } : {}),
        ...(typeof description !== 'undefined' ? { description } : {}),
        ...(typeof examConditions !== 'undefined' ? { examConditions } : {}),
        ...(typeof durationHours !== 'undefined' ? { durationHours } : {}),
        ...(typeof priceCents !== 'undefined' ? { priceCents } : {}),
        ...(typeof active !== 'undefined' ? { active } : {})
      }
    });
    return res.json({ course });
  });
  router.delete('/courses/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const force = req.query.force === 'true';
    const [enrollmentCount, moduleCount, topicCount, examCount, volumeLinkCount] = await Promise.all([
      prisma.enrollment.count({ where: { courseId: id } }),
      prisma.module.count({ where: { courseId: id } }),
      prisma.topic.count({ where: { courseId: id } }),
      prisma.exam.count({ where: { courseId: id } }),
      prisma.courseVolume.count({ where: { courseId: id } })
    ]);
    const related = [];
    if (enrollmentCount) related.push(`${enrollmentCount} enrollment(s)`);
    if (moduleCount) related.push(`${moduleCount} learning module(s)`);
    if (topicCount) related.push(`${topicCount} topic(s)`);
    if (examCount) related.push(`${examCount} exam(s)`);
    if (volumeLinkCount) related.push(`${volumeLinkCount} volume link(s)`);
    if (related.length > 0 && !force) {
      return res.status(409).json({ error: 'Has associated entities', related, message: `This course has ${related.join(', ')}. Delete them all?` });
    }
    if (force) {
      await prisma.$transaction(async (tx) => {
        // Delete exams and their related data
        const exams = await tx.exam.findMany({ where: { courseId: id }, select: { id: true } });
        const examIds = exams.map(e => e.id);
        if (examIds.length) {
          const attempts = await tx.examAttempt.findMany({ where: { examId: { in: examIds } }, select: { id: true } });
          const attemptIds = attempts.map(a => a.id);
          if (attemptIds.length) {
            await tx.examAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
            await tx.examAttempt.deleteMany({ where: { id: { in: attemptIds } } });
          }
          await tx.examQuestion.deleteMany({ where: { examId: { in: examIds } } });
          await tx.exam.deleteMany({ where: { id: { in: examIds } } });
        }
        // Delete topics and their related data
        const topics = await tx.topic.findMany({ where: { courseId: id }, select: { id: true } });
        const topicIds = topics.map(t => t.id);
        if (topicIds.length) {
          await tx.learningMaterial.deleteMany({ where: { topicId: { in: topicIds } } });
          await tx.concept.deleteMany({ where: { topicId: { in: topicIds } } });
          const qIds = (await tx.question.findMany({ where: { topicId: { in: topicIds } }, select: { id: true } })).map(q => q.id);
          if (qIds.length) {
            await tx.mcqOption.deleteMany({ where: { questionId: { in: qIds } } });
            await tx.examAnswer.deleteMany({ where: { questionId: { in: qIds } } });
            await tx.examQuestion.deleteMany({ where: { questionId: { in: qIds } } });
            await tx.question.deleteMany({ where: { id: { in: qIds } } });
          }
          await tx.video.deleteMany({ where: { topicId: { in: topicIds } } });
          await tx.revisionSummary.deleteMany({ where: { topicId: { in: topicIds } } });
          await tx.topic.deleteMany({ where: { id: { in: topicIds } } });
        }
        // Delete modules
        await tx.module.deleteMany({ where: { courseId: id } });
        // Delete course links, enrollments, progress
        await tx.courseVolume.deleteMany({ where: { courseId: id } });
        await tx.courseProgress.deleteMany({ where: { courseId: id } });
        await tx.enrollment.deleteMany({ where: { courseId: id } });
        await tx.courseProduct.deleteMany({ where: { courseId: id } });
        await tx.mockExam.deleteMany({ where: { courseId: id } }).catch(() => {});
        await tx.course.delete({ where: { id } });
      });
      return res.json({ ok: true });
    }
    await prisma.enrollment.deleteMany({ where: { courseId: id } });
    await prisma.course.delete({ where: { id } });
    return res.json({ ok: true });
  });

	// Volumes
	router.get('/volumes', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const courseId = (req.query.courseId ?? '').toString().trim();
		if (courseId) {
			const links = await prisma.courseVolume.findMany({
				where: { courseId },
				orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
				include: {
					volume: {
						include: {
							modules: {
								where: { courseId },
								orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
								select: { id: true }
							},
							courseLinks: {
								orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
								include: { course: { select: { id: true, name: true, level: true } } }
							}
						}
					}
				}
			});
			const volumes = sortVolumes(links.map(l => ({ ...l.volume, order: l.order ?? null })));
			return res.json({ volumes });
		}
		const allVolumes = await prisma.volume.findMany({
			orderBy: [{ name: 'asc' }],
			include: {
				courseLinks: {
					orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
					include: { course: { select: { id: true, name: true, level: true } } }
				}
			}
		});
		return res.json({ volumes: sortVolumes(allVolumes) });
	});
	router.get('/volumes/pathways', async (req, res) => {
		const volumes = await prisma.volume.findMany({
			where: { isPathway: true },
			orderBy: [{ name: 'asc' }],
			include: {
				courseLinks: {
					orderBy: [{ order: 'asc' }],
					include: { course: { select: { id: true, name: true, level: true } } }
				}
			}
		});
		return res.json({ volumes });
	});
	router.post('/volumes', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			name: z.string().min(2),
			description: z.string().optional(),
			isPathway: z.boolean().optional(),
			courseId: z.string().optional(),
			courseIds: z.array(z.string()).optional(),
			order: z.number().int().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const volume = await prisma.volume.create({ data: { name: parse.data.name, description: parse.data.description, isPathway: parse.data.isPathway ?? false } });
		// Handle multiple course links
		const courseIds = parse.data.courseIds || (parse.data.courseId ? [parse.data.courseId] : []);
		if (courseIds.length > 0) {
			for (const courseId of courseIds) {
				const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
				if (!course) continue; // Skip invalid course IDs
				const max = await prisma.courseVolume.findFirst({ where: { courseId }, orderBy: { order: 'desc' }, select: { order: true } });
				const order = parse.data.order ?? ((max?.order ?? 0) + 1);
				await prisma.courseVolume.upsert({
					where: { courseId_volumeId: { courseId, volumeId: volume.id } },
					update: { order },
					create: { courseId, volumeId: volume.id, order }
				});
			}
		}
		return res.status(201).json({ volume });
	});
	router.get('/volumes/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		const volume = await prisma.volume.findUnique({
			where: { id },
			include: {
				courseLinks: {
					orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
					include: { course: { select: { id: true, name: true, level: true } } }
				}
			}
		});
		if (!volume) return res.status(404).json({ error: 'Volume not found' });
		return res.json({ volume });
	});

	router.put('/volumes/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		const schema = z.object({
			name: z.string().min(2).optional(),
			description: z.string().optional(),
			isPathway: z.boolean().optional(),
			// course linkage is managed via /courses/:courseId/volumes endpoints
			order: z.number().int().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const volume = await prisma.volume.update({ 
			where: { id }, 
			data: { 
				...(parse.data.name ? { name: parse.data.name } : {}),
				...(typeof parse.data.description !== 'undefined' ? { description: parse.data.description } : {}),
				...(typeof parse.data.isPathway !== 'undefined' ? { isPathway: parse.data.isPathway } : {})
			} 
		});
		return res.json({ volume });
	});
	router.delete('/volumes/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		const force = req.query.force === 'true';
		const [moduleCount, linkCount, weightCount] = await Promise.all([
			prisma.module.count({ where: { volumeId: id } }),
			prisma.courseVolume.count({ where: { volumeId: id } }),
			prisma.mockExamTopicWeight.count({ where: { volumeId: id } })
		]);
		const related = [];
		if (moduleCount) related.push(`${moduleCount} learning module(s)`);
		if (linkCount) related.push(`${linkCount} course link(s)`);
		if (weightCount) related.push(`${weightCount} mock exam weight(s)`);
		if (related.length > 0 && !force) {
			return res.status(409).json({ error: 'Has associated entities', related, message: `This volume has ${related.join(', ')}. Delete them all?` });
		}
		if (force && related.length > 0) {
			await prisma.$transaction(async (tx) => {
				// Delete topics under modules of this volume
				const mods = await tx.module.findMany({ where: { volumeId: id }, select: { id: true } });
				const modIds = mods.map(m => m.id);
				if (modIds.length) {
					const topics = await tx.topic.findMany({ where: { moduleId: { in: modIds } }, select: { id: true } });
					const topicIds = topics.map(t => t.id);
					if (topicIds.length) {
						await tx.learningMaterial.deleteMany({ where: { topicId: { in: topicIds } } });
						await tx.concept.deleteMany({ where: { topicId: { in: topicIds } } });
						const qIds = (await tx.question.findMany({ where: { topicId: { in: topicIds } }, select: { id: true } })).map(q => q.id);
						if (qIds.length) {
							await tx.mcqOption.deleteMany({ where: { questionId: { in: qIds } } });
							await tx.examAnswer.deleteMany({ where: { questionId: { in: qIds } } });
							await tx.examQuestion.deleteMany({ where: { questionId: { in: qIds } } });
							await tx.question.deleteMany({ where: { id: { in: qIds } } });
						}
						await tx.video.deleteMany({ where: { topicId: { in: topicIds } } });
						await tx.revisionSummary.deleteMany({ where: { topicId: { in: topicIds } } });
						await tx.topic.deleteMany({ where: { id: { in: topicIds } } });
					}
					await tx.module.deleteMany({ where: { id: { in: modIds } } });
				}
				await tx.courseVolume.deleteMany({ where: { volumeId: id } });
				await tx.mockExamTopicWeight.deleteMany({ where: { volumeId: id } });
				await tx.volume.delete({ where: { id } });
			});
			return res.json({ ok: true });
		}
		await prisma.volume.delete({ where: { id } });
		return res.json({ ok: true });
	});

	// Course ↔ Volume links
	router.get('/courses/:courseId/volumes', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const courseId = req.params.courseId;
		const links = await prisma.courseVolume.findMany({
			where: { courseId },
			orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
			include: { volume: true }
		});
		const volumes = sortVolumes(links.map(l => ({ ...l.volume, order: l.order ?? null })));
		return res.json({ volumes });
	});
	router.post('/courses/:courseId/volumes', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const courseId = req.params.courseId;
		const schema = z.object({ volumeId: z.string().min(1), order: z.number().int().optional() });
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
		if (!course) return res.status(400).json({ error: 'Invalid courseId' });
		const volume = await prisma.volume.findUnique({ where: { id: parse.data.volumeId }, select: { id: true } });
		if (!volume) return res.status(400).json({ error: 'Invalid volumeId' });
		const max = await prisma.courseVolume.findFirst({ where: { courseId }, orderBy: { order: 'desc' }, select: { order: true } });
		const order = parse.data.order ?? ((max?.order ?? 0) + 1);
		const link = await prisma.courseVolume.upsert({
			where: { courseId_volumeId: { courseId, volumeId: parse.data.volumeId } },
			update: { order },
			create: { courseId, volumeId: parse.data.volumeId, order }
		});
		return res.status(201).json({ link });
	});
	router.delete('/courses/:courseId/volumes/:volumeId', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const { courseId, volumeId } = req.params;
		// ensure no modules under this course use this volume
		const used = await prisma.module.count({ where: { courseId, volumeId } });
		if (used > 0) return res.status(400).json({ error: 'Cannot detach: modules exist under this course+volume' });
		await prisma.courseVolume.delete({ where: { courseId_volumeId: { courseId, volumeId } } });
		return res.json({ ok: true });
	});

  	// Modules (containers for topics; a module has many topics)
	router.get('/modules', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const level = req.query.level;
		const courseId = (req.query.courseId ?? '').toString().trim();
		const volumeId = (req.query.volumeId ?? '').toString().trim();
		const where = courseId
			? { courseId }
			: (volumeId ? { volumeId } : (level ? { level } : {}));
		const modules = await prisma.module.findMany({
			where,
			orderBy: [{ level: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
			include: {
				volume: { select: { id: true, name: true, description: true } },
				topics: {
					...(courseId ? { where: { courseId } } : {}),
					orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
					include: {
						concepts: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true, order: true, topicId: true, createdAt: true } }
					}
				}
			}
		});
		return res.json({ modules });
	});
	router.post('/modules', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			name: z.string().min(2),
			courseId: z.string().min(1),
			volumeId: z.string().min(1),
			order: z.number().int().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const volumeId = String(parse.data.volumeId);
		const courseId = String(parse.data.courseId);
		const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, level: true } });
		if (!course) return res.status(400).json({ error: 'Invalid courseId' });
		const volume = await prisma.volume.findUnique({ where: { id: volumeId }, select: { id: true } });
		if (!volume) return res.status(400).json({ error: 'Invalid volumeId' });
		const linked = await assertVolumeLinkedToCourse({ courseId, volumeId });
		if (!linked) return res.status(400).json({ error: 'Volume is not linked to this course' });
		const level = course.level;
		const max = await prisma.module.findFirst({ where: { volumeId }, orderBy: { order: 'desc' }, select: { order: true } });
		const order = parse.data.order ?? (max?.order ?? 0) + 1;
		// Check for duplicate order in same volume
		if (parse.data.order != null) {
			const dup = await prisma.module.findFirst({ where: { volumeId, order } });
			if (dup) return res.status(400).json({ error: `Order ${order} is already taken by another learning module in this volume` });
		}
		const module_ = await prisma.module.create({ data: { name: parse.data.name, level, courseId, volumeId, order } });
		return res.status(201).json({ module: module_ });
	});
	router.put('/modules/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		const schema = z.object({
			name: z.string().min(2).optional(),
			courseId: z.string().optional(),
			volumeId: z.string().optional(),
			order: z.number().int().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const existing = await prisma.module.findUnique({ where: { id }, select: { id: true, courseId: true, volumeId: true, order: true } });
		if (!existing) return res.status(404).json({ error: 'Not found' });
		const nextCourseId = parse.data.courseId ? String(parse.data.courseId) : existing.courseId;
		const nextVolumeId = parse.data.volumeId ? String(parse.data.volumeId) : existing.volumeId;
		const course = await prisma.course.findUnique({ where: { id: nextCourseId }, select: { id: true, level: true } });
		if (!course) return res.status(400).json({ error: 'Invalid courseId' });
		const volume = await prisma.volume.findUnique({ where: { id: nextVolumeId }, select: { id: true } });
		if (!volume) return res.status(400).json({ error: 'Invalid volumeId' });
		const linked = await assertVolumeLinkedToCourse({ courseId: nextCourseId, volumeId: nextVolumeId });
		if (!linked) return res.status(400).json({ error: 'Volume is not linked to this course' });
		const level = course.level;
		// Check for duplicate order in same volume (exclude self) — only when order or volume actually changed
		if (typeof parse.data.order !== 'undefined' && parse.data.order != null) {
			const orderChanged = parse.data.order !== existing.order;
			const volumeChanged = nextVolumeId !== existing.volumeId;
			if (orderChanged || volumeChanged) {
				const dup = await prisma.module.findFirst({ where: { volumeId: nextVolumeId, order: parse.data.order, id: { not: id } } });
				if (dup) return res.status(400).json({ error: `Order ${parse.data.order} is already taken by another learning module in this volume` });
			}
		}
		const module_ = await prisma.module.update({
			where: { id },
			data: {
				...(typeof parse.data.name !== 'undefined' ? { name: parse.data.name } : {}),
				level,
				courseId: nextCourseId,
				volumeId: nextVolumeId,
				...(typeof parse.data.order !== 'undefined' ? { order: parse.data.order } : {})
			}
		});
		return res.json({ module: module_ });
	});
	router.delete('/modules/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		const force = req.query.force === 'true';
		const mod = await prisma.module.findUnique({ where: { id }, select: { id: true, courseId: true } });
		if (!mod) return res.status(404).json({ error: 'Not found' });
		const topicCount = await prisma.topic.count({ where: { moduleId: id } });
		if (topicCount > 0 && !force) {
			return res.status(409).json({ error: 'Has associated entities', related: [`${topicCount} topic(s)`], message: `This learning module has ${topicCount} topic(s). Delete them all?` });
		}
		if (force && topicCount > 0) {
			await prisma.$transaction(async (tx) => {
				const topics = await tx.topic.findMany({ where: { moduleId: id }, select: { id: true } });
				const topicIds = topics.map(t => t.id);
				if (topicIds.length) {
					await tx.learningMaterial.deleteMany({ where: { topicId: { in: topicIds } } });
					await tx.concept.deleteMany({ where: { topicId: { in: topicIds } } });
					const qIds = (await tx.question.findMany({ where: { topicId: { in: topicIds } }, select: { id: true } })).map(q => q.id);
					if (qIds.length) {
						await tx.mcqOption.deleteMany({ where: { questionId: { in: qIds } } });
						await tx.examAnswer.deleteMany({ where: { questionId: { in: qIds } } });
						await tx.examQuestion.deleteMany({ where: { questionId: { in: qIds } } });
						await tx.question.deleteMany({ where: { id: { in: qIds } } });
					}
					await tx.video.deleteMany({ where: { topicId: { in: topicIds } } });
					await tx.revisionSummary.deleteMany({ where: { topicId: { in: topicIds } } });
					await tx.topic.deleteMany({ where: { id: { in: topicIds } } });
				}
				await tx.module.delete({ where: { id } });
			});
			return res.json({ ok: true });
		}
		// No topics or not forced - old behavior: reassign topics then delete
		const unassignedId = mod.courseId ? await getOrCreateUnassignedModuleForCourse(mod.courseId) : null;
		if (!unassignedId) return res.status(400).json({ error: 'Unable to find course/unassigned module for this module. Fix module.courseId first.' });
		await prisma.topic.updateMany({ where: { moduleId: id }, data: { moduleId: unassignedId } });
		await prisma.module.delete({ where: { id } });
		return res.json({ ok: true });
	});

	// Topics
	router.get('/topics', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const level = req.query.level;
		const courseId = (req.query.courseId ?? '').toString().trim();
		const moduleId = req.query.moduleId;
		const volumeId = req.query.volumeId?.toString();
		const q = (req.query.q ?? '').toString().trim();
		const where = {
			AND: [
				courseId ? { courseId } : {},
				(!courseId && level) ? { level } : {},
				moduleId ? { moduleId } : {},
				volumeId ? { module: { volumeId } } : {},
				q ? { name: { contains: q, mode: 'insensitive' } } : {}
			]
		};
		const [total, topics] = await Promise.all([
			prisma.topic.count({ where }),
			prisma.topic.findMany({
				where,
				orderBy: [{ moduleId: 'asc' }, { moduleNumber: 'asc' }, { order: 'asc' }, { createdAt: 'desc' }],
				include: {
					module: true,
					concepts: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true, order: true, topicId: true, losCode: true, commandWord: true, learningOutcomeStatement: true, createdAt: true } }
				}
			})
		]);
		return res.json({ topics, total });
	});
  router.post('/topics', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			name: z.string().min(2),
			courseId: z.string().min(1),
			moduleId: z.string().min(1),
			moduleNumber: z.number().int().optional(),
			order: z.number().int().optional(),
			losCode: z.string().optional(),
			commandWord: z.string().optional(),
			learningOutcomeStatement: z.string().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const courseId = parse.data.courseId;
		const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, level: true } });
		if (!course) return res.status(400).json({ error: 'Invalid courseId' });
		const level = course.level;
		const m = await prisma.module.findUnique({ where: { id: parse.data.moduleId }, select: { id: true, courseId: true, volumeId: true } });
		if (!m) return res.status(400).json({ error: 'Invalid moduleId' });
		if (m.courseId && m.courseId !== courseId) return res.status(400).json({ error: 'Module does not belong to this course' });
		if (!m.volumeId) return res.status(400).json({ error: 'Module is missing volumeId. Run backfill or fix module.' });
		const data = { ...parse.data, courseId, level, moduleId: parse.data.moduleId };
		let finalOrder = parse.data.order;
		if (finalOrder == null) {
			const max = await prisma.topic.findFirst({
				where: { moduleId: data.moduleId, courseId },
				orderBy: { order: 'desc' },
				select: { order: true }
			});
			finalOrder = (max?.order ?? 0) + 1;
		} else {
			// Check for duplicate order in same module
			const dup = await prisma.topic.findFirst({ where: { moduleId: data.moduleId, order: finalOrder } });
			if (dup) return res.status(400).json({ error: `Order ${finalOrder} is already taken by another topic in this learning module` });
		}
		delete data.order;
		const topic = await prisma.topic.create({ data: { ...data, order: finalOrder }, include: { module: true } });
		return res.status(201).json({ topic });
	});
	router.put('/topics/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		const schema = z.object({
			name: z.string().min(2).optional(),
			courseId: z.string().optional().nullable(),
			moduleId: z.string().optional().nullable(),
			moduleNumber: z.number().int().optional(),
			order: z.number().int().optional(),
			losCode: z.string().optional().nullable(),
			commandWord: z.string().optional().nullable(),
			learningOutcomeStatement: z.string().optional().nullable()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const courseId = typeof parse.data.courseId === 'undefined'
			? undefined
			: (parse.data.courseId || null);
		const existing = await prisma.topic.findUnique({ where: { id }, select: { id: true, courseId: true } });
		if (!existing) return res.status(404).json({ error: 'Not found' });
		const effectiveCourseId = (typeof courseId !== 'undefined') ? courseId : (existing.courseId ?? null);
		const course = effectiveCourseId ? await prisma.course.findUnique({ where: { id: effectiveCourseId }, select: { id: true, level: true } }) : null;
		if (effectiveCourseId && !course) return res.status(400).json({ error: 'Invalid courseId' });
		const level = course ? course.level : undefined;
		const nextModuleId = (typeof parse.data.moduleId === 'undefined')
			? undefined
			: (parse.data.moduleId === null || parse.data.moduleId === '' ? null : parse.data.moduleId);
		if (nextModuleId === null) {
			return res.status(400).json({ error: 'moduleId is required' });
		}
		if (nextModuleId) {
			const m = await prisma.module.findUnique({ where: { id: nextModuleId }, select: { id: true, courseId: true } });
			if (!m) return res.status(400).json({ error: 'Invalid moduleId' });
			if (effectiveCourseId && m.courseId && m.courseId !== effectiveCourseId) return res.status(400).json({ error: 'Module does not belong to this course' });
		}
		// Check for duplicate order in same module (exclude self)
		const effectiveModuleId = nextModuleId || (await prisma.topic.findUnique({ where: { id }, select: { moduleId: true } }))?.moduleId;
		if (typeof parse.data.order !== 'undefined' && parse.data.order != null && effectiveModuleId) {
			const dup = await prisma.topic.findFirst({ where: { moduleId: effectiveModuleId, order: parse.data.order, id: { not: id } } });
			if (dup) return res.status(400).json({ error: `Order ${parse.data.order} is already taken by another topic in this learning module` });
		}
		const data = {
			...parse.data,
			...(typeof level !== 'undefined' ? { level } : {}),
			...(typeof courseId !== 'undefined' ? { courseId } : {}),
			...(typeof nextModuleId !== 'undefined' ? { moduleId: nextModuleId } : {})
		};
		const topic = await prisma.topic.update({ where: { id }, data, include: { module: true } });
		return res.json({ topic });
	});
	router.delete('/topics/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		const force = req.query.force === 'true';
		const [questionCount, conceptCount, materialCount, videoCount] = await Promise.all([
			prisma.question.count({ where: { OR: [{ topicId: id }, { topics: { some: { id } } }] } }),
			prisma.concept.count({ where: { topicId: id } }),
			prisma.learningMaterial.count({ where: { topicId: id } }),
			prisma.video.count({ where: { topicId: id } })
		]);
		const related = [];
		if (questionCount) related.push(`${questionCount} question(s)`);
		if (conceptCount) related.push(`${conceptCount} concept(s)`);
		if (materialCount) related.push(`${materialCount} learning material(s)`);
		if (videoCount) related.push(`${videoCount} video(s)`);
		if (related.length > 0 && !force) {
			return res.status(409).json({ error: 'Has associated entities', related, message: `This topic has ${related.join(', ')}. Delete them all?` });
		}
		if (force && related.length > 0) {
			await prisma.$transaction(async (tx) => {
				const qIds = (await tx.question.findMany({ where: { OR: [{ topicId: id }, { topics: { some: { id } } }] }, select: { id: true } })).map(q => q.id);
				if (qIds.length) {
					await tx.mcqOption.deleteMany({ where: { questionId: { in: qIds } } });
					await tx.examAnswer.deleteMany({ where: { questionId: { in: qIds } } });
					await tx.examQuestion.deleteMany({ where: { questionId: { in: qIds } } });
					await tx.question.deleteMany({ where: { id: { in: qIds } } });
				}
				await tx.learningMaterial.deleteMany({ where: { topicId: id } });
				await tx.concept.deleteMany({ where: { topicId: id } });
				await tx.video.deleteMany({ where: { topicId: id } });
				await tx.revisionSummary.deleteMany({ where: { topicId: id } });
				await tx.topic.delete({ where: { id } });
			});
			return res.json({ ok: true });
		}
		await prisma.topic.delete({ where: { id } });
		return res.json({ ok: true });
	});
  router.post('/topics/reorder', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const ids = (req.body?.ids ?? []).filter(Boolean);
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });
    await prisma.$transaction(ids.map((id, idx) => prisma.topic.update({ where: { id }, data: { order: idx + 1 } })));
    return res.json({ ok: true });
  });

  // Learning Materials
  router.get('/topics/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const topic = await prisma.topic.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        level: true,
        order: true,
        moduleNumber: true,
        moduleId: true,
        createdAt: true,
        updatedAt: true,
        module: {
          select: { id: true, name: true, level: true, order: true, createdAt: true, updatedAt: true }
        },
        materials: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
        revisionSummaries: { orderBy: { createdAt: 'desc' } },
        videos: { orderBy: { createdAt: 'desc' } }
      }
    });
    if (!topic) return res.status(404).json({ error: 'Not found' });
    // Count practice questions
    const questionCount = await prisma.question.count({ where: { topicId: id } });
    return res.json({ topic, questionCount });
  });
  router.get('/topics/:id/materials', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const topicId = req.params.id;
    const materials = await prisma.learningMaterial.findMany({
      where: { topicId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
    });
    const etaSeconds = (materials || []).reduce((acc, m) => acc + (m.estimatedSeconds || 0), 0);
    return res.json({ materials, etaSeconds });
  });
  router.post('/topics/:id/materials', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const topicId = req.params.id;
    const schema = z.object({
      kind: z.enum(['LINK','PDF','VIDEO','IMAGE','HTML']),
      title: z.string().min(2),
      // Accept relative paths from uploader or absolute URLs
      url: z.string().min(1).optional(),
      contentHtml: z.string().optional(),
      imageUrl: z.string().min(1).optional(),
      // time estimation inputs (optional)
      estimatedSeconds: z.number().int().positive().optional(),
      estimatedMinutes: z.number().int().positive().optional(),
      durationSec: z.number().int().positive().optional()
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const max = await prisma.learningMaterial.findFirst({ where: { topicId }, orderBy: { order: 'desc' }, select: { order: true } });
    const nextOrder = (max?.order ?? 0) + 1;
    const payload = parse.data;
    const estimatedSeconds = computeEstimatedSeconds(payload.kind, payload);
    const material = await prisma.learningMaterial.create({
      data: {
        topicId,
        order: nextOrder,
        kind: payload.kind,
        title: payload.title,
        url: payload.url ?? null,
        contentHtml: payload.contentHtml ?? null,
        imageUrl: payload.imageUrl ?? null,
        estimatedSeconds
      }
    });
    return res.status(201).json({ material });
  });
  router.put('/materials/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const schema = z.object({
      kind: z.enum(['LINK','PDF','VIDEO','IMAGE','HTML']).optional(),
      title: z.string().min(2).optional(),
      url: z.string().nullable().optional(),
      contentHtml: z.string().nullable().optional(),
      imageUrl: z.string().nullable().optional(),
      order: z.number().int().optional(),
      // time estimation inputs (optional)
      estimatedSeconds: z.number().int().positive().nullable().optional(),
      estimatedMinutes: z.number().int().positive().optional(),
      durationSec: z.number().int().positive().optional()
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const existing = await prisma.learningMaterial.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const payload = parse.data;
    // Recompute estimate if any relevant field provided
    let estimatedSeconds = existing.estimatedSeconds ?? null;
    const needsRecompute = typeof payload.estimatedSeconds !== 'undefined'
      || typeof payload.estimatedMinutes !== 'undefined'
      || typeof payload.durationSec !== 'undefined'
      || (typeof payload.contentHtml !== 'undefined')
      || (payload.kind && payload.kind !== existing.kind);
    if (needsRecompute) {
      estimatedSeconds = computeEstimatedSeconds(payload.kind ?? existing.kind, {
        ...payload,
        contentHtml: (typeof payload.contentHtml !== 'undefined') ? payload.contentHtml ?? undefined : existing.contentHtml ?? undefined
      });
    }
    const material = await prisma.learningMaterial.update({
      where: { id },
      data: {
        ...(payload.kind ? { kind: payload.kind } : {}),
        ...(typeof payload.title !== 'undefined' ? { title: payload.title } : {}),
        ...(typeof payload.url !== 'undefined' ? { url: payload.url } : {}),
        ...(typeof payload.contentHtml !== 'undefined' ? { contentHtml: payload.contentHtml } : {}),
        ...(typeof payload.imageUrl !== 'undefined' ? { imageUrl: payload.imageUrl } : {}),
        ...(typeof payload.order !== 'undefined' ? { order: payload.order } : {}),
        ...(estimatedSeconds != null ? { estimatedSeconds } : {})
      }
    });
    return res.json({ material });
  });
  router.delete('/materials/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    await prisma.learningMaterial.delete({ where: { id } });
    return res.json({ ok: true });
  });

  // Concepts
  router.get('/concepts', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const topicId = (req.query.topicId ?? '').toString().trim() || undefined;
    const moduleId = (req.query.moduleId ?? '').toString().trim() || undefined;
    const courseId = (req.query.courseId ?? '').toString().trim() || undefined;
    const q = (req.query.q ?? '').toString().trim() || undefined;
    const where = {};
    if (topicId) where.topicId = topicId;
    if (moduleId) where.topic = { ...where.topic, moduleId };
    if (courseId) where.topic = { ...where.topic, courseId };
    if (q) where.name = { contains: q, mode: 'insensitive' };
    const concepts = await prisma.concept.findMany({
      where,
      include: {
        topic: {
          select: {
            id: true, name: true, moduleId: true, courseId: true,
            module: { select: { id: true, name: true, volumeId: true, volume: { select: { id: true, name: true, description: true } } } },
            course: { select: { id: true, name: true, level: true } }
          }
        },
        materials: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
    });
    return res.json({ concepts });
  });
  router.post('/concepts', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      topicId: z.string().min(1),
      order: z.number().int().optional(),
      losCode: z.string().optional(),
      commandWord: z.string().optional(),
      learningOutcomeStatement: z.string().optional()
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const { name, topicId, order, losCode, commandWord, learningOutcomeStatement } = parse.data;
    const topic = await prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) return res.status(404).json({ error: 'Topic not found' });
    let nextOrder = order;
    if (nextOrder == null) {
      const max = await prisma.concept.findFirst({ where: { topicId }, orderBy: { order: 'desc' }, select: { order: true } });
      nextOrder = (max?.order ?? 0) + 1;
    } else {
      const dup = await prisma.concept.findFirst({ where: { topicId, order: nextOrder } });
      if (dup) return res.status(400).json({ error: `Order ${nextOrder} is already taken by another concept in this topic` });
    }
    const concept = await prisma.concept.create({ data: { name, topicId, order: nextOrder, losCode, commandWord, learningOutcomeStatement }, include: { topic: true } });
    return res.status(201).json({ concept });
  });
  router.put('/concepts/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const schema = z.object({
      name: z.string().min(2).optional(),
      order: z.number().int().optional(),
      losCode: z.string().optional().nullable(),
      commandWord: z.string().optional().nullable(),
      learningOutcomeStatement: z.string().optional().nullable()
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    // Check for duplicate order in same topic (exclude self)
    if (typeof parse.data.order !== 'undefined' && parse.data.order != null) {
      const existing = await prisma.concept.findUnique({ where: { id }, select: { topicId: true } });
      if (existing) {
        const dup = await prisma.concept.findFirst({ where: { topicId: existing.topicId, order: parse.data.order, id: { not: id } } });
        if (dup) return res.status(400).json({ error: `Order ${parse.data.order} is already taken by another concept in this topic` });
      }
    }
    const concept = await prisma.concept.update({ where: { id }, data: parse.data, include: { topic: true } });
    return res.json({ concept });
  });
  router.delete('/concepts/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const force = req.query.force === 'true';
    const materialCount = await prisma.learningMaterial.count({ where: { conceptId: id } });
    if (materialCount > 0 && !force) {
      return res.status(409).json({ error: 'Has associated entities', related: [`${materialCount} learning material(s)`], message: `This concept has ${materialCount} learning material(s). Delete them all?` });
    }
    if (force && materialCount > 0) {
      await prisma.learningMaterial.deleteMany({ where: { conceptId: id } });
    }
    await prisma.concept.delete({ where: { id } });
    return res.json({ ok: true });
  });
  router.get('/concepts/:id/materials', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const conceptId = req.params.id;
    const materials = await prisma.learningMaterial.findMany({
      where: { conceptId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
    });
    const etaSeconds = (materials || []).reduce((acc, m) => acc + (m.estimatedSeconds || 0), 0);
    return res.json({ materials, etaSeconds });
  });
  router.post('/concepts/:id/materials', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const conceptId = req.params.id;
    const concept = await prisma.concept.findUnique({ where: { id: conceptId } });
    if (!concept) return res.status(404).json({ error: 'Concept not found' });
    const schema = z.object({
      kind: z.enum(['LINK','PDF','VIDEO','IMAGE','HTML']),
      title: z.string().min(2),
      url: z.string().min(1).optional(),
      contentHtml: z.string().optional(),
      imageUrl: z.string().min(1).optional(),
      estimatedSeconds: z.number().int().positive().optional(),
      estimatedMinutes: z.number().int().positive().optional(),
      durationSec: z.number().int().positive().optional()
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const max = await prisma.learningMaterial.findFirst({ where: { conceptId }, orderBy: { order: 'desc' }, select: { order: true } });
    const nextOrder = (max?.order ?? 0) + 1;
    const payload = parse.data;
    const estimatedSeconds = computeEstimatedSeconds(payload.kind, payload);
    const material = await prisma.learningMaterial.create({
      data: {
        topicId: concept.topicId,
        conceptId,
        order: nextOrder,
        kind: payload.kind,
        title: payload.title,
        url: payload.url ?? null,
        contentHtml: payload.contentHtml ?? null,
        imageUrl: payload.imageUrl ?? null,
        estimatedSeconds
      }
    });
    return res.status(201).json({ material });
  });

	// Questions (MCQ or Vignette-based, CR)
	function escapeCsvCell(v) {
		const s = String(v ?? '');
		if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
		return s;
	}
	function parseCsv(content) {
		const rows = [];
		let i = 0;
		let cell = '';
		let row = [];
		let inQuotes = false;
		while (i < content.length) {
			const ch = content[i];
			const next = content[i + 1];
			if (inQuotes) {
				if (ch === '"' && next === '"') {
					cell += '"';
					i += 2;
					continue;
				}
				if (ch === '"') {
					inQuotes = false;
					i += 1;
					continue;
				}
				cell += ch;
				i += 1;
				continue;
			}
			if (ch === '"') {
				inQuotes = true;
				i += 1;
				continue;
			}
			if (ch === ',') {
				row.push(cell);
				cell = '';
				i += 1;
				continue;
			}
			if (ch === '\n') {
				row.push(cell);
				rows.push(row);
				row = [];
				cell = '';
				i += 1;
				continue;
			}
			if (ch === '\r' && next === '\n') {
				row.push(cell);
				rows.push(row);
				row = [];
				cell = '';
				i += 2;
				continue;
			}
			cell += ch;
			i += 1;
		}
		if (cell.length > 0 || row.length > 0) {
			row.push(cell);
			rows.push(row);
		}
		return rows;
	}

	router.get('/questions/template.csv', requireAuth(), requireRole('ADMIN'), async (_req, res) => {
		const headers = [
			'topic_id',
			'question_text',
			'question_type',
			'answers',
			'correct_answer',
			'difficulty',
			'marks'
		];
		const sample = [
			'',
			'What is 2+2?',
			'MCQ',
			'1|2|3|4',
			'4',
			'EASY',
			'1'
		];
		const csv = `${headers.join(',')}\n${sample.map(escapeCsvCell).join(',')}\n`;
		res.setHeader('Content-Type', 'text/csv; charset=utf-8');
		res.setHeader('Content-Disposition', 'attachment; filename="question_template.csv"');
		return res.send(csv);
	});

	router.get('/questions/template.xlsx', requireAuth(), requireRole('ADMIN'), async (_req, res) => {
		// Column order: QID, Difficulty, LOS, Trace (Section), Trace (Page), Question (Stem), A, B, C, Correct, Key Formula(s), Worked Solution (concise), topic_id
		const headers = ['QID', 'Difficulty', 'LOS', 'Trace (Section)', 'Trace (Page)', 'Question (Stem)', 'A', 'B', 'C', 'Correct', 'Key Formula(s)', 'Worked Solution (concise)', 'topic_id'];
		// Difficulty: 1 = EASY, 2 = MEDIUM, 3 = HARD
		const sampleData = [
			['IND9-001', 1, 't-test for correlation', 'Section 4.2', '125', 'Sample correlation r=0.35 with n=28. Test H0: ρ=0. The t-statistic is:', '1.91', '2.10', '1.71', 'A', 't = r√((n-2)/(1-r²))', 't=1.9052.', ''],
			['IND9-002', 2, 'Chi-square test of independence', 'Section 5.1', '180', '2×2 table observed: [[40,10],[20,30]]. χ² statistic is closest to:', '16.67', '18.33', '15.00', 'A', 'χ² = Σ (O-E)²/E', 'χ²=16.666...≈7.', ''],
			['IND9-003', 3, 'Hypothesis testing', 'Section 6.3', '210', 'A sample has mean 52, std 8, n=64. Test if population mean > 50 at 5% level:', 'Reject H0', 'Fail to reject H0', 'Inconclusive', 'A', 'z = (x̄ - μ) / (σ/√n)', 'z=2, p<0.05, reject.', '']
		];
		const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
		ws['!cols'] = [
			{ wch: 12 },  // QID
			{ wch: 10 },  // Difficulty
			{ wch: 25 },  // LOS
			{ wch: 15 },  // Trace (Section)
			{ wch: 12 },  // Trace (Page)
			{ wch: 50 },  // Question (Stem)
			{ wch: 20 },  // A
			{ wch: 20 },  // B
			{ wch: 20 },  // C
			{ wch: 8 },   // Correct
			{ wch: 25 },  // Key Formula(s)
			{ wch: 30 },  // Worked Solution
			{ wch: 30 }   // topic_id
		];
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, 'Questions');
		const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
		res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
		res.setHeader('Content-Disposition', 'attachment; filename="question_template.xlsx"');
		return res.send(buf);
	});

	router.post('/questions/bulk-upload', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({ csv: z.string().min(1).optional(), xlsx: z.string().min(1).optional() });
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

		let rows = [];
		if (parse.data.xlsx) {
			try {
				const buf = Buffer.from(parse.data.xlsx, 'base64');
				const wb = XLSX.read(buf, { type: 'buffer' });
				const ws = wb.Sheets[wb.SheetNames[0]];
				rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
			} catch (e) {
				return res.status(400).json({ error: 'Invalid Excel file format' });
			}
		} else if (parse.data.csv) {
			rows = parseCsv(parse.data.csv);
		} else {
			return res.status(400).json({ error: 'Must provide csv or xlsx content' });
		}

		if (rows.length < 2) return res.status(400).json({ error: 'File must include header and at least one data row' });

		const headerRaw = rows[0].map(h => (h ?? '').toString().trim().toLowerCase());
		const header = headerRaw.map(h => {
			if (h === 'question (stem)' || h === 'question_stem' || h === 'stem') return 'question_text';
			if (h === 'a') return 'option_a';
			if (h === 'b') return 'option_b';
			if (h === 'c') return 'option_c';
			if (h === 'd') return 'option_d';
			if (h === 'key formula(s)' || h === 'key_formulas' || h === 'keyformulas') return 'key_formulas';
			if (h === 'worked solution (concise)' || h === 'worked_solution' || h === 'workedsolution') return 'worked_solution';
			if (h === 'trace (section)' || h === 'trace_section' || h === 'tracesection') return 'trace_section';
			if (h === 'trace (page)' || h === 'trace_page' || h === 'tracepage') return 'trace_page';
			return h.replace(/\s+/g, '_');
		});

		const idx = (name) => header.indexOf(name);
		const hasNewFormat = idx('option_a') >= 0 || idx('qid') >= 0;
		const hasOldFormat = idx('question_text') >= 0 && idx('question_type') >= 0;

		if (!hasNewFormat && !hasOldFormat) {
			return res.status(400).json({ error: 'Invalid template format. Use the Excel template from the download.' });
		}

		// Difficulty mapping: 1=EASY, 2=MEDIUM, 3=HARD (or text values)
		const mapDifficulty = (val) => {
			const v = String(val ?? '').trim();
			if (v === '1' || v.toUpperCase() === 'EASY') return 'EASY';
			if (v === '2' || v.toUpperCase() === 'MEDIUM') return 'MEDIUM';
			if (v === '3' || v.toUpperCase() === 'HARD') return 'HARD';
			return v.toUpperCase();
		};

		const errors = [];
		let createdCount = 0;

		for (let r = 1; r < rows.length; r++) {
			const row = rows[r];
			if (!row || row.every(c => !String(c ?? '').trim())) continue;
			const get = (col) => (row[idx(col)] ?? '').toString().trim();
			const rowNum = r + 1;

			let topicId, questionText, questionType, difficulty, marks, options, correctAnswer;
			let qid = '', los = '', traceSection = '', tracePage = '', keyFormulas = '', workedSolution = '';

			if (hasNewFormat && idx('option_a') >= 0) {
				topicId = get('topic_id');
				questionText = get('question_text');
				difficulty = mapDifficulty(get('difficulty'));
				qid = get('qid') || '';
				los = get('los') || '';
				traceSection = get('trace_section') || '';
				tracePage = get('trace_page') || '';
				keyFormulas = get('key_formulas') || '';
				workedSolution = get('worked_solution') || '';

				const optA = get('option_a');
				const optB = get('option_b');
				const optC = get('option_c');
				const optD = idx('option_d') >= 0 ? get('option_d') : '';
				options = [optA, optB, optC, optD].filter(Boolean);

				// Map correct answer: A->optA, B->optB, C->optC, D->optD
				const correctRaw = get('correct').toUpperCase().trim();
				if (correctRaw === 'A') correctAnswer = optA;
				else if (correctRaw === 'B') correctAnswer = optB;
				else if (correctRaw === 'C') correctAnswer = optC;
				else if (correctRaw === 'D') correctAnswer = optD;
				else correctAnswer = correctRaw; // fallback to literal value

				questionType = options.length > 0 ? 'MCQ' : 'CONSTRUCTED_RESPONSE';
				marks = idx('marks') >= 0 ? Number(get('marks') || 1) : 1;
			} else {
				topicId = get('topic_id');
				questionText = get('question_text');
				questionType = get('question_type');
				const answersRaw = idx('answers') >= 0 ? get('answers') : '';
				correctAnswer = idx('correct_answer') >= 0 ? get('correct_answer') : '';
				difficulty = mapDifficulty(get('difficulty'));
				marks = Number(get('marks') || 1);
				options = answersRaw ? answersRaw.split('|').map(s => s.trim()).filter(Boolean) : [];

				qid = idx('qid') >= 0 ? get('qid') : '';
				los = idx('los') >= 0 ? get('los') : '';
				traceSection = idx('trace_section') >= 0 ? get('trace_section') : '';
				tracePage = idx('trace_page') >= 0 ? get('trace_page') : '';
				keyFormulas = idx('key_formulas') >= 0 ? get('key_formulas') : '';
				workedSolution = idx('worked_solution') >= 0 ? get('worked_solution') : '';
			}

			if (!topicId) {
				errors.push({ row: rowNum, error: 'Missing required topic_id' });
				continue;
			}
			if (!questionText) {
				errors.push({ row: rowNum, error: 'question_text/Question (Stem) required' });
				continue;
			}
			if (!['EASY', 'MEDIUM', 'HARD'].includes(difficulty)) {
				errors.push({ row: rowNum, error: `Invalid difficulty: ${difficulty}. Must be 1 (EASY), 2 (MEDIUM), 3 (HARD) or text EASY/MEDIUM/HARD` });
				continue;
			}
			if (!Number.isFinite(marks) || marks <= 0) {
				errors.push({ row: rowNum, error: 'marks must be a positive number' });
				continue;
			}

			const normalizedType = questionType === 'TRUE_FALSE' ? 'MCQ' :
				(questionType === 'SHORT_ANSWER' ? 'CONSTRUCTED_RESPONSE' : (questionType || 'MCQ'));

			if (!['MCQ', 'VIGNETTE_MCQ', 'CONSTRUCTED_RESPONSE'].includes(normalizedType)) {
				errors.push({ row: rowNum, error: `Unsupported question_type: ${questionType}` });
				continue;
			}

			if (normalizedType !== 'CONSTRUCTED_RESPONSE') {
				if (options.length < 2) {
					errors.push({ row: rowNum, error: 'At least 2 answer options required (A, B columns or answers column with | separator)' });
					continue;
				}
				if (!correctAnswer) {
					errors.push({ row: rowNum, error: 'Correct answer required for MCQ (use A, B, C, or D in Correct column)' });
					continue;
				}
				if (!options.includes(correctAnswer)) {
					errors.push({ row: rowNum, error: `Correct answer "${correctAnswer}" must match one of the options exactly` });
					continue;
				}
			}

			try {
				const pathIds = await deriveQuestionPathIdsFromTopic(topicId);
				if (!pathIds.courseId || !pathIds.volumeId || !pathIds.moduleId) {
					throw new Error('Topic path is incomplete. Ensure topic has module and module has volume.');
				}

				const { courseId, volumeId, moduleId } = pathIds;
				const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, level: true } });
				if (!course) throw new Error('Derived course not found');

				await prisma.$transaction(async (tx) => {
					const created = await tx.question.create({
						data: {
							stem: questionText,
							type: normalizedType,
							level: course.level,
							difficulty,
							marks,
							topicId,
							courseId,
							volumeId,
							moduleId,
							topics: { connect: [{ id: topicId }] },
							qid: qid || null,
							los: los || null,
							traceSection: traceSection || null,
							tracePage: tracePage || null,
							keyFormulas: keyFormulas || null,
							workedSolution: workedSolution || null
						}
					});
					if (normalizedType !== 'CONSTRUCTED_RESPONSE' && options.length > 0) {
						await tx.mcqOption.createMany({
							data: options.map(opt => ({
								questionId: created.id,
								text: opt,
								isCorrect: opt === correctAnswer
							}))
						});
					}
				});

				createdCount += 1;
			} catch (e) {
				errors.push({ row: rowNum, error: e?.message ?? String(e) });
			}
		}

		return res.json({ created: createdCount, errors });
	});

	router.get('/questions', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const q = (req.query.q ?? '').toString().trim();
		const topicId = req.query.topicId?.toString();
		const topicIds = req.query.topicIds?.toString();
		const level = req.query.level?.toString();
		const courseId = req.query.courseId?.toString();
		const volumeId = req.query.volumeId?.toString();
		const moduleId = req.query.moduleId?.toString();
		const difficulty = req.query.difficulty?.toString();
		const difficulties = req.query.difficulties?.toString();
		const type = req.query.type?.toString();
		const types = req.query.types?.toString();
		const aiGenerated = req.query.aiGenerated?.toString() === 'true';
		const page = Math.max(1, parseInt(req.query.page, 10) || 1);
		const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
		const topicIdList = topicIds ? topicIds.split(',').filter(Boolean) : (topicId ? [topicId] : []);
		const difficultyList = difficulties ? difficulties.split(',').filter(Boolean) : (difficulty ? [difficulty] : []);
		const typeList = types ? types.split(',').filter(Boolean) : (type ? [type] : []);

		// Only show top-level questions (parentId IS NULL). Sub-questions are hidden.
		const where = {
			AND: [
				{ parentId: null },
				q ? {
					OR: [
						{ stem: { contains: q, mode: 'insensitive' } },
						{ vignetteText: { contains: q, mode: 'insensitive' } }
					]
				} : {},
				topicIdList.length > 0 ? { OR: [{ topicId: { in: topicIdList } }, { topics: { some: { id: { in: topicIdList } } } }] } : {},
				level ? { level } : {},
				courseId ? { courseId } : {},
				volumeId ? { volumeId } : {},
				moduleId ? { moduleId } : {},
				difficultyList.length > 0 ? { difficulty: { in: difficultyList } } : {},
				typeList.length > 0 ? { type: { in: typeList } } : {},
				aiGenerated ? { isAiGenerated: true } : {}
			]
		};

		const [total, questions] = await Promise.all([
			prisma.question.count({ where }),
			prisma.question.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip: (page - 1) * pageSize,
				take: pageSize,
				include: {
					options: true,
					topics: { select: { id: true, name: true } },
					concepts: { select: { id: true, name: true, topicId: true } },
					_count: { select: { children: true } }
				}
			})
		]);

		// Attach _childCount for UI display
		const mapped = questions.map(q => ({
			...q,
			_childCount: q._count?.children ?? 0
		}));

		return res.json({ questions: mapped, total, logicalTotal: total });
	});
	router.post('/questions', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			stem: z.string().min(1),
			type: z.enum(['MCQ', 'VIGNETTE_MCQ', 'CONSTRUCTED_RESPONSE']),
			level: z.enum(['NONE','LEVEL1', 'LEVEL2', 'LEVEL3']),
			difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
			topicId: z.string().optional(),
			topicIds: z.array(z.string()).optional(),
			marks: z.number().int().positive().optional(),
			orderIndex: z.number().int().nonnegative().optional(),
			parentId: z.string().optional(),
			vignetteText: z.string().optional(),
			imageUrl: z.string().url().optional().nullable(),
			options: z.array(z.object({ text: z.string(), isCorrect: z.boolean() })).optional(),
			// Sub-questions array (for creating parent + children in one call)
			subQuestions: z.array(z.object({
				stem: z.string().min(1),
				marks: z.number().int().positive().optional(),
				options: z.array(z.object({ text: z.string(), isCorrect: z.boolean() })).optional()
			})).optional(),
			qid: z.string().optional().nullable(),
			los: z.string().optional().nullable(),
			traceSection: z.string().optional().nullable(),
			tracePage: z.string().optional().nullable(),
			keyFormulas: z.string().optional().nullable(),
			workedSolution: z.string().optional().nullable(),
			conceptIds: z.array(z.string()).optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const { vignetteText, parentId, options, subQuestions, qid, los, traceSection, tracePage, keyFormulas, workedSolution, orderIndex, topicIds: rawTopicIds, conceptIds, ...q } = parse.data;
		// Resolve topic IDs: prefer topicIds array, fall back to single topicId
		const resolvedTopicIds = (Array.isArray(rawTopicIds) && rawTopicIds.length > 0) ? rawTopicIds : (q.topicId ? [q.topicId] : []);
		if (resolvedTopicIds.length === 0) {
			return res.status(400).json({ error: 'At least one topic is required (topicId or topicIds)' });
		}
		const primaryTopicId = resolvedTopicIds[0];
		const pathIds = await deriveQuestionPathIdsFromTopic(primaryTopicId);
		if (!pathIds.courseId || !pathIds.volumeId || !pathIds.moduleId) {
			return res.status(400).json({ error: 'Topic path is incomplete. Ensure topic has module and module has volume.' });
		}

		// If parentId is provided, validate it exists
		if (parentId) {
			const parent = await prisma.question.findUnique({ where: { id: parentId }, select: { id: true } });
			if (!parent) return res.status(400).json({ error: 'Parent question not found' });
		}

		const resolvedConceptIds = Array.isArray(conceptIds) && conceptIds.length > 0 ? conceptIds : [];
		const question = await prisma.question.create({
			data: {
				...q,
				topicId: primaryTopicId,
				...pathIds,
				topics: { connect: resolvedTopicIds.map(id => ({ id })) },
				...(resolvedConceptIds.length > 0 ? { concepts: { connect: resolvedConceptIds.map(id => ({ id })) } } : {}),
				parentId: parentId || null,
				vignetteText: vignetteText || null,
				orderIndex: typeof orderIndex === 'number' ? orderIndex : 0,
				imageUrl: parse.data.imageUrl || null,
				qid: qid || null,
				los: los || null,
				traceSection: traceSection || null,
				tracePage: tracePage || null,
				keyFormulas: keyFormulas || null,
				workedSolution: workedSolution || null
			}
		});

		// Create MCQ options for standalone MCQ or parent vignette question itself (if any)
		if (q.type === 'MCQ' && options && options.length) {
			await prisma.mcqOption.createMany({
				data: options.map(o => ({ questionId: question.id, text: o.text, isCorrect: o.isCorrect }))
			});
		}

		// Create sub-questions if provided (for vignette/constructed bundles created in one call)
		if (Array.isArray(subQuestions) && subQuestions.length > 0 && !parentId) {
			for (let i = 0; i < subQuestions.length; i++) {
				const sq = subQuestions[i];
				const child = await prisma.question.create({
					data: {
						stem: sq.stem,
						type: q.type === 'VIGNETTE_MCQ' ? 'MCQ' : 'CONSTRUCTED_RESPONSE',
						level: q.level,
						difficulty: q.difficulty,
						topicId: primaryTopicId,
						...pathIds,
						topics: { connect: resolvedTopicIds.map(id => ({ id })) },
						parentId: question.id,
						orderIndex: i + 1,
						marks: sq.marks || 1,
						qid: qid || null,
						los: los || null,
						traceSection: traceSection || null,
						tracePage: tracePage || null,
						keyFormulas: keyFormulas || null,
						workedSolution: workedSolution || null
					}
				});
				// Create MCQ options for vignette sub-questions
				if (q.type === 'VIGNETTE_MCQ' && sq.options && sq.options.length) {
					await prisma.mcqOption.createMany({
						data: sq.options.map(o => ({ questionId: child.id, text: o.text, isCorrect: o.isCorrect }))
					});
				}
			}
		}

		const full = await prisma.question.findUnique({
			where: { id: question.id },
			include: {
				options: true,
				children: {
					orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
					include: { options: true }
				}
			}
		});
		return res.status(201).json({ question: full });
	});

	// Generate questions using OpenAI (admin only)
	router.post('/questions/generate-ai', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			courseId: z.string(),
			volumeId: z.string().optional(),
			topicId: z.string().optional(),
			topicIds: z.array(z.string()).optional(),
			conceptIds: z.array(z.string()).optional(),
			questionType: z.enum(['MCQ', 'VIGNETTE_MCQ', 'CONSTRUCTED_RESPONSE']),
			difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
			difficulties: z.array(z.enum(['EASY', 'MEDIUM', 'HARD'])).optional(),
			count: z.coerce.number().int().min(1).max(10)
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const { courseId, volumeId, topicId, topicIds, conceptIds, questionType, difficulty, difficulties, count } = parse.data;
		const diffList = Array.isArray(difficulties) && difficulties.length
			? difficulties
			: (difficulty ? [difficulty] : ['MEDIUM']);

		const apiKey = await getOpenAIApiKey(prisma);
		if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY in .env or in Admin settings.' });

		const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, level: true } });
		if (!course) return res.status(400).json({ error: 'Course not found' });
		let topicIdList = Array.isArray(topicIds) && topicIds.length
			? topicIds
			: (topicId ? [topicId] : []);
		// If no topics selected, auto-resolve from course modules
		if (topicIdList.length === 0) {
			const autoTopics = await prisma.topic.findMany({
				where: { courseId, ...(volumeId ? { module: { volumeId } } : {}) },
				select: { id: true },
				orderBy: { order: 'asc' }
			});
			topicIdList = autoTopics.map(t => t.id);
			if (topicIdList.length === 0) return res.status(400).json({ error: 'No topics found for the selected course/volume' });
		}

		// Load and validate topics
		const selectedTopics = await prisma.topic.findMany({
			where: { id: { in: topicIdList } },
			select: { id: true, name: true, courseId: true, moduleId: true, module: { select: { volumeId: true } } }
		});
		if (selectedTopics.length !== topicIdList.length) return res.status(400).json({ error: 'One or more topics not found' });
		for (const t of selectedTopics) {
			if (t.courseId && t.courseId !== courseId) return res.status(400).json({ error: 'One or more topics do not belong to selected course' });
			if (volumeId && t.module?.volumeId && t.module.volumeId !== volumeId) return res.status(400).json({ error: 'One or more topics do not belong to selected volume' });
		}

		// Resolve volume name for better prompt context
		let volumeName = 'N/A';
		let effectiveVolumeId = volumeId;
		if (volumeId) {
			const vol = await prisma.volume.findUnique({ where: { id: volumeId }, select: { name: true } });
			if (vol) volumeName = vol.name;
		} else if (selectedTopics.length > 0 && selectedTopics[0].module?.volumeId) {
			effectiveVolumeId = selectedTopics[0].module.volumeId;
			const vol = await prisma.volume.findUnique({ where: { id: effectiveVolumeId }, select: { name: true } });
			if (vol) volumeName = vol.name;
		}

		// Load concepts for prompt context (must be before curriculum excerpt for topic-aware extraction)
		let legacyConcepts = [];
		if (Array.isArray(conceptIds) && conceptIds.length > 0) {
			legacyConcepts = await prisma.concept.findMany({ where: { id: { in: conceptIds } }, select: { id: true, name: true, topicId: true } });
		} else {
			legacyConcepts = await prisma.concept.findMany({ where: { topicId: { in: topicIdList } }, orderBy: [{ order: 'asc' }], select: { id: true, name: true, topicId: true } });
		}

		// Load curriculum document for fine-tuning (if uploaded for this course + volume)
		let curriculumExcerpt = '';
		if (effectiveVolumeId) {
			const currDoc = await prisma.curriculumDocument.findUnique({
				where: { courseId_volumeId: { courseId, volumeId: effectiveVolumeId } },
				select: { extractedText: true }
			});
			if (currDoc?.extractedText) {
				// Use topic-aware windowed extraction so relevant sections are found even in large PDFs
				curriculumExcerpt = buildCurriculumExcerpt(
					currDoc.extractedText,
					selectedTopics.map(t => t.name),
					legacyConcepts.map(c => c.name)
				);
			}
		}
		const legacyConceptLabel = legacyConcepts.length > 0 ? legacyConcepts.map(c => c.name).join(', ') : 'All concepts under the selected topics';
		const levelLabel = (course.level || 'LEVEL1').replace('LEVEL', 'Level ');
		const typeLabel = questionType === 'MCQ'
			? 'Multiple choice (MCQ) with exactly 3 options (A, B, C) and exactly one correct answer'
			: questionType === 'VIGNETTE_MCQ'
			? 'Vignette / item-set (CFA exam style): a long, rich case study passage (400-600 words) with a named protagonist, multiple financial scenarios, AT LEAST ONE HTML table as a CFA Exhibit, and 4-5 MCQ sub-questions that reference specific exhibits'
			: 'Constructed response (written answer requiring calculations or explanations)';
		const topicLabel = selectedTopics.map(t => t.name).join(', ');
		const difficultyLabel = diffList.join(', ');
		const curriculumSection = curriculumExcerpt
			? `\n\nCURRICULUM REFERENCE MATERIAL (THIS IS YOUR PRIMARY SOURCE — all questions MUST be grounded in this document):\n---\n${curriculumExcerpt}\n---\n`
			: '';
		const prompt = `You are a senior CFA exam question writer and curriculum expert. Generate professional, exam-quality questions in JSON format.

Draw directly from past CFA exam question styles and real-world financial scenarios. Questions must be precise, unambiguous, and test genuine understanding.
ALL metadata fields below are REQUIRED - always populate every single one to help students during revision.
For VIGNETTE_MCQ or CONSTRUCTED_RESPONSE bundles: a single case study/vignette may span MULTIPLE learning modules, topics, or concepts within the same volume. Sub-questions should draw from different topics/concepts where appropriate to create a rich, integrative scenario.
${curriculumExcerpt ? `CRITICAL — CURRICULUM DOCUMENT RULES:
A curriculum reference document has been provided below. You MUST:
1. BASE every question on the content, terminology, and examples from this document.
2. For "los": Copy the EXACT Learning Outcome Statement (LOS) from the document — these are statements starting with verbs like "describe", "explain", "calculate", etc. that appear just below each topic heading. Do NOT paraphrase or invent LOS — use the exact wording from the document.
3. For "tracePage": Use the EXACT page numbers from the [PAGE N] markers in the document. Format as "p. X" or "p. X-Y" for ranges.
4. For "traceSection": Use the EXACT section/reading/topic heading as it appears in the document. CRITICAL: The traceSection MUST match the assigned topic — if the question is assigned to "Standard I: Professionalism", the traceSection MUST reference a section within Standard I, NEVER a section from Standard VI or any other standard/topic. Consistency between the topic assignment and the traceSection is mandatory.
5. For "keyFormulas" and "workedSolution": ALWAYS use valid LaTeX notation:
   - Inline formulas: \\( ... \\)   Block formulas: \\[ ... \\]
   - Fractions: \\frac{a}{b}   Exponents: x^{2}, k^{\\alpha}
   - Subscripts: P_{0}, CF_{t}, R_{equity}   Greek: \\alpha, \\beta, \\sigma, \\mu, \\rho, \\delta, \\lambda
   - Roots: \\sqrt{x}   Sums: \\sum_{i=1}^{n}   Multiply: \\cdot
   - ALL braces must be balanced. NEVER output broken LaTeX or mix markdown with LaTeX.
   Copy formulas from the document but ALWAYS convert them to valid LaTeX notation.
6. Questions that involve calculations MUST use the exact formulas from the document with correct variable names.` : ''}

VIGNETTE REQUIREMENTS (for VIGNETTE_MCQ or CONSTRUCTED_RESPONSE bundles):
- The vignetteText MUST be 400-600 words — long, rich, CFA-exam-quality narrative
- Introduce a named protagonist (e.g. "Rebecca Jones is a financial advisor at Apex Capital Management. She is evaluating...")
- Present multiple related financial scenarios, each with specific data, dates, company names
- Open the vignetteText with: "<p><strong>TOPIC: [TOPIC NAME]</strong></p><p><strong>TOTAL POINT VALUE OF THIS QUESTION SET IS [N] POINTS</strong></p>"
- VARY THE EXHIBIT FORMAT across case studies — do NOT give every case study a table. Distribute formats roughly equally:
  FORMAT A — TABLE: Include 1-2 HTML tables as CFA Exhibits with realistic financial data.
    CRITICAL TABLE STYLING: All tables MUST use SOLID borders only — never dashed, dotted, or broken lines.
    Use this EXACT format (do not modify the style attributes):
    <p><strong>Exhibit 1</strong></p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;border:1px solid #000;"><thead><tr><th style="border:1px solid #000;padding:6px;">Column</th><th style="border:1px solid #000;padding:6px;">Column</th></tr></thead><tbody><tr><td style="border:1px solid #000;padding:6px;">Value</td><td style="border:1px solid #000;padding:6px;">Value</td></tr></tbody></table>
    Every <th> and <td> MUST have inline style="border:1px solid #000;padding:6px;" — this guarantees solid borders in all renderings. NEVER use border-style:dashed or border-style:dotted.
  FORMAT B — NARRATIVE ONLY: No exhibit element — all data (specific numbers, ratios, dates, company names) must be woven naturally and richly into the prose. Sub-questions reference the narrative directly.
  FORMAT C — CHART: Include a text-based chart or graph as a CFA Exhibit using a <pre> block:
    <p><strong>Exhibit 1 – [Chart Title]</strong></p>
    <pre style="font-family:monospace;font-size:12px;background:#f8f8f8;padding:8px;border-radius:4px;">[ASCII bar chart, trend line, or labelled data series with specific values]</pre>
    Chart must show meaningful financial data (e.g. portfolio return over quarters, yield curve points, performance attribution bars)
- Sub-questions must reference specific exhibits or narrative sections (e.g. "Based on Exhibit 1..." or "Regarding Jones's evaluation of...")

Context:
- Course: ${course.name}
- Course level: ${levelLabel}
- Volume: ${volumeName}
- Topics: ${topicLabel}
- Concepts: ${legacyConceptLabel}
- Question type: ${typeLabel}
- Difficulty: ${difficultyLabel}
- Count: ${count}
${curriculumSection}
Return a JSON object with an "items" key. EVERY question/sub-question MUST include ALL of these fields (never null):
- "stem": string (question text, may include simple HTML)
- "options": for MCQ only: array of exactly 3 objects { "text": string, "isCorrect": boolean } with exactly one isCorrect true
- "explanation": string (concise explanation of the correct answer and common mistakes)
- "qid": string (short unique ID like "Q-TOPIC-001")
- "los": string (the EXACT learning outcome statement from the curriculum document — copy it verbatim)
- "traceSection": string (EXACT section/reading heading from the document that MATCHES the assigned topic. CRITICAL: traceSection MUST correspond to the specific topic — e.g. if topic is "Standard I: Professionalism", traceSection MUST reference Standard I content only, NEVER Standard VI or any other topic.)
- "tracePage": string (EXACT page from the document [PAGE N] markers, e.g. "p. 145" or "p. 145-148")
- "keyFormulas": string (key formula(s) using VALID LaTeX — e.g. "\\( PV = \\frac{CF_1}{(1+r)^{1}} + \\frac{CF_2}{(1+r)^{2}} \\)", "\\( WACC = w_{d} \\cdot r_{d} \\cdot (1-t) + w_{e} \\cdot r_{e} \\)". Use \\frac, \\sigma, \\beta, \\alpha etc. ALL braces must be balanced. Include variable definitions.)
- "workedSolution": string (step-by-step worked solution using valid LaTeX for all math — be thorough)

CRITICAL — CALCULATION CONSISTENCY RULE (MUST FOLLOW):
For EVERY question that involves a numerical calculation:
1. FIRST complete the full worked solution with every arithmetic step shown.
2. DERIVE the final numerical answer from your worked solution.
3. The correct MCQ option (isCorrect: true) MUST display the EXACT number you computed in the worked solution — NOT a different number.
4. NEVER pick the correct answer first and then write the solution — always solve first, then set the matching option as correct.
5. DOUBLE-CHECK: After generating the question, verify that the workedSolution's final value matches the correct option's text exactly. If they differ, fix the option to match the solution.
6. The two distractor options must be plausible but numerically different from the correct answer (e.g. common errors like forgetting the square root, using wrong weights, omitting a term).
Violating this rule produces hallucinated answers that damage student trust. Accuracy is mandatory.

For VIGNETTE_MCQ: items must be an array of ${count} objects, each with { "vignetteText": string, "questions": array of 4-5 MCQ sub-questions with same fields }.
For MCQ or CONSTRUCTED_RESPONSE: items must be an array of ${count} objects.`;

		try {
			const openai = new OpenAI({ apiKey });
			const completion = await openai.chat.completions.create({
				model: 'gpt-4o-mini',
				messages: [
					{ role: 'system', content: `You are an expert CFA curriculum and exam question writer. Always return valid JSON only.\n\n${LATEX_SYSTEM_RULES}` },
					{ role: 'user', content: prompt }
				],
				temperature: 0.4,
				response_format: { type: 'json_object' }
			});
			const raw = completion.choices?.[0]?.message?.content?.trim() || '{}';
			let items = [];
			try {
				const parsed = JSON.parse(raw);
				items = Array.isArray(parsed.questions) ? parsed.questions : Array.isArray(parsed) ? parsed : (parsed.items ? parsed.items : [parsed]);
			} catch {
				// Try wrapping in array if single object
				const single = JSON.parse(raw);
				items = Array.isArray(single) ? single : [single];
			}
			if (!Array.isArray(items)) items = [];

			const level = course.level || 'LEVEL1';
			const created = [];
			// For creation, spread questions across selected topics (round-robin)
			let topicCursor = 0;
			let diffCursor = 0;
			const nextTopicId = () => {
				const t = selectedTopics[topicCursor % selectedTopics.length];
				topicCursor++;
				return t.id;
			};
			const getTopicName = () => {
				return selectedTopics[(topicCursor - 1) % selectedTopics.length]?.name || '';
			};
			const nextDifficulty = () => {
				const d = diffList[diffCursor % diffList.length];
				diffCursor++;
				return d;
			};

			if (questionType === 'VIGNETTE_MCQ' && items.length > 0 && items[0].vignetteText) {
				// Each item is a separate case study bundle
				for (const item of items) {
					if (!item.vignetteText) continue;
					const useTopicId = nextTopicId();
					const useDifficulty = nextDifficulty();
					const parentPathIds = await deriveQuestionPathIdsFromTopic(useTopicId);
					if (!parentPathIds.courseId || !parentPathIds.volumeId || !parentPathIds.moduleId) continue;
					const parent = await prisma.question.create({
						data: {
							stem: '(Vignette parent)',
							type: 'VIGNETTE_MCQ',
							level,
							difficulty: useDifficulty,
							topicId: useTopicId,
							...parentPathIds,
							topics: { connect: selectedTopics.map(t => ({ id: t.id })) },
							vignetteText: item.vignetteText,
							marks: 1,
							isAiGenerated: true
						}
					});
					const subQ = Array.isArray(item.questions) ? item.questions : [];
					for (let si = 0; si < subQ.length; si++) {
						const sq = subQ[si];
						const s = (sq.stem || sq.question || '').trim();
						if (!s || s.length < 5) continue;
						const opts = sq.options || [];
						const child = await prisma.question.create({
							data: {
								stem: s,
								type: 'MCQ',
								level,
								difficulty: useDifficulty,
								topicId: useTopicId,
								...parentPathIds,
								topics: { connect: selectedTopics.map(t => ({ id: t.id })) },
								...(legacyConcepts.length > 0 ? { concepts: { connect: legacyConcepts.map(c => ({ id: c.id })) } } : {}),
								parentId: parent.id,
								orderIndex: si + 1,
								marks: 1,
								qid: sq.qid || null,
								los: sq.los || null,
								traceSection: validateTraceSection(sq.traceSection || '', getTopicName()) || null,
								tracePage: sq.tracePage || null,
								keyFormulas: sq.keyFormulas || null,
								workedSolution: (() => { const ws = (sq.workedSolution || '').trim(); const ex = (sq.explanation || '').trim(); if (ws && ex) return `${ex}\n\n--- Worked Solution ---\n${ws}`; return ex || ws || null; })(),
								isAiGenerated: true
							}
						});
						if (Array.isArray(opts) && opts.length >= 2) {
							await prisma.mcqOption.createMany({
								data: opts.map(o => ({ questionId: child.id, text: String(o.text || '').trim() || 'Option', isCorrect: !!o.isCorrect }))
							});
						}
					}
					const full = await prisma.question.findUnique({
						where: { id: parent.id },
						include: { options: true, children: { orderBy: [{ orderIndex: 'asc' }], include: { options: true } } }
					});
					created.push(full);
				}
			} else {
				for (let i = 0; i < Math.min(items.length, count); i++) {
					const item = items[i];
					const stem = (item.stem || item.question || '').trim();
					if (!stem || stem.length < 5) continue;
					const opts = item.options || [];
					const useTopicId = nextTopicId();
					const useDifficulty = nextDifficulty();
					const pathIds = await deriveQuestionPathIdsFromTopic(useTopicId);
					if (!pathIds.courseId || !pathIds.volumeId || !pathIds.moduleId) continue;
					const question = await prisma.question.create({
						data: {
							stem,
							type: questionType,
							level,
							difficulty: useDifficulty,
							topicId: useTopicId,
							...pathIds,
							topics: { connect: [{ id: useTopicId }] },
							...(legacyConcepts.length > 0 ? { concepts: { connect: legacyConcepts.map(c => ({ id: c.id })) } } : {}),
							marks: 1,
							qid: item.qid || null,
							los: item.los || null,
							traceSection: validateTraceSection(item.traceSection || '', getTopicName()) || null,
							tracePage: item.tracePage || null,
							keyFormulas: item.keyFormulas || null,
							workedSolution: (() => { const ws = (item.workedSolution || '').trim(); const ex = (item.explanation || '').trim(); if (ws && ex) return `${ex}\n\n--- Worked Solution ---\n${ws}`; return ex || ws || null; })(),
							isAiGenerated: true
						}
					});
					if (questionType !== 'CONSTRUCTED_RESPONSE' && Array.isArray(opts) && opts.length >= 2) {
						await prisma.mcqOption.createMany({
							data: opts.map(o => ({ questionId: question.id, text: String(o.text || '').trim() || 'Option', isCorrect: !!o.isCorrect }))
						});
					}
					const full = await prisma.question.findUnique({ where: { id: question.id }, include: { options: true } });
					created.push(full);
				}
			}
			return res.status(201).json({ created: created.length, questions: created });
		} catch (err) {
			const status = err?.status || err?.response?.status;
			const msg = err?.error?.message || err?.response?.data?.error?.message || err?.message || 'OpenAI request failed';
			// eslint-disable-next-line no-console
			console.error('AI generate failed:', {
				status,
				message: msg,
				name: err?.name,
				code: err?.code,
				type: err?.type,
				param: err?.param,
				stack: err?.stack
			});
			return res.status(502).json({
				error: msg,
				upstreamStatus: status || null
			});
		}
	});

	// Generate questions using OpenAI (admin only) - preview only (no DB writes)
	router.post('/questions/generate-ai/preview', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			courseId: z.string(),
			volumeId: z.string().optional(),
			moduleIds: z.array(z.string()).optional(),
			topicIds: z.array(z.string()).optional(),
			conceptIds: z.array(z.string()).optional(),
			questionType: z.enum(['MCQ', 'VIGNETTE_MCQ', 'CONSTRUCTED_RESPONSE']),
			constructedMode: z.enum(['single', 'bundle']).optional(),
			difficulties: z.array(z.enum(['EASY', 'MEDIUM', 'HARD'])).optional(),
			difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
			count: z.coerce.number().int().min(1).max(10)
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		let { courseId, volumeId, moduleIds, topicIds, conceptIds, questionType, constructedMode, difficulty, difficulties, count } = parse.data;
		const diffList = Array.isArray(difficulties) && difficulties.length
			? difficulties
			: (difficulty ? [difficulty] : ['MEDIUM']);

		const apiKey = await getOpenAIApiKey(prisma);
		if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY in .env or in Admin settings.' });

		const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, level: true } });
		if (!course) return res.status(400).json({ error: 'Course not found' });

		// Auto-resolve topics from moduleIds/course when none selected
		if (!topicIds || topicIds.length === 0) {
			const topicWhere = { courseId };
			if (Array.isArray(moduleIds) && moduleIds.length > 0) {
				topicWhere.moduleId = { in: moduleIds };
			} else if (volumeId) {
				topicWhere.module = { volumeId };
			}
			const autoTopics = await prisma.topic.findMany({ where: topicWhere, select: { id: true }, orderBy: { order: 'asc' } });
			topicIds = autoTopics.map(t => t.id);
			if (topicIds.length === 0) return res.status(400).json({ error: 'No topics found for the selected course/volume/modules' });
		}

		// Resolve volume name for better prompt context
		let volumeName = 'N/A';
		let effectiveVolumeId = volumeId;
		if (volumeId) {
			const vol = await prisma.volume.findUnique({ where: { id: volumeId }, select: { name: true } });
			if (vol) volumeName = vol.name;
		}

		const selectedTopics = await prisma.topic.findMany({
			where: { id: { in: topicIds } },
			select: { id: true, name: true, courseId: true, moduleId: true, module: { select: { id: true, name: true, volumeId: true } } }
		});
		if (selectedTopics.length !== topicIds.length) return res.status(400).json({ error: 'One or more topics not found' });
		for (const t of selectedTopics) {
			if (t.courseId && t.courseId !== courseId) return res.status(400).json({ error: 'One or more topics do not belong to selected course' });
			if (volumeId && t.module?.volumeId && t.module.volumeId !== volumeId) return res.status(400).json({ error: 'One or more topics do not belong to selected volume' });
		}

		// Derive volume from topics if not explicitly selected
		if (!effectiveVolumeId && selectedTopics.length > 0 && selectedTopics[0].module?.volumeId) {
			effectiveVolumeId = selectedTopics[0].module.volumeId;
			if (!volumeId) {
				const vol = await prisma.volume.findUnique({ where: { id: effectiveVolumeId }, select: { name: true } });
				if (vol) volumeName = vol.name;
			}
		}

		// Load concepts: must be before curriculum excerpt for topic-aware extraction
		let selectedConcepts = [];
		if (Array.isArray(conceptIds) && conceptIds.length > 0) {
			selectedConcepts = await prisma.concept.findMany({
				where: { id: { in: conceptIds } },
				select: { id: true, name: true, topicId: true }
			});
		} else {
			// Auto-resolve all concepts under selected topics
			selectedConcepts = await prisma.concept.findMany({
				where: { topicId: { in: topicIds } },
				orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
				select: { id: true, name: true, topicId: true }
			});
		}

		// Load curriculum document for fine-tuning (if uploaded for this course + volume)
		let previewCurriculumExcerpt = '';
		if (effectiveVolumeId) {
			const currDoc = await prisma.curriculumDocument.findUnique({
				where: { courseId_volumeId: { courseId, volumeId: effectiveVolumeId } },
				select: { extractedText: true }
			});
			if (currDoc?.extractedText) {
				// Use topic-aware windowed extraction so relevant sections are found even in large PDFs
				previewCurriculumExcerpt = buildCurriculumExcerpt(
					currDoc.extractedText,
					selectedTopics.map(t => t.name),
					selectedConcepts.map(c => c.name)
				);
			}
		}

		// ── SSE: switch to streaming before the long OpenAI call ─────────────────
		// DigitalOcean (and most cloud networks) kill TCP connections with no data
		// flowing for ~60 s. SSE heartbeats every 15 s keep the pipe alive.
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'X-Accel-Buffering': 'no',
			'Connection': 'keep-alive',
		});
		const sseHeartbeat = setInterval(() => { try { res.write(':heartbeat\n\n'); } catch {} }, 15000);
		const sseSend = (event, payload) => { try { res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); } catch {} };
		const sseEnd = () => { clearInterval(sseHeartbeat); try { res.end(); } catch {} };

		const levelLabel = (course.level || 'LEVEL1').replace('LEVEL', 'Level ');
		const isConstructedBundle = questionType === 'CONSTRUCTED_RESPONSE' && constructedMode === 'bundle';
		const typeLabel = questionType === 'MCQ'
			? 'Multiple choice (MCQ) with exactly 3 options (A, B, C) and exactly one correct answer'
			: questionType === 'VIGNETTE_MCQ'
				? 'Vignette / item-set (CFA exam style): a long, rich case study passage (400-600 words) with a named protagonist (financial analyst/advisor), multiple financial scenarios, and at least one HTML data table formatted as a CFA Exhibit. Sub-questions reference specific exhibits and test different aspects of the scenario. Each sub-question has exactly 3 MCQ options.'
				: isConstructedBundle
					? 'Constructed response case study: a detailed realistic scenario/case study passage (400-600 words) with a named protagonist and at least one HTML data table as an Exhibit, followed by multiple constructed-response sub-questions requiring calculations, analysis, or written explanations'
					: 'Constructed response (written answer requiring calculations or explanations)';
		const topicLabel = selectedTopics.map(t => t.name).join(', ');
		const conceptLabel = selectedConcepts.length > 0 ? selectedConcepts.map(c => c.name).join(', ') : 'All concepts under the selected topics';
		const difficultyLabel = diffList.join(', ');

		const isBundleType = questionType === 'VIGNETTE_MCQ' || isConstructedBundle;

		const metaFieldsBlock = `EVERY question MUST include ALL of these metadata fields (populate ALL of them, never leave null):
- "qid": string (a short unique random identifier — generate a random alphanumeric code for each question, e.g. "Q-${selectedTopics[0]?.name?.substring(0,4)?.toUpperCase() || 'CFA'}-${Math.random().toString(36).substring(2,6).toUpperCase()}" — each qid MUST be unique and randomly generated, NEVER use sequential numbering like 001, 002, 003)
- "los": string (the EXACT Learning Outcome Statement from the curriculum document — copy it VERBATIM, e.g. "describe the features of a fixed-income security". These appear just below topic headings and start with verbs like describe, explain, calculate, etc.)
- "traceSection": string (the EXACT section/reading/topic heading from the curriculum document that MATCHES THE ASSIGNED TOPIC. CRITICAL: the traceSection MUST correspond to the specific topic the question is about — e.g. if the topic is "Standard I: Professionalism", the traceSection MUST reference Standard I content, NEVER Standard VI or any other standard. The traceSection must be consistent with the topic tag. Do NOT reference sections outside the assigned topic.)
- "tracePage": string (the EXACT page number from the [PAGE N] markers in the curriculum document, e.g. "p. 145" or "p. 145-148" — do NOT guess page numbers)
- "keyFormulas": string (key formula(s) using VALID LaTeX — e.g. "\\( PV = \\frac{CF_1}{(1+r)^{1}} + \\frac{CF_2}{(1+r)^{2}} \\)", "\\( WACC = w_{d} \\cdot r_{d} \\cdot (1-t) + w_{e} \\cdot r_{e} \\)". Use \\frac, \\sigma, \\beta, \\alpha etc. ALL braces must be balanced. Include variable definitions.)
- "workedSolution": string (step-by-step worked solution using valid LaTeX for all math — be thorough so students can learn from it)
- "explanation": string (concise explanation of why the answer is correct and common mistakes to avoid)`;

		let formatBlock;
		if (questionType === 'MCQ') {
			formatBlock = `Return a JSON object with this EXACT shape:
{ "items": [ ... ${count} MCQ question objects ... ] }

Each object in the "items" array MUST have:
- "stem": string (the question text, may use simple HTML like <p>, <strong>, <em>, <ul>, <li> for formatting)
- "options": array of exactly 3 objects { "text": string, "isCorrect": boolean } with exactly ONE isCorrect: true
- Plus ALL metadata fields listed below

DO NOT wrap questions inside "vignetteText" or "questions" sub-arrays. Each item is a standalone MCQ question at the top level of the "items" array.

${metaFieldsBlock}`;
		} else if (questionType === 'VIGNETTE_MCQ') {
			formatBlock = `Return a JSON object with this EXACT shape:
{ "items": [ ${count > 1 ? `${count} separate vignette case study objects` : '1 vignette case study object'} ] }

Each object in "items" MUST follow this structure:
{
  "vignetteText": string — A LONG, RICH CFA-EXAM-STYLE CASE STUDY PASSAGE (400-600 words). Requirements:
    • Open with EXACTLY: "<p><strong>${volumeName}</strong></p>\n<p><strong>TOTAL POINT VALUE OF THIS QUESTION SET IS 12 POINTS</strong></p>"
    • Introduce a named protagonist with a UNIQUE, RANDOMLY GENERATED full name and a UNIQUE fictional company name — NEVER reuse names like Sarah Chen, Rebecca Jones, Michael Torres, Apex Capital, or Meridian Asset Management. Invent fresh, diverse names every time (vary ethnicity, gender, and firm style). Example pattern: "[Unique Name], CFA, is a [role] at [Unique Firm]. She/He is evaluating..."
    • Present multiple related financial scenarios, each with specific data, dates, company names, and context
    • IMPORTANT — VARY THE EXHIBIT FORMAT across case studies. Do NOT always use tables. Mix approaches:
      FORMAT A (TABLE): Include 1-2 HTML tables as CFA Exhibits (use this for ~40% of case studies)
      FORMAT B (NARRATIVE ONLY): No exhibit at all — weave ALL specific numbers, ratios, dates, names richly into the prose only. Sub-questions reference the narrative directly. (use this for ~30% of case studies)
      FORMAT C (CHART/GRAPH): Include a text-based chart as a CFA Exhibit using <pre> with ASCII/labelled data (use this for ~30% of case studies)
    • The passage should weave naturally between narrative context and any numerical exhibits
    • Different case studies MUST use different formats — do not repeat the same format for every case study
  "questions": array of EXACTLY 4 MCQ sub-questions (no more, no less). Each sub-question MUST:
    • Reference specific information or exhibit data from the vignetteText (e.g. "Based on Exhibit 1..." or "Regarding Jones's evaluation of XYZ...")
    • Have "stem": string, "options": exactly 3 objects { "text": string, "isCorrect": boolean } with exactly ONE correct
    • Cover a different aspect of the scenario/topic than the other sub-questions
    • Each sub-question is worth 3 marks (do NOT include a "marks" field for vignette MCQ sub-questions)
${selectedTopics.length > 1 ? `    • TOPIC DISTRIBUTION: The selected topics are [${selectedTopics.map(t => t.name).join(', ')}]. You MUST spread these topics equally across the 4 sub-questions. Each sub-question should test a different topic from this list. Assign topics round-robin so all selected topics are covered.
` : ''}
    • Plus ALL metadata fields listed below
}

${metaFieldsBlock}`;
		} else if (isConstructedBundle) {
			formatBlock = `Return a JSON object with this EXACT shape:
{ "items": [ ${count > 1 ? `${count} separate case study objects` : '1 case study object'} ] }

Each object in "items" MUST follow this structure:
{
  "vignetteText": string — A LONG, RICH CFA-EXAM-STYLE CASE STUDY PASSAGE (400-600 words). Requirements:
    • Open with EXACTLY: "<p><strong>${volumeName}</strong></p>\n<p><strong>TOTAL POINT VALUE OF THIS QUESTION SET IS 12 POINTS</strong></p>"
    • Introduce a named protagonist with a UNIQUE, RANDOMLY GENERATED full name and a UNIQUE fictional company name — NEVER reuse names like Sarah Chen, Michael Torres, Rebecca Jones, Apex Capital, or Meridian Asset Management. Invent fresh, diverse names every time (vary ethnicity, gender, and firm style). Example pattern: "[Unique Name], CFA, is a [role] at [Unique Firm]..."
    • Present multiple related financial scenarios with specific data, dates, company names, and context
    • IMPORTANT — VARY THE EXHIBIT FORMAT across case studies. Do NOT always use tables. Mix approaches:
      FORMAT A (TABLE): Include 1-2 HTML tables as CFA Exhibits with realistic financial data (use for ~40% of case studies)
      FORMAT B (NARRATIVE ONLY): No exhibit at all — embed ALL specific numbers, ratios, and data richly in the prose only (use for ~30% of case studies)
      FORMAT C (CHART/GRAPH): Include a text-based chart as a CFA Exhibit using <pre> with ASCII/labelled data (use for ~30% of case studies)
    • Different case studies MUST use different formats — do not repeat the same format for every case study
    • The passage should weave naturally between narrative context and any numerical exhibits
  "questions": array of 3 to 5 constructed-response sub-questions (vary the count between case studies). Each MUST:
    • Reference specific data or exhibits from the vignetteText
    • Have "stem" — clearly state what to calculate/explain. In SOME sub-questions (not all), include roman-numeral sub-points within the stem when it makes sense, e.g.:
      "Determine whether the stock market is overvalued using the:\ni. Fed model.\nii. Yardeni model.\nJustify each response with one reason."
      Only use sub-points when the question naturally breaks into distinct parts. Other sub-questions should be single direct prompts.
    • Have "marks" (integer — the total across all sub-questions should equal 12)
    • Have "questionGuidelines" (DETAILED marking criteria showing how marks are split — e.g. "Formula identification (1 mark)\nCorrect substitution (1 mark)\nFinal calculation (1 mark)\nInterpretation (1 mark)" — each step MUST show its mark allocation so students can self-assess)
    • Have "output" (full model answer that would receive maximum marks — use valid LaTeX for all formulas and show the step-by-step working with mark allocations inline, e.g. "Step 1: Identify formula... [1 mark]\nStep 2: Substitute values... [1 mark]")
${selectedTopics.length > 1 ? `    • TOPIC DISTRIBUTION: The selected topics are [${selectedTopics.map(t => t.name).join(', ')}]. You MUST spread these topics equally across the sub-questions. Each sub-question should test a different topic from this list. Assign topics round-robin so all selected topics are covered.
` : ''}
    • Plus ALL metadata fields below. No "options" field.
}

${metaFieldsBlock}`;
		} else {
			formatBlock = `Return a JSON object with this EXACT shape:
{ "items": [ ... ${count} constructed response question objects ... ] }

Each object in the "items" array MUST have:
- "stem": string (clearly describe what the candidate must calculate/explain and how many marks are available)
- "marks": integer (marks for this question)
- "questionGuidelines": string (DETAILED marking criteria showing how marks are split per step — e.g. "Formula identification (1 mark)\nCorrect substitution (1 mark)\nFinal calculation (1 mark)" — each component MUST show its mark so students can self-assess)
- "output": string (full model answer using valid LaTeX for formulas — show step-by-step working with mark allocations inline, e.g. "Step 1: \\( formula \\) [1 mark]\nStep 2: Substitute... [1 mark]")
- No "options" field
- Plus ALL metadata fields listed below (keyFormulas and workedSolution are especially important for constructed response)

${metaFieldsBlock}`;
		}

		// Fetch existing question stems for the selected topics to prevent duplicates
		let existingStemsBlock = '';
		try {
			const existingQuestions = await prisma.question.findMany({
				where: { topicId: { in: topicIds }, type: questionType },
				select: { stem: true },
				orderBy: { createdAt: 'desc' },
				take: 50
			});
			if (existingQuestions.length > 0) {
				const stems = existingQuestions
					.map(q => (q.stem || '').replace(/<[^>]+>/g, '').trim())
					.filter(s => s.length > 15)
					.slice(0, 30)
					.map((s, i) => `${i + 1}. ${s.substring(0, 150)}`);
				if (stems.length > 0) {
					existingStemsBlock = `\n\nDUPLICATE AVOIDANCE — The following questions ALREADY EXIST in our question bank. You MUST NOT generate questions that are the same or very similar to any of these. Generate COMPLETELY DIFFERENT questions that test different aspects or use different scenarios:\n${stems.join('\n')}\n`;
				}
			}
		} catch { /* ignore if fetch fails */ }

		const previewCurriculumSection = previewCurriculumExcerpt
			? `\n\nCURRICULUM REFERENCE MATERIAL (THIS IS YOUR PRIMARY SOURCE — all questions MUST be grounded in this document):\n---\n${previewCurriculumExcerpt}\n---\n`
			: '';
		const prompt = `You are a senior CFA exam question writer and curriculum expert. Generate professional, exam-quality questions that could appear on actual CFA Level I, II, or III examinations.

IMPORTANT GUIDELINES:
- Draw directly from past CFA exam question styles and real-world financial scenarios
- Questions must be precise, unambiguous, and test genuine understanding — not memorization
- Include realistic numerical examples, UNIQUE fictional company names (invent fresh names each time — NEVER reuse Apex Capital, Meridian Asset Management, or any previously used names), market scenarios, and specific dates
- For calculations, ALWAYS provide the key formulas and a detailed step-by-step worked solution — this is critical for student revision
- Each question should test a specific learning outcome related to the topic
- Vary the difficulty: EASY = straightforward recall/application; MEDIUM = multi-step analysis; HARD = complex scenario requiring synthesis of multiple concepts
- ALL metadata fields below are REQUIRED — populate every single one to help students during revision
- For VIGNETTE_MCQ or CONSTRUCTED_RESPONSE bundles:
  * The vignette MUST be 400–600 words — rich, narrative, CFA-exam-quality
  * Use a named protagonist with a UNIQUE randomly generated name and company — NEVER repeat names like Sarah Chen, Apex Capital, or Meridian Asset Management. Each case study MUST have completely different character and firm names. Vary ethnicity, gender, and company naming style
  * Include multiple related financial scenarios and data points within the passage
  * VARY exhibit formats across case studies: some with HTML tables, some narrative-only (no exhibits), some with text-based charts. Do NOT use tables in every single case study — mix approaches for realism
  * Sub-questions should reference specific exhibits or narrative details by name and test different aspects of the scenario
  * Open the vignetteText with the Volume name header: "<p><strong>${volumeName}</strong></p>"
${previewCurriculumExcerpt ? `CRITICAL — CURRICULUM DOCUMENT RULES:
A curriculum reference document has been provided below. You MUST:
1. BASE every question on the content, terminology, and examples from this document.
2. For "los": Copy the EXACT Learning Outcome Statement (LOS) from the document — these are statements starting with verbs like "describe", "explain", "calculate", etc. that appear just below each topic heading. Do NOT paraphrase or invent LOS — use the exact wording from the document.
3. For "tracePage": Use the EXACT page numbers from the [PAGE N] markers in the document. Format as "p. X" or "p. X-Y" for ranges.
4. For "traceSection": Use the EXACT section/reading/topic heading as it appears in the document. CRITICAL: The traceSection MUST match the assigned topic — if the question is assigned to "Standard I: Professionalism", the traceSection MUST reference a section within Standard I, NEVER a section from Standard VI or any other standard/topic. Consistency between the topic assignment and the traceSection is mandatory.
5. For "keyFormulas" and "workedSolution": ALWAYS use valid LaTeX notation:
   - Inline formulas: \\\\( ... \\\\)   Block formulas: \\\\[ ... \\\\]
   - Fractions: \\\\frac{a}{b}   Exponents: x^{2}, k^{\\\\alpha}
   - Subscripts: P_{0}, CF_{t}, R_{equity}   Greek: \\\\alpha, \\\\beta, \\\\sigma, \\\\mu, \\\\rho, \\\\delta, \\\\lambda
   - Roots: \\\\sqrt{x}   Sums: \\\\sum_{i=1}^{n}   Multiply: \\\\cdot
   - ALL braces must be balanced. NEVER output broken LaTeX or mix markdown with LaTeX.
   Copy formulas from the document but ALWAYS convert them to valid LaTeX notation.
6. Questions that involve calculations MUST use the exact formulas from the document with correct variable names.` : ''}

Context:
- Course: ${course.name}
- Course level: ${levelLabel}
- Volume: ${volumeName}
- Topics: ${topicLabel}
- Concepts: ${conceptLabel}
- Question type: ${typeLabel}
- Difficulty levels: ${difficultyLabel}
- Number of ${isBundleType ? 'case studies' : 'questions'}: ${count}
${previewCurriculumSection}${existingStemsBlock}
IMPORTANT: Each question MUST include a "conceptName" field — the name of the specific concept it tests, chosen from the Concepts list above (or a close match if the list says "All concepts"). This is used to map questions back to our curriculum database.

CONSISTENCY RULE: Each question's "traceSection" MUST be a section that falls WITHIN the topic the question is testing. If Topics = "${topicLabel}", then traceSection must reference content from ONLY those topics. For example, if the topic is "Standard I: Professionalism", the traceSection MUST say "Standard I(A) ...", "Standard I(B) ...", etc. — NEVER "Standard VI(A) ..." or content from any other topic. The question content, LOS, traceSection, and topic assignment must ALL be consistent with each other.

${formatBlock}`;

		try {
			const openai = new OpenAI({ apiKey });
			const completion = await openai.chat.completions.create({
				model: 'gpt-4o-mini',
				messages: [
					{ role: 'system', content: `You are an expert CFA curriculum and exam question writer. You produce high-quality, exam-standard questions. Always return valid JSON only.\n\n${LATEX_SYSTEM_RULES}` },
					{ role: 'user', content: prompt }
				],
				temperature: 0.75,
				response_format: { type: 'json_object' }
			});
			const raw = completion.choices?.[0]?.message?.content?.trim() || '{}';
			let parsed;
			try {
				parsed = JSON.parse(raw);
			} catch {
				sseSend('error', { error: 'AI returned invalid JSON' });
				return sseEnd();
			}
			let items = Array.isArray(parsed?.items) ? parsed.items : (Array.isArray(parsed?.questions) ? parsed.questions : []);

			// Robust MCQ post-processing: if AI returned MCQ items in bundle format, flatten them
			if (questionType === 'MCQ' && items.length > 0) {
				const flattened = [];
				for (const it of items) {
					if (Array.isArray(it.questions) && it.questions.length > 0) {
						// AI wrapped MCQ items inside a bundle - extract sub-questions
						for (const sq of it.questions) {
							flattened.push(sq);
						}
					} else if (it.stem || it.question) {
						flattened.push(it);
					}
				}
				if (flattened.length > 0) items = flattened;
				// Normalize alternative field names for options
				items = items.map(it => {
					const opts = it.options || it.choices || it.answers || [];
					const normalizedOpts = Array.isArray(opts) ? opts.map(o => ({
						text: o.text || o.label || o.answer || o.content || '',
						isCorrect: o.isCorrect === true || o.correct === true || o.is_correct === true
					})) : [];
					return { ...it, stem: it.stem || it.question || it.text || '', options: normalizedOpts };
				});
			}

			const level = course.level || 'LEVEL1';
			// Generate truly random unique qids server-side
			const usedQids = new Set();
			const generateRandomQid = (topicName) => {
				const prefix = (topicName || 'CFA').substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '');
				let qid;
				do {
					const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
					qid = `Q-${prefix}-${rand}`;
				} while (usedQids.has(qid));
				usedQids.add(qid);
				return qid;
			};
			let topicCursor = 0;
			let diffCursor = 0;
			const nextTopic = () => {
				const t = selectedTopics[topicCursor % selectedTopics.length];
				topicCursor++;
				return t;
			};
			const nextDifficulty = () => {
				const d = diffList[diffCursor % diffList.length];
				diffCursor++;
				return d;
			};

			// Map AI-returned conceptName back to concept IDs
			const mapConceptIds = (item) => {
				const cn = (item.conceptName || '').trim().toLowerCase();
				if (!cn || selectedConcepts.length === 0) return [];
				const exact = selectedConcepts.find(c => c.name.toLowerCase() === cn);
				if (exact) return [exact.id];
				// Fuzzy: find concept whose name contains the AI label or vice versa
				const partial = selectedConcepts.find(c => c.name.toLowerCase().includes(cn) || cn.includes(c.name.toLowerCase()));
				if (partial) return [partial.id];
				return [];
			};

			if (questionType === 'VIGNETTE_MCQ' || isConstructedBundle) {
				// Each item in the array is a separate case study bundle
				const bundles = items.map((bundle) => {
					const vignetteText = String(bundle.vignetteText || '').trim();
					const sub = Array.isArray(bundle.questions) ? bundle.questions : [];
					if (sub.length > 0) console.log('[preview] AI sub-question keys:', Object.keys(sub[0]), '| stem sample:', String(sub[0]?.stem || sub[0]?.question || sub[0]?.text || '').slice(0, 80));
					const subQuestions = sub.map((sq) => {
						const t = nextTopic();
						const useDifficulty = nextDifficulty();
						const cIds = mapConceptIds(sq);
						return {
							stem: sq.stem || sq.question || sq.text || sq.question_text || sq.questionText || sq.prompt || '',
							options: isConstructedBundle ? [] : (Array.isArray(sq.options) ? sq.options : []),
							explanation: sq.explanation || '',
							topicId: t.id,
							topicName: t.name,
							conceptIds: cIds,
							conceptName: sq.conceptName || '',
							difficulty: useDifficulty,
							marks: (questionType === 'VIGNETTE_MCQ') ? 3 : (sq.marks ? Number(sq.marks) : 1),
							qid: generateRandomQid(t.name),
							los: sq.los || '',
							traceSection: validateTraceSection(sq.traceSection || '', t.name),
							tracePage: sq.tracePage || '',
							keyFormulas: sq.keyFormulas || '',
							workedSolution: sq.workedSolution || '',
							questionGuidelines: sq.questionGuidelines || '',
							output: sq.output || ''
						};
					});
					return { vignetteText, questions: subQuestions };
				}).filter(b => b.vignetteText && b.questions.length > 0);
				sseSend('result', { course: { id: course.id, name: course.name, level }, questionType, concepts: selectedConcepts, generated: { bundles } });
				return sseEnd();
			}

			items = items.slice(0, count);
			const normalized = items.map((it) => {
				const t = nextTopic();
				const useDifficulty = nextDifficulty();
				const cIds = mapConceptIds(it);
				return {
					stem: it.stem || it.question || '',
					options: Array.isArray(it.options) ? it.options : [],
					explanation: it.explanation || '',
					topicId: t.id,
					topicName: t.name,
					conceptIds: cIds,
					conceptName: it.conceptName || '',
					difficulty: useDifficulty,
					marks: it.marks ? Number(it.marks) : 1,
					qid: generateRandomQid(t.name),
					los: it.los || '',
					traceSection: validateTraceSection(it.traceSection || '', t.name),
					tracePage: it.tracePage || '',
					keyFormulas: it.keyFormulas || '',
					workedSolution: it.workedSolution || '',
					questionGuidelines: it.questionGuidelines || '',
					output: it.output || ''
				};
			});

			sseSend('result', { course: { id: course.id, name: course.name, level }, questionType, concepts: selectedConcepts, generated: { items: normalized } });
			return sseEnd();
		} catch (err) {
			const msg = err?.message || err?.error?.message || 'OpenAI request failed';
			sseSend('error', { error: msg });
			return sseEnd();
		}
	});

	// Accept AI-generated preview and save to DB (supports selectedIndices for individual item selection)
	router.post('/questions/generate-ai/accept', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			questionType: z.enum(['MCQ', 'VIGNETTE_MCQ', 'CONSTRUCTED_RESPONSE']),
			generated: z.any(),
			selectedIndices: z.array(z.number().int().min(0)).optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const { questionType, generated, selectedIndices } = parse.data;

		// Helper: check for near-duplicate stems in existing questions
		async function isDuplicateStem(stem) {
			if (!stem || stem.length < 10) return false;
			const plain = stem.replace(/<[^>]+>/g, '').trim().toLowerCase();
			const words = plain.split(/\s+/).slice(0, 12).join(' ');
			if (!words || words.length < 10) return false;
			const existing = await prisma.question.findFirst({
				where: { stem: { contains: words.substring(0, Math.min(words.length, 60)) } },
				select: { id: true }
			});
			return !!existing;
		}

		// Merge explanation into workedSolution since 'explanation' doesn't exist in the DB schema
		// This ensures students see full context during revision
		function mergeWorkedSolution(item) {
			const ws = (item?.workedSolution || '').trim();
			const expl = (item?.explanation || '').trim();
			if (ws && expl) return `${expl}\n\n--- Worked Solution ---\n${ws}`;
			if (expl) return expl;
			return ws || null;
		}

		try {
			const created = [];
			const skippedDuplicates = [];

			// Handle bundle-based types (VIGNETTE_MCQ or CONSTRUCTED_RESPONSE case study)
			// generated.bundles is an array of { vignetteText, questions }
			const hasBundles = Array.isArray(generated?.bundles) && generated.bundles.length > 0;
			if (hasBundles && (questionType === 'VIGNETTE_MCQ' || questionType === 'CONSTRUCTED_RESPONSE')) {
				let bundles = generated.bundles;
				// selectedIndices refers to which bundles to save
				if (Array.isArray(selectedIndices) && selectedIndices.length > 0) {
					bundles = bundles.filter((_, idx) => selectedIndices.includes(idx));
				}
				if (bundles.length === 0) return res.status(400).json({ error: 'No case studies selected' });

				const isConstructed = questionType === 'CONSTRUCTED_RESPONSE';
				for (const bundle of bundles) {
					const vignetteText = String(bundle.vignetteText || '').trim();
					if (!vignetteText) continue;
					const questions = Array.isArray(bundle.questions) ? bundle.questions : [];
					if (questions.length === 0) continue;

					const firstTopicId = String(questions[0]?.topicId || '').trim();
					if (!firstTopicId) continue;
					const parentPathIds = await deriveQuestionPathIdsFromTopic(firstTopicId);
					if (!parentPathIds.courseId || !parentPathIds.volumeId || !parentPathIds.moduleId) continue;

					// Use a transaction so any child failure is immediately visible as an error (no orphaned parents)
					const full = await prisma.$transaction(async (tx) => {
						const parent = await tx.question.create({
							data: {
								stem: isConstructed ? '(Case study parent)' : '(Vignette parent)',
								type: questionType,
								level: parentPathIds.level || 'LEVEL1',
								difficulty: questions[0]?.difficulty || 'MEDIUM',
								topicId: firstTopicId,
								courseId: parentPathIds.courseId,
								volumeId: parentPathIds.volumeId,
								moduleId: parentPathIds.moduleId,
								topics: { connect: [{ id: firstTopicId }] },
								vignetteText,
								marks: 1,
								isAiGenerated: true
							}
						});

						for (let si = 0; si < questions.length; si++) {
							const sq = questions[si];
							const stem = String(sq?.stem || sq?.question || sq?.text || '').trim();
							if (!stem || stem.length < 3) continue;
							// Use child's own topicId for curriculum mapping; fall back to firstTopicId.
							// Always use parentPathIds for path fields (guaranteed complete).
							const childTopicId = String(sq?.topicId || '').trim() || firstTopicId;
							const childType = isConstructed ? 'CONSTRUCTED_RESPONSE' : 'MCQ';
							const sqConceptIds = Array.isArray(sq?.conceptIds) ? sq.conceptIds.filter(Boolean) : [];

							const child = await tx.question.create({
								data: {
									stem,
									type: childType,
									level: parentPathIds.level || 'LEVEL1',
									difficulty: sq?.difficulty || 'MEDIUM',
									marks: (questionType === 'VIGNETTE_MCQ') ? 3 : (sq?.marks ? Number(sq.marks) : 1),
									topicId: childTopicId,
									courseId: parentPathIds.courseId,
									volumeId: parentPathIds.volumeId,
									moduleId: parentPathIds.moduleId,
									topics: { connect: [{ id: childTopicId }] },
									...(sqConceptIds.length > 0 ? { concepts: { connect: sqConceptIds.map(cid => ({ id: cid })) } } : {}),
									parentId: parent.id,
									orderIndex: si + 1,
									qid: sq?.qid || null,
									los: sq?.los || null,
									traceSection: sq?.traceSection || null,
									tracePage: sq?.tracePage || null,
									keyFormulas: sq?.keyFormulas || null,
									workedSolution: mergeWorkedSolution(sq),
									questionGuidelines: sq?.questionGuidelines || null,
									output: sq?.output || null,
									isAiGenerated: true
								}
							});

							// Create MCQ options for vignette sub-questions
							if (!isConstructed) {
								const opts = Array.isArray(sq?.options) ? sq.options : [];
								if (opts.length >= 2) {
									await tx.mcqOption.createMany({
										data: opts.map(o => ({
											questionId: child.id,
											text: String(o.text || '').trim() || 'Option',
											isCorrect: !!o.isCorrect
										}))
									});
								}
							}
						}

						return tx.question.findUnique({
							where: { id: parent.id },
							include: { options: true, children: { orderBy: [{ orderIndex: 'asc' }], include: { options: true } } }
						});
					});
					created.push(full);
				}
				return res.status(201).json({ created: created.length, questions: created, skippedDuplicates });
			}

			let items = Array.isArray(generated?.items) ? generated.items : [];
			if (items.length === 0) return res.status(400).json({ error: 'items required' });
			// Filter by selectedIndices if provided
			if (Array.isArray(selectedIndices) && selectedIndices.length > 0) {
				items = items.filter((_, idx) => selectedIndices.includes(idx));
			}
			if (items.length === 0) return res.status(400).json({ error: 'No questions selected' });
			for (const item of items) {
				const stem = String(item?.stem || '').trim();
				if (!stem || stem.length < 5) continue;
				// Duplicate check
				if (await isDuplicateStem(stem)) {
					skippedDuplicates.push(stem.substring(0, 60));
					continue;
				}
				const topicId = String(item?.topicId || '').trim();
				if (!topicId) continue;
				const pathIds = await deriveQuestionPathIdsFromTopic(topicId);
				if (!pathIds.courseId || !pathIds.volumeId || !pathIds.moduleId) continue;
				const itemConceptIds = Array.isArray(item?.conceptIds) ? item.conceptIds.filter(Boolean) : [];
				const q = await prisma.question.create({
					data: {
						stem,
						type: questionType,
						level: pathIds.level || 'LEVEL1',
						difficulty: item?.difficulty || 'MEDIUM',
						marks: item?.marks ? Number(item.marks) : 1,
						topicId,
						...pathIds,
						topics: { connect: [{ id: topicId }] },
						...(itemConceptIds.length > 0 ? { concepts: { connect: itemConceptIds.map(cid => ({ id: cid })) } } : {}),
						qid: item?.qid || null,
						los: item?.los || null,
						traceSection: item?.traceSection || null,
						tracePage: item?.tracePage || null,
						keyFormulas: item?.keyFormulas || null,
						workedSolution: mergeWorkedSolution(item),
						questionGuidelines: item?.questionGuidelines || null,
						output: item?.output || null,
						isAiGenerated: true
					}
				});
				if (questionType !== 'CONSTRUCTED_RESPONSE') {
					const opts = Array.isArray(item?.options) ? item.options : [];
					if (opts.length >= 2) {
						await prisma.mcqOption.createMany({
							data: opts.map(o => ({
								questionId: q.id,
								text: String(o.text || '').trim() || 'Option',
								isCorrect: !!o.isCorrect
							}))
						});
					}
				}
				const full = await prisma.question.findUnique({ where: { id: q.id }, include: { options: true } });
				created.push(full);
			}
			return res.status(201).json({ created: created.length, questions: created, skippedDuplicates });
		} catch (err) {
			const msg = err?.message || err?.error?.message || 'Failed to save generated questions';
			return res.status(500).json({ error: msg });
		}
	});

  router.get('/questions/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const q = await prisma.question.findUnique({
      where: { id },
      include: {
        options: true,
        topics: { select: { id: true, name: true, moduleId: true, module: { select: { id: true, name: true, volumeId: true } } } },
        concepts: { select: { id: true, name: true, topicId: true } },
        children: {
          orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
          include: { options: true, topics: { select: { id: true, name: true } }, concepts: { select: { id: true, name: true, topicId: true } } }
        }
      }
    });
    if (!q) return res.status(404).json({ error: 'Not found' });
    return res.json({ question: q });
  });
  router.put('/questions/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const schema = z.object({
      stem: z.string().min(1).optional(),
      type: z.enum(['MCQ', 'VIGNETTE_MCQ', 'CONSTRUCTED_RESPONSE']).optional(),
      level: z.enum(['NONE','LEVEL1', 'LEVEL2', 'LEVEL3']).optional(),
      difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
      topicId: z.string().optional(),
      topicIds: z.array(z.string()).optional(),
      marks: z.number().int().positive().optional(),
      orderIndex: z.number().int().nonnegative().optional(),
      vignetteText: z.string().optional().nullable(),
      imageUrl: z.string().url().optional().nullable(),
      options: z.array(z.object({ text: z.string(), isCorrect: z.boolean() })).optional(),
      // Sub-questions array for bulk update of children
      subQuestions: z.array(z.object({
        id: z.string().optional(),
        stem: z.string().min(1),
        marks: z.number().int().positive().optional(),
        options: z.array(z.object({ text: z.string(), isCorrect: z.boolean() })).optional()
      })).optional(),
      qid: z.string().optional().nullable(),
      los: z.string().optional().nullable(),
      traceSection: z.string().optional().nullable(),
      tracePage: z.string().optional().nullable(),
      keyFormulas: z.string().optional().nullable(),
      workedSolution: z.string().optional().nullable(),
      conceptIds: z.array(z.string()).optional()
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const payload = parse.data;
    const existing = await prisma.question.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const newType = payload.type ?? existing.type;

    // Update core question fields
    // Resolve topic IDs: prefer topicIds array, fall back to single topicId
    const resolvedTopicIds = (Array.isArray(payload.topicIds) && payload.topicIds.length > 0)
      ? payload.topicIds
      : (typeof payload.topicId !== 'undefined' ? [payload.topicId] : null);
    let pathIds = null;
    let primaryTopicId = undefined;
    if (resolvedTopicIds && resolvedTopicIds.length > 0) {
      primaryTopicId = resolvedTopicIds[0];
      pathIds = await deriveQuestionPathIdsFromTopic(primaryTopicId);
      if (!pathIds.courseId || !pathIds.volumeId || !pathIds.moduleId) {
        return res.status(400).json({ error: 'Topic path is incomplete. Ensure topic has module and module has volume.' });
      }
    }
    await prisma.question.update({
      where: { id },
      data: {
        ...(typeof payload.stem !== 'undefined' ? { stem: payload.stem } : {}),
        ...(typeof payload.type !== 'undefined' ? { type: payload.type } : {}),
        ...(typeof payload.level !== 'undefined' ? { level: payload.level } : {}),
        ...(typeof payload.difficulty !== 'undefined' ? { difficulty: payload.difficulty } : {}),
        ...(typeof primaryTopicId !== 'undefined' ? { topicId: primaryTopicId } : {}),
        ...(resolvedTopicIds ? { topics: { set: resolvedTopicIds.map(tid => ({ id: tid })) } } : {}),
        ...(Array.isArray(payload.conceptIds) ? { concepts: { set: payload.conceptIds.map(cid => ({ id: cid })) } } : {}),
        ...(typeof payload.orderIndex !== 'undefined' ? { orderIndex: payload.orderIndex } : {}),
        ...(typeof payload.marks !== 'undefined' ? { marks: payload.marks } : {}),
        ...(typeof payload.vignetteText !== 'undefined' ? { vignetteText: payload.vignetteText || null } : {}),
        ...(typeof payload.imageUrl !== 'undefined' ? { imageUrl: payload.imageUrl || null } : {}),
        ...(typeof payload.qid !== 'undefined' ? { qid: payload.qid || null } : {}),
        ...(typeof payload.los !== 'undefined' ? { los: payload.los || null } : {}),
        ...(typeof payload.traceSection !== 'undefined' ? { traceSection: payload.traceSection || null } : {}),
        ...(typeof payload.tracePage !== 'undefined' ? { tracePage: payload.tracePage || null } : {}),
        ...(typeof payload.keyFormulas !== 'undefined' ? { keyFormulas: payload.keyFormulas || null } : {}),
        ...(typeof payload.workedSolution !== 'undefined' ? { workedSolution: payload.workedSolution || null } : {}),
        ...(pathIds ? pathIds : {})
      }
    });

    // Options for standalone MCQ
    if (newType === 'MCQ' && payload.options) {
      await prisma.mcqOption.deleteMany({ where: { questionId: id } });
      if (payload.options.length) {
        await prisma.mcqOption.createMany({
          data: payload.options.map(o => ({ questionId: id, text: o.text, isCorrect: o.isCorrect }))
        });
      }
    }

    // Sync sub-questions for vignette/constructed parent
    if (Array.isArray(payload.subQuestions) && (newType === 'VIGNETTE_MCQ' || newType === 'CONSTRUCTED_RESPONSE')) {
      const topicId = payload.topicId || existing.topicId;
      const effPathIds = pathIds || await deriveQuestionPathIdsFromTopic(topicId);

      // Get existing children
      const existingChildren = await prisma.question.findMany({
        where: { parentId: id },
        select: { id: true }
      });
      const existingChildIds = new Set(existingChildren.map(c => c.id));
      const incomingChildIds = new Set(payload.subQuestions.filter(sq => sq.id).map(sq => sq.id));

      // Delete children that are no longer in the list
      const toDelete = [...existingChildIds].filter(cid => !incomingChildIds.has(cid));
      if (toDelete.length) {
        await prisma.mcqOption.deleteMany({ where: { questionId: { in: toDelete } } });
        await prisma.question.deleteMany({ where: { id: { in: toDelete } } });
      }

      // Upsert each sub-question
      for (let i = 0; i < payload.subQuestions.length; i++) {
        const sq = payload.subQuestions[i];
        const childType = newType === 'VIGNETTE_MCQ' ? 'MCQ' : 'CONSTRUCTED_RESPONSE';
        if (sq.id && existingChildIds.has(sq.id)) {
          // Update existing child
          await prisma.question.update({
            where: { id: sq.id },
            data: {
              stem: sq.stem,
              orderIndex: i + 1,
              marks: sq.marks || 1
            }
          });
          // Replace options
          if (newType === 'VIGNETTE_MCQ' && sq.options) {
            await prisma.mcqOption.deleteMany({ where: { questionId: sq.id } });
            if (sq.options.length) {
              await prisma.mcqOption.createMany({
                data: sq.options.map(o => ({ questionId: sq.id, text: o.text, isCorrect: o.isCorrect }))
              });
            }
          }
        } else {
          // Create new child
          const child = await prisma.question.create({
            data: {
              stem: sq.stem,
              type: childType,
              level: payload.level || existing.level,
              difficulty: payload.difficulty || existing.difficulty,
              topicId,
              ...effPathIds,
              topics: topicId ? { connect: [{ id: topicId }] } : {},
              parentId: id,
              orderIndex: i + 1,
              marks: sq.marks || 1
            }
          });
          if (newType === 'VIGNETTE_MCQ' && sq.options && sq.options.length) {
            await prisma.mcqOption.createMany({
              data: sq.options.map(o => ({ questionId: child.id, text: o.text, isCorrect: o.isCorrect }))
            });
          }
        }
      }
    }

    const full = await prisma.question.findUnique({
      where: { id },
      include: {
        options: true,
        children: {
          orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
          include: { options: true }
        }
      }
    });
    return res.json({ question: full });
  });
  router.delete('/questions/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const existing = await prisma.question.findUnique({ where: { id }, select: { id: true, parentId: true } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    // Collect all IDs to delete (self + all children recursively via Prisma onDelete: Cascade)
    const children = await prisma.question.findMany({ where: { parentId: id }, select: { id: true } });
    const allIds = [id, ...children.map(c => c.id)];

    // Delete options, exam links, answers for all affected questions
    await prisma.mcqOption.deleteMany({ where: { questionId: { in: allIds } } });
    // Remove from exams
    await prisma.examQuestion.deleteMany({ where: { questionId: { in: allIds } } }).catch(() => {});
    await prisma.examAnswer.deleteMany({ where: { questionId: { in: allIds } } }).catch(() => {});
    // Delete children first, then parent
    if (children.length) {
      await prisma.question.deleteMany({ where: { parentId: id } });
    }
    await prisma.question.delete({ where: { id } });
    return res.json({ ok: true, deletedCount: allIds.length });
  });

  // Fetch sub-questions (children) of a parent question
  router.get('/questions/:id/children', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const parentId = req.params.id;
    const questions = await prisma.question.findMany({
      where: { parentId },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
      include: { options: true }
    });
    return res.json({ questions });
  });

	// Revision summaries
	router.get('/revision-summaries', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const level = req.query.level;
		const q = (req.query.q ?? '').toString().trim();
		const where = {
			AND: [level ? { level } : {}, q ? { title: { contains: q, mode: 'insensitive' } } : {}]
		};
		const [total, summaries] = await Promise.all([
			prisma.revisionSummary.count({ where }),
			prisma.revisionSummary.findMany({ where, orderBy: { createdAt: 'desc' } })
		]);
		return res.json({ summaries, total });
	});
	router.post('/revision-summaries', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			title: z.string().min(3),
			level: z.enum(['NONE','LEVEL1', 'LEVEL2', 'LEVEL3']),
			topicId: z.string().optional(),
			contentUrl: z.string().url().optional(),
			contentHtml: z.string().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const summary = await prisma.revisionSummary.create({ data: parse.data });
		return res.status(201).json({ summary });
	});
	router.put('/revision-summaries/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		const schema = z.object({
			title: z.string().min(3),
			level: z.enum(['NONE','LEVEL1', 'LEVEL2', 'LEVEL3']),
			topicId: z.string().optional(),
			contentUrl: z.string().url().optional(),
			contentHtml: z.string().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const summary = await prisma.revisionSummary.update({ where: { id }, data: parse.data });
		return res.json({ summary });
	});
	router.delete('/revision-summaries/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		await prisma.revisionSummary.delete({ where: { id } });
		return res.json({ ok: true });
	});

	return router;
}

// Helpers
function computeEstimatedSeconds(kind, payload) {
  // 1) Direct inputs
  if (typeof payload.estimatedSeconds === 'number' && payload.estimatedSeconds > 0) {
    return payload.estimatedSeconds;
  }
  if (typeof payload.estimatedMinutes === 'number' && payload.estimatedMinutes > 0) {
    return payload.estimatedMinutes * 60;
  }
  // 2) Kind-based heuristics
  if (kind === 'VIDEO') {
    if (typeof payload.durationSec === 'number' && payload.durationSec > 0) {
      return Math.max(60, payload.durationSec); // at least 1 minute
    }
    return 5 * 60; // default 5 min if unknown
  }
  if (kind === 'HTML' && typeof payload.contentHtml === 'string') {
    const text = payload.contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const words = text ? text.split(' ').length : 0;
    const minutes = Math.max(1, Math.ceil(words / 200)); // ~200 wpm
    return minutes * 60;
  }
  // PDFs/Links/Images default small slot unless provided
  return 2 * 60;
}


