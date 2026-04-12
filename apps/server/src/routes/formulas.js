import { Router } from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { getOpenAIApiKey } from '../lib/openai.js';

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
	router.post('/generate-ai/preview', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			courseId: z.string(),
			volumeId: z.string().optional().nullable(),
			moduleId: z.string().optional().nullable(),
			topicId: z.string().optional().nullable(),
			level: z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3']),
			year: z.coerce.number().int().optional().default(2026),
			count: z.coerce.number().int().min(1).max(20).optional().default(5),
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });

		const { courseId, volumeId, moduleId, topicId, level, year, count } = parse.data;

		const apiKey = await getOpenAIApiKey(prisma);
		if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY in .env or in Admin Settings.' });

		try {
			const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, level: true } });
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
			const effectiveVolumeId = volumeId || null;
			if (effectiveVolumeId) {
				const currDoc = await prisma.curriculumDocument.findUnique({
					where: { courseId_volumeId: { courseId, volumeId: effectiveVolumeId } },
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
				? `\n\nCURRICULUM REFERENCE MATERIAL (use this to derive accurate formulas, variable definitions, and exam context):\n---\n${curriculumExcerpt}\n---\n`
				: '';

			const prompt = `You are a senior CFA curriculum expert and formula book author at Milven Finance School. Generate ${count} professional, exam-quality formula cards in JSON format.

Each formula card is used in a premium CFA Formula Book. Every field must be populated with accurate, useful content. Draw from actual CFA curriculum material, financial theory, and exam patterns.

${hierarchyContext}
Year: ${year}
${curriculumSection}
IMPORTANT RULES:
- Each formula must be a REAL, commonly tested formula for this topic area in the CFA curriculum
- The "formula" field must be the exact mathematical equation using RICH NOTATION:
  * Use _ for subscripts: P_0, r_d, w_{equity}, CF_t
  * Use ^ for superscripts/exponents: (1+r)^n, x^2, e^{-rT}
  * Use (numerator) / (denominator) for fractions: (P_1 - P_0 + D_1) / (P_0)
  * Use Greek letter names: sigma, beta, alpha, mu, rho, delta, lambda, pi, theta, epsilon, tau
  * Use sqrt(x) for square roots
  * Use * for multiplication where explicit multiply sign is needed
- "variables" must define EVERY symbol in the formula clearly
- "interpretation" must explain what the formula measures or means in plain English
- "whenToUse" must describe the specific exam scenario where this formula applies
- "watchOut" must highlight a common mistake or trap that students fall into
- "calculatorCue" should provide TI BA II Plus keystrokes or calculator tips (if applicable, otherwise null)
- "losTag" should reference the specific CFA Learning Outcome Statement
- "highYield" should be true if this formula is very frequently tested on CFA exams
- Do NOT duplicate formulas — each must be unique and cover a different concept within the topic area
- Order formulas logically (foundational concepts first, then build complexity)

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
      "order": number
    }
  ]
}

Generate exactly ${count} formula cards. Return ONLY valid JSON.`;

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
				items = Array.isArray(parsed.formulas) ? parsed.formulas : (Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []));
			} catch {
				return res.status(502).json({ error: 'AI returned invalid JSON' });
			}

			if (!items.length) return res.status(502).json({ error: 'AI returned no formulas' });

			// Return formulas for preview — do NOT save yet
			const previewItems = items.map((item, i) => ({
				name: String(item.name || `Formula ${i + 1}`).slice(0, 255),
				formula: String(item.formula || ''),
				variables: String(item.variables || ''),
				interpretation: String(item.interpretation || ''),
				whenToUse: String(item.whenToUse || ''),
				watchOut: String(item.watchOut || ''),
				calculatorCue: item.calculatorCue || null,
				losTag: item.losTag || null,
				highYield: !!item.highYield,
				order: item.order || (i + 1),
			}));

			return res.json({
				generated: { items: previewItems },
				meta: { courseId, volumeId, moduleId, topicId, level, year }
			});
		} catch (err) {
			const msg = err?.error?.message || err?.message || 'OpenAI request failed';
			console.error('[formulas.generate-ai.preview]', msg);
			return res.status(502).json({ error: msg });
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
							level,
							courseId,
							volumeId: volumeId || null,
							moduleId: moduleId || null,
							topicId: topicId || null,
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
			count: z.coerce.number().int().min(1).max(20).optional().default(5),
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });

		const { courseId, volumeId, moduleId, topicId, level, year, count } = parse.data;

		const apiKey = await getOpenAIApiKey(prisma);
		if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY in .env or in Admin Settings.' });

		try {
			// Resolve hierarchy names for prompt context
			const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, level: true } });
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
				// Auto-resolve topics within the selected hierarchy
				const topicWhere = { courseId };
				if (moduleId) topicWhere.moduleId = moduleId;
				else if (volumeId) topicWhere.module = { volumeId };
				const resolvedTopics = await prisma.topic.findMany({ where: topicWhere, select: { id: true, name: true }, orderBy: { order: 'asc' }, take: 20 });
				topicNames = resolvedTopics.map(t => t.name);
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
					// Take a relevant portion (max 12000 chars)
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
				? `\n\nCURRICULUM REFERENCE MATERIAL (use this to derive accurate formulas, variable definitions, and exam context):\n---\n${curriculumExcerpt}\n---\n`
				: '';

			const prompt = `You are a senior CFA curriculum expert and formula book author at Milven Finance School. Generate ${count} professional, exam-quality formula cards in JSON format.

Each formula card is used in a premium CFA Formula Book. Every field must be populated with accurate, useful content. Draw from actual CFA curriculum material, financial theory, and exam patterns.

${hierarchyContext}
Year: ${year}
${curriculumSection}
IMPORTANT RULES:
- Each formula must be a REAL, commonly tested formula for this topic area in the CFA curriculum
- The "formula" field must be the exact mathematical equation using RICH NOTATION:
  * Use _ for subscripts: P_0, r_d, w_{equity}, CF_t
  * Use ^ for superscripts/exponents: (1+r)^n, x^2, e^{-rT}
  * Use (numerator) / (denominator) for fractions: (P_1 - P_0 + D_1) / (P_0)
  * Use Greek letter names: sigma, beta, alpha, mu, rho, delta, lambda, pi, theta, epsilon, tau
  * Use sqrt(x) for square roots
  * Use * for multiplication where explicit multiply sign is needed
  * Example: WACC = w_d * r_d * (1 - t) + w_e * r_e
  * Example: PV = (CF_1) / ((1 + r)^1) + (CF_2) / ((1 + r)^2)
  * Example: sigma_p = sqrt(w_1^2 * sigma_1^2 + w_2^2 * sigma_2^2 + 2 * w_1 * w_2 * rho_{12} * sigma_1 * sigma_2)
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
      "order": number (starting from 1)
    }
  ]
}

Generate exactly ${count} formula cards. Return ONLY valid JSON.`;

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
				items = Array.isArray(parsed.formulas) ? parsed.formulas : (Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []));
			} catch {
				return res.status(502).json({ error: 'AI returned invalid JSON' });
			}

			if (!items.length) return res.status(502).json({ error: 'AI returned no formulas' });

			// Save each formula to the database
			const created = [];
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				try {
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
							level,
							courseId,
							volumeId: volumeId || null,
							moduleId: moduleId || null,
							topicId: topicId || null,
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
