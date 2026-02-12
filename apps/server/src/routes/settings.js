import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

export function settingsRouter(prisma) {
  const router = Router();

  // Public: get FAQ for header / explore (no auth)
  router.get('/faq', async (_req, res) => {
    try {
      const row = await prisma.systemSetting.findUnique({
        where: { key: 'faq.items' }
      });
      const faq = Array.isArray(row?.value) ? row.value : [];
      return res.json({ faq });
    } catch {
      return res.json({ faq: [] });
    }
  });

  // List all settings (admin)
  router.get('/', requireAuth(), requireRole('ADMIN'), async (_req, res) => {
    const rows = await prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
    const map = {};
    for (const r of rows) map[r.key] = r.value ?? null;
    // computed, readonly info
    map.__meta = {
      stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
      webhookConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
      brandDefault: { name: 'MILVEN FINANCE SCHOOL', color: '#102540' }
    };
    res.json({ settings: map });
  });

  // Upsert multiple settings
  router.put('/', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const payload = req.body || {};
    const allowedKeys = [
      'brand.name',
      'brand.primaryColor',
      'brand.logoUrl',
      'payments.stripe.publishableKey',
      'payments.useStripe',
      'auth.allowRegistration',
      'auth.requireEmailVerification',
      'learning.progress.heartbeatSec',
      'learning.topic.gate.require100',
      'exams.default.timeLimitMinutes',
      'exams.requireSubscription',
      'system.supportEmail',
      'system.uploadMaxSizeMb',
      'faq.items'
    ];
    const entries = Object.entries(payload).filter(([k]) => allowedKeys.includes(k));
    const ops = entries.map(([key, value]) =>
      prisma.systemSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value }
      })
    );
    await prisma.$transaction(ops);
    res.json({ ok: true });
  });

  return router;
}

