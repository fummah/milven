/**
 * =========================================================
 * AI Provider Abstraction Layer
 * Supports: OpenAI, Anthropic (Claude), and future providers
 * =========================================================
 */

import OpenAI from 'openai';

// ── Supported providers ─────────────────────────────────
export const AI_PROVIDERS = {
	openai: { id: 'openai', label: 'OpenAI', envKey: 'OPENAI_API_KEY', settingsKey: 'ai.openai.apiKey' },
	anthropic: { id: 'anthropic', label: 'Anthropic (Claude)', envKey: 'ANTHROPIC_API_KEY', settingsKey: 'ai.anthropic.apiKey' },
};

export const DEFAULT_PROVIDER = 'openai';

// ── Default models per provider (cost-effective) ────────
const DEFAULT_MODELS = {
	openai: 'gpt-4o-mini',
	anthropic: 'claude-sonnet-4-20250514',
};

// ── Get API key for a provider ──────────────────────────
export async function getAIApiKey(prisma, provider = DEFAULT_PROVIDER) {
	const prov = AI_PROVIDERS[provider];
	if (!prov) return null;

	// 1. Check environment variable
	const envKey = process.env[prov.envKey];
	if (envKey && envKey.trim()) return envKey.trim();

	// 2. Check DB (new multi-provider key)
	const row = await prisma.systemSetting.findUnique({ where: { key: prov.settingsKey } });
	if (row?.value) {
		const val = typeof row.value === 'string' ? row.value : row.value?.value;
		if (val?.trim()) return val.trim();
	}

	// 3. Fallback: legacy openai_api_key for backward compat
	if (provider === 'openai') {
		const legacy = await prisma.systemSetting.findUnique({ where: { key: 'openai_api_key' } });
		const val = legacy?.value;
		return (typeof val === 'string' ? val : val?.value)?.trim() || null;
	}

	return null;
}

// ── Get default model for a provider ────────────────────
export function getDefaultModel(provider = DEFAULT_PROVIDER) {
	return DEFAULT_MODELS[provider] || DEFAULT_MODELS.openai;
}

// ── Get active provider from settings ───────────────────
export async function getActiveProvider(prisma) {
	const row = await prisma.systemSetting.findUnique({ where: { key: 'ai.provider' } });
	const val = typeof row?.value === 'string' ? row.value : row?.value?.value;
	return AI_PROVIDERS[val] ? val : DEFAULT_PROVIDER;
}

// ── Get active model from settings ──────────────────────
export async function getActiveModel(prisma) {
	const row = await prisma.systemSetting.findUnique({ where: { key: 'ai.model' } });
	const val = typeof row?.value === 'string' ? row.value : row?.value?.value;
	return val?.trim() || null;
}

// ── List models for a provider ──────────────────────────
export async function listModels(apiKey, provider = DEFAULT_PROVIDER) {
	if (provider === 'openai') {
		const openai = new OpenAI({ apiKey });
		const all = [];
		const list = await openai.models.list();
		if (Array.isArray(list?.data)) {
			all.push(...list.data);
		} else if (list && typeof list[Symbol.asyncIterator] === 'function') {
			for await (const m of list) all.push(m);
		} else if (list && typeof list.data?.[Symbol.asyncIterator] === 'function') {
			for await (const m of list.data) all.push(m);
		}
		return all
			.sort((a, b) => a.id.localeCompare(b.id))
			.map(m => ({ id: m.id, owned_by: m.owned_by, created: m.created }));
	}

	if (provider === 'anthropic') {
		// Anthropic doesn't have a list models API — return known models
		return [
			{ id: 'claude-sonnet-4-20250514', owned_by: 'anthropic' },
			{ id: 'claude-3-5-sonnet-20241022', owned_by: 'anthropic' },
			{ id: 'claude-3-5-haiku-20241022', owned_by: 'anthropic' },
			{ id: 'claude-3-opus-20240229', owned_by: 'anthropic' },
			{ id: 'claude-3-haiku-20240307', owned_by: 'anthropic' },
		];
	}

	return [];
}

// ── Unified chat completion ─────────────────────────────
// Returns { content: string, usage: { prompt_tokens, completion_tokens } }
export async function chatCompletion({ apiKey, provider = DEFAULT_PROVIDER, model, messages, temperature = 0.5, maxTokens = 4000, jsonMode = false, timeout = 300000 }) {
	const resolvedModel = model || getDefaultModel(provider);

	if (provider === 'openai') {
		const openai = new OpenAI({ apiKey, timeout });
		// Reasoning models (pure o-series: o1, o3, o4-mini, etc.) don't support temperature or response_format
		// gpt-5.x models are standard chat models but use max_completion_tokens instead of max_tokens
		// Some models (mini/lite variants) only support the default temperature (1) and don't accept custom values
		const modelBase = resolvedModel.replace(/-[a-z0-9]+$/i, '').toLowerCase();
		const isReasoningModel = /^o[1-9](?![a-zA-Z])/.test(resolvedModel);
		const usesCompletionTokens = isReasoningModel || /^(gpt-5|chatgpt-4o-latest)/.test(resolvedModel);
		// Models that cannot accept custom temperature (default 1 only)
		const noCustomTemp = ['o1', 'o3', 'o4', 'gpt-5-mini', 'gpt-5.4-mini', 'gpt-4.1-mini', 'gpt-4o-mini', 'o4-mini'];
		const supportsTemperature = !noCustomTemp.some(prefix => resolvedModel.startsWith(prefix));
		const opts = {
			model: resolvedModel,
			messages,
		};
		if (usesCompletionTokens) {
			opts.max_completion_tokens = maxTokens;
		} else {
			opts.max_tokens = maxTokens;
		}
		if (supportsTemperature) {
			opts.temperature = temperature;
		}
		if (jsonMode && supportsTemperature) {
			opts.response_format = { type: 'json_object' };
		}
		const completion = await openai.chat.completions.create(opts);
		return {
			content: completion.choices?.[0]?.message?.content?.trim() || '',
			usage: completion.usage || {},
			model: completion.model || resolvedModel,
		};
	}

	if (provider === 'anthropic') {
		// Anthropic uses a different API format — use fetch directly
		// Extract system message from messages array
		const systemMsgs = messages.filter(m => m.role === 'system');
		const nonSystemMsgs = messages.filter(m => m.role !== 'system');
		const systemText = systemMsgs.map(m => m.content).join('\n\n');

		const body = {
			model: resolvedModel,
			max_tokens: maxTokens,
			temperature,
			messages: nonSystemMsgs.map(m => ({ role: m.role, content: m.content })),
		};
		if (systemText) body.system = systemText;

		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(timeout),
		});

		if (!response.ok) {
			const err = await response.json().catch(() => ({}));
			throw new Error(err?.error?.message || `Anthropic API error ${response.status}`);
		}

		const data = await response.json();
		const content = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
		return {
			content: content.trim(),
			usage: { prompt_tokens: data.usage?.input_tokens || 0, completion_tokens: data.usage?.output_tokens || 0 },
			model: data.model || resolvedModel,
		};
	}

	throw new Error(`Unsupported AI provider: ${provider}`);
}
