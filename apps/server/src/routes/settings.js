import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { AI_PROVIDERS, DEFAULT_PROVIDER, getAIApiKey, getDefaultModel, listModels, getActiveProvider, getActiveModel } from '../lib/aiProvider.js';

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
      'openai_api_key',
      // Multi-provider AI settings
      'ai.provider',
      'ai.model',
      'ai.openai.apiKey',
      'ai.anthropic.apiKey',
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

  // Get AI configuration (active provider, model, available providers)
  router.get('/ai-config', requireAuth(), requireRole('ADMIN'), async (_req, res) => {
    try {
      const activeProvider = await getActiveProvider(prisma);
      const activeModel = await getActiveModel(prisma);
      const providers = Object.values(AI_PROVIDERS).map(p => ({
        id: p.id,
        label: p.label,
        hasKey: false, // populated below
      }));
      // Check which providers have API keys configured
      for (const p of providers) {
        const key = await getAIApiKey(prisma, p.id);
        p.hasKey = !!key;
        if (key) p.keyPrefix = key.slice(0, 8) + '...';
      }
      res.json({
        activeProvider,
        activeModel: activeModel || getDefaultModel(activeProvider),
        defaultModel: getDefaultModel(activeProvider),
        providers,
      });
    } catch (err) {
      res.status(500).json({ error: err?.message || 'Failed to load AI config' });
    }
  });

  // List available models for a provider (query: ?provider=openai)
  router.get('/ai-models', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    try {
      const provider = req.query.provider || await getActiveProvider(prisma);
      if (!AI_PROVIDERS[provider]) return res.status(400).json({ error: `Unknown provider: ${provider}` });
      const apiKey = await getAIApiKey(prisma, provider);
      if (!apiKey) return res.status(400).json({ error: `No API key configured for ${AI_PROVIDERS[provider].label}. Set one in .env or in the AI settings tab.` });
      const models = await listModels(apiKey, provider);
      res.json({ provider, models, keyPrefix: apiKey.slice(0, 8) + '...' });
    } catch (err) {
      const msg = err?.message || 'Failed to fetch models';
      res.status(502).json({ error: msg });
    }
  });

  // Backward-compat: /openai-models still works
  router.get('/openai-models', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    try {
      const apiKey = await getAIApiKey(prisma, 'openai');
      if (!apiKey) return res.status(400).json({ error: 'No OpenAI API key configured.' });
      const models = await listModels(apiKey, 'openai');
      res.json({ provider: 'openai', models, keyPrefix: apiKey.slice(0, 8) + '...' });
    } catch (err) {
      res.status(502).json({ error: err?.message || 'Failed to fetch models' });
    }
  });

  return router;
}

