import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { LATEX_SYSTEM_RULES, validateFormulaItems } from '../lib/openai.js';
import { getAIApiKey, getActiveProvider, getActiveModel, getDefaultModel, chatCompletion, AI_PROVIDERS } from '../lib/aiProvider.js';
import { stripJsonFences, worstStatus, extractCurriculumExcerpt, STATUS_RANK } from '../lib/aiContent.js';
import { extractPdfPages, looksLikePdfBuffer } from '../lib/summarySheets/pdf.js';
import { enqueueSummarySheet } from '../lib/summarySheets/worker.js';
import { searchSummarySheets, searchWithinSummarySheet, serializeSheet } from '../lib/summarySheets/search.js';
import {
  summarySheetDir,
  summaryKey,
  safeFilename,
  moveFile,
  hashFile,
  signedSummaryPdfUrl,
  verifySummaryPdfToken,
  resolveSummaryKey,
  removeSummaryStorage
} from '../lib/summarySheets/storage.js';

const MAX_TARGET_MODULES = 20;

const MILVEN_SUMMARY_SYSTEM = `You are the Milven Diagrammatic Summary Generator for Milven Finance School.

Your role is to transform authoritative CFA curriculum extracts, Learning Outcome Statements, completed Milven Notes and approved Formula Book content into a concise, exam-focused Learning Module revision dashboard.

You are NOT writing textbook notes.

You are creating a visual revision dashboard that helps a CFA candidate understand the entire Learning Module before attempting exam questions.

Never invent curriculum content.

If information required for a section is not supported by supplied source material, place it under Instructor Review Required instead of guessing.

Return valid JSON only.`;

// Programmatic quality-control validator (always runs).
function programmaticValidation(item, ctx) {
	const findings = [];
	const checks = {};
	const norm = (s) => String(s || '').toLowerCase().trim();

	const topicNames = ctx.topics.map(t => t.name).filter(Boolean);
	const mapTexts = [
		...(Array.isArray(item.diagrams) ? item.diagrams.map(d => `${d.topic || ''} ${(d.subtopics || []).join(' ')} ${d.connectionTo || ''}`) : []),
		...(Array.isArray(item.memoryHooks) ? item.memoryHooks.map(m => `${m.topic || ''} ${(m.concepts || []).join(' ')} ${m.linkToObjective || ''}`) : []),
	].map(norm);

	const coveredTopics = topicNames.filter(tn => {
		const n = norm(tn);
		return mapTexts.some(m => m.includes(n) || (n.length > 4 && n.includes(m) && m.length > 3));
	});
	checks.topicCoverage = topicNames.length ? Math.round((coveredTopics.length / topicNames.length) * 100) : 100;
	if (topicNames.length && coveredTopics.length < Math.max(1, Math.ceil(topicNames.length * 0.6))) {
		findings.push(`Topic coverage is low: ${coveredTopics.length}/${topicNames.length} module topics appear in the concept maps.`);
	}

	const losRefs = ctx.los.map(l => norm(l.ref)).filter(Boolean);
	const itemLos = Array.isArray(item.coreDefinitions) ? item.coreDefinitions.map(c => norm(c.ref)).filter(Boolean) : [];
	const coveredLos = losRefs.filter(r => itemLos.some(x => x === r || x.includes(r) || r.includes(x)));
	checks.losCoverage = losRefs.length ? Math.round((coveredLos.length / losRefs.length) * 100) : (itemLos.length ? 100 : 0);
	if (ctx.los.length && coveredLos.length < Math.ceil(ctx.los.length * 0.6)) {
		findings.push(`LOS coverage is incomplete: ${coveredLos.length}/${ctx.los.length} supplied Learning Outcome Statements appear in the LOS Snapshot.`);
	}
	if (!ctx.los.length) {
		findings.push('No Learning Outcome Statements were found for this module. Generation requires instructor review.');
	}

	checks.formulaCount = Array.isArray(item.formulas) ? item.formulas.length : 0;
	if (ctx.formulas.length && checks.formulaCount === 0) {
		findings.push('No formulas were included even though formulas exist in the Formula Book for this module.');
	}

	checks.decisionRuleCount = Array.isArray(item.distinctions) ? item.distinctions.length : 0;
	if (checks.decisionRuleCount < 3) findings.push('Fewer than 3 exam decision rules were generated.');

	checks.trapCount = Array.isArray(item.examTraps) ? item.examTraps.length : 0;
	if (checks.trapCount < 3) findings.push('Fewer than 3 high-frequency exam traps were generated.');

	checks.checklistCount = Array.isArray(item.revisionCheck) ? item.revisionCheck.length : 0;
	if (checks.checklistCount < 5) findings.push('The final revision checklist has fewer than 5 action items.');

	// Compression / verbatim detection
	const longStrings = [];
	const collectStrings = [];
	const walk = (v) => {
		if (typeof v === 'string') {
			if (v.length > 600) longStrings.push(v);
			if (v.length > 120) collectStrings.push(v);
		} else if (Array.isArray(v)) v.forEach(walk);
		else if (v && typeof v === 'object') Object.values(v).forEach(walk);
	};
	walk(item);
	checks.overlongBlocks = longStrings.length;
	if (longStrings.length) findings.push(`${longStrings.length} block(s) exceed 600 characters — likely too text-heavy for a dashboard.`);

	if (ctx.curriculumExcerpt) {
		const excerptLower = ctx.curriculumExcerpt.toLowerCase();
		let copied = 0;
		for (const s of collectStrings) {
			if (excerptLower.includes(s.toLowerCase().slice(0, 120))) copied++;
		}
		checks.copiedBlocks = copied;
		if (copied > 0) findings.push(`${copied} block(s) appear to be copied verbatim from the curriculum — paraphrase required.`);
	}

	let status = findings.length ? 'REVISE' : 'PASS';
	if (!ctx.topics.length && !ctx.notes.length && !ctx.curriculumExcerpt) status = 'INSTRUCTOR REVIEW REQUIRED';
	if (!ctx.los.length) status = 'INSTRUCTOR REVIEW REQUIRED';
	return { status, findings, checks };
}

// Second AI validation pass (best effort — never fatal). Uses the same provider/model.
async function aiValidation(item, ctx, { apiKey, provider, model, chatCompletion: chat = chatCompletion }) {
	const compact = {
		title: item.title,
		snapshot: item.snapshot,
		coreDefinitions: item.coreDefinitions,
		diagrams: item.diagrams,
		memoryHooks: item.memoryHooks,
		formulas: item.formulas,
		distinctions: item.distinctions,
		examTraps: item.examTraps,
		revisionCheck: item.revisionCheck,
		quickDrills: item.quickDrills,
		useCase: item.useCase,
	};
	const sourceFacts = {
		module: ctx.module?.name,
		topics: ctx.topics.map(t => t.name),
		los: ctx.los.map(l => `${l.ref || ''}: ${l.statement}`),
		formulaNames: ctx.formulas.map(f => f.name),
		hasCurriculum: !!ctx.curriculumExcerpt,
		notesCount: ctx.notes.length,
	};
	const prompt = `You are the Milven Summary Quality Validator. Validate the generated Learning Module revision dashboard against the supplied source facts.

CHECK THESE 10 CRITERIA:
1. Is it at Learning Module level (not topic level)?
2. Topic coverage — are all module topics represented?
3. LOS coverage — are all supplied LOS represented?
4. Objective alignment — do topics link to the module objective?
5. Formula coverage — are the key formulas included?
6. Decision rules — are there rules telling candidates which measure/concept to choose?
7. Exam traps — are common candidate errors present?
8. Compression — is it dashboard-dense (not textbook paragraphs)?
9. Originality — no verbatim curriculum copying?
10. Instructor-review gaps — is unsupported/ambiguous content flagged instead of invented?

Return ONLY valid JSON:
{"status":"PASS|REVISE|INSTRUCTOR REVIEW REQUIRED","findings":[{"area":"topic coverage","severity":"low|medium|high","note":"..."}]}

SOURCE FACTS:
${JSON.stringify(sourceFacts)}

GENERATED SUMMARY:
${JSON.stringify(compact)}`;

	const result = await chat({
		apiKey, provider, model,
		messages: [
			{ role: 'system', content: 'You are a strict QA validator for Milven Finance School revision summaries. Return valid JSON only.' },
			{ role: 'user', content: prompt },
		],
		temperature: 0.2,
		maxTokens: 1500,
		jsonMode: true,
	});
	const parsed = JSON.parse(stripJsonFences(result.content || '{}'));
	let status = String(parsed.status || 'PASS').toUpperCase();
	if (!(status in STATUS_RANK)) status = 'REVISE';
	const findings = Array.isArray(parsed.findings)
		? parsed.findings.map(f => typeof f === 'string' ? f : `${f.area ? f.area + ': ' : ''}${f.note || ''}`.trim()).filter(Boolean)
		: [];
	return { status, findings };
}

function mergeInstructorReview(quickDrills, findings, status) {
	const base = Array.isArray(quickDrills) ? quickDrills.filter(Boolean) : [];
	const clean = base.filter(d => !(d.issue === 'None identified' && status !== 'PASS'));
	if (status === 'PASS' && findings.length === 0) {
		return clean.length ? clean : [{ issue: 'None identified', recommendation: 'Ready for publication' }];
	}
	const merged = [...clean];
	for (const f of findings) {
		if (!merged.some(m => (m.issue || '') === f)) {
			merged.push({ issue: f, recommendation: 'Instructor to verify against curriculum before publication.' });
		}
	}
	return merged.length ? merged : [{ issue: 'Quality validation did not pass', recommendation: 'Instructor review required before publication.' }];
}

function buildSummaryPrompt(ctx, year) {
	const levelLabel = String(ctx.level || '').replace('LEVEL', 'Level ');
	const topicNames = ctx.topics.map(t => t.name);
	const losLines = ctx.los.length
		? ctx.los.map(l => `- ${l.ref ? l.ref + ': ' : ''}${l.statement}${l.commandWord ? ` [${l.commandWord}]` : ''}`).join('\n')
		: '(none supplied — flag under Instructor Review Required)';

	const notesContext = ctx.notes.length
		? ctx.notes.map(n => {
			const parts = [`- ${n.title}`];
			if (n.overview) parts.push(`  Overview: ${n.overview}`);
			if (n.moduleSummary) parts.push(`  Module summary: ${n.moduleSummary}`);
			if (Array.isArray(n.losStatements) && n.losStatements.length) {
				parts.push(`  LOS: ${n.losStatements.map(l => l.statement || l.learningOutcomeStatement || '').filter(Boolean).join(' | ')}`);
			}
			if (Array.isArray(n.concepts) && n.concepts.length) {
				parts.push(`  Concepts: ${n.concepts.map(c => c.title || c.name || '').filter(Boolean).join(' | ')}`);
			}
			return parts.join('\n');
		}).join('\n')
		: '(no published Milven Notes for this module)';

	const formulaContext = ctx.formulas.length
		? ctx.formulas.map(f => `- ${f.name}: ${f.formula}${f.variables ? ` | vars: ${f.variables}` : ''}${f.whenToUse ? ` | use: ${f.whenToUse}` : ''}${f.interpretation ? ` | meaning: ${f.interpretation}` : ''}`).join('\n')
		: '(no Formula Book entries for this module)';

	const curriculumSection = ctx.curriculumExcerpt
		? `\n\nCURRICULUM REFERENCE MATERIAL (control source — do NOT reproduce verbatim):\n---\n${ctx.curriculumExcerpt}\n---\n`
		: '\n\nCURRICULUM REFERENCE MATERIAL: (none available for this volume)\n';

	return `Generate ONE Milven Diagrammatic Summary for the Learning Module below.

HIERARCHY:
Programme: CFA
Exam Level: ${levelLabel}
Course / Topic Area: ${ctx.course?.name || ''}
Volume: ${ctx.module?.volume?.name || ''}
Learning Module: ${ctx.module?.name || ''}
Year: ${year}

LEARNING MODULE OBJECTIVE (from published Milven Notes, if any):
${ctx.moduleObjective || '(not available — infer only from supplied material, otherwise flag under Instructor Review Required)'}

LEARNING OUTCOME STATEMENTS (LOS):
${losLines}

TOPIC HEADINGS IN THIS MODULE:
${topicNames.length ? topicNames.map(t => `- ${t}`).join('\n') : '(none found — flag under Instructor Review Required)'}

COMPLETED TOPIC-LEVEL MILVEN NOTES:
${notesContext}

FORMULA BOOK ENTRIES:
${formulaContext}
${curriculumSection}
CORE GENERATION RULES:
1. Generate at Learning Module level only.
2. Prefer one-page density; allow a second page only when required.
3. Cover every available topic.
4. Address every supplied LOS.
5. Link topics to the Learning Module objective.
6. Do not reproduce source text verbatim.
7. Use short exam-focused statements.
8. Avoid long paragraphs.
9. Include key formulas and their use cases.
10. Include interpretation for formulas.
11. Include decision rules that tell the candidate when to choose one concept/measure over another.
12. Include high-frequency candidate errors/traps.
13. End with an action-based revision checklist.
14. Flag unsupported or ambiguous content under Instructor Review Required.
15. Perform a coverage check before returning the output.

REQUIRED JSON OUTPUT (populate ALL sections):
{
  "sheets": [
    {
      "title": "LM#: [Learning Module Name]",
      "snapshot": "Concise Learning Module objective",
      "coreDefinitions": [{"ref": "LOS 1.a", "statement": "Candidate-friendly LOS wording", "commandWord": "interpret"}],
      "diagrams": [{"topic": "Topic", "subtopics": ["..."], "connectionTo": "..."}],
      "memoryHooks": [{"topic": "Topic", "concepts": ["..."], "linkToObjective": "..."}],
      "formulas": [{"formula": "LaTeX", "useCase": "...", "interpretation": "..."}],
      "distinctions": [{"scenario": "...", "rule": "...", "apply": "..."}],
      "examTraps": [{"trap": "..."}],
      "revisionCheck": [{"item": "..."}],
      "quickDrills": [{"issue": "...", "recommendation": "..."}],
      "useCase": "PASS|REVISE|INSTRUCTOR REVIEW REQUIRED"
    }
  ]
}

Formula LaTeX: use \\frac{a}{b}, P_{0}, (1+r)^{n}, \\sigma, \\beta; inline \\( ... \\) or block \\[ ... \\]. Keep braces balanced.
The "useCase" value is your own coverage quality check for this module.
Return ONLY valid JSON. Generate exactly 1 summary sheet.`;
}

const MAX_SUMMARY_PDF_BYTES = Number(process.env.SUMMARY_PDF_MAX_BYTES ?? 250 * 1024 * 1024);
const summaryTempDir = path.join(os.tmpdir(), 'milven-summary-pdf-uploads');
fs.mkdirSync(summaryTempDir, { recursive: true });

const summaryPdfUpload = multer({
  dest: summaryTempDir,
  limits: { fileSize: MAX_SUMMARY_PDF_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/\.pdf$/i.test(file.originalname || '')) return cb(new Error('Only PDF files are accepted.'));
    cb(null, true);
  }
});

function cleanupSummaryTemp(file) {
  if (!file?.path) return;
  try { fs.rmSync(file.path, { force: true }); } catch {}
}

async function validateSummaryMapping(prisma, { courseId, volumeId, moduleId, topicIds = [], conceptIds = [] }) {
  const errors = [];
  if (!courseId) errors.push('Course is required.');
  if (!volumeId) errors.push('Volume is required.');
  if (!moduleId) errors.push('Learning Module is required.');
  const [course, volume, moduleRecord] = await Promise.all([
    courseId ? prisma.course.findUnique({ where: { id: courseId }, select: { id: true, level: true } }) : null,
    volumeId ? prisma.volume.findUnique({ where: { id: volumeId }, select: { id: true } }) : null,
    moduleId ? prisma.module.findUnique({ where: { id: moduleId }, select: { id: true, courseId: true, volumeId: true } }) : null
  ]);
  if (courseId && !course) errors.push('Course not found.');
  if (volumeId && !volume) errors.push('Volume not found.');
  if (moduleId && !moduleRecord) errors.push('Learning Module not found.');
  if (course && volume) {
    const link = await prisma.courseVolume.findUnique({
      where: { courseId_volumeId: { courseId, volumeId } },
      select: { courseId: true }
    });
    if (!link) errors.push('The selected Volume is not linked to this Course.');
  }
  if (moduleRecord && courseId && moduleRecord.courseId !== courseId) errors.push('The Learning Module does not belong to the selected Course.');
  if (moduleRecord && volumeId && moduleRecord.volumeId !== volumeId) errors.push('The Learning Module does not belong to the selected Volume.');

  if (topicIds.length) {
    const topics = await prisma.topic.findMany({
      where: { id: { in: topicIds } },
      select: { id: true, name: true, moduleId: true }
    });
    if (topics.length !== topicIds.length) errors.push('One or more selected Topics no longer exist.');
    for (const topic of topics) {
      if (moduleId && topic.moduleId !== moduleId) errors.push(`Topic "${topic.name}" does not belong to the selected Learning Module.`);
    }
  }
  if (conceptIds.length) {
    const concepts = await prisma.concept.findMany({
      where: { id: { in: conceptIds } },
      select: { id: true, name: true, topicId: true, topic: { select: { moduleId: true } } }
    });
    if (concepts.length !== conceptIds.length) errors.push('One or more selected Concepts no longer exist.');
    for (const concept of concepts) {
      if (moduleId && concept.topic?.moduleId !== moduleId) errors.push(`Concept "${concept.name}" does not belong to the selected Learning Module.`);
      if (topicIds.length && !topicIds.includes(concept.topicId)) errors.push(`Concept "${concept.name}" does not belong to the selected Topics.`);
    }
  }
  return { errors, course };
}

async function canAccessSummarySheet(prisma, user, sheet) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (sheet.status !== 'PUBLISHED') return false;
  if (!sheet.courseId) return false;
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId: sheet.courseId } },
    select: { id: true }
  });
  return Boolean(enrollment);
}

function parseIdArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return String(value).split(',').map(item => item.trim()).filter(Boolean);
  }
}

export function summarySheetsRouter(prisma, deps = {}) {
	const router = Router();

	// Injectable AI dependencies (defaults preserve production behaviour; tests can override).
	const ai = {
		getAIApiKey: deps.getAIApiKey || getAIApiKey,
		getActiveProvider: deps.getActiveProvider || getActiveProvider,
		getActiveModel: deps.getActiveModel || getActiveModel,
		getDefaultModel: deps.getDefaultModel || getDefaultModel,
		chatCompletion: deps.chatCompletion || chatCompletion,
	};

	const defaultInclude = {
		course: { select: { id: true, name: true, level: true } },
		volume: { select: { id: true, name: true } },
		module: { select: { id: true, name: true } },
		topic: { select: { id: true, name: true } },
		topicLinks: { include: { topic: { select: { id: true, name: true } } } },
		conceptLinks: { include: { concept: { select: { id: true, name: true, topicId: true } } } },
	};

	const stripStorage = (sheet) => {
		if (!sheet) return sheet;
		const { pdfStorageKey, pendingPdfKey, pdfFileHash, pendingPdfHash, ...safe } = sheet;
		return {
			...safe,
			topics: (sheet.topicLinks || []).map(link => link.topic).filter(Boolean),
			concepts: (sheet.conceptLinks || []).map(link => link.concept).filter(Boolean),
			topicLinks: undefined,
			conceptLinks: undefined,
			hasPdf: Boolean(pdfStorageKey)
		};
	};

	const sheetSchema = z.object({
		title: z.string().min(1),
		level: z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3']),
		courseId: z.string().optional().nullable(),
		volumeId: z.string().optional().nullable(),
		moduleId: z.string().optional().nullable(),
		topicId: z.string().optional().nullable(),
		year: z.number().int().optional().default(2026),
		snapshot: z.string().optional().nullable(),
		useCase: z.string().optional().nullable(),
		description: z.string().optional().nullable(),
		keywords: z.array(z.string()).optional(),
		coreDefinitions: z.any().optional().nullable(),
		formulas: z.any().optional().nullable(),
		distinctions: z.any().optional().nullable(),
		diagrams: z.any().optional().nullable(),
		examTraps: z.any().optional().nullable(),
		memoryHooks: z.any().optional().nullable(),
		quickDrills: z.any().optional().nullable(),
		revisionCheck: z.any().optional().nullable(),
		order: z.number().int().optional().default(0),
		status: z.enum(['DRAFT', 'PUBLISHED']).optional().default('DRAFT'),
	});

	// ─── LIST ─────────────────────────────────────────────────
	router.get('/', async (req, res) => {
		try {
			const { courseId, volumeId, moduleId, topicId, level, status, year, search, source, page, limit } = req.query;
			const where = {};
			if (courseId) where.courseId = courseId;
			if (volumeId) where.volumeId = volumeId;
			if (moduleId) where.moduleId = moduleId;
			if (topicId) where.topicId = topicId;
			if (level) where.level = level;
			if (status) where.status = status;
			if (year) where.year = Number(year);
			if (source === 'AI_GENERATED' || source === 'UPLOADED_PDF') where.sourceType = source;
			if (search) {
				where.OR = [
					{ title: { contains: search, mode: 'insensitive' } },
					{ snapshot: { contains: search, mode: 'insensitive' } },
					{ description: { contains: search, mode: 'insensitive' } },
					{ keywords: { has: search } },
				];
			}

			const pageNum = Math.max(1, Number(page) || 1);
			const pageSize = Math.min(200, Math.max(1, Number(limit) || 25));
			const skip = (pageNum - 1) * pageSize;

			const [sheets, total] = await Promise.all([
				prisma.summarySheet.findMany({
					where,
					include: defaultInclude,
					orderBy: [{ order: 'asc' }, { title: 'asc' }],
					skip,
					take: pageSize,
				}),
				prisma.summarySheet.count({ where }),
			]);

			return res.json({ sheets: sheets.map(stripStorage), total, page: pageNum, limit: pageSize });
		} catch (err) {
			console.error('[summarySheets.list]', err);
			return res.status(500).json({ error: 'Failed to list summary sheets' });
		}
	});

	// ─── GET ONE ──────────────────────────────────────────────
	// Uploaded PDF asset delivery (signed token; no public static files)
	router.get('/assets/:id/pdf', async (req, res) => {
		const payload = verifySummaryPdfToken(String(req.query.token || ''));
		if (!payload || payload.sid !== req.params.id) {
			return res.status(401).json({ error: 'Invalid or expired PDF link' });
		}
		const sheet = await prisma.summarySheet.findUnique({
			where: { id: req.params.id },
			select: { id: true, status: true, pdfStorageKey: true, originalFilename: true }
		});
		if (!sheet || !sheet.pdfStorageKey) return res.status(404).json({ error: 'PDF not found' });
		if (sheet.status !== 'PUBLISHED' && !payload.adm) {
			return res.status(403).json({ error: 'PDF is not published' });
		}
		try {
			const absolute = resolveSummaryKey(sheet.pdfStorageKey);
			if (!fs.existsSync(absolute)) return res.status(404).json({ error: 'PDF file is missing' });
			const versioned = Boolean(req.query.v);
			res.setHeader('Content-Type', 'application/pdf');
			res.setHeader('Content-Disposition', `inline; filename="${safeFilename(sheet.originalFilename || 'summary-sheet.pdf')}"`);
			res.setHeader('Cache-Control', versioned ? 'private, max-age=31536000, immutable' : 'private, max-age=3600');
			res.setHeader('X-Content-Type-Options', 'nosniff');
			return res.sendFile(absolute);
		} catch {
			return res.status(400).json({ error: 'Invalid PDF storage path' });
		}
	});

	// Global uploaded-PDF search
	router.get('/search', requireAuth(), async (req, res) => {
		try {
			const q = String(req.query.q || '').trim();
			if (q.length < 2) return res.json({ q, results: [], total: 0 });
			const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 24));
			const page = Math.max(1, Number(req.query.page) || 1);
			const data = await searchSummarySheets(prisma, {
				q,
				user: req.user,
				courseId: String(req.query.courseId || '') || null,
				volumeId: String(req.query.volumeId || '') || null,
				moduleId: String(req.query.moduleId || '') || null,
				topicId: String(req.query.topicId || '') || null,
				conceptId: String(req.query.conceptId || '') || null,
				level: String(req.query.level || '') || null,
				year: req.query.year ? Number(req.query.year) : null,
				includeDrafts: req.user.role === 'ADMIN',
				limit,
				offset: (page - 1) * limit
			});
			return res.json({ q, page, limit, ...data });
		} catch (err) {
			console.error('[summarySheets.search]', err);
			return res.status(500).json({ error: 'Search failed' });
		}
	});

	router.get('/:id/pdf-access', requireAuth(), async (req, res) => {
		const sheet = await prisma.summarySheet.findUnique({
			where: { id: req.params.id },
			include: defaultInclude
		});
		if (!sheet) return res.status(404).json({ error: 'Summary sheet not found' });
		if (!(await canAccessSummarySheet(prisma, req.user, sheet))) {
			return res.status(403).json({ error: 'You do not have access to this summary sheet.' });
		}
		if (sheet.sourceType !== 'UPLOADED_PDF' || !sheet.pdfStorageKey) {
			return res.status(404).json({ error: 'This summary sheet has no uploaded PDF.' });
		}
		return res.json({
			sheet: stripStorage(sheet),
			pdfUrl: signedSummaryPdfUrl({
				id: sheet.id,
				userId: req.user.id,
				admin: req.user.role === 'ADMIN',
				version: sheet.pdfVersion
			}),
			canDownload: true,
			pageCount: sheet.pdfPageCount || 0,
			processingStatus: sheet.processingStatus,
			searchIndexStatus: sheet.searchIndexStatus
		});
	});

	router.get('/:id/search', requireAuth(), async (req, res) => {
		const sheet = await prisma.summarySheet.findUnique({
			where: { id: req.params.id },
			select: { id: true, courseId: true, status: true, sourceType: true }
		});
		if (!sheet) return res.status(404).json({ error: 'Summary sheet not found' });
		if (!(await canAccessSummarySheet(prisma, req.user, sheet))) {
			return res.status(403).json({ error: 'You do not have access to this summary sheet.' });
		}
		const q = String(req.query.q || '').trim();
		const results = await searchWithinSummarySheet(prisma, sheet.id, q);
		return res.json({ q, results });
	});

	router.get('/:id/download', requireAuth(), async (req, res) => {
		const sheet = await prisma.summarySheet.findUnique({
			where: { id: req.params.id },
			select: { id: true, courseId: true, status: true, pdfStorageKey: true, originalFilename: true, sourceType: true }
		});
		if (!sheet || sheet.sourceType !== 'UPLOADED_PDF' || !sheet.pdfStorageKey) {
			return res.status(404).json({ error: 'PDF not found' });
		}
		if (!(await canAccessSummarySheet(prisma, req.user, sheet))) {
			return res.status(403).json({ error: 'You do not have access to this PDF.' });
		}
		try {
			const absolute = resolveSummaryKey(sheet.pdfStorageKey);
			if (!fs.existsSync(absolute)) return res.status(404).json({ error: 'PDF file is missing' });
			return res.download(absolute, sheet.originalFilename || 'summary-sheet.pdf');
		} catch {
			return res.status(400).json({ error: 'Invalid PDF storage path' });
		}
	});

	router.post('/upload-pdf', requireAuth(), requireRole('ADMIN'), summaryPdfUpload.single('file'), async (req, res) => {
		const file = req.file;
		try {
			if (!file) return res.status(400).json({ error: 'A PDF file is required.' });
			const buffer = await fs.promises.readFile(file.path);
			if (!looksLikePdfBuffer(buffer)) return res.status(400).json({ error: 'The uploaded file is not a valid PDF.' });
			if (buffer.length > MAX_SUMMARY_PDF_BYTES) return res.status(400).json({ error: 'PDF exceeds the allowed size.' });

			const courseId = String(req.body.courseId || '').trim();
			const volumeId = String(req.body.volumeId || '').trim();
			const moduleId = String(req.body.moduleId || '').trim();
			const topicIds = parseIdArray(req.body.topicIds);
			const conceptIds = parseIdArray(req.body.conceptIds);
			const validation = await validateSummaryMapping(prisma, { courseId, volumeId, moduleId, topicIds, conceptIds });
			if (validation.errors.length) return res.status(400).json({ error: validation.errors[0], errors: validation.errors });

			let parsed;
			try {
				parsed = await extractPdfPages(buffer);
			} catch (err) {
				return res.status(400).json({ error: err?.message || 'Could not read this PDF.' });
			}

			const id = crypto.randomUUID();
			const version = `pdf-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
			const destination = path.join(summarySheetDir(id), 'versions', version, 'original.pdf');
			await moveFile(file.path, destination);
			const fileHash = await hashFile(destination);
			const stat = await fs.promises.stat(destination);
			const keywords = parseIdArray(req.body.keywords).map(keyword => String(keyword).trim()).filter(Boolean).slice(0, 40);
			const title = String(req.body.title || '').trim() || path.basename(file.originalname, path.extname(file.originalname)) || 'Summary Sheet';
			const year = Number(req.body.year) || 2026;

			const sheet = await prisma.$transaction(async (tx) => {
				const created = await tx.summarySheet.create({
					data: {
						id,
						title: title.slice(0, 300),
						level: validation.course.level,
						courseId,
						volumeId,
						moduleId,
						topicId: topicIds[0] || null,
						year,
						description: String(req.body.description || '').trim().slice(0, 10000) || null,
						keywords,
						sourceType: 'UPLOADED_PDF',
						status: 'DRAFT',
						pdfStorageKey: summaryKey('sheets', id, 'versions', version, 'original.pdf'),
						originalFilename: safeFilename(file.originalname),
						pdfFileHash: fileHash,
						pdfFileSize: stat.size,
						pdfPageCount: parsed.pageCount,
						pdfVersion: version,
						processingStatus: 'INDEXING',
						searchIndexStatus: 'INDEXING',
						processingAttempts: 0,
						createdById: req.user.id
					},
					include: defaultInclude
				});
				if (topicIds.length) {
					await tx.summarySheetTopic.createMany({
						data: topicIds.map(topicId => ({ summarySheetId: id, topicId })),
						skipDuplicates: true
					});
				}
				if (conceptIds.length) {
					await tx.summarySheetConcept.createMany({
						data: conceptIds.map(conceptId => ({ summarySheetId: id, conceptId })),
						skipDuplicates: true
					});
				}
				return created;
			});
			enqueueSummarySheet(id);
			return res.status(201).json({
				sheet: stripStorage(sheet),
				message: 'PDF uploaded. Text indexing is running in the background.'
			});
		} catch (err) {
			console.error('[summarySheets.upload-pdf]', err);
			return res.status(500).json({ error: err?.message || 'Failed to upload PDF summary sheet' });
		} finally {
			cleanupSummaryTemp(file);
		}
	});

	router.post('/:id/replace-pdf', requireAuth(), requireRole('ADMIN'), summaryPdfUpload.single('file'), async (req, res) => {
		const file = req.file;
		try {
			const existing = await prisma.summarySheet.findUnique({ where: { id: req.params.id } });
			if (!existing) return res.status(404).json({ error: 'Summary sheet not found' });
			if (existing.sourceType !== 'UPLOADED_PDF') return res.status(400).json({ error: 'Only uploaded PDF summary sheets can be replaced.' });
			if (!file) return res.status(400).json({ error: 'A PDF file is required.' });
			const buffer = await fs.promises.readFile(file.path);
			if (!looksLikePdfBuffer(buffer)) return res.status(400).json({ error: 'The uploaded file is not a valid PDF.' });
			try {
				await extractPdfPages(buffer);
			} catch (err) {
				return res.status(400).json({ error: err?.message || 'Could not read this PDF.' });
			}

			const version = `pdf-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
			const destination = path.join(summarySheetDir(existing.id), 'versions', version, 'original.pdf');
			await moveFile(file.path, destination);
			const fileHash = await hashFile(destination);
			const stat = await fs.promises.stat(destination);
			const updated = await prisma.summarySheet.update({
				where: { id: existing.id },
				data: {
					pendingPdfKey: summaryKey('sheets', existing.id, 'versions', version, 'original.pdf'),
					pendingPdfHash: fileHash,
					pendingPdfSize: stat.size,
					pendingPdfVersion: version,
					pendingFilename: safeFilename(file.originalname),
					processingStatus: 'INDEXING',
					searchIndexStatus: 'INDEXING',
					processingError: null,
					processingAttempts: 0
				},
				include: defaultInclude
			});
			enqueueSummarySheet(existing.id);
			return res.json({ sheet: stripStorage(updated), message: 'Replacement PDF uploaded. The current PDF remains available until indexing succeeds.' });
		} catch (err) {
			console.error('[summarySheets.replace-pdf]', err);
			return res.status(500).json({ error: err?.message || 'Failed to replace PDF' });
		} finally {
			cleanupSummaryTemp(file);
		}
	});

	router.post('/:id/reindex', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const existing = await prisma.summarySheet.findUnique({ where: { id: req.params.id } });
		if (!existing) return res.status(404).json({ error: 'Summary sheet not found' });
		if (existing.sourceType !== 'UPLOADED_PDF') return res.status(400).json({ error: 'Only uploaded PDF summary sheets can be re-indexed.' });
		await prisma.summarySheet.update({
			where: { id: existing.id },
			data: { processingStatus: 'INDEXING', searchIndexStatus: 'INDEXING', processingError: null, processingAttempts: 0 }
		});
		enqueueSummarySheet(existing.id);
		return res.json({ ok: true, message: 'PDF indexing queued.' });
	});

	router.put('/:id/pdf-metadata', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const existing = await prisma.summarySheet.findUnique({ where: { id: req.params.id } });
			if (!existing) return res.status(404).json({ error: 'Summary sheet not found' });
			if (existing.sourceType !== 'UPLOADED_PDF') return res.status(400).json({ error: 'This is not an uploaded PDF summary sheet.' });
			const courseId = String(req.body.courseId || existing.courseId || '');
			const volumeId = String(req.body.volumeId || existing.volumeId || '');
			const moduleId = String(req.body.moduleId || existing.moduleId || '');
			const topicIds = typeof req.body.topicIds !== 'undefined' ? parseIdArray(req.body.topicIds) : (await prisma.summarySheetTopic.findMany({ where: { summarySheetId: existing.id }, select: { topicId: true } })).map(x => x.topicId);
			const conceptIds = typeof req.body.conceptIds !== 'undefined' ? parseIdArray(req.body.conceptIds) : (await prisma.summarySheetConcept.findMany({ where: { summarySheetId: existing.id }, select: { conceptId: true } })).map(x => x.conceptId);
			const validation = await validateSummaryMapping(prisma, { courseId, volumeId, moduleId, topicIds, conceptIds });
			if (validation.errors.length) return res.status(400).json({ error: validation.errors[0], errors: validation.errors });
			const nextStatus = req.body.status ? String(req.body.status).toUpperCase() : existing.status;
			if (nextStatus === 'PUBLISHED' && (existing.processingStatus !== 'READY' || existing.pdfPageCount < 1)) {
				return res.status(400).json({ error: 'Only fully indexed PDFs can be published.' });
			}
			const description = typeof req.body.description !== 'undefined' ? (String(req.body.description || '').trim().slice(0, 10000) || null) : existing.description;
			const keywords = typeof req.body.keywords !== 'undefined' ? parseIdArray(req.body.keywords).map(k => String(k).trim()).filter(Boolean).slice(0, 40) : existing.keywords;
			const updated = await prisma.$transaction(async (tx) => {
				const row = await tx.summarySheet.update({
					where: { id: existing.id },
					data: {
						title: req.body.title ? String(req.body.title).trim().slice(0, 300) : existing.title,
						description,
						keywords,
						level: validation.course.level,
						courseId,
						volumeId,
						moduleId,
						topicId: topicIds[0] || null,
						...(req.body.year ? { year: Number(req.body.year) } : {}),
						status: nextStatus === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
					},
					include: defaultInclude
				});
				await tx.summarySheetTopic.deleteMany({ where: { summarySheetId: existing.id } });
				await tx.summarySheetConcept.deleteMany({ where: { summarySheetId: existing.id } });
				if (topicIds.length) await tx.summarySheetTopic.createMany({ data: topicIds.map(topicId => ({ summarySheetId: existing.id, topicId })), skipDuplicates: true });
				if (conceptIds.length) await tx.summarySheetConcept.createMany({ data: conceptIds.map(conceptId => ({ summarySheetId: existing.id, conceptId })), skipDuplicates: true });
				return row;
			});
			return res.json({ sheet: stripStorage(updated) });
		} catch (err) {
			if (err?.name === 'ZodError') return res.status(400).json({ error: 'Validation failed', details: err.errors });
			console.error('[summarySheets.pdf-metadata]', err);
			return res.status(500).json({ error: 'Failed to update PDF summary sheet' });
		}
	});

	router.get('/:id', async (req, res) => {
		try {
			const sheet = await prisma.summarySheet.findUnique({
				where: { id: req.params.id },
				include: defaultInclude,
			});
			if (!sheet) return res.status(404).json({ error: 'Summary sheet not found' });
			return res.json({ sheet: stripStorage(sheet) });
		} catch (err) {
			console.error('[summarySheets.get]', err);
			return res.status(500).json({ error: 'Failed to fetch summary sheet' });
		}
	});

	// ─── CREATE (Admin only) ─────────────────────────────────
	router.post('/', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const data = sheetSchema.parse(req.body);
			const sheet = await prisma.summarySheet.create({
				data,
				include: defaultInclude,
			});
			return res.status(201).json({ sheet });
		} catch (err) {
			if (err?.name === 'ZodError') {
				return res.status(400).json({ error: 'Validation failed', details: err.errors });
			}
			console.error('[summarySheets.create]', err);
			return res.status(500).json({ error: 'Failed to create summary sheet' });
		}
	});

	// ─── UPDATE (Admin only) ─────────────────────────────────
	router.put('/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const data = sheetSchema.partial().parse(req.body);
			const existing = await prisma.summarySheet.findUnique({ where: { id: req.params.id }, select: { sourceType: true, processingStatus: true, pdfPageCount: true } });
			if (!existing) return res.status(404).json({ error: 'Summary sheet not found' });
			if (existing.sourceType === 'UPLOADED_PDF' && data.status === 'PUBLISHED' && (existing.processingStatus !== 'READY' || existing.pdfPageCount < 1)) {
				return res.status(400).json({ error: 'Only fully indexed PDFs can be published.' });
			}
			const sheet = await prisma.summarySheet.update({
				where: { id: req.params.id },
				data,
				include: defaultInclude,
			});
			return res.json({ sheet });
		} catch (err) {
			if (err?.name === 'ZodError') {
				return res.status(400).json({ error: 'Validation failed', details: err.errors });
			}
			if (err?.code === 'P2025') {
				return res.status(404).json({ error: 'Summary sheet not found' });
			}
			console.error('[summarySheets.update]', err);
			return res.status(500).json({ error: 'Failed to update summary sheet' });
		}
	});

	// ─── DELETE (Admin only) ─────────────────────────────────
	router.delete('/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const existing = await prisma.summarySheet.findUnique({ where: { id: req.params.id }, select: { sourceType: true } });
			await prisma.summarySheet.delete({ where: { id: req.params.id } });
			if (existing?.sourceType === 'UPLOADED_PDF') removeSummaryStorage(req.params.id);
			return res.json({ success: true });
		} catch (err) {
			if (err?.code === 'P2025') {
				return res.status(404).json({ error: 'Summary sheet not found' });
			}
			console.error('[summarySheets.delete]', err);
			return res.status(500).json({ error: 'Failed to delete summary sheet' });
		}
	});

	// ─── AI GENERATE PREVIEW (Admin only) ────────────────────
	router.post('/generate-ai/preview', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			courseId: z.string(),
			volumeId: z.string().optional().nullable(),
			moduleId: z.string().optional().nullable(),
			level: z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3']),
			year: z.coerce.number().int().optional().default(2026),
			count: z.coerce.number().int().min(1).max(20).optional().nullable(),
			provider: z.string().optional().nullable(),
			model: z.string().optional().nullable(),
			deepValidation: z.boolean().optional().nullable(),
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });

		const { courseId, volumeId, moduleId, level, year } = parse.data;
		const requestedProvider = parse.data.provider || null;
		const requestedModel = parse.data.model || null;
		const count = parse.data.count || null;

		// Provider: requested (if valid/configured) → otherwise active provider.
		const activeProvider = await ai.getActiveProvider(prisma);
		const aiProvider = (requestedProvider && AI_PROVIDERS[requestedProvider]) ? requestedProvider : activeProvider;
		// Model: requested → active model → provider default.
		const aiModel = requestedModel || await ai.getActiveModel(prisma) || ai.getDefaultModel(aiProvider);
		const apiKey = await ai.getAIApiKey(prisma, aiProvider);
		if (!apiKey) {
			const label = AI_PROVIDERS[aiProvider]?.label || aiProvider;
			return res.status(400).json({ error: `No API key configured for ${label}. Set it in .env or in Admin settings.` });
		}

		// Build the source-of-truth context for a single Learning Module.
		async function buildModuleContext(mod, course) {
			const [topics, notes, formulas] = await Promise.all([
				prisma.topic.findMany({
					where: { moduleId: mod.id },
					select: { id: true, name: true, order: true, losCode: true, commandWord: true, learningOutcomeStatement: true },
					orderBy: [{ order: 'asc' }, { name: 'asc' }],
				}),
				prisma.moduleNote.findMany({
					where: { moduleId: mod.id, status: 'PUBLISHED' },
					select: { id: true, title: true, topicId: true, overview: true, moduleSummary: true, losStatements: true, concepts: true, formulaRecap: true },
					orderBy: [{ order: 'asc' }],
					take: 20,
				}),
				prisma.formula.findMany({
					where: { moduleId: mod.id },
					select: { name: true, formula: true, variables: true, interpretation: true, whenToUse: true, watchOut: true, losTag: true },
					orderBy: [{ order: 'asc' }],
					take: 40,
				}),
			]);

			// Curriculum (control source) scoped to the module's volume.
			let curriculumExcerpt = '';
			try {
				const currDoc = await prisma.curriculumDocument.findUnique({
					where: { courseId_volumeId: { courseId: mod.courseId, volumeId: mod.volumeId } },
					select: { extractedText: true },
				});
				if (currDoc?.extractedText) {
					curriculumExcerpt = extractCurriculumExcerpt(currDoc.extractedText, [mod.name, ...topics.map(t => t.name)]);
				}
			} catch { /* no curriculum document for this volume */ }

			// Module objective: Module has no objective column — derive from published Milven Notes.
			const moduleNote = notes.find(n => !n.topicId) || notes[0] || null;
			const moduleObjective = (moduleNote?.overview || moduleNote?.moduleSummary || '').trim();

			// LOS: real source is Topic.learningOutcomeStatement / ModuleNote.losStatements.
			const los = [];
			const seen = new Set();
			for (const t of topics) {
				if (!t.learningOutcomeStatement) continue;
				const key = `${t.losCode || ''}|${t.learningOutcomeStatement}`;
				if (seen.has(key)) continue;
				seen.add(key);
				los.push({ ref: t.losCode || '', statement: t.learningOutcomeStatement, commandWord: t.commandWord || '' });
			}
			for (const n of notes) {
				if (!Array.isArray(n.losStatements)) continue;
				for (const l of n.losStatements) {
					const ref = l?.ref || l?.losCode || '';
					const statement = l?.statement || l?.learningOutcomeStatement || '';
					if (!statement) continue;
					const key = `${ref}|${statement}`;
					if (seen.has(key)) continue;
					seen.add(key);
					los.push({ ref, statement, commandWord: l?.commandWord || '' });
				}
			}

			return { module: mod, course, level, year, topics, notes, formulas, curriculumExcerpt, moduleObjective, los };
		}

		try {
			const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, level: true } });
			if (!course) return res.status(400).json({ error: 'Course not found' });

			// Resolve the actual target Learning Modules (module-specific generation).
			let targetModules = [];
			if (moduleId) {
				const mod = await prisma.module.findUnique({
					where: { id: moduleId },
					select: { id: true, name: true, level: true, courseId: true, volumeId: true, volume: { select: { id: true, name: true } } },
				});
				if (!mod) return res.status(400).json({ error: 'Learning module not found' });
				targetModules = [mod];
			} else {
				const modWhere = { courseId };
				if (volumeId) modWhere.volumeId = volumeId;
				targetModules = await prisma.module.findMany({
					where: modWhere,
					select: { id: true, name: true, level: true, courseId: true, volumeId: true, volume: { select: { id: true, name: true } } },
					orderBy: [{ order: 'asc' }, { name: 'asc' }],
					take: MAX_TARGET_MODULES,
				});
				if (!targetModules.length) {
					return res.status(400).json({ error: volumeId ? 'No learning modules found in the selected volume.' : 'No learning modules found for the selected course.' });
				}
				if (count) targetModules = targetModules.slice(0, Math.min(count, MAX_TARGET_MODULES));
			}

			const items = [];
			const validationSummaries = [];
			// Programmatic validation always runs. The second AI validation pass adds
			// semantic checks. Callers can force it (deepValidation=true), disable it
			// (deepValidation=false), or leave it undefined for the bounded default so
			// large bulk runs stay responsive.
			const dv = parse.data.deepValidation;
			const runAiValidation = dv === true ? true : (dv === false ? false : targetModules.length <= 5);

			for (const mod of targetModules) {
				const ctx = await buildModuleContext(mod, course);
				const prompt = buildSummaryPrompt(ctx, year);

				let parsedItem = null;
				try {
					const aiResult = await ai.chatCompletion({
						apiKey, provider: aiProvider, model: aiModel,
						messages: [
							{ role: 'system', content: `${MILVEN_SUMMARY_SYSTEM}\n\n${LATEX_SYSTEM_RULES}` },
							{ role: 'user', content: prompt },
						],
						temperature: 0.6,
						maxTokens: 16384,
						jsonMode: true,
					});
					const parsed = JSON.parse(stripJsonFences(aiResult.content || '{}'));
					const sheetItems = Array.isArray(parsed.sheets)
						? parsed.sheets
						: (Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed) ? parsed : [parsed]));
					parsedItem = sheetItems.find(Boolean) || null;
				} catch (genErr) {
					const msg = genErr?.error?.message || genErr?.message || 'AI generation failed';
					console.error(`[summarySheets.generate-ai.preview] module ${mod.id} failed:`, msg);
					items.push({
						title: `LM: ${mod.name}`,
						moduleId: mod.id,
						volumeId: mod.volumeId,
						courseId: mod.courseId,
						level,
						year,
						_error: msg,
						validation: { status: 'INSTRUCTOR REVIEW REQUIRED', findings: [msg], checks: {} },
						quickDrills: [{ issue: msg, recommendation: 'Regenerate or author this summary manually.' }],
					});
					validationSummaries.push({ moduleId: mod.id, moduleName: mod.name, status: 'INSTRUCTOR REVIEW REQUIRED', findings: [msg] });
					continue;
				}

				if (!parsedItem) {
					const msg = 'AI returned no summary sheet for this module.';
					items.push({
						title: `LM: ${mod.name}`,
						moduleId: mod.id,
						volumeId: mod.volumeId,
						courseId: mod.courseId,
						level,
						year,
						_error: msg,
						validation: { status: 'INSTRUCTOR REVIEW REQUIRED', findings: [msg], checks: {} },
						quickDrills: [{ issue: msg, recommendation: 'Regenerate or author this summary manually.' }],
					});
					validationSummaries.push({ moduleId: mod.id, moduleName: mod.name, status: 'INSTRUCTOR REVIEW REQUIRED', findings: [msg] });
					continue;
				}

				// Attach module linkage so bulk generation maps each sheet to its own module.
				parsedItem.moduleId = mod.id;
				parsedItem.volumeId = mod.volumeId;
				parsedItem.courseId = mod.courseId;
				parsedItem.level = level;
				parsedItem.year = year;
				parsedItem.moduleName = mod.name;
				parsedItem.volumeName = mod.volume?.name || null;
				parsedItem.courseName = course?.name || null;
				if (!parsedItem.title) parsedItem.title = `LM: ${mod.name}`;

				// LaTeX safety: auto-repair + flag invalid formulas (do not drop).
				if (Array.isArray(parsedItem.formulas) && parsedItem.formulas.length) {
					const invalid = validateFormulaItems(parsedItem.formulas);
					if (invalid.length) parsedItem._invalidFormulas = invalid.length;
				}

				// Validation: programmatic (always) + second AI pass (best effort).
				const programmatic = programmaticValidation(parsedItem, ctx);
				let aiVal = { status: 'PASS', findings: [] };
				if (runAiValidation) {
					try {
						aiVal = await aiValidation(parsedItem, ctx, { apiKey, provider: aiProvider, model: aiModel, chatCompletion: ai.chatCompletion });
					} catch (vErr) {
						console.warn('[summarySheets.generate-ai.preview] AI validation skipped:', vErr?.message);
					}
				}
				const findings = [...(programmatic.findings || []), ...(aiVal.findings || [])];
				let finalStatus = worstStatus(programmatic.status, aiVal.status);
				if (finalStatus === 'PASS' && findings.length) finalStatus = 'REVISE';
				parsedItem.validation = { status: finalStatus, findings, checks: programmatic.checks };
				parsedItem.useCase = finalStatus;
				parsedItem.quickDrills = mergeInstructorReview(parsedItem.quickDrills, findings, finalStatus);

				items.push(parsedItem);
				validationSummaries.push({ moduleId: mod.id, moduleName: mod.name, status: finalStatus, findings });
			}

			if (!items.length) return res.status(502).json({ error: 'AI returned no summary sheets' });

			return res.json({
				generated: { items },
				meta: { courseId, volumeId, moduleId, level, year, provider: aiProvider, model: aiModel, validation: validationSummaries },
			});
		} catch (err) {
			const msg = err?.error?.message || err?.message || 'AI request failed';
			console.error('[summarySheets.generate-ai.preview]', msg);
			return res.status(502).json({ error: msg });
		}
	});

	// ─── AI GENERATE ACCEPT (Admin only) ─────────────────────
	router.post('/generate-ai/accept', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const { generated, meta, selectedIndices } = req.body;
			if (!generated?.items || !Array.isArray(generated.items)) {
				return res.status(400).json({ error: 'Missing generated items' });
			}
			if (!Array.isArray(selectedIndices) || selectedIndices.length === 0) {
				return res.status(400).json({ error: 'No sheets selected' });
			}
			const { courseId, volumeId, moduleId, level, year } = meta || {};

			const created = [];
			const skipped = [];
			for (const idx of selectedIndices) {
				const item = generated.items[idx];
				if (!item) continue;
				// Skip failed generation placeholders (no real content).
				if (item._error && !item.snapshot && !item.coreDefinitions && !item.formulas && !item.diagrams) {
					skipped.push({ index: idx, reason: item._error });
					continue;
				}
				// Prefer per-item linkage (bulk generation maps each sheet to its own module).
				const itemCourseId = item.courseId || courseId;
				const itemLevel = item.level || level;
				if (!itemCourseId || !itemLevel) {
					skipped.push({ index: idx, reason: 'Missing course/level' });
					continue;
				}
				try {
					const sheet = await prisma.summarySheet.create({
						data: {
							title: String(item.title || `Summary Sheet ${idx + 1}`).slice(0, 255),
							level: itemLevel,
							courseId: itemCourseId,
							volumeId: item.volumeId || volumeId || null,
							moduleId: item.moduleId || moduleId || null,
							year: item.year || year || 2026,
							snapshot: item.snapshot || null,
							useCase: item.useCase || item.validation?.status || null,
							coreDefinitions: item.coreDefinitions || null,
							formulas: item.formulas || null,
							distinctions: item.distinctions || null,
							diagrams: item.diagrams || null,
							examTraps: item.examTraps || null,
							memoryHooks: item.memoryHooks || null,
							quickDrills: item.quickDrills || null,
							revisionCheck: item.revisionCheck || null,
							order: idx + 1,
							status: 'DRAFT',
						},
						include: defaultInclude,
					});
					created.push(sheet);
				} catch (saveErr) {
					console.error(`[summarySheets.generate-ai.accept] Failed to save sheet ${idx}:`, saveErr?.message);
					skipped.push({ index: idx, reason: saveErr?.message || 'Save failed' });
				}
			}

			return res.status(201).json({ created: created.length, skipped, sheets: created });
		} catch (err) {
			console.error('[summarySheets.generate-ai.accept]', err);
			return res.status(500).json({ error: 'Failed to accept summary sheets' });
		}
	});

	return router;
}

// Exported for unit testing of the pure summary-generation helpers.
export { stripJsonFences, worstStatus, extractCurriculumExcerpt, programmaticValidation, mergeInstructorReview, buildSummaryPrompt };
