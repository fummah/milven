import { Router } from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { getOpenAIApiKey } from '../lib/openai.js';

export function summarySheetsRouter(prisma) {
	const router = Router();

	const defaultInclude = {
		course: { select: { id: true, name: true, level: true } },
		volume: { select: { id: true, name: true } },
		module: { select: { id: true, name: true } },
		topic: { select: { id: true, name: true } },
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
		coreDefinitions: z.any().optional().nullable(),
		formulas: z.any().optional().nullable(),
		distinctions: z.any().optional().nullable(),
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
			const { courseId, volumeId, moduleId, topicId, level, status, year, search, page, limit } = req.query;
			const where = {};
			if (courseId) where.courseId = courseId;
			if (volumeId) where.volumeId = volumeId;
			if (moduleId) where.moduleId = moduleId;
			if (topicId) where.topicId = topicId;
			if (level) where.level = level;
			if (status) where.status = status;
			if (year) where.year = Number(year);
			if (search) {
				where.OR = [
					{ title: { contains: search, mode: 'insensitive' } },
					{ snapshot: { contains: search, mode: 'insensitive' } },
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

			return res.json({ sheets, total, page: pageNum, limit: pageSize });
		} catch (err) {
			console.error('[summarySheets.list]', err);
			return res.status(500).json({ error: 'Failed to list summary sheets' });
		}
	});

	// ─── GET ONE ──────────────────────────────────────────────
	router.get('/:id', async (req, res) => {
		try {
			const sheet = await prisma.summarySheet.findUnique({
				where: { id: req.params.id },
				include: defaultInclude,
			});
			if (!sheet) return res.status(404).json({ error: 'Summary sheet not found' });
			return res.json({ sheet });
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
			await prisma.summarySheet.delete({ where: { id: req.params.id } });
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
			topicId: z.string().optional().nullable(),
			level: z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3']),
			year: z.coerce.number().int().optional().default(2026),
			count: z.coerce.number().int().min(1).max(20).optional().nullable(),
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });

		const { courseId, volumeId, moduleId, topicId, level, year } = parse.data;
		let count = parse.data.count || null;

		const apiKey = await getOpenAIApiKey(prisma);
		if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured.' });

		try {
			const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true } });
			if (!course) return res.status(400).json({ error: 'Course not found' });

			let volumeName = null, moduleName = null, topicName = null;
			let topicNames = [];

			if (volumeId) {
				const vol = await prisma.volume.findUnique({ where: { id: volumeId }, select: { name: true } });
				if (vol) volumeName = vol.name;
			}
			if (moduleId) {
				const mod = await prisma.module.findUnique({ where: { id: moduleId }, select: { name: true } });
				if (mod) moduleName = mod.name;
			}
			if (topicId) {
				const t = await prisma.topic.findUnique({ where: { id: topicId }, select: { name: true } });
				if (t) topicName = t.name;
				topicNames = [topicName];
			} else {
				const topicWhere = { courseId };
				if (moduleId) topicWhere.moduleId = moduleId;
				else if (volumeId) topicWhere.module = { volumeId };
				const resolvedTopics = await prisma.topic.findMany({ where: topicWhere, select: { id: true, name: true }, orderBy: { order: 'asc' }, take: 50 });
				topicNames = resolvedTopics.map(t => t.name);
			}

			// Auto-detect count: if moduleId given, 1 sheet for that module; if volumeId, count modules in volume; else count modules in course
			if (!count) {
				if (moduleId) {
					count = 1;
				} else {
					const modWhere = { courseId };
					if (volumeId) modWhere.volumeId = volumeId;
					const modCount = await prisma.module.count({ where: modWhere });
					count = Math.max(1, Math.min(20, modCount));
				}
			}

			let curriculumExcerpt = '';
			if (volumeId) {
				const currDoc = await prisma.curriculumDocument.findUnique({
					where: { courseId_volumeId: { courseId, volumeId } },
					select: { extractedText: true }
				});
				if (currDoc?.extractedText) {
					const text = currDoc.extractedText;
					if (text.length <= 15000) {
						curriculumExcerpt = text;
					} else {
						const keywords = [...topicNames, topicName, moduleName].filter(Boolean)
							.flatMap(n => n.split(/[\s,;:()\-\/]+/).filter(w => w.length > 3))
							.map(w => w.toLowerCase());
						if (keywords.length === 0) {
							curriculumExcerpt = text.substring(0, 15000) + '\n... [truncated]';
						} else {
							const WINDOW = 2500, STEP = 500;
							const windows = [];
							for (let i = 0; i < text.length; i += STEP) {
								const chunk = text.substring(i, i + WINDOW).toLowerCase();
								let score = keywords.reduce((s, kw) => { let c = 0, idx = 0; while ((idx = chunk.indexOf(kw, idx)) !== -1) { c++; idx += kw.length; } return s + c; }, 0);
								windows.push({ start: i, score });
							}
							windows.sort((a, b) => b.score - a.score);
							const ranges = [];
							let total = 0;
							for (const w of windows) {
								if (total >= 15000 || w.score === 0) break;
								const end = Math.min(w.start + WINDOW, text.length);
								const budget = Math.min(end - w.start, 15000 - total);
								ranges.push({ start: w.start, end: w.start + budget });
								total += budget;
							}
							ranges.sort((a, b) => a.start - b.start);
							const merged = [];
							for (const r of ranges) {
								if (merged.length > 0 && r.start <= merged[merged.length - 1].end + 300) merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end);
								else merged.push({ ...r });
							}
							curriculumExcerpt = merged.map((r, i) => {
								const t = text.substring(r.start, r.end).trim();
								const pm = text.substring(0, r.start).match(/\[PAGE (\d+)\]/g);
								const pg = pm ? parseInt(pm[pm.length - 1].match(/\d+/)[0], 10) : null;
								const prefix = pg ? `[... content from page ${pg} ...]\n` : (r.start > 0 ? '[...]\n' : '');
								return prefix + t + (i < merged.length - 1 ? '\n[...]\n' : '');
							}).join('\n') + (merged[merged.length - 1]?.end < text.length ? '\n... [additional content omitted]' : '');
						}
					}
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
				? `\n\nCURRICULUM REFERENCE MATERIAL (use this as the primary source — reference exact LOS, formulas, and page numbers from the document):\n---\n${curriculumExcerpt}\n---\n`
				: '';

			const prompt = `You are a senior CFA curriculum expert at Milven Finance School. Generate 1 CFA Summary Sheet in JSON format.

This summary sheet MUST be equivalent to 2-3 FULL printed pages of content. It is a high-impact revision document that covers the ENTIRE learning module in detail. Every topic, formula, and key concept must be included. Do NOT produce a short summary — this is premium study material.

${hierarchyContext}
Year: ${year}
${curriculumSection}
MINIMUM LENGTH REQUIREMENTS (generate AT LEAST these amounts — more is better):
- "snapshot": 4-6 sentences describing what the sheet covers, why it matters, and how to use it
- "useCase": 2-3 sentences on when to use this sheet
- "coreDefinitions": 12-20 key definitions. Each definition must be 2-3 sentences in exam language. Cover EVERY important term in the module.
- "formulas": 8-15 formulas. Include EVERY formula from the curriculum for this module. Each must have full variables explanation and when-to-use context (2-3 sentences each).
  * Use rich notation: _ for subscripts (P_0, CF_t), ^ for superscripts ((1+r)^n), Greek letters (sigma, beta, alpha)
  * PRESERVE exact notation from the curriculum document
- "distinctions": 5-8 comparisons of look-alike concepts. Each "difference" field must be 3-5 sentences explaining the distinction clearly.
- "diagrams": 3-5 text-based visual aids (flowcharts, comparison tables, process flows). Each "description" must be detailed (5-10 sentences describing the visual layout and relationships).
- "examTraps": 6-10 common exam traps. Each "trap" must be 2-3 sentences explaining what candidates confuse and how to avoid it.
- "memoryHooks": 8-12 memory cues. Each hook should be a memorable phrase or mnemonic.
- "quickDrills": 6-10 fast recall/calculation questions. Each question should be specific and exam-relevant.
- "revisionCheck": 10-15 self-check items covering every key concept in the module.

Return a JSON object:
{
  "sheets": [
    {
      "title": "string",
      "snapshot": "LONG string (4-6 sentences)",
      "useCase": "string (2-3 sentences)",
      "coreDefinitions": [{"term": "string", "definition": "DETAILED string (2-3 sentences)"}, ...12-20 items],
      "formulas": [{"formula": "rich notation string", "variables": "define ALL variables", "whenToUse": "2-3 sentences"}, ...8-15 items],
      "distinctions": [{"left": "string", "right": "string", "difference": "DETAILED 3-5 sentences"}, ...5-8 items],
      "diagrams": [{"title": "string", "description": "DETAILED 5-10 sentences"}, ...3-5 items],
      "examTraps": [{"trap": "2-3 sentences"}, ...6-10 items],
      "memoryHooks": [{"hook": "string"}, ...8-12 items],
      "quickDrills": [{"question": "string"}, ...6-10 items],
      "revisionCheck": [{"item": "string"}, ...10-15 items]
    }
  ]
}

IMPORTANT: MAXIMIZE the length and detail of your response. Use ALL available tokens. This is premium study material — short or thin content is unacceptable. Every section must be FULLY populated with the minimum number of items listed above.

Generate exactly 1 summary sheet. Return ONLY valid JSON.`;

			const openai = new OpenAI({ apiKey });

			// gpt-4o-mini supports max 16384 completion tokens
			// Generate one sheet at a time to ensure 2-3 pages of content per sheet
			let items = [];
			const sheetsToGenerate = Math.min(count, 20);

			for (let i = 0; i < sheetsToGenerate; i++) {
				const completion = await openai.chat.completions.create({
					model: 'gpt-4o-mini',
					messages: [
						{ role: 'system', content: 'You are an expert CFA curriculum author. Return valid JSON only. CRITICAL: Generate the LONGEST, most detailed response possible. Use ALL available tokens. Every array must meet the MINIMUM item counts specified. Every text field must be multiple sentences. Do NOT abbreviate — write FULL detailed content.' },
						{ role: 'user', content: prompt }
					],
					temperature: 0.7,
					max_tokens: 16384,
					response_format: { type: 'json_object' }
				});

				const raw = completion.choices?.[0]?.message?.content?.trim() || '{}';
				try {
					const parsed = JSON.parse(raw);
					const sheetItems = Array.isArray(parsed.sheets) ? parsed.sheets : (Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed) ? parsed : [parsed]));
					items.push(...sheetItems);
				} catch {
					if (items.length === 0) return res.status(502).json({ error: 'AI returned invalid JSON' });
				}
			}

			if (!items.length) return res.status(502).json({ error: 'AI returned no summary sheets' });

			return res.json({
				generated: { items },
				meta: { courseId, volumeId, moduleId, topicId, level, year }
			});
		} catch (err) {
			const msg = err?.error?.message || err?.message || 'OpenAI request failed';
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
			const { courseId, volumeId, moduleId, topicId, level, year } = meta || {};
			if (!courseId || !level) {
				return res.status(400).json({ error: 'Missing meta (courseId, level)' });
			}

			const created = [];
			for (const idx of selectedIndices) {
				const item = generated.items[idx];
				if (!item) continue;
				try {
					const sheet = await prisma.summarySheet.create({
						data: {
							title: String(item.title || `Summary Sheet ${idx + 1}`).slice(0, 255),
							level,
							courseId,
							volumeId: volumeId || null,
							moduleId: moduleId || null,
							topicId: topicId || null,
							year: year || 2026,
							snapshot: item.snapshot || null,
							useCase: item.useCase || null,
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
				}
			}

			return res.status(201).json({ created: created.length, sheets: created });
		} catch (err) {
			console.error('[summarySheets.generate-ai.accept]', err);
			return res.status(500).json({ error: 'Failed to accept summary sheets' });
		}
	});

	return router;
}
