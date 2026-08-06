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
	anthropic: 'claude-sonnet-4-6',
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
		try {
			const response = await fetch('https://api.anthropic.com/v1/models', {
				headers: {
					'x-api-key': apiKey,
					'anthropic-version': '2023-06-01',
				},
			});
			if (!response.ok) return [];
			const body = await response.json();
			const models = body.data || [];
			return models
				.sort((a, b) => a.display_name?.localeCompare(b.display_name || a.id) || a.id.localeCompare(b.id))
				.map(m => ({ id: m.id, display_name: m.display_name, owned_by: 'anthropic', created: new Date(m.created_at).getTime() }));
		} catch {
			return [];
		}
	}

	return [];
}

// ── Unified chat completion ─────────────────────────────
// Returns { content: string, usage: { prompt_tokens, completion_tokens } }
export async function chatCompletion({ apiKey, provider = DEFAULT_PROVIDER, model, messages, temperature = 0.5, maxTokens = 4000, jsonMode = false, timeout = 300000 }) {
	const resolvedModel = model || getDefaultModel(provider);

	if (provider === 'openai') {
		const openai = new OpenAI({ apiKey, timeout });

		// Build options aggressively: include all params, let the API tell us what's unsupported
		// Reasoning models (gpt-5 / o1 / o3 / o4 / o1-mini / gpt-5-mini) reject
		// `temperature` and consume a huge share of `max_completion_tokens` on
		// hidden chain-of-thought. For them we omit temperature, keep output tokens
		// generous, and set reasoning_effort low so they emit real JSON instead of `{}`.
		const reasoningModel = /^(o[134]|o4-mini|gpt-5)/i.test(resolvedModel);
		const effectiveTokens = reasoningModel ? Math.max(maxTokens, 24000) : maxTokens;

		const buildOpts = (overrides = {}) => {
			const opts = {
				model: resolvedModel,
				messages,
				...overrides,
			};
			if (!('max_tokens' in overrides) && !('max_completion_tokens' in overrides)) {
				if (reasoningModel) opts.max_completion_tokens = effectiveTokens;
				else opts.max_tokens = effectiveTokens;
			}
			if (!reasoningModel && !('temperature' in overrides)) {
				opts.temperature = temperature;
			}
			if (reasoningModel && !('reasoning_effort' in overrides)) {
				opts.reasoning_effort = 'low';
			}
			if (jsonMode && !('response_format' in overrides)) {
				opts.response_format = { type: 'json_object' };
			}
			return opts;
		};

		const tryCreate = async (overrides) => {
			return await openai.chat.completions.create(buildOpts(overrides));
		};

		// Iteratively strip unsupported parameters and retry
		const maxRetries = 5;
		let currentOverrides = {};
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				const completion = await tryCreate(currentOverrides);
				return {
					content: completion.choices?.[0]?.message?.content?.trim() || '',
					usage: completion.usage || {},
					model: completion.model || resolvedModel,
				};
			} catch (err) {
				const msg = (err?.message || '').toLowerCase();
				let found = false;

				if (msg.includes('temperature')) {
					currentOverrides.temperature = undefined;
					found = true;
				}
				if (msg.includes('response_format') || msg.includes('json_object') || msg.includes('json mode')) {
					currentOverrides.response_format = undefined;
					found = true;
				}
				if (msg.includes('reasoning_effort')) {
					currentOverrides.reasoning_effort = undefined;
					found = true;
				}
				if (msg.includes('max_completion_tokens')) {
					currentOverrides.max_tokens = undefined;
					currentOverrides.max_completion_tokens = effectiveTokens;
					found = true;
				} else if (msg.includes('max_tokens')) {
					currentOverrides.max_tokens = undefined;
					currentOverrides.max_completion_tokens = effectiveTokens;
					found = true;
				}

				if (!found || attempt >= maxRetries) throw err;
				console.log(`[OpenAI] Retry ${attempt + 1}: stripping unsupported params, current overrides:`, currentOverrides);
			}
		}
	}

	if (provider === 'anthropic') {
		const systemMsgs = messages.filter(m => m.role === 'system');
		const nonSystemMsgs = messages.filter(m => m.role !== 'system');
		const systemText = systemMsgs.map(m => m.content).join('\n\n');

		const buildBody = (overrides = {}) => {
			const body = {
				model: resolvedModel,
				max_tokens: maxTokens,
				messages: nonSystemMsgs.map(m => ({ role: m.role, content: m.content })),
				...overrides,
			};
			if (!('temperature' in overrides) && !body.thinking) body.temperature = temperature;
			if (!('system' in overrides) && systemText) body.system = systemText;
			return body;
		};

		// Add thinking parameter for jsonMode — improves output quality on supported models
		// Thinking uses budget_tokens (must be < max_tokens). Not all models support it.
		const tryWithThinking = jsonMode ? {
			thinking: { type: 'enabled', budget_tokens: Math.max(1024, Math.min(maxTokens * 0.5, 32000)) },
			temperature: undefined, // temperature incompatible with thinking
		} : {};

		const doFetch = async (bodyToSend) => {
			const response = await fetch('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': apiKey,
					'anthropic-version': '2023-06-01',
				},
				body: JSON.stringify(bodyToSend),
				signal: AbortSignal.timeout(timeout),
			});
			return response;
		};

		// Fallback model IDs to try if the requested model is not found
		const MODEL_FALLBACKS = {
			'claude-sonnet-4-20250514': ['claude-4-sonnet', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
			'claude-4-sonnet': ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
			'claude-3-5-sonnet-20241022': ['claude-3-5-haiku-20241022', 'claude-sonnet-4-20250514'],
		};

		const attemptRequest = async (modelId, overrides = {}) => {
			const body = buildBody({ ...tryWithThinking, ...overrides });
			body.model = modelId;
			const response = await doFetch(body);

			if (response.ok) return response;

			const errBody = await response.json().catch(() => ({}));
			console.error(`[Anthropic] Error with model "${modelId}":`, JSON.stringify(errBody));

			const errType = errBody?.error?.type || '';
			const errMsg = errBody?.error?.message || '';

			// If not found error — try fallback models
			if (errType === 'not_found_error') {
				const fallbacks = MODEL_FALLBACKS[modelId] || [];
				for (const fb of fallbacks) {
					if (fb === modelId) continue;
					console.log(`[Anthropic] Trying fallback model: ${fb}`);
					const fbRes = await attemptRequest(fb, overrides);
					if (fbRes.ok) {
						console.log(`[Anthropic] Fallback model "${fb}" worked!`);
						return fbRes;
					}
				}
				throw new Error(`Model "${modelId}" not found by Anthropic API. Tried fallbacks: ${(fallbacks.length ? fallbacks.join(', ') : 'none available')}. Check your API key has access to the selected model.`);
			}

			// If thinking not supported — retry without it
			if (errMsg.toLowerCase().includes('thinking')) {
				console.log('[Anthropic] Retrying without thinking (not supported by this model)');
				return await attemptRequest(modelId, { thinking: undefined, temperature });
			}

			// If temperature is the issue — retry without it
			if (errMsg.toLowerCase().includes('temperature')) {
				console.log('[Anthropic] Retrying without temperature');
				return await attemptRequest(modelId, { temperature: undefined, thinking: undefined });
			}

			throw new Error(errMsg || `Anthropic API error ${response.status}`);
		};

		try {
			const response = await attemptRequest(resolvedModel);
			const data = await response.json();
			const content = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
			return {
				content: content.trim(),
				usage: { prompt_tokens: data.usage?.input_tokens || 0, completion_tokens: data.usage?.output_tokens || 0 },
				model: data.model || resolvedModel,
			};
		} catch (err) {
			console.error('[Anthropic] Fatal error:', err?.message);
			throw err;
		}
	}

	throw new Error(`Unsupported AI provider: ${provider}`);
}
