import { Router } from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { getOpenAIApiKey } from '../lib/openai.js';

export function moduleNotesRouter(prisma) {
	const router = Router();

	const defaultInclude = {
		course: { select: { id: true, name: true, level: true } },
		volume: { select: { id: true, name: true } },
		module: { select: { id: true, name: true } },
		topic: { select: { id: true, name: true } },
	};

	const noteSchema = z.object({
		title: z.string().min(1),
		level: z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3']),
		courseId: z.string().optional().nullable(),
		volumeId: z.string().optional().nullable(),
		moduleId: z.string().optional().nullable(),
		topicId: z.string().optional().nullable(),
		year: z.number().int().optional().default(2026),
		studyTime: z.string().optional().nullable(),
		difficulty: z.string().optional().nullable(),
		calculatorUse: z.string().optional().nullable(),
		overview: z.string().optional().nullable(),
		losStatements: z.any().optional().nullable(),
		concepts: z.any().optional().nullable(),
		moduleSummary: z.string().optional().nullable(),
		formulaRecap: z.any().optional().nullable(),
		practiceSet: z.any().optional().nullable(),
		workedSolutions: z.any().optional().nullable(),
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
					{ overview: { contains: search, mode: 'insensitive' } },
				];
			}

			const pageNum = Math.max(1, Number(page) || 1);
			const pageSize = Math.min(200, Math.max(1, Number(limit) || 25));
			const skip = (pageNum - 1) * pageSize;

			const [notes, total] = await Promise.all([
				prisma.moduleNote.findMany({
					where,
					include: defaultInclude,
					orderBy: [{ order: 'asc' }, { title: 'asc' }],
					skip,
					take: pageSize,
				}),
				prisma.moduleNote.count({ where }),
			]);

			return res.json({ notes, total, page: pageNum, limit: pageSize });
		} catch (err) {
			console.error('[moduleNotes.list]', err);
			return res.status(500).json({ error: 'Failed to list module notes' });
		}
	});

	// ─── GET ONE ──────────────────────────────────────────────
	router.get('/:id', async (req, res) => {
		try {
			const note = await prisma.moduleNote.findUnique({
				where: { id: req.params.id },
				include: defaultInclude,
			});
			if (!note) return res.status(404).json({ error: 'Module note not found' });
			return res.json({ note });
		} catch (err) {
			console.error('[moduleNotes.get]', err);
			return res.status(500).json({ error: 'Failed to fetch module note' });
		}
	});

	// ─── CREATE (Admin only) ─────────────────────────────────
	router.post('/', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const data = noteSchema.parse(req.body);
			const note = await prisma.moduleNote.create({ data, include: defaultInclude });
			return res.status(201).json({ note });
		} catch (err) {
			if (err?.name === 'ZodError') return res.status(400).json({ error: 'Validation failed', details: err.errors });
			console.error('[moduleNotes.create]', err);
			return res.status(500).json({ error: 'Failed to create module note' });
		}
	});

	// ─── UPDATE (Admin only) ─────────────────────────────────
	router.put('/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const data = noteSchema.partial().parse(req.body);
			const note = await prisma.moduleNote.update({ where: { id: req.params.id }, data, include: defaultInclude });
			return res.json({ note });
		} catch (err) {
			if (err?.name === 'ZodError') return res.status(400).json({ error: 'Validation failed', details: err.errors });
			if (err?.code === 'P2025') return res.status(404).json({ error: 'Module note not found' });
			console.error('[moduleNotes.update]', err);
			return res.status(500).json({ error: 'Failed to update module note' });
		}
	});

	// ─── DELETE (Admin only) ─────────────────────────────────
	router.delete('/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			await prisma.moduleNote.delete({ where: { id: req.params.id } });
			return res.json({ success: true });
		} catch (err) {
			if (err?.code === 'P2025') return res.status(404).json({ error: 'Module note not found' });
			console.error('[moduleNotes.delete]', err);
			return res.status(500).json({ error: 'Failed to delete module note' });
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
			if (volumeId) { const v = await prisma.volume.findUnique({ where: { id: volumeId }, select: { name: true } }); if (v) volumeName = v.name; }
			if (moduleId) { const m = await prisma.module.findUnique({ where: { id: moduleId }, select: { name: true } }); if (m) moduleName = m.name; }
			if (topicId) { const t = await prisma.topic.findUnique({ where: { id: topicId }, select: { name: true } }); if (t) topicName = t.name; topicNames = [topicName]; }
			else {
				const topicWhere = { courseId };
				if (moduleId) topicWhere.moduleId = moduleId;
				else if (volumeId) topicWhere.module = { volumeId };
				const resolvedTopics = await prisma.topic.findMany({ where: topicWhere, select: { name: true }, orderBy: { order: 'asc' }, take: 50 });
				topicNames = resolvedTopics.map(t => t.name);
			}

			// Auto-detect count: if moduleId given, 1 note for that module; if volumeId, count modules in volume; else count modules in course
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
						// Topic-aware extraction: find windows mentioning the topic/module
						const keywords = [topicName, moduleName].filter(Boolean)
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
				`Course: ${course.name}`, `CFA Level: ${levelLabel}`,
				volumeName ? `Volume: ${volumeName}` : null,
				moduleName ? `Learning Module: ${moduleName}` : null,
				topicName ? `Topic: ${topicName}` : null,
			].filter(Boolean).join('\n');

			const curriculumSection = curriculumExcerpt
				? `\n\nCURRICULUM REFERENCE MATERIAL (use this as the primary source — reference exact LOS, formulas, and page numbers from the document):\n---\n${curriculumExcerpt}\n---\n`
				: '';

			const topicContext = topicNames.length > 0 ? `\nTopics to cover: ${topicNames.join(', ')}` : '';

			const prompt = `You are a senior CFA curriculum expert at Milven Finance School. Generate ${count} complete CFA Learning Module Note(s) in JSON format following the Milven Design Guide.

Each module note is a premium, exam-focused learning document equivalent to 10-15 printed pages per learning module. It must provide COMPREHENSIVE coverage of ALL topics within the module, including every formula, key concept, definition, and worked example.

${hierarchyContext}
Year: ${year}${topicContext}
${curriculumSection}
CRITICAL REQUIREMENTS:
- Each module note MUST be equivalent to 10-15 printed pages of content
- Cover ALL topics within the learning module — do not skip or summarize away any topic
- Include EVERY formula that appears in the module with correct superscript/subscript notation
- Ensure all key concepts, definitions, and relationships are thoroughly explained
- Use the uploaded curriculum document as the PRIMARY source for accuracy

For each module note, generate ALL sections:

1. "title" — Learning Module title
2. "studyTime" — estimated study time (e.g. "2.5 hours")
3. "difficulty" — "Foundational", "Intermediate", or "Advanced"
4. "calculatorUse" — "Minimal", "Moderate", or "Heavy"
5. "overview" — 2-4 sentences on why this module matters and what success looks like
6. "losStatements" — array of ALL Learning Outcome Statements for this module:
   [{"ref": "LOS 1", "statement": "...", "commandWord": "Calculate / Interpret"}]
7. "concepts" — array of concept pages (6-12 per module for comprehensive coverage):
   [{"title": "...", "meaning": "plain-English meaning", "explanation": "detailed core explanation covering all nuances", "formula": "exact equation with rich notation", "formulaVariables": "variable definitions", "interpretation": "link to valuation/performance", "workedExample": {"given": "...", "required": "...", "solution": "step-by-step solution", "conclusion": "..."}, "examTip": "...", "commonMistake": "..."}]
   * Use _ for subscripts, ^ for superscripts, Greek letter names
   * If a concept has no formula, set formula and formulaVariables to null
   * EVERY topic within the module must have at least one concept page
8. "moduleSummary" — key ideas, must-know distinctions, exam traps, memory triggers (3-5 paragraphs)
9. "formulaRecap" — compact list of ALL formulas in the module: [{"name": "...", "formula": "...", "variables": "..."}]
10. "practiceSet" — 5-8 exam-style questions covering different topics: [{"question": "...", "losRef": "LOS 1"}]
11. "workedSolutions" — solutions for practice set: [{"question": "...", "answer": "...", "method": "...", "interpretation": "...", "trap": "..."}]
12. "revisionCheck" — self-check items covering every key concept: [{"item": "..."}]

IMPORTANT:
- All content must be accurate CFA curriculum material sourced from the curriculum document
- Every concept page follows the same rhythm: title, meaning, explanation, formula, interpretation, worked example, exam tip, common mistake
- Formulas MUST use rich notation preserving exact subscripts (_), superscripts (^), and Greek letters from the curriculum
- Worked examples must be complete with given, required, step-by-step solution, and conclusion
- Maximize quality and completeness — this is premium study material

Return JSON:
{
  "notes": [
    {
      "title": "string",
      "studyTime": "string",
      "difficulty": "string",
      "calculatorUse": "string",
      "overview": "string",
      "losStatements": [...],
      "concepts": [...],
      "moduleSummary": "string",
      "formulaRecap": [...],
      "practiceSet": [...],
      "workedSolutions": [...],
      "revisionCheck": [...]
    }
  ]
}

Generate exactly ${count} module note(s). Return ONLY valid JSON.`;

			const openai = new OpenAI({ apiKey });

			// gpt-4o-mini supports max 16384 completion tokens
			// For multiple notes, generate one at a time for best quality
			let items = [];
			const notesToGenerate = Math.min(count, 20);

			for (let i = 0; i < notesToGenerate; i++) {
				const singlePrompt = notesToGenerate === 1 ? prompt : prompt.replace(
					`Generate exactly ${count} module note(s).`,
					`Generate exactly 1 module note (note ${i + 1} of ${notesToGenerate} — cover a DIFFERENT module/topic than previous ones).`
				);

				const completion = await openai.chat.completions.create({
					model: 'gpt-4o-mini',
					messages: [
						{ role: 'system', content: 'You are an expert CFA curriculum author. Always return valid JSON only. Generate comprehensive, detailed content.' },
						{ role: 'user', content: notesToGenerate === 1 ? prompt : singlePrompt }
					],
					temperature: 0.7,
					max_tokens: 16384,
					response_format: { type: 'json_object' }
				});

				const raw = completion.choices?.[0]?.message?.content?.trim() || '{}';
				try {
					const parsed = JSON.parse(raw);
					const noteItems = Array.isArray(parsed.notes) ? parsed.notes : (Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed) ? parsed : [parsed]));
					items.push(...noteItems);
				} catch {
					if (items.length === 0) return res.status(502).json({ error: 'AI returned invalid JSON' });
				}

				// If generating just 1, no need to loop
				if (notesToGenerate === 1) break;
			}
			if (!items.length) return res.status(502).json({ error: 'AI returned no module notes' });

			return res.json({
				generated: { items },
				meta: { courseId, volumeId, moduleId, topicId, level, year }
			});
		} catch (err) {
			const msg = err?.error?.message || err?.message || 'OpenAI request failed';
			console.error('[moduleNotes.generate-ai.preview]', msg);
			return res.status(502).json({ error: msg });
		}
	});

	// ─── AI GENERATE ACCEPT (Admin only) ─────────────────────
	router.post('/generate-ai/accept', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const { generated, meta, selectedIndices } = req.body;
			if (!generated?.items || !Array.isArray(generated.items)) return res.status(400).json({ error: 'Missing generated items' });
			if (!Array.isArray(selectedIndices) || selectedIndices.length === 0) return res.status(400).json({ error: 'No notes selected' });
			const { courseId, volumeId, moduleId, topicId, level, year } = meta || {};
			if (!courseId || !level) return res.status(400).json({ error: 'Missing meta (courseId, level)' });

			const created = [];
			for (const idx of selectedIndices) {
				const item = generated.items[idx];
				if (!item) continue;
				try {
					const note = await prisma.moduleNote.create({
						data: {
							title: String(item.title || `Module Note ${idx + 1}`).slice(0, 255),
							level, courseId, volumeId: volumeId || null, moduleId: moduleId || null, topicId: topicId || null,
							year: year || 2026,
							studyTime: item.studyTime || null,
							difficulty: item.difficulty || null,
							calculatorUse: item.calculatorUse || null,
							overview: item.overview || null,
							losStatements: item.losStatements || null,
							concepts: item.concepts || null,
							moduleSummary: item.moduleSummary || null,
							formulaRecap: item.formulaRecap || null,
							practiceSet: item.practiceSet || null,
							workedSolutions: item.workedSolutions || null,
							revisionCheck: item.revisionCheck || null,
							order: idx + 1,
							status: 'DRAFT',
						},
						include: defaultInclude,
					});
					created.push(note);
				} catch (saveErr) {
					console.error(`[moduleNotes.generate-ai.accept] Failed to save note ${idx}:`, saveErr?.message);
				}
			}
			return res.status(201).json({ created: created.length, notes: created });
		} catch (err) {
			console.error('[moduleNotes.generate-ai.accept]', err);
			return res.status(500).json({ error: 'Failed to accept module notes' });
		}
	});

	return router;
}
