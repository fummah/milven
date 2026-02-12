import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

const BASE_ROLES = ['ADMIN', 'STUDENT'];

export function rolesRouter(prisma) {
  const router = Router();

  // List roles (base + custom)
  router.get('/', requireAuth(), requireRole('ADMIN'), async (_req, res) => {
    const custom = await prisma.customRole.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true, createdAt: true }
    });
    const roles = [
      ...BASE_ROLES.map(r => ({ key: r, name: r, type: 'BASE' })),
      ...custom.map(r => ({ key: `custom:${r.id}`, name: r.name, type: 'CUSTOM', id: r.id, description: r.description }))
    ];
    return res.json({ roles });
  });

  // Create custom role
  router.post('/', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const schema = z.object({ name: z.string().min(2), description: z.string().optional() });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const role = await prisma.customRole.create({ data: parse.data });
    return res.status(201).json({ role });
  });

  // Update custom role
  router.put('/custom/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const schema = z.object({ name: z.string().min(2), description: z.string().optional() });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const role = await prisma.customRole.update({ where: { id }, data: parse.data });
    return res.json({ role });
  });

  // Delete custom role
  router.delete('/custom/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    // Set users with this custom role to null first (FK is ON DELETE SET NULL but we can be explicit)
    await prisma.user.updateMany({ where: { customRoleId: id }, data: { customRoleId: null } });
    await prisma.customRole.delete({ where: { id } });
    return res.json({ ok: true });
  });

  // List permissions for a roleKey
  router.get('/:roleKey/permissions', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const roleKey = req.params.roleKey;
    const perms = await prisma.rolePermission.findMany({
      where: { roleKey },
      orderBy: { permission: 'asc' }
    });
    return res.json({ permissions: perms });
  });

  // Set permission allowed flag
  router.put('/:roleKey/permissions', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const schema = z.object({ permission: z.string().min(2), allowed: z.boolean() });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const { permission, allowed } = parse.data;
    const roleKey = req.params.roleKey;
    const rec = await prisma.rolePermission.upsert({
      where: { roleKey_permission: { roleKey, permission } },
      create: { roleKey, permission, allowed },
      update: { allowed }
    });
    return res.json({ permission: rec });
  });

  return router;
}

