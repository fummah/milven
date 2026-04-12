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
			count: z.coerce.number().int().min(1).max(5).optional().default(1),
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });

		const { courseId, volumeId, moduleId, topicId, level, year, count } = parse.data;

		const apiKey = await getOpenAIApiKey(prisma);
		if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured.' });

		try {
			const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true } });
			if (!course) return res.status(400).json({ error: 'Course not found' });

			let volumeName = null, moduleName = null, topicName = null;
			if (volumeId) { const v = await prisma.volume.findUnique({ where: { id: volumeId }, select: { name: true } }); if (v) volumeName = v.name; }
			if (moduleId) { const m = await prisma.module.findUnique({ where: { id: moduleId }, select: { name: true } }); if (m) moduleName = m.name; }
			if (topicId) { const t = await prisma.topic.findUnique({ where: { id: topicId }, select: { name: true } }); if (t) topicName = t.name; }

			let curriculumExcerpt = '';
			if (volumeId) {
				const currDoc = await prisma.curriculumDocument.findUnique({
					where: { courseId_volumeId: { courseId, volumeId } },
					select: { extractedText: true }
				});
				if (currDoc?.extractedText) {
					curriculumExcerpt = currDoc.extractedText.length > 15000 ? currDoc.extractedText.slice(0, 15000) : currDoc.extractedText;
				}
			}

			const levelLabel = level.replace('LEVEL', 'Level ');
			const hierarchyContext = [
				`Course: ${course.name}`, `CFA Level: ${levelLabel}`,
				volumeName ? `Volume: ${volumeName}` : null,
				moduleName ? `Learning Module: ${moduleName}` : null,
				topicName ? `Topic: ${topicName}` : null,
			].filter(Boolean).join('\n');

			const curriculumSection = curriculumExcerpt ? `\n\nCURRICULUM REFERENCE MATERIAL:\n---\n${curriculumExcerpt}\n---\n` : '';

			const prompt = `You are a senior CFA curriculum expert at Milven Finance School. Generate ${count} complete CFA Learning Module Note(s) in JSON format following the Milven Design Guide.

Each module note is a premium, exam-focused learning document that covers a full Learning Module with concept explanations, formulas, worked examples, exam tips, and practice.

${hierarchyContext}
Year: ${year}
${curriculumSection}
For each module note, generate ALL sections:

1. "title" — Learning Module title
2. "studyTime" — estimated study time (e.g. "2.5 hours")
3. "difficulty" — "Foundational", "Intermediate", or "Advanced"
4. "calculatorUse" — "Minimal", "Moderate", or "Heavy"
5. "overview" — 2-4 sentences on why this module matters and what success looks like
6. "losStatements" — array of Learning Outcome Statements:
   [{"ref": "LOS 1", "statement": "...", "commandWord": "Calculate / Interpret"}]
7. "concepts" — array of concept pages (3-6 per module):
   [{"title": "...", "meaning": "plain-English meaning", "explanation": "core explanation", "formula": "exact equation with rich notation", "formulaVariables": "variable definitions", "interpretation": "link to valuation/performance", "workedExample": {"given": "...", "required": "...", "solution": "...", "conclusion": "..."}, "examTip": "...", "commonMistake": "..."}]
   * Use _ for subscripts, ^ for superscripts, Greek letter names
   * If a concept has no formula, set formula and formulaVariables to null
8. "moduleSummary" — key ideas, must-know distinctions, exam traps, memory triggers (2-4 paragraphs)
9. "formulaRecap" — compact list of all formulas: [{"name": "...", "formula": "...", "variables": "..."}]
10. "practiceSet" — 3-5 exam-style questions: [{"question": "...", "losRef": "LOS 1"}]
11. "workedSolutions" — solutions for practice set: [{"question": "...", "answer": "...", "method": "...", "interpretation": "...", "trap": "..."}]
12. "revisionCheck" — self-check items: [{"item": "..."}]

IMPORTANT:
- All content must be accurate CFA curriculum material
- Every concept page follows the same rhythm: title, meaning, explanation, formula, interpretation, worked example, exam tip, common mistake
- Formulas use rich notation (subscripts, superscripts, Greek letters)
- Worked examples must be complete with given, required, solution, and conclusion
- Keep content exam-focused and concise

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
			const completion = await openai.chat.completions.create({
				model: 'gpt-4o-mini',
				messages: [
					{ role: 'system', content: 'You are an expert CFA curriculum author. Always return valid JSON only.' },
					{ role: 'user', content: prompt }
				],
				temperature: 0.7,
				max_tokens: 16000,
				response_format: { type: 'json_object' }
			});

			const raw = completion.choices?.[0]?.message?.content?.trim() || '{}';
			let items = [];
			try {
				const parsed = JSON.parse(raw);
				items = Array.isArray(parsed.notes) ? parsed.notes : (Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []));
			} catch {
				return res.status(502).json({ error: 'AI returned invalid JSON' });
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
