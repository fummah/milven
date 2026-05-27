import { Router } from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { getOpenAIApiKey, LATEX_SYSTEM_RULES, LATEX_PROMPT_SECTION, validateFormulaItems } from '../lib/openai.js';

/**
 * Server-side formula sanitizer — repairs corrupted LaTeX from JSON parsing.
 * When OpenAI returns \times in JSON, JSON.parse interprets \t as tab → "<TAB>imes".
 * Similarly \beta → \b = backspace + "eta", \frac → \f = formfeed + "rac".
 * This MUST run on formula text before saving to database.
 */
function sanitizeLatex(text) {
	if (!text || typeof text !== 'string') return text || '';
	let s = text;
	// Fix JSON escape corruption
	s = s.replace(/\times/g, '\\times');
	s = s.replace(/\beta/g, '\\beta');
	s = s.replace(/\bar/g, '\\bar');
	s = s.replace(/\frac/g, '\\frac');
	s = s.replace(/\nu(?=[^a-zA-Z]|$)/g, '\\nu');
	s = s.replace(/\nabla/g, '\\nabla');
	// Fix standalone "imes"
	s = s.replace(/(?<![a-zA-Z\\])imes\b/g, '\\times');
	// Clean stray control characters
	s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
	return s;
}

/**
 * Build a formula-focused curriculum excerpt that prioritises formula sections
 * and LOS near selected topics, preserving [PAGE N] markers for page references.
 */
function buildFormulaCurriculumExcerpt(fullText, topicNames = [], maxChars = 15000) {
	if (!fullText) return '';
	if (fullText.length <= maxChars) return fullText;

	const keywords = topicNames
		.flatMap(n => n.split(/[\s,;:()\-\/]+/).filter(w => w.length > 3))
		.map(w => w.toLowerCase());

	if (keywords.length === 0) return fullText.substring(0, maxChars) + '\n... [truncated]';

	const FORMULA_RE = /(?:^|\n)([^\n]*(?:[\=][\s]*[^\n]*[\+\-\*\/\^]|(?:PV|FV|NPV|IRR|WACC|EPS|ROE|ROA|CAPM|YTM|HPR|DDM|FCF|FCFE|FCFF|EVA|σ|β|α|μ|Σ|√|∑|∏|∫|Δ)\s*[=])[^\n]*)/gim;

	const WINDOW = 2500, STEP = 500;
	const windows = [];
	for (let i = 0; i < fullText.length; i += STEP) {
		const chunk = fullText.substring(i, i + WINDOW);
		const lower = chunk.toLowerCase();
		let score = keywords.reduce((s, kw) => {
			let c = 0, idx = 0;
			while ((idx = lower.indexOf(kw, idx)) !== -1) { c++; idx += kw.length; }
			return s + c;
		}, 0);
		// Boost formula-containing windows
		FORMULA_RE.lastIndex = 0;
		const formulaMatches = chunk.match(FORMULA_RE);
		if (formulaMatches) score += formulaMatches.length * 5;
		// Boost topic headings
		for (const tn of topicNames) {
			if (lower.includes(tn.toLowerCase())) score += 8;
		}
		windows.push({ start: i, score });
	}

	windows.sort((a, b) => b.score - a.score);
	const ranges = [];
	let total = 0;
	for (const w of windows) {
		if (total >= maxChars || w.score === 0) break;
		const end = Math.min(w.start + WINDOW, fullText.length);
		const budget = Math.min(end - w.start, maxChars - total);
		ranges.push({ start: w.start, end: w.start + budget });
		total += budget;
	}

	ranges.sort((a, b) => a.start - b.start);
	const merged = [];
	for (const r of ranges) {
		if (merged.length > 0 && r.start <= merged[merged.length - 1].end + 300) {
			merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end);
		} else {
			merged.push({ ...r });
		}
	}

	return merged.map((r, i) => {
		const text = fullText.substring(r.start, r.end).trim();
		const pageMatch = fullText.substring(0, r.start).match(/\[PAGE (\d+)\]/g);
		const page = pageMatch ? parseInt(pageMatch[pageMatch.length - 1].match(/\d+/)[0], 10) : null;
		const prefix = page ? `[... content from page ${page} ...]\n` : (r.start > 0 ? '[...]\n' : '');
		return prefix + text + (i < merged.length - 1 ? '\n[...]\n' : '');
	}).join('\n') + (merged[merged.length - 1]?.end < fullText.length ? '\n... [additional content omitted]' : '');
}

export function formulasRouter(prisma) {
	const router = Router();

	// ─── Validation ────────────────────────────────────────────
	const formulaSchema = z.object({
		name: z.string().min(1),
		formula: z.string().min(1),
		variables: z.string().min(1),
		interpretation: z.string().min(1),
		whenToUse: z.string().min(1),
		watchOut: z.string().min(1),
		calculatorCue: z.string().optional().nullable(),
		losTag: z.string().optional().nullable(),
		workedExample: z.any().optional().nullable(),
		level: z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3']),
		courseId: z.string().optional().nullable(),
		volumeId: z.string().optional().nullable(),
		moduleId: z.string().optional().nullable(),
		topicId: z.string().optional().nullable(),
		order: z.number().int().optional().default(0),
		highYield: z.boolean().optional().default(false),
		year: z.number().int().optional().default(2026),
	});

	const defaultInclude = {
		course: { select: { id: true, name: true, level: true } },
		volume: { select: { id: true, name: true } },
		module: { select: { id: true, name: true } },
		topic: { select: { id: true, name: true } },
	};

	// ─── LIST (public - no auth required for student/public formula book) ──
	router.get('/', async (req, res) => {
		try {
			const { courseId, volumeId, moduleId, topicId, level, highYield, year, search, page, limit } = req.query;
			const where = {};
			if (courseId) where.courseId = courseId;
			if (volumeId) where.volumeId = volumeId;
			if (moduleId) where.moduleId = moduleId;
			if (topicId) where.topicId = topicId;
			if (level) where.level = level;
			if (highYield === 'true') where.highYield = true;
			if (year) where.year = Number(year);
			if (search) {
				where.OR = [
					{ name: { contains: search, mode: 'insensitive' } },
					{ formula: { contains: search, mode: 'insensitive' } },
					{ variables: { contains: search, mode: 'insensitive' } },
					{ losTag: { contains: search, mode: 'insensitive' } },
				];
			}

			const pageNum = Math.max(1, Number(page) || 1);
			const pageSize = Math.min(200, Math.max(1, Number(limit) || 50));
			const skip = (pageNum - 1) * pageSize;

			const [formulas, total] = await Promise.all([
				prisma.formula.findMany({
					where,
					include: defaultInclude,
					orderBy: [{ order: 'asc' }, { name: 'asc' }],
					skip,
					take: pageSize,
				}),
				prisma.formula.count({ where }),
			]);

			return res.json({ formulas, total, page: pageNum, limit: pageSize });
		} catch (err) {
			console.error('[formulas.list]', err);
			return res.status(500).json({ error: 'Failed to list formulas' });
		}
	});

	// ─── GROUPED (for formula book view) ───────────────────────
	// Returns formulas grouped by volume → module → topic
	// NOTE: Must be before /:id to prevent 'book' matching as an id
	router.get('/book/grouped', async (req, res) => {
		try {
			const { courseId, level, year } = req.query;
			const where = {};
			if (courseId) where.courseId = courseId;
			if (level) where.level = level;
			if (year) where.year = Number(year);

			const formulas = await prisma.formula.findMany({
				where,
				include: defaultInclude,
				orderBy: [{ order: 'asc' }, { name: 'asc' }],
			});

			// Group: volume → module → topic → formulas
			const grouped = {};
			for (const f of formulas) {
				const vKey = f.volumeId || '_none';
				const vName = f.volume?.name || 'Unassigned Volume';
				const mKey = f.moduleId || '_none';
				const mName = f.module?.name || 'Unassigned Module';
				const tKey = f.topicId || '_none';
				const tName = f.topic?.name || 'Unassigned Topic';

				if (!grouped[vKey]) grouped[vKey] = { id: vKey, name: vName, modules: {} };
				if (!grouped[vKey].modules[mKey]) grouped[vKey].modules[mKey] = { id: mKey, name: mName, topics: {} };
				if (!grouped[vKey].modules[mKey].topics[tKey]) grouped[vKey].modules[mKey].topics[tKey] = { id: tKey, name: tName, formulas: [] };
				grouped[vKey].modules[mKey].topics[tKey].formulas.push(f);
			}

			// Convert to array structure
			const book = Object.values(grouped).map(vol => ({
				...vol,
				modules: Object.values(vol.modules).map(mod => ({
					...mod,
					topics: Object.values(mod.topics),
				})),
			}));

			return res.json({ book, total: formulas.length });
		} catch (err) {
			console.error('[formulas.grouped]', err);
			return res.status(500).json({ error: 'Failed to fetch formula book' });
		}
	});

	// ─── STATS ─────────────────────────────────────────────────
	router.get('/book/stats', async (req, res) => {
		try {
			const { courseId, level } = req.query;
			const where = {};
			if (courseId) where.courseId = courseId;
			if (level) where.level = level;

			const [total, highYieldCount, byLevel] = await Promise.all([
				prisma.formula.count({ where }),
				prisma.formula.count({ where: { ...where, highYield: true } }),
				prisma.formula.groupBy({
					by: ['level'],
					_count: { id: true },
					where,
				}),
			]);

			return res.json({
				total,
				highYield: highYieldCount,
				byLevel: byLevel.map(b => ({ level: b.level, count: b._count.id })),
			});
		} catch (err) {
			console.error('[formulas.stats]', err);
			return res.status(500).json({ error: 'Failed to fetch formula stats' });
		}
	});

	// ─── BULK CREATE (Admin only) ──────────────────────────────
	// NOTE: Must be before /:id routes
	router.post('/bulk', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const { formulas: items } = req.body;
			if (!Array.isArray(items) || items.length === 0) {
				return res.status(400).json({ error: 'formulas array required' });
			}
			const validated = items.map(item => formulaSchema.parse(item));
			const count = await prisma.formula.createMany({ data: validated });
			return res.status(201).json({ created: count.count });
		} catch (err) {
			if (err?.name === 'ZodError') {
				return res.status(400).json({ error: 'Validation failed', details: err.errors });
			}
			console.error('[formulas.bulk]', err);
			return res.status(500).json({ error: 'Failed to bulk create formulas' });
		}
	});

	// ─── REORDER (Admin only) ──────────────────────────────────
	// NOTE: Must be before /:id routes
	router.put('/reorder/batch', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const { items } = req.body; // [{ id, order }]
			if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
			await prisma.$transaction(
				items.map(({ id, order }) =>
					prisma.formula.update({ where: { id }, data: { order } })
				)
			);
			return res.json({ success: true });
		} catch (err) {
			console.error('[formulas.reorder]', err);
			return res.status(500).json({ error: 'Failed to reorder formulas' });
		}
	});

	// ─── AI GENERATE PREVIEW (Admin only) ────────────────────
	// Returns generated formulas WITHOUT saving — for admin review
	// Uses SSE (Server-Sent Events) to prevent 504 gateway timeouts
	router.post('/generate-ai/preview', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			courseId: z.string(),
			volumeId: z.string().optional().nullable(),
			moduleId: z.string().optional().nullable(),
			topicId: z.string().optional().nullable(),
			level: z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3']),
			year: z.coerce.number().int().optional().default(2026),
			count: z.coerce.number().int().min(1).max(100).optional().nullable(),
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });

		const { courseId, volumeId, moduleId, topicId, level, year } = parse.data;
		let count = parse.data.count || null;

		const apiKey = await getOpenAIApiKey(prisma);
		if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY in .env or in Admin Settings.' });

		// ── Set up SSE to keep connection alive ──
		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');
		res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
		res.flushHeaders();

		const sendEvent = (event, data) => {
			res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
		};

		// Send keepalive pings every 10s to prevent proxy timeout
		const keepAlive = setInterval(() => {
			res.write(`: keepalive\n\n`);
		}, 10_000);

		const cleanup = () => { clearInterval(keepAlive); };

		// Handle client disconnect
		req.on('close', () => { cleanup(); });

		try {
			sendEvent('progress', { step: 'init', message: 'Preparing generation...' });

			const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, level: true } });
			if (!course) { cleanup(); sendEvent('error', { error: 'Course not found' }); res.end(); return; }

			let volumeName = null, moduleName = null, topicName = null;
			let topicNames = [];
			let resolvedTopics = [];

			if (volumeId) {
				const vol = await prisma.volume.findUnique({ where: { id: volumeId }, select: { name: true } });
				if (vol) volumeName = vol.name;
			}
			if (moduleId) {
				const mod = await prisma.module.findUnique({ where: { id: moduleId }, select: { name: true } });
				if (mod) moduleName = mod.name;
			}
			if (topicId) {
				const t = await prisma.topic.findUnique({ where: { id: topicId }, select: { id: true, name: true } });
				if (t) { topicName = t.name; resolvedTopics = [t]; }
				topicNames = [topicName];
			} else {
				const topicWhere = { courseId };
				if (moduleId) topicWhere.moduleId = moduleId;
				else if (volumeId) topicWhere.module = { volumeId };
				resolvedTopics = await prisma.topic.findMany({ where: topicWhere, select: { id: true, name: true }, orderBy: { order: 'asc' }, take: 50 });
				topicNames = resolvedTopics.map(t => t.name);
			}

			// Auto-detect count if not provided — maximize formulas for the selected scope
			let autoDetected = false;
			if (!count) {
				autoDetected = true;
				if (topicId) {
					count = 10;
				} else if (moduleId) {
					count = Math.min(30, Math.max(10, resolvedTopics.length * 4));
				} else if (resolvedTopics.length > 0) {
					count = Math.min(25, Math.max(10, resolvedTopics.length * 3));
				} else {
					count = 15;
				}
			}

			let curriculumExcerpt = '';
			const effectiveVolumeId = volumeId || null;
			if (effectiveVolumeId) {
				const currDoc = await prisma.curriculumDocument.findUnique({
					where: { courseId_volumeId: { courseId, volumeId: effectiveVolumeId } },
					select: { extractedText: true }
				});
				if (currDoc?.extractedText) {
					const maxChars = topicId ? 4000 : (moduleId ? 6000 : 8000);
					curriculumExcerpt = buildFormulaCurriculumExcerpt(currDoc.extractedText, topicNames, maxChars);
				}
			}

			const levelLabel = level.replace('LEVEL', 'Level ');
			const hierarchyContext = [
				`Course: ${course.name}`,
				`CFA Level: ${levelLabel}`,
				volumeName ? `Volume: ${volumeName}` : null,
				moduleName ? `Learning Module: ${moduleName}` : null,
				topicName ? `Topic: ${topicName}` : (topicNames.length > 0 ? `Topics: ${topicNames.join(', ')}` : null),
			].filter(Boolean).join('\n');

			const curriculumSection = curriculumExcerpt
				? `\n\nCURRICULUM REFERENCE MATERIAL (THIS IS YOUR PRIMARY SOURCE — formulas MUST be grounded in this document):\n---\n${curriculumExcerpt}\n---\n`
				: '';

			const isComprehensive = autoDetected && !topicId && count >= 20;
			const prompt = `You are a senior CFA curriculum expert and formula book author at Milven Finance School. Generate ${isComprehensive ? 'ALL' : count} professional, exam-quality formula cards in JSON format.

Each formula card is used in a premium CFA Formula Book. Every field must be populated with accurate, useful content. Draw from actual CFA curriculum material, financial theory, and exam patterns.
${isComprehensive ? `\nCOMPREHENSIVE MODE: You MUST generate EVERY formula that appears in this module/topic area of the CFA curriculum. Do NOT skip or omit any formula — include foundational definitions, intermediate results, and advanced formulas. Aim for completeness. If the curriculum document is provided, extract EVERY mathematical formula or equation from it. Generate at least ${count} formulas.\n` : ''}
${hierarchyContext}
Year: ${year}
${curriculumSection}
IMPORTANT RULES:
${curriculumExcerpt ? `- CRITICAL: A curriculum document has been provided. You MUST extract formulas EXACTLY as they appear in the document — preserve all notation, subscripts, superscripts, Greek letters, and variable names PRECISELY as written. Do NOT rewrite, simplify, or paraphrase formulas from the document.${isComprehensive ? ' Extract EVERY formula from every page of the provided document for this module.' : ''}
- Match the EXACT subscript and superscript patterns from the curriculum. For example, if the curriculum writes "R_s" do NOT change it to "R_stock" or "r_s".
- The "losTag" MUST be the EXACT Learning Outcome Statement from the document (starts with verbs like "describe", "explain", "calculate").
- Page references in the document appear as [PAGE N] markers — use these for accurate "losTag" references.
` : ''}- Each formula must be a REAL, commonly tested formula for this topic area in the CFA curriculum
- The "formula" field must be the EXACT mathematical equation using VALID LaTeX notation:
  * Subscripts: P_{0}, r_{d}, CF_{t}, R_{nominal}, w_{equity}
  * Superscripts: (1+r)^{n}, e^{-rT}, \sigma^{2}, (1+r)^{-n}
  * Fractions: \frac{P_1 - P_0 + D_1}{P_0}, \frac{D_1}{r - g}
  * Greek letters: \sigma, \beta, \alpha, \mu, \rho, \delta, \lambda, \pi, \theta, \epsilon, \tau, \gamma, \phi
  * Summation: \sum_{t=1}^{T} \frac{CF_t}{(1+r)^{t}}
  * Roots: \sqrt{\frac{\sum_{i=1}^{n}(R_i - \bar{R})^{2}}{n-1}}
  * Inline formulas: wrap in \( ... \)
  * Block formulas: wrap in \[ ... \]
  * Multiply: use \cdot instead of *
  * ALWAYS use curly braces for multi-character sub/superscripts: R_{equity} not R_equity, \sigma^{2}_{p} not sigma^2_p
- NEVER flatten subscripts or superscripts into plain text — E(R_p) not "Expected return of portfolio"
- NEVER omit subscripts/superscripts that exist in the curriculum
- ALL LaTeX must be valid, render-ready for KaTeX/MathJax, with balanced braces
- "variables" must define EVERY symbol in the formula clearly. Use plain text with subscript/superscript notation (e.g., "r_f: risk-free rate; R_p: portfolio return; sigma: standard deviation"). Do NOT wrap descriptions in \text{} — just use plain words after the colon.
- "interpretation" must explain what the formula measures or means in plain English
- "whenToUse" must describe the specific exam scenario where this formula applies
- "watchOut" must highlight a common mistake or trap that students fall into
- "calculatorCue" should provide TI BA II Plus keystrokes or calculator tips (if applicable, otherwise null)
- "losTag" should reference the specific CFA Learning Outcome Statement
- "highYield" should be true if this formula is very frequently tested on CFA exams
- "workedExample" must be a JSON object with a step-by-step numeric example showing how to use the formula. Include: given values, substitution, intermediate calculations, final answer, and interpretation.
- Do NOT duplicate formulas — each must be unique and cover a different concept within the topic area
- Order formulas logically (foundational concepts first, then build complexity)
- Use ONLY the latest ${year} CFA curriculum formulas. Do NOT use outdated or deprecated formula versions. If the curriculum document is provided, match its exact formulations.

Return a JSON object:
{
  "formulas": [
    {
      "name": "string",
      "formula": "string",
      "variables": "string",
      "interpretation": "string",
      "whenToUse": "string",
      "watchOut": "string",
      "calculatorCue": "string or null",
      "losTag": "string",
      "highYield": boolean,
      "order": number,
      "topicName": "string (the exact topic name from the list above that this formula belongs to, or null if no match)",
      "workedExample": {
        "given": "string (list of given values, e.g. 'z_2 = 4%, z_5 = 6%')",
        "formula": "string (the formula with variables shown)",
        "steps": ["string (step 1)", "string (step 2)", "..."],
        "answer": "string (final numeric answer)",
        "interpretation": "string (what the answer means in context)"
      }
    }
  ]
}

Generate ${isComprehensive ? `at least ${count}` : `exactly ${count}`} formula cards. Return ONLY valid JSON.`;

			sendEvent('progress', { step: 'generating', message: `Generating ${count} formulas via AI...` });

			const openai = new OpenAI({ apiKey, timeout: 180_000 });
			const maxTokens = Math.min(16384, Math.max(4096, count * 700));
			const systemMsg = { role: 'system', content: `You are an expert CFA curriculum author. Return valid JSON only. Use the LATEST CFA curriculum formulas only.\n\n${LATEX_SYSTEM_RULES}` };
			const userMsg = { role: 'user', content: prompt };

			const completion = await openai.chat.completions.create({
				model: 'gpt-4o-mini',
				messages: [systemMsg, userMsg],
				temperature: 0.7,
				max_tokens: maxTokens,
				response_format: { type: 'json_object' }
			});

			const raw = completion.choices?.[0]?.message?.content?.trim() || '{}';
			let items = [];
			try {
				const parsed = JSON.parse(raw);
				items = Array.isArray(parsed.formulas) ? parsed.formulas : (Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []));
			} catch {
				cleanup();
				sendEvent('error', { error: 'AI returned invalid JSON' });
				res.end();
				return;
			}

			if (!items.length) { cleanup(); sendEvent('error', { error: 'AI returned no formulas' }); res.end(); return; }

			sendEvent('progress', { step: 'validating', message: `Validating ${items.length} formulas...` });

			// ── LaTeX validation pass: regenerate any malformed formulas ────────
			let invalid = validateFormulaItems(items);
			if (invalid.length > 0) {
				console.warn(`[formulas.generate-ai.preview] ${invalid.length}/${items.length} formula(s) failed LaTeX validation, requesting regeneration`);
				sendEvent('progress', { step: 'fixing', message: `Fixing ${invalid.length} invalid formulas...` });
				const invalidList = invalid.slice(0, 15).map(v => `- index ${v.index} ("${v.name || 'unnamed'}"): ${v.reason}`).join('\n');
				const fixPrompt = `Some formulas you returned had INVALID LaTeX and would fail to render in KaTeX. Regenerate ONLY these items with VALID, KaTeX-compileable LaTeX, returning the SAME JSON shape { "formulas": [...] } with ONLY the fixed entries (preserve the original "order" field so I can match them back):\n\n${invalidList}\n\nFor each fix, ensure:\n- Every \\frac has TWO brace groups: \\frac{...}{...}\n- All { } pairs balance\n- All \\left have matching \\right\n- Multi-char superscripts/subscripts use braces: x^{2}, R_{equity}\n- No malformed escapes inside sub/superscripts\n- No empty math delimiters\n\nReturn ONLY valid JSON containing the corrected formulas array.`;

				try {
					const fixCompletion = await openai.chat.completions.create({
						model: 'gpt-4o-mini',
						messages: [systemMsg, userMsg, { role: 'assistant', content: raw }, { role: 'user', content: fixPrompt }],
						temperature: 0.3,
						max_tokens: Math.min(8192, Math.max(2048, invalid.length * 600)),
						response_format: { type: 'json_object' }
					});
					const fixRaw = fixCompletion.choices?.[0]?.message?.content?.trim() || '{}';
					const fixParsed = JSON.parse(fixRaw);
					const fixes = Array.isArray(fixParsed.formulas) ? fixParsed.formulas : (Array.isArray(fixParsed.items) ? fixParsed.items : []);
					for (let i = 0; i < fixes.length; i++) {
						const fix = fixes[i];
						const target = invalid[i];
						if (!target) break;
						let replaceIdx = target.index;
						if (typeof fix.order === 'number') {
							const byOrder = items.findIndex(it => it.order === fix.order);
							if (byOrder !== -1) replaceIdx = byOrder;
						}
						items[replaceIdx] = { ...items[replaceIdx], ...fix };
					}
					invalid = validateFormulaItems(items);
				} catch (fixErr) {
					console.warn('[formulas.generate-ai.preview] Regeneration pass failed:', fixErr?.message);
				}

				// Drop any still-invalid formulas — never return broken LaTeX
				if (invalid.length > 0) {
					const dropSet = new Set(invalid.map(v => v.index));
					items = items.filter((_, i) => !dropSet.has(i));
					console.warn(`[formulas.generate-ai.preview] Dropped ${dropSet.size} formula(s) that remained invalid after regeneration`);
				}
			}

			if (!items.length) { cleanup(); sendEvent('error', { error: 'AI returned no valid formulas (all failed LaTeX validation)' }); res.end(); return; }

			// Build topic lookup for matching AI topicName to DB topic IDs
			const topicLookup = new Map();
			for (const t of resolvedTopics) {
				topicLookup.set(t.name.toLowerCase().trim(), t.id);
			}
			const matchTopicId = (aiTopicName) => {
				if (topicId) return topicId;
				if (!aiTopicName) return null;
				const key = aiTopicName.toLowerCase().trim();
				if (topicLookup.has(key)) return topicLookup.get(key);
				for (const [name, id] of topicLookup) {
					if (key.includes(name) || name.includes(key)) return id;
				}
				return null;
			};

			// Return formulas for preview — do NOT save yet
			const previewItems = items.map((item, i) => ({
				name: String(item.name || `Formula ${i + 1}`).slice(0, 255),
				formula: sanitizeLatex(String(item.formula || '')),
				variables: sanitizeLatex(String(item.variables || '')),
				interpretation: String(item.interpretation || ''),
				whenToUse: String(item.whenToUse || ''),
				watchOut: String(item.watchOut || ''),
				calculatorCue: item.calculatorCue ? sanitizeLatex(String(item.calculatorCue)) : null,
				losTag: item.losTag || null,
				highYield: !!item.highYield,
				order: item.order || (i + 1),
				topicName: item.topicName || null,
				matchedTopicId: matchTopicId(item.topicName),
				workedExample: item.workedExample || null,
			}));

			cleanup();
			sendEvent('result', {
				generated: { items: previewItems },
				meta: { courseId, volumeId, moduleId, topicId, level, year }
			});
			res.end();
		} catch (err) {
			cleanup();
			const msg = err?.error?.message || err?.message || 'OpenAI request failed';
			console.error('[formulas.generate-ai.preview]', msg);
			sendEvent('error', { error: msg });
			res.end();
		}
	});

	// ─── AI GENERATE ACCEPT (Admin only) ────────────────────────
	// Saves selected formulas from a preview
	router.post('/generate-ai/accept', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const { generated, meta, selectedIndices } = req.body;
			if (!generated?.items || !Array.isArray(generated.items)) {
				return res.status(400).json({ error: 'Missing generated items' });
			}
			if (!Array.isArray(selectedIndices) || selectedIndices.length === 0) {
				return res.status(400).json({ error: 'No formulas selected' });
			}
			const { courseId, volumeId, moduleId, topicId, level, year } = meta || {};
			if (!courseId || !level) {
				return res.status(400).json({ error: 'Missing meta (courseId, level)' });
			}

			const created = [];
			for (const idx of selectedIndices) {
				const item = generated.items[idx];
				if (!item) continue;
				try {
					const formula = await prisma.formula.create({
						data: {
							name: String(item.name || `Formula ${idx + 1}`).slice(0, 255),
							formula: String(item.formula || ''),
							variables: String(item.variables || ''),
							interpretation: String(item.interpretation || ''),
							whenToUse: String(item.whenToUse || ''),
							watchOut: String(item.watchOut || ''),
							calculatorCue: item.calculatorCue || null,
							losTag: item.losTag || null,
							workedExample: item.workedExample || undefined,
							level,
							courseId,
							volumeId: volumeId || null,
							moduleId: moduleId || null,
							topicId: item.matchedTopicId || topicId || null,
							order: item.order || (idx + 1),
							highYield: !!item.highYield,
							year: year || 2026,
						},
						include: defaultInclude,
					});
					created.push(formula);
				} catch (saveErr) {
					console.error(`[formulas.generate-ai.accept] Failed to save formula ${idx}:`, saveErr?.message);
				}
			}

			return res.status(201).json({ created: created.length, formulas: created });
		} catch (err) {
			console.error('[formulas.generate-ai.accept]', err);
			return res.status(500).json({ error: 'Failed to accept formulas' });
		}
	});

	// ─── AI GENERATE (Admin only) — legacy direct-save ─────────
	// NOTE: Must be before /:id routes
	router.post('/generate-ai', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			courseId: z.string(),
			volumeId: z.string().optional().nullable(),
			moduleId: z.string().optional().nullable(),
			topicId: z.string().optional().nullable(),
			level: z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3']),
			year: z.coerce.number().int().optional().default(2026),
			count: z.coerce.number().int().min(1).max(100).optional().nullable(),
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });

		const { courseId, volumeId, moduleId, topicId, level, year } = parse.data;
		let count = parse.data.count || null;

		const apiKey = await getOpenAIApiKey(prisma);
		if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY in .env or in Admin Settings.' });

		try {
			// Resolve hierarchy names for prompt context
			const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, level: true } });
			if (!course) return res.status(400).json({ error: 'Course not found' });

			let volumeName = null, moduleName = null, topicName = null;
			let topicNames = [];
			let resolvedTopics = []; // {id, name} — used for topic matching on save

			if (volumeId) {
				const vol = await prisma.volume.findUnique({ where: { id: volumeId }, select: { name: true } });
				if (vol) volumeName = vol.name;
			}
			if (moduleId) {
				const mod = await prisma.module.findUnique({ where: { id: moduleId }, select: { name: true } });
				if (mod) moduleName = mod.name;
			}
			if (topicId) {
				const t = await prisma.topic.findUnique({ where: { id: topicId }, select: { id: true, name: true } });
				if (t) { topicName = t.name; resolvedTopics = [t]; }
				topicNames = [topicName];
			} else {
				// Auto-resolve topics within the selected hierarchy
				const topicWhere = { courseId };
				if (moduleId) topicWhere.moduleId = moduleId;
				else if (volumeId) topicWhere.module = { volumeId };
				resolvedTopics = await prisma.topic.findMany({ where: topicWhere, select: { id: true, name: true }, orderBy: { order: 'asc' }, take: 50 });
				topicNames = resolvedTopics.map(t => t.name);
			}

			// Auto-detect count: if no count provided, generate ~3 formulas per topic in the module (min 5, max 50)
			if (!count) {
				count = resolvedTopics.length > 0 ? Math.min(50, Math.max(5, resolvedTopics.length * 3)) : 10;
				console.log(`[formulas.generate-ai] Auto count = ${count} (${resolvedTopics.length} topics)`);
			}

			// Load curriculum document for richer context
			let curriculumExcerpt = '';
			const effectiveVolumeId = volumeId || null;
			if (effectiveVolumeId) {
				const currDoc = await prisma.curriculumDocument.findUnique({
					where: { courseId_volumeId: { courseId, volumeId: effectiveVolumeId } },
					select: { extractedText: true }
				});
				if (currDoc?.extractedText) {
					curriculumExcerpt = buildFormulaCurriculumExcerpt(currDoc.extractedText, topicNames, 15000);
				}
			}

			const levelLabel = level.replace('LEVEL', 'Level ');
			const hierarchyContext = [
				`Course: ${course.name}`,
				`CFA Level: ${levelLabel}`,
				volumeName ? `Volume: ${volumeName}` : null,
				moduleName ? `Learning Module: ${moduleName}` : null,
				topicName ? `Topic: ${topicName}` : (topicNames.length > 0 ? `Topics: ${topicNames.join(', ')}` : null),
			].filter(Boolean).join('\n');

			const curriculumSection = curriculumExcerpt
				? `\n\nCURRICULUM REFERENCE MATERIAL (THIS IS YOUR PRIMARY SOURCE — formulas MUST be grounded in this document):\n---\n${curriculumExcerpt}\n---\n`
				: '';

			const prompt = `You are a senior CFA curriculum expert and formula book author at Milven Finance School. Generate ${count} professional, exam-quality formula cards in JSON format.

Each formula card is used in a premium CFA Formula Book. Every field must be populated with accurate, useful content. Draw from actual CFA curriculum material, financial theory, and exam patterns.

${hierarchyContext}
Year: ${year}
${curriculumSection}
IMPORTANT RULES:
${curriculumExcerpt ? `- CRITICAL: A curriculum document has been provided. You MUST extract formulas EXACTLY as they appear in the document — preserve all notation, subscripts, superscripts, Greek letters, and variable names. Do NOT rewrite or simplify formulas from the document.
- The "losTag" MUST be the EXACT Learning Outcome Statement from the document (starts with verbs like "describe", "explain", "calculate").
- Page references in the document appear as [PAGE N] markers — use these for accurate "losTag" references.
` : ''}- Each formula must be a REAL, commonly tested formula for this topic area in the CFA curriculum
- The "formula" field must be the exact mathematical equation using VALID LaTeX notation:
  * Subscripts: P_{0}, r_{d}, w_{equity}, CF_{t}
  * Superscripts: (1+r)^{n}, x^{2}, e^{-rT}
  * Fractions: \frac{P_1 - P_0 + D_1}{P_0}
  * Greek letters: \sigma, \beta, \alpha, \mu, \rho, \delta, \lambda, \pi, \theta, \epsilon, \tau
  * Roots: \sqrt{x}
  * Multiply: \cdot
  * Inline formulas: wrap in \( ... \)
  * Block formulas: wrap in \[ ... \]
  * Example: \( WACC = w_{d} \cdot r_{d} \cdot (1 - t) + w_{e} \cdot r_{e} \)
  * Example: \( PV = \frac{CF_1}{(1+r)^{1}} + \frac{CF_2}{(1+r)^{2}} \)
  * Example: \( \sigma_{p} = \sqrt{w_1^{2} \sigma_1^{2} + w_2^{2} \sigma_2^{2} + 2 w_1 w_2 \rho_{12} \sigma_1 \sigma_2} \)
  * ALL LaTeX must be render-ready for KaTeX/MathJax with balanced braces
- "variables" must define EVERY symbol in the formula clearly
- "interpretation" must explain what the formula measures or means in plain English
- "whenToUse" must describe the specific exam scenario where this formula applies
- "watchOut" must highlight a common mistake or trap that students fall into
- "calculatorCue" should provide TI BA II Plus keystrokes or calculator tips (if applicable, otherwise null)
- "losTag" should reference the specific CFA Learning Outcome Statement (e.g. "Calculate and interpret holding period return")
- "highYield" should be true if this formula is very frequently tested on CFA exams
- Do NOT duplicate formulas — each must be unique and cover a different concept within the topic area
- Order formulas logically (foundational concepts first, then build complexity)

Return a JSON object:
{
  "formulas": [
    {
      "name": "string (descriptive name, e.g. 'Holding Period Return')",
      "formula": "string (exact equation)",
      "variables": "string (define every symbol)",
      "interpretation": "string (plain English meaning)",
      "whenToUse": "string (exam context)",
      "watchOut": "string (common trap)",
      "calculatorCue": "string or null",
      "losTag": "string (CFA LOS reference)",
      "highYield": boolean,
      "order": number (starting from 1),
      "topicName": "string (the exact topic name from the list above that this formula belongs to, or null if no match)"
    }
  ]
}

Generate exactly ${count} formula cards. Return ONLY valid JSON.`;

			const openai = new OpenAI({ apiKey });
			const completion = await openai.chat.completions.create({
				model: 'gpt-4o-mini',
				messages: [
					{ role: 'system', content: `You are an expert CFA curriculum author. Always return valid JSON only.\n\n${LATEX_SYSTEM_RULES}` },
					{ role: 'user', content: prompt }
				],
				temperature: 0.7,
				response_format: { type: 'json_object' }
			});

			const raw = completion.choices?.[0]?.message?.content?.trim() || '{}';
			let items = [];
			try {
				const parsed = JSON.parse(raw);
				items = Array.isArray(parsed.formulas) ? parsed.formulas : (Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []));
			} catch {
				return res.status(502).json({ error: 'AI returned invalid JSON' });
			}

			if (!items.length) return res.status(502).json({ error: 'AI returned no formulas' });

			// Build a topic name -> id lookup for fuzzy matching AI-returned topicName
			const topicLookup = new Map();
			for (const t of resolvedTopics) {
				topicLookup.set(t.name.toLowerCase().trim(), t.id);
			}
			const matchTopicId = (aiTopicName) => {
				if (topicId) return topicId; // explicit topic always wins
				if (!aiTopicName) return null;
				const key = aiTopicName.toLowerCase().trim();
				if (topicLookup.has(key)) return topicLookup.get(key);
				// Partial match: find first topic whose name is contained in AI's topicName or vice versa
				for (const [name, id] of topicLookup) {
					if (key.includes(name) || name.includes(key)) return id;
				}
				return null;
			};

			// Save each formula to the database
			const created = [];
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				try {
					const matchedTopicId = matchTopicId(item.topicName);
					const formula = await prisma.formula.create({
						data: {
							name: String(item.name || `Formula ${i + 1}`).slice(0, 255),
							formula: String(item.formula || ''),
							variables: String(item.variables || ''),
							interpretation: String(item.interpretation || ''),
							whenToUse: String(item.whenToUse || ''),
							watchOut: String(item.watchOut || ''),
							calculatorCue: item.calculatorCue || null,
							losTag: item.losTag || null,
							workedExample: item.workedExample || undefined,
							level,
							courseId,
							volumeId: volumeId || null,
							moduleId: moduleId || null,
							topicId: matchedTopicId,
							order: item.order || (i + 1),
							highYield: !!item.highYield,
							year,
						},
						include: defaultInclude,
					});
					created.push(formula);
				} catch (saveErr) {
					console.error(`[formulas.generate-ai] Failed to save formula ${i}:`, saveErr?.message);
				}
			}

			return res.status(201).json({ created: created.length, formulas: created });
		} catch (err) {
			const msg = err?.error?.message || err?.message || 'OpenAI request failed';
			console.error('[formulas.generate-ai]', msg);
			return res.status(502).json({ error: msg });
		}
	});

	// ─── CREATE (Admin only) ───────────────────────────────────
	router.post('/', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const data = formulaSchema.parse(req.body);
			const formula = await prisma.formula.create({
				data,
				include: defaultInclude,
			});
			return res.status(201).json({ formula });
		} catch (err) {
			if (err?.name === 'ZodError') {
				return res.status(400).json({ error: 'Validation failed', details: err.errors });
			}
			console.error('[formulas.create]', err);
			return res.status(500).json({ error: 'Failed to create formula' });
		}
	});

	// ─── GET ONE ───────────────────────────────────────────────
	router.get('/:id', async (req, res) => {
		try {
			const formula = await prisma.formula.findUnique({
				where: { id: req.params.id },
				include: defaultInclude,
			});
			if (!formula) return res.status(404).json({ error: 'Formula not found' });
			return res.json({ formula });
		} catch (err) {
			console.error('[formulas.get]', err);
			return res.status(500).json({ error: 'Failed to fetch formula' });
		}
	});

	// ─── UPDATE (Admin only) ───────────────────────────────────
	router.put('/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const data = formulaSchema.partial().parse(req.body);
			const formula = await prisma.formula.update({
				where: { id: req.params.id },
				data,
				include: defaultInclude,
			});
			return res.json({ formula });
		} catch (err) {
			if (err?.name === 'ZodError') {
				return res.status(400).json({ error: 'Validation failed', details: err.errors });
			}
			if (err?.code === 'P2025') {
				return res.status(404).json({ error: 'Formula not found' });
			}
			console.error('[formulas.update]', err);
			return res.status(500).json({ error: 'Failed to update formula' });
		}
	});

	// ─── DELETE (Admin only) ───────────────────────────────────
	router.delete('/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			await prisma.formula.delete({ where: { id: req.params.id } });
			return res.json({ success: true });
		} catch (err) {
			if (err?.code === 'P2025') {
				return res.status(404).json({ error: 'Formula not found' });
			}
			console.error('[formulas.delete]', err);
			return res.status(500).json({ error: 'Failed to delete formula' });
		}
	});

	return router;
}
