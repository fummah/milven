import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { createMcpTokenValue, MCP_SCOPES, normalizeScopes } from '../lib/mcp/tokenAuth.js';
import { auditMcpAction } from '../lib/questions/questionReview.js';
import {
	approveReviewBatch,
	cancelReviewBatch,
	commitApprovedBatch,
	getReviewBatch,
	listReviewBatches,
	rejectReviewBatch,
	updateReviewItem
} from '../lib/questions/questionReview.js';

export function mcpAdminRouter(prisma) {
	const router = Router();

	router.use(requireAuth(), requireRole('ADMIN'));

	router.get('/scopes', (_req, res) => res.json({ scopes: MCP_SCOPES }));

	router.get('/tokens', async (_req, res) => {
		const tokens = await prisma.mcpApiToken.findMany({
			orderBy: { createdAt: 'desc' },
			select: {
				id: true,
				name: true,
				tokenPrefix: true,
				scopes: true,
				expiresAt: true,
				lastUsedAt: true,
				revokedAt: true,
				createdAt: true,
				user: { select: { id: true, email: true } }
			}
		});
		return res.json({ tokens });
	});

	router.post('/tokens', async (req, res) => {
		const schema = z.object({
			name: z.string().min(2).max(120),
			scopes: z.array(z.enum(MCP_SCOPES)).optional(),
			expiresInDays: z.number().int().min(1).max(365).optional()
		});
		const parsed = schema.safeParse(req.body);
		if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
		const token = createMcpTokenValue();
		const scopes = normalizeScopes(parsed.data.scopes && parsed.data.scopes.length ? parsed.data.scopes : MCP_SCOPES);
		if (!scopes.length) return res.status(400).json({ error: 'At least one valid scope is required.' });
		const expiresAt = parsed.data.expiresInDays ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000) : null;
		const record = await prisma.mcpApiToken.create({
			data: {
				name: parsed.data.name,
				tokenHash: token.tokenHash,
				tokenPrefix: token.tokenPrefix,
				userId: req.user.id,
				scopes,
				expiresAt
			},
			select: { id: true, name: true, tokenPrefix: true, scopes: true, expiresAt: true, createdAt: true }
		});
		await auditMcpAction(prisma, { action: 'TOKEN_CREATED', actorId: req.user.id, detail: { tokenId: record.id, scopes, expiresAt } });
		return res.status(201).json({
			token: record,
			secret: token.value,
			warning: 'Copy this token now. It is shown only once.'
		});
	});

	router.delete('/tokens/:id', async (req, res) => {
		const existing = await prisma.mcpApiToken.findUnique({ where: { id: req.params.id } });
		if (!existing) return res.status(404).json({ error: 'Token not found.' });
		const token = await prisma.mcpApiToken.update({
			where: { id: req.params.id },
			data: { revokedAt: new Date() },
			select: { id: true, name: true, revokedAt: true }
		});
		await auditMcpAction(prisma, { action: 'TOKEN_REVOKED', actorId: req.user.id, detail: { tokenId: token.id } });
		return res.json({ token });
	});

	router.get('/imports', async (req, res) => {
		const data = await listReviewBatches(prisma, {
			status: req.query.status ? String(req.query.status) : undefined,
			page: req.query.page,
			limit: req.query.limit
		});
		return res.json(data);
	});

	router.get('/imports/:id', async (req, res) => {
		const batch = await getReviewBatch(prisma, req.params.id);
		if (!batch) return res.status(404).json({ error: 'Import batch not found.' });
		return res.json({ batch });
	});

	router.put('/imports/:batchId/items/:itemId', async (req, res) => {
		const result = await updateReviewItem(prisma, req.params.batchId, req.params.itemId, req.body?.question || req.body, {
			actorId: req.user.id,
			tokenId: null
		});
		if (!result.ok) return res.status(result.statusCode || 400).json(result);
		return res.json(result);
	});

	router.post('/imports/:id/approve', async (req, res) => {
		const result = await approveReviewBatch(prisma, req.params.id, { actorId: req.user.id });
		if (!result.ok) return res.status(result.statusCode || 409).json(result);
		return res.json(result);
	});

	router.post('/imports/:id/reject', async (req, res) => {
		const result = await rejectReviewBatch(prisma, req.params.id, {
			actorId: req.user.id,
			reason: req.body?.reason
		});
		if (!result.ok) return res.status(result.statusCode || 409).json(result);
		return res.json(result);
	});

	router.post('/imports/:id/cancel', async (req, res) => {
		const result = await cancelReviewBatch(prisma, req.params.id, { actorId: req.user.id });
		if (!result.ok) return res.status(result.statusCode || 409).json(result);
		return res.json(result);
	});

	router.post('/imports/:id/commit', async (req, res) => {
		const result = await commitApprovedBatch(prisma, req.params.id, { actorId: req.user.id });
		if (!result.ok && !result.partial) return res.status(result.statusCode || 409).json(result);
		return res.status(result.partial ? 207 : 200).json(result);
	});

	return router;
}
