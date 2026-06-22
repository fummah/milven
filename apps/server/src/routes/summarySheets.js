import { Router } from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { getOpenAIApiKey, LATEX_SYSTEM_RULES, LATEX_PROMPT_SECTION } from '../lib/openai.js';

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
			level: z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3']),
			year: z.coerce.number().int().optional().default(2026),
			count: z.coerce.number().int().min(1).max(20).optional().nullable(),
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });

		const { courseId, volumeId, moduleId, level, year } = parse.data;
		let count = parse.data.count || null;

		const apiKey = await getOpenAIApiKey(prisma);
		if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured.' });

		try {
			const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true } });
			if (!course) return res.status(400).json({ error: 'Course not found' });

			let volumeName = null, moduleName = null, moduleObjective = null;
			let topicNames = [];

			if (volumeId) {
				const vol = await prisma.volume.findUnique({ where: { id: volumeId }, select: { name: true } });
				if (vol) volumeName = vol.name;
			}
			if (moduleId) {
				const mod = await prisma.module.findUnique({ where: { id: moduleId }, select: { name: true, description: true } });
				if (mod) { moduleName = mod.name; moduleObjective = mod.description || null; }
			}
			// Resolve topics within scope
			const topicWhere = { courseId };
			if (moduleId) topicWhere.moduleId = moduleId;
			else if (volumeId) topicWhere.module = { volumeId };
			const resolvedTopics = await prisma.topic.findMany({ where: topicWhere, select: { id: true, name: true }, orderBy: { order: 'asc' }, take: 50 });
			topicNames = resolvedTopics.map(t => t.name);

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
				`Programme: CFA`,
				`Exam Level: ${levelLabel}`,
				`Course / Topic Area: ${course.name}`,
				volumeName ? `Volume: ${volumeName}` : null,
				moduleName ? `Learning Module: ${moduleName}` : null,
				moduleObjective ? `Learning Module Objective: ${moduleObjective}` : null,
				topicNames.length > 0 ? `Topic Headings: ${topicNames.join('; ')}` : null,
			].filter(Boolean).join('\n');

			// Fetch existing module notes for this module (completed topic-level Milven Notes)
			let topicNotesContext = '';
			if (moduleId) {
				const existingNotes = await prisma.moduleNote.findMany({
					where: { moduleId, status: 'PUBLISHED' },
					select: { title: true, overview: true, moduleSummary: true },
					take: 10,
				});
				if (existingNotes.length > 0) {
					topicNotesContext = '\n\nCOMPLETED TOPIC-LEVEL MILVEN NOTES:\n' + existingNotes.map(n =>
						`- ${n.title}: ${n.overview || ''} ${n.moduleSummary || ''}`
					).join('\n') + '\n';
				}
			}

			// Fetch formulas for this module
			let formulaListContext = '';
			if (moduleId) {
				const existingFormulas = await prisma.formula.findMany({
					where: { moduleId },
					select: { name: true, formula: true, variables: true },
					take: 30,
				});
				if (existingFormulas.length > 0) {
					formulaListContext = '\n\nFORMULA LIST FROM DATABASE:\n' + existingFormulas.map(f =>
						`- ${f.name}: ${f.formula} (${f.variables || ''})`
					).join('\n') + '\n';
				}
			}

			const curriculumSection = curriculumExcerpt
				? `\n\nCURRICULUM REFERENCE MATERIAL (use as primary source — reference exact LOS, formulas, page numbers):\n---\n${curriculumExcerpt}\n---\n`
				: '';

			const prompt = `You are a senior CFA curriculum expert at Milven Finance School.

TASK: Generate a Learning Module-level Milven Summary — a one-to-two page diagrammatic revision dashboard.

INPUTS:
${hierarchyContext}
Year: ${year}
${curriculumSection}${topicNotesContext}${formulaListContext}

CORE RULES:
1. Generate at Learning Module level only.
2. Prefer one page; use two pages only for dense or calculation-heavy modules.
3. Do NOT copy or reproduce the curriculum verbatim.
4. Include EVERY topic in the learning module.
5. Link every major topic to the learning module objective.
6. Cover ALL Learning Outcome Statements in candidate-friendly language.
7. Use diagrammatic structures: boxes, arrows, tables, formula strips and checklists.
8. Avoid long paragraphs.
9. Include key formulas with use cases.
10. Include decision rules that help candidates choose the correct measure or concept.
11. Include common exam traps.
12. Flag missing or unsupported areas under Instructor Review Required.

REQUIRED OUTPUT SECTIONS (populate ALL of them):

1. "snapshot" (string) — Module Objective: 2-3 sentences stating WHAT the module teaches and HOW it connects to the exam. This goes in the callout box at the top.

2. "coreDefinitions" (array) — LOS Snapshot: [{ref, statement, commandWord}]. List EVERY Learning Outcome Statement with its reference code, the statement in candidate-friendly language, and the command word (calculate, describe, explain, compare, etc.). Minimum 5 items.

3. "diagrams" (array) — Module Concept Map: [{topic, subtopics, connectionTo}]. Show how the topics in this module connect to each other and to the module objective. Each entry is a topic node with its subtopics and what it connects to. Minimum 3 items.

4. "memoryHooks" (array) — Topic-to-Concept Map: [{topic, concepts, linkToObjective}]. For each topic, list the key concepts and explain how they link to the module objective. Minimum 3 items.

5. "formulas" (array) — Formula Strip: [{formula, useCase, interpretation}]. Every key formula with its use case scenario and a one-line interpretation of what the result means. Minimum 6 items.
   * Use valid LaTeX: \\frac{a}{b} for fractions, P_{0}, CF_{t} for subscripts, (1+r)^{n} for superscripts, \\sigma, \\beta, \\alpha for Greek
   * Inline: \\( ... \\)  Block: \\[ ... \\]  ALL braces must be balanced

6. "distinctions" (array) — Exam Decision Rules: [{scenario, rule, apply}]. Decision rules that help candidates choose the correct measure, method, or concept in exam questions. e.g. "If asked about return over multiple periods → use geometric mean, not arithmetic mean". Minimum 5 items.

7. "examTraps" (array) — Exam Traps: [{trap}]. Short warning statements about common mistakes. e.g. "Arithmetic mean is NOT always appropriate — geometric mean for compounding." Minimum 5 items.

8. "revisionCheck" (array) — Final Revision Checklist: [{item}]. Action-verb checklist items. e.g. "Calculate holding period return from given cash flows." Minimum 8 items.

9. "quickDrills" (array) — Instructor Review Required: [{issue, recommendation}]. Flag any gaps, ambiguous areas, or content not fully supported by the curriculum. If none, include one item: {issue: "None identified", recommendation: "Ready for publication"}.

10. "useCase" (string) — Coverage Quality Check: One of "PASS", "REVISE", or "INSTRUCTOR REVIEW REQUIRED". Confirm all topics, LOS, formulas, decision rules and traps are covered.

Return a JSON object:
{
  "sheets": [
    {
      "title": "LM#: [Learning Module Name]",
      "snapshot": "Module Objective string",
      "useCase": "PASS|REVISE|INSTRUCTOR REVIEW REQUIRED",
      "coreDefinitions": [{"ref": "LOS 1.a", "statement": "...", "commandWord": "calculate"}],
      "diagrams": [{"topic": "...", "subtopics": ["..."], "connectionTo": "..."}],
      "memoryHooks": [{"topic": "...", "concepts": ["..."], "linkToObjective": "..."}],
      "formulas": [{"formula": "LaTeX string", "useCase": "...", "interpretation": "..."}],
      "distinctions": [{"scenario": "...", "rule": "...", "apply": "..."}],
      "examTraps": [{"trap": "..."}],
      "revisionCheck": [{"item": "..."}],
      "quickDrills": [{"issue": "...", "recommendation": "..."}]
    }
  ]
}

OUTPUT STANDARD: The final summary must read like a premium Milven revision dashboard, not like a textbook summary. Clean, visual, concise, exam-focused.

Generate exactly 1 summary sheet. Return ONLY valid JSON.`;

			const openai = new OpenAI({ apiKey });

			let items = [];
			const sheetsToGenerate = Math.min(count, 20);

			for (let i = 0; i < sheetsToGenerate; i++) {
				const completion = await openai.chat.completions.create({
					model: 'gpt-4o-mini',
					messages: [
						{ role: 'system', content: `You are the Milven Summary Generator and Layout Formatter. Return valid JSON only. Generate a diagrammatic revision dashboard at Learning Module level. Every section must be fully populated. Use concise exam-focused language. Do NOT write textbook paragraphs.\n\n${LATEX_SYSTEM_RULES}` },
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
				meta: { courseId, volumeId, moduleId, level, year }
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
			const { courseId, volumeId, moduleId, level, year } = meta || {};
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
