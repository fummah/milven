/**
 * Route-level integration tests for the AI Formula Generator provider/model handling.
 * Injects a fake Prisma client and fake AI so the HTTP/SSE routes can be exercised
 * without a database or network.
 *
 * Run with:  node --test "test/**\/*.test.mjs"   (from apps/server)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { formulasRouter } from '../src/routes/formulas.js';

const COURSE = { id: 'c1', name: 'Quantitative Methods', level: 'LEVEL1' };

function makePrisma() {
	const created = [];
	return {
		created,
		course: { findUnique: async ({ where }) => (where.id === COURSE.id ? COURSE : null) },
		volume: { findUnique: async ({ where }) => (where.id === 'v1' ? { name: 'Vol 1' } : null) },
		module: { findUnique: async ({ where }) => (where.id === 'm1' ? { name: 'Rates and Returns' } : null) },
		topic: {
			findUnique: async ({ where }) => (where.id === 't1' ? { id: 't1', name: 'Interest Rates' } : null),
			findMany: async () => [{ id: 't1', name: 'Interest Rates' }, { id: 't2', name: 'Return Measurement' }],
		},
		curriculumDocument: { findUnique: async () => ({ extractedText: 'HPR = (P1 - P0 + D1) / P0. Some curriculum text.' }) },
		formula: {
			create: async ({ data }) => { created.push(data); return { id: 'f' + created.length, ...data }; },
		},
	};
}

function formulaFixture() {
	return {
		formulas: [{
			name: 'Holding Period Return',
			formula: '\\( HPR = \\frac{P_1 - P_0 + D_1}{P_0} \\)',
			variables: 'P_0: beginning price; P_1: ending price; D_1: income',
			interpretation: 'Measures total return over the holding period.',
			whenToUse: 'Single-period total return questions.',
			watchOut: 'Do not omit income.',
			calculatorCue: null,
			losTag: 'LOS 1.a',
			highYield: true,
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
			chatCompletion: async (opts) => { calls.chat.push(opts); return { content: JSON.stringify(fixture) }; },
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

function post(base, path, body, role = 'ADMIN') {
	return fetch(base + path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(role)}` },
		body: JSON.stringify(body),
	});
}

async function readSse(res) {
	const text = await res.text();
	const result = text.match(/event: result\ndata: (.*)\n\n/);
	if (result) return { type: 'result', data: JSON.parse(result[1]) };
	const error = text.match(/event: error\ndata: (.*)\n\n/);
	if (error) return { type: 'error', data: JSON.parse(error[1]) };
	return { type: 'none', text };
}

// ─── Tests ────────────────────────────────────────────────

test('formulas: requested provider + model are honoured', async () => {
	const prisma = makePrisma();
	const { deps, calls } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/formulas/generate-ai/preview', {
			courseId: 'c1', topicId: 't1', level: 'LEVEL1', count: 1, provider: 'anthropic', model: 'claude-x',
		});
		assert.equal(res.status, 200);
		const sse = await readSse(res);
		assert.equal(sse.type, 'result');
		assert.equal(sse.data.meta.provider, 'anthropic');
		assert.equal(sse.data.meta.model, 'claude-x');
		assert.equal(calls.chat[0].provider, 'anthropic');
		assert.equal(calls.chat[0].model, 'claude-x');
	});
});

test('formulas: invalid provider falls back to active provider + default model', async () => {
	const prisma = makePrisma();
	const { deps, calls } = makeDeps({ activeProvider: 'openai', activeModel: null });
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/formulas/generate-ai/preview', {
			courseId: 'c1', topicId: 't1', level: 'LEVEL1', count: 1, provider: 'nope',
		});
		const sse = await readSse(res);
		assert.equal(sse.type, 'result');
		assert.equal(sse.data.meta.provider, 'openai');
		assert.equal(sse.data.meta.model, 'gpt-4o-mini');
		assert.equal(calls.chat[0].provider, 'openai');
	});
});

test('formulas: missing provider/model uses configured defaults (backward compatible)', async () => {
	const prisma = makePrisma();
	const { deps, calls } = makeDeps({ activeProvider: 'anthropic', activeModel: 'claude-sonnet-4-6' });
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/formulas/generate-ai/preview', {
			courseId: 'c1', topicId: 't1', level: 'LEVEL1', count: 1,
		});
		const sse = await readSse(res);
		assert.equal(sse.type, 'result');
		assert.equal(sse.data.meta.provider, 'anthropic');
		assert.equal(sse.data.meta.model, 'claude-sonnet-4-6');
		assert.equal(calls.chat[0].provider, 'anthropic');
		assert.equal(calls.chat[0].model, 'claude-sonnet-4-6');
	});
});

test('formulas: generation still returns formula cards with mandatory fields', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/formulas/generate-ai/preview', {
			courseId: 'c1', topicId: 't1', level: 'LEVEL1', count: 1, provider: 'openai', model: 'gpt-4o-mini',
		});
		const sse = await readSse(res);
		assert.equal(sse.type, 'result');
		assert.ok(sse.data.generated.items.length >= 1);
		const f = sse.data.generated.items[0];
		assert.ok(f.formula);
		assert.ok(f.variables);
		assert.ok(f.interpretation);
		assert.ok(f.whenToUse);
		assert.ok(f.watchOut);
	});
});

test('formulas: missing API key returns friendly 400', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps({ apiKey: null });
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/formulas/generate-ai/preview', {
			courseId: 'c1', topicId: 't1', level: 'LEVEL1', provider: 'anthropic',
		});
		assert.equal(res.status, 400);
		assert.match((await res.json()).error, /API key not configured/i);
	});
});

test('formulas: course not found returns SSE error', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/formulas/generate-ai/preview', { courseId: 'nope', level: 'LEVEL1' });
		assert.equal(res.status, 200);
		const sse = await readSse(res);
		assert.equal(sse.type, 'error');
		assert.match(sse.data.error, /Course not found/);
	});
});

test('formulas: accept saves selected formulas as DRAFT-eligible records', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const generated = {
			items: [{
				name: 'HPR',
				formula: '\\( HPR = \\frac{P_1 - P_0}{P_0} \\)',
				variables: 'P_0: beginning price',
				interpretation: 'total return',
				whenToUse: 'single period',
				watchOut: 'omit income',
				order: 1,
				matchedTopicId: 't1',
			}],
		};
		const res = await post(base, '/api/formulas/generate-ai/accept', {
			generated, meta: { courseId: 'c1', level: 'LEVEL1', topicId: 't1' }, selectedIndices: [0],
		});
		assert.equal(res.status, 201);
		const body = await res.json();
		assert.equal(body.created, 1);
		assert.equal(prisma.created[0].topicId, 't1');
		assert.equal(prisma.created[0].courseId, 'c1');
	});
});

test('formulas: legacy /generate-ai also honours provider + model', async () => {
	const prisma = makePrisma();
	const { deps, calls } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/formulas/generate-ai', {
			courseId: 'c1', topicId: 't1', level: 'LEVEL1', count: 1, provider: 'anthropic', model: 'claude-x',
		});
		assert.equal(res.status, 201);
		assert.equal(calls.chat[0].provider, 'anthropic');
		assert.equal(calls.chat[0].model, 'claude-x');
		assert.equal(prisma.created.length, 1);
	});
});
