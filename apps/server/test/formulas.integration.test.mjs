/**
 * Integration tests for the AI Formula Generator.
 *
 * Runs the REAL application flow (auth → provider/model resolution → AI request →
 * parsing → SSE response → accept → DB insert → query-back) with a stateful
 * in-memory Prisma fake and a mocked provider client (chatCompletion).
 *
 * Run with:  node --test "test/**\/*.test.mjs"   (from apps/server)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { formulasRouter } from '../src/routes/formulas.js';
import { readSseStream } from '../../web/src/lib/sse.js';

const COURSE = { id: 'c1', name: 'Quantitative Methods', level: 'LEVEL1' };

function makePrisma() {
	const formulas = [];
	let seq = 0;
	const api = {
		_formulas: formulas,
		course: { findUnique: async ({ where }) => (where.id === COURSE.id ? COURSE : null) },
		volume: { findUnique: async ({ where }) => (where.id === 'v1' ? { id: 'v1', name: 'Vol 1' } : null) },
		module: { findUnique: async ({ where }) => (where.id === 'm1' ? { id: 'm1', name: 'Rates and Returns' } : null) },
		topic: {
			findUnique: async ({ where }) => (where.id === 't1' ? { id: 't1', name: 'Interest Rates' } : null),
			findMany: async () => [{ id: 't1', name: 'Interest Rates' }, { id: 't2', name: 'Return Measurement' }],
		},
		curriculumDocument: { findUnique: async () => ({ extractedText: 'HPR = (P1 - P0 + D1) / P0. Curriculum text.' }) },
		formula: {
			create: async ({ data }) => {
				if (data.name === 'FAIL_INSERT') throw new Error('simulated DB failure');
				const rec = { id: 'f' + (++seq), ...data };
				formulas.push(rec);
				return rec;
			},
			findUnique: async ({ where }) => formulas.find(f => f.id === where.id) || null,
			findMany: async () => formulas.slice(),
			count: async () => formulas.length,
		},
		// Supports both interactive (callback) and array forms, with rollback.
		$transaction: async (arg) => {
			const snapshot = formulas.slice();
			try {
				if (typeof arg === 'function') return await arg(api);
				return await Promise.all(arg);
			} catch (err) {
				formulas.length = 0;
				formulas.push(...snapshot);
				throw err;
			}
		},
	};
	return api;
}

function formulaFixture() {
	return {
		formulas: [{
			name: 'Speed',
			formula: 'v = d / t',
			variables: 'v: speed; d: distance; t: time',
			interpretation: 'Speed equals distance divided by time.',
			whenToUse: 'Straightforward rate questions.',
			watchOut: 'Do not omit units.',
			order: 1,
			topicName: 'Interest Rates',
		}],
	};
}

function makeDeps({ activeProvider = 'openai', activeModel = 'gpt-4o-mini', apiKey = 'sk-test', fixture = formulaFixture() } = {}) {
	const calls = { chat: [] };
	return {
		calls,
		deps: {
			getActiveProvider: async () => activeProvider,
			getActiveModel: async () => activeModel,
			getDefaultModel: () => 'gpt-4o-mini',
			getAIApiKey: async () => apiKey,
			// Mock only the provider client layer, not the app logic.
			chatCompletion: async (opts) => {
				calls.chat.push(opts);
				return { text: JSON.stringify(fixture), content: JSON.stringify(fixture), provider: opts.provider, model: opts.model, usage: {} };
			},
		},
	};
}

function token(role = 'ADMIN') {
	return jwt.sign({ sub: 'u1', role }, process.env.JWT_SECRET ?? 'dev_secret');
}

async function withServer(prisma, deps, fn) {
	const app = express();
	app.use(express.json());
	app.use('/api/formulas', formulasRouter(prisma, deps));
	const server = app.listen(0);
	await new Promise(resolve => server.once('listening', resolve));
	const base = `http://127.0.0.1:${server.address().port}`;
	try {
		return await fn(base);
	} finally {
		await new Promise(resolve => server.close(resolve));
	}
}

function post(base, path, body) {
	return fetch(base + path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
		body: JSON.stringify(body),
	});
}

// Parse the SSE response using the SAME shared parser the frontend uses.
async function readResult(res) {
	let result = null;
	let sseError = null;
	await readSseStream(res.body, (evt) => {
		if (evt.event === 'result') result = evt.data;
		else if (evt.event === 'error') sseError = evt.data;
	});
	return { result, sseError };
}

const PREVIEW = '/api/formulas/generate-ai/preview';

test('formulas: requested provider + model are honoured end-to-end', async () => {
	const prisma = makePrisma();
	const { deps, calls } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, PREVIEW, { courseId: 'c1', topicId: 't1', level: 'LEVEL1', count: 1, provider: 'anthropic', model: 'claude-x' });
		assert.equal(res.status, 200);
		const { result, sseError } = await readResult(res);
		assert.equal(sseError, null);
		assert.ok(result, 'expected a result event');
		assert.equal(result.meta.provider, 'anthropic');
		assert.equal(result.meta.model, 'claude-x');
		assert.equal(calls.chat[0].provider, 'anthropic');
		assert.equal(calls.chat[0].model, 'claude-x');
	});
});

test('formulas: invalid provider falls back to active provider + default model', async () => {
	const prisma = makePrisma();
	const { deps, calls } = makeDeps({ activeProvider: 'openai', activeModel: null });
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, PREVIEW, { courseId: 'c1', topicId: 't1', level: 'LEVEL1', count: 1, provider: 'nope' });
		const { result } = await readResult(res);
		assert.equal(result.meta.provider, 'openai');
		assert.equal(result.meta.model, 'gpt-4o-mini');
		assert.equal(calls.chat[0].provider, 'openai');
	});
});

test('formulas: missing provider/model uses configured defaults (backward compatible)', async () => {
	const prisma = makePrisma();
	const { deps, calls } = makeDeps({ activeProvider: 'anthropic', activeModel: 'claude-sonnet-4-6' });
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, PREVIEW, { courseId: 'c1', topicId: 't1', level: 'LEVEL1', count: 1 });
		const { result } = await readResult(res);
		assert.equal(result.meta.provider, 'anthropic');
		assert.equal(result.meta.model, 'claude-sonnet-4-6');
		assert.equal(calls.chat[0].provider, 'anthropic');
	});
});

test('formulas: generation returns non-empty formula cards with expected fields', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, PREVIEW, { courseId: 'c1', topicId: 't1', level: 'LEVEL1', count: 1, provider: 'openai', model: 'gpt-4o-mini' });
		const { result, sseError } = await readResult(res);
		assert.equal(sseError, null);
		assert.ok(result.generated.items.length >= 1);
		const f = result.generated.items[0];
		for (const key of ['name', 'formula', 'variables', 'interpretation', 'whenToUse', 'watchOut']) {
			assert.ok(f[key], `expected field ${key}`);
		}
	});
});

test('formulas: empty AI response produces AI_GENERATION_EMPTY (not a silent failure)', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps({ fixture: { formulas: [] } });
	// provider returns valid JSON containing no formulas
	deps.chatCompletion = async () => ({ text: JSON.stringify({ formulas: [] }), content: JSON.stringify({ formulas: [] }), provider: 'openai', model: 'gpt-4o-mini' });
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, PREVIEW, { courseId: 'c1', topicId: 't1', level: 'LEVEL1', count: 1 });
		const { result, sseError } = await readResult(res);
		assert.equal(result, null);
		assert.equal(sseError.error, 'AI_GENERATION_EMPTY');
		assert.equal(sseError.provider, 'openai');
		assert.equal(sseError.model, 'gpt-4o-mini');
	});
});

test('formulas: unparseable AI response produces AI_RESPONSE_PARSE_FAILED with preview', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	deps.chatCompletion = async () => ({ text: 'this is not json <<<', content: 'this is not json <<<', provider: 'openai', model: 'gpt-4o-mini' });
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, PREVIEW, { courseId: 'c1', topicId: 't1', level: 'LEVEL1', count: 1 });
		const { result, sseError } = await readResult(res);
		assert.equal(result, null);
		assert.equal(sseError.error, 'AI_RESPONSE_PARSE_FAILED');
		assert.ok(sseError.rawPreview.includes('not json'));
	});
});

test('formulas: missing API key returns friendly 400', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps({ apiKey: null });
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, PREVIEW, { courseId: 'c1', topicId: 't1', level: 'LEVEL1', provider: 'anthropic' });
		assert.equal(res.status, 400);
		assert.match((await res.json()).error, /API key not configured/i);
	});
});

test('formulas: accept persists selected formulas and returns inserted IDs', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const generated = { items: [
			{ name: 'Speed', formula: 'v = d / t', variables: 'v: speed; d: distance; t: time', interpretation: 'Speed = distance / time', whenToUse: 'rate', watchOut: 'units', order: 1, matchedTopicId: 't1' },
			{ name: 'Density', formula: 'p = m / V', variables: 'p: density', interpretation: 'Density = mass / volume', whenToUse: 'measurement', watchOut: 'units', order: 2, matchedTopicId: 't1' },
		] };
		const res = await post(base, '/api/formulas/generate-ai/accept', {
			generated, meta: { courseId: 'c1', level: 'LEVEL1', topicId: 't1' }, selectedIndices: [0, 1],
		});
		assert.equal(res.status, 201);
		const body = await res.json();
		assert.equal(body.created, 2);
		assert.equal(body.ids.length, 2);
		assert.equal(prisma._formulas.length, 2);
		assert.equal(prisma._formulas[0].courseId, 'c1');
		assert.equal(prisma._formulas[0].topicId, 't1');

		// Query back through the real list API.
		const listRes = await fetch(base + '/api/formulas');
		assert.equal(listRes.status, 200);
		const list = await listRes.json();
		assert.equal(list.total, 2);
		const names = list.formulas.map(f => f.name).sort();
		assert.deepEqual(names, ['Density', 'Speed']);
	});
});

test('formulas: accept rejects invalid items before insert', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/formulas/generate-ai/accept', {
			generated: { items: [{ name: '', formula: '' }] },
			meta: { courseId: 'c1', level: 'LEVEL1' }, selectedIndices: [0],
		});
		assert.equal(res.status, 400);
		assert.equal((await res.json()).error, 'AI_VALIDATION_FAILED');
		assert.equal(prisma._formulas.length, 0);
	});
});

test('formulas: accept rolls back all inserts if one fails (no partial inserts)', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/formulas/generate-ai/accept', {
			generated: { items: [
				{ name: 'Good', formula: 'a = b', variables: 'a', interpretation: 'x', whenToUse: 'y', watchOut: 'z' },
				{ name: 'FAIL_INSERT', formula: 'c = d', variables: 'c', interpretation: 'x', whenToUse: 'y', watchOut: 'z' },
			] },
			meta: { courseId: 'c1', level: 'LEVEL1' }, selectedIndices: [0, 1],
		});
		assert.equal(res.status, 500);
		assert.equal((await res.json()).error, 'DB_INSERT_FAILED');
		assert.equal(prisma._formulas.length, 0);
	});
});

test('formulas: accept rejects a non-existent course', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/formulas/generate-ai/accept', {
			generated: { items: [{ name: 'Speed', formula: 'v = d / t' }] },
			meta: { courseId: 'nope', level: 'LEVEL1' }, selectedIndices: [0],
		});
		assert.equal(res.status, 400);
		assert.match((await res.json()).error, /Course not found/);
	});
});

test('formulas: legacy /generate-ai also honours provider + model', async () => {
	const prisma = makePrisma();
	const { deps, calls } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/formulas/generate-ai', { courseId: 'c1', topicId: 't1', level: 'LEVEL1', count: 1, provider: 'anthropic', model: 'claude-x' });
		assert.equal(res.status, 201);
		assert.equal(calls.chat[0].provider, 'anthropic');
		assert.equal(calls.chat[0].model, 'claude-x');
		assert.equal(prisma._formulas.length, 1);
	});
});
