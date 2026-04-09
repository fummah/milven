import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

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
