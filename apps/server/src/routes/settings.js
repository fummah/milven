import { Router } from 'express';
import OpenAI from 'openai';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { getOpenAIApiKey } from '../lib/openai.js';

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
      'faq.items',
      'openai_api_key'
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

  // List available OpenAI models for the configured API key
  router.get('/openai-models', requireAuth(), requireRole('ADMIN'), async (_req, res) => {
    try {
      const apiKey = await getOpenAIApiKey(prisma);
      if (!apiKey) return res.status(400).json({ error: 'No OpenAI API key configured. Set one in .env or in the AI settings tab.' });
      const openai = new OpenAI({ apiKey });
      // Collect all pages from the async iterable
      const all = [];
      const list = await openai.models.list();
      if (Array.isArray(list?.data)) {
        all.push(...list.data);
      } else if (list && typeof list[Symbol.asyncIterator] === 'function') {
        for await (const m of list) all.push(m);
      } else if (list && typeof list.data?.[Symbol.asyncIterator] === 'function') {
        for await (const m of list.data) all.push(m);
      }
      const models = all
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(m => ({ id: m.id, owned_by: m.owned_by, created: m.created }));
      res.json({ models, keyPrefix: apiKey.slice(0, 8) + '...' });
    } catch (err) {
      const msg = err?.message || 'Failed to fetch models';
      res.status(502).json({ error: msg });
    }
  });

  return router;
}

