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
			count: z.coerce.number().int().min(1).max(10).optional().default(1),
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
				const resolvedTopics = await prisma.topic.findMany({ where: topicWhere, select: { id: true, name: true }, orderBy: { order: 'asc' }, take: 20 });
				topicNames = resolvedTopics.map(t => t.name);
			}

			let curriculumExcerpt = '';
			if (volumeId) {
				const currDoc = await prisma.curriculumDocument.findUnique({
					where: { courseId_volumeId: { courseId, volumeId } },
					select: { extractedText: true }
				});
				if (currDoc?.extractedText) {
					const text = currDoc.extractedText;
					curriculumExcerpt = text.length > 12000 ? text.slice(0, 12000) : text;
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
				? `\n\nCURRICULUM REFERENCE MATERIAL:\n---\n${curriculumExcerpt}\n---\n`
				: '';

			const prompt = `You are a senior CFA curriculum expert at Milven Finance School. Generate ${count} CFA Summary Sheet(s) in JSON format following the Milven Summary Sheet Master standard.

Each summary sheet is a high-impact, exam-focused revision sheet that compresses curriculum into a scannable, memorable format. It should work as a printable handout, quick digital revision sheet, and visual companion.

${hierarchyContext}
Year: ${year}
${curriculumSection}
For each summary sheet, generate ALL of these sections:

1. "title" — descriptive title for the learning module/topic
2. "snapshot" — what this sheet covers in 2-4 lines (what it helps you remember, why it matters)
3. "useCase" — primary use cases (e.g. "final review, tutor recap, formula refresh")
4. "coreDefinitions" — array of 5-10 key definitions in exam language: [{"term": "...", "definition": "..."}]
5. "formulas" — array of essential formulas: [{"formula": "...", "variables": "...", "whenToUse": "..."}]
   * Use rich notation: subscripts (_), superscripts (^), Greek letters (sigma, beta, etc.)
6. "distinctions" — array comparing look-alike concepts: [{"left": "...", "right": "...", "difference": "..."}]
   * e.g. money-weighted vs time-weighted return; Type I vs Type II error
7. "examTraps" — array of common exam traps: [{"trap": "..."}]
   * What candidates confuse, omit, or misread
8. "memoryHooks" — array of short memory cues: [{"hook": "..."}]
   * e.g. "manager skill = TWRR" or "spot + rate differential → forward"
9. "quickDrills" — array of 2-5 fast recall/calculation questions: [{"question": "..."}]
10. "revisionCheck" — array of self-check items: [{"item": "..."}]
    * e.g. "I know the core formulas", "I can explain each metric"

IMPORTANT:
- Every section must be populated with accurate, exam-relevant CFA content
- Definitions should be precise and exam-language ready
- Formulas must be real CFA curriculum formulas
- Distinctions should cover commonly confused concepts
- Traps should reflect actual exam mistakes
- Keep everything concise — this is for speed and retention, not full explanation

Return a JSON object:
{
  "sheets": [
    {
      "title": "string",
      "snapshot": "string",
      "useCase": "string",
      "coreDefinitions": [{"term": "string", "definition": "string"}],
      "formulas": [{"formula": "string", "variables": "string", "whenToUse": "string"}],
      "distinctions": [{"left": "string", "right": "string", "difference": "string"}],
      "examTraps": [{"trap": "string"}],
      "memoryHooks": [{"hook": "string"}],
      "quickDrills": [{"question": "string"}],
      "revisionCheck": [{"item": "string"}]
    }
  ]
}

Generate exactly ${count} summary sheet(s). Return ONLY valid JSON.`;

			const openai = new OpenAI({ apiKey });
			const completion = await openai.chat.completions.create({
				model: 'gpt-4o-mini',
				messages: [
					{ role: 'system', content: 'You are an expert CFA curriculum author. Always return valid JSON only.' },
					{ role: 'user', content: prompt }
				],
				temperature: 0.7,
				response_format: { type: 'json_object' }
			});

			const raw = completion.choices?.[0]?.message?.content?.trim() || '{}';
			let items = [];
			try {
				const parsed = JSON.parse(raw);
				items = Array.isArray(parsed.sheets) ? parsed.sheets : (Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []));
			} catch {
				return res.status(502).json({ error: 'AI returned invalid JSON' });
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
