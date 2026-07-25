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
		// Anthropic doesn't have a list models API — return known active models
		return [
			{ id: 'claude-sonnet-4-20250514', owned_by: 'anthropic' },
			{ id: 'claude-3-5-haiku-20241022', owned_by: 'anthropic' },
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

		// Build options aggressively: include all params, let the API tell us what's unsupported
		const buildOpts = (overrides = {}) => {
			const opts = {
				model: resolvedModel,
				messages,
				...overrides,
			};
			if (!('max_tokens' in overrides) && !('max_completion_tokens' in overrides)) {
				opts.max_tokens = maxTokens;
			}
			if (!('temperature' in overrides)) {
				opts.temperature = temperature;
			}
			if (jsonMode && !('response_format' in overrides)) {
				opts.response_format = { type: 'json_object' };
			}
			return opts;
		};

		const tryCreate = async (overrides) => {
			return await openai.chat.completions.create(buildOpts(overrides));
		};

		try {
			const completion = await tryCreate({});
			return {
				content: completion.choices?.[0]?.message?.content?.trim() || '',
				usage: completion.usage || {},
				model: completion.model || resolvedModel,
			};
		} catch (err) {
			const msg = (err?.message || '').toLowerCase();
			const overrides = {};

			// Determine which params to strip based on the error message
			if (msg.includes('temperature')) overrides.temperature = undefined;
			if (msg.includes('response_format') || msg.includes('json_object') || msg.includes('json mode')) {
				overrides.response_format = undefined;
			}
			if (msg.includes('max_tokens') || msg.includes('max_completion_tokens')) {
				if (msg.includes('max_completion_tokens')) {
					overrides.max_tokens = undefined;
					overrides.max_completion_tokens = maxTokens;
				} else {
					overrides.max_tokens = undefined;
					overrides.max_completion_tokens = maxTokens;
				}
			}

			// If we have nothing to change, rethrow
			if (Object.keys(overrides).length === 0) throw err;

			const completion = await tryCreate(overrides);
			return {
				content: completion.choices?.[0]?.message?.content?.trim() || '',
				usage: completion.usage || {},
				model: completion.model || resolvedModel,
			};
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
			if (!('temperature' in overrides)) body.temperature = temperature;
			if (!('system' in overrides) && systemText) body.system = systemText;
			return body;
		};

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

		try {
			let response = await doFetch(buildBody({}));

			if (!response.ok) {
				const errBody = await response.json().catch(() => ({}));
				console.error('[Anthropic API Error]', JSON.stringify(errBody));
				const errMsg = (errBody?.error?.message || '');
				const errMsgLower = errMsg.toLowerCase();

				// If temperature is the issue, retry without it
				if (errMsgLower.includes('temperature')) {
					console.log('[Anthropic] Retrying without temperature');
					response = await doFetch(buildBody({ temperature: undefined }));
				} else if (errMsg && !errMsg.includes(' ') && errMsg.startsWith('model:')) {
					// Anthropic sometimes returns just the model name as error when model is not found/deprecated
					throw new Error(`Anthropic model error: "${errMsg.replace('model:', '').trim()}" — this model may be deprecated or unavailable. Try a different model.`);
				} else {
					throw new Error(errMsg || `Anthropic API error ${response.status}`);
				}
			}

			if (!response.ok) {
				const err = await response.json().catch(() => ({}));
				console.error('[Anthropic API Error (2nd attempt)]', JSON.stringify(err));
				throw new Error(err?.error?.message || `Anthropic API error ${response.status}`);
			}

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
