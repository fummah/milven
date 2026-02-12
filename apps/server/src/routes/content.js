import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';

export function contentRouter(prisma) {
	const router = Router();

	router.get('/videos', requireAuth(), requireActiveSubscription(prisma), async (_req, res) => {
		const videos = await prisma.video.findMany({ orderBy: { createdAt: 'desc' } });
		return res.json({ videos });
	});

	router.post('/videos', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			title: z.string().min(3),
			url: z.string().url(),
			level: z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3']),
			topicId: z.string().optional(),
			durationSec: z.number().int().positive().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const video = await prisma.video.create({ data: parse.data });
		return res.status(201).json({ video });
	});

	router.get('/videos/:id/progress', requireAuth(), requireActiveSubscription(prisma), async (req, res) => {
		const { id } = req.params;
		const progress = await prisma.videoProgress.findFirst({
			where: { userId: req.user.id, videoId: id }
		});
		return res.json({ progress });
	});

	router.post('/videos/:id/progress', requireAuth(), requireActiveSubscription(prisma), async (req, res) => {
		const { id } = req.params;
		const schema = z.object({ positionSec: z.number().int().nonnegative(), completed: z.boolean().optional() });
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const updated = await prisma.videoProgress.upsert({
			where: { userId_videoId: { userId: req.user.id, videoId: id } },
			update: { positionSec: parse.data.positionSec, completed: parse.data.completed ?? false },
			create: { userId: req.user.id, videoId: id, positionSec: parse.data.positionSec, completed: parse.data.completed ?? false }
		});
		return res.json({ progress: updated });
	});

	return router;
}


