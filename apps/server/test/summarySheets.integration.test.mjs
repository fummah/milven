/**
 * Route-level integration tests for the CFA Summary Sheet AI pipeline.
 *
 * These tests inject a fake Prisma client and fake AI functions so the whole
 * HTTP route (auth → provider/model resolution → module iteration → validation →
 * accept) can be exercised without a database or network.
 *
 * Run with:  node --test test   (from apps/server)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { summarySheetsRouter } from '../src/routes/summarySheets.js';

// ─── Fixtures ─────────────────────────────────────────────
const COURSE = { id: 'c1', name: 'Quantitative Methods', level: 'LEVEL1' };
const MODULES = {
	m1: { id: 'm1', name: 'Rates and Returns', level: 'LEVEL1', courseId: 'c1', volumeId: 'v1', volume: { id: 'v1', name: 'Vol 1' } },
	m2: { id: 'm2', name: 'Time Value of Money', level: 'LEVEL1', courseId: 'c1', volumeId: 'v1', volume: { id: 'v1', name: 'Vol 1' } },
	m3: { id: 'm3', name: 'Statistics', level: 'LEVEL1', courseId: 'c1', volumeId: 'v2', volume: { id: 'v2', name: 'Vol 2' } },
};
const TOPICS = {
	m1: [{ id: 't1', name: 'Interest Rates', order: 1, losCode: 'LOS 1.a', commandWord: 'interpret', learningOutcomeStatement: 'interpret interest rates' }],
	m2: [{ id: 't2', name: 'Future Value', order: 1, losCode: 'LOS 2.a', commandWord: 'calculate', learningOutcomeStatement: 'calculate future value' }],
	m3: [{ id: 't3', name: 'Descriptive Statistics', order: 1, losCode: null, commandWord: null, learningOutcomeStatement: null }],
};
const NOTES = {
	m1: [{ id: 'n1', title: 'Rates Notes', topicId: null, overview: 'Understand rates', moduleSummary: '', losStatements: [], concepts: [] }],
};

function makePrisma() {
	const created = [];
	return {
		created,
		course: { findUnique: async ({ where }) => (where.id === COURSE.id ? COURSE : null) },
		module: {
			findUnique: async ({ where }) => MODULES[where.id] || null,
			findMany: async ({ where }) => Object.values(MODULES).filter(m => m.courseId === where.courseId && (!where.volumeId || m.volumeId === where.volumeId)),
			count: async ({ where }) => Object.values(MODULES).filter(m => m.courseId === where.courseId && (!where.volumeId || m.volumeId === where.volumeId)).length,
		},
		topic: { findMany: async ({ where }) => TOPICS[where.moduleId] || [] },
		moduleNote: { findMany: async ({ where }) => NOTES[where.moduleId] || [] },
		formula: { findMany: async ({ where }) => (where.moduleId === 'm1' ? [{ name: 'HPR', formula: '\\( HPR \\)', variables: '', interpretation: '', whenToUse: '', watchOut: '', losTag: '' }] : []) },
		curriculumDocument: { findUnique: async ({ where }) => (where.courseId_volumeId.volumeId === 'v1' ? { extractedText: 'curriculum for v1' } : null) },
		summarySheet: {
			create: async ({ data }) => { created.push(data); return { id: 'sheet-' + created.length, ...data }; },
		},
	};
}

function generatedSheet() {
	return {
		sheets: [{
			title: 'LM1: Test Module',
			snapshot: 'Objective of the module',
			coreDefinitions: [{ ref: 'LOS 1.a', statement: 'interpret interest rates', commandWord: 'interpret' }],
			diagrams: [
				{ topic: 'Interest Rates', subtopics: ['required return'], connectionTo: 'objective' },
				{ topic: 'Future Value', subtopics: ['compounding'], connectionTo: 'objective' },
				{ topic: 'Descriptive Statistics', subtopics: ['mean'], connectionTo: 'objective' },
			],
			memoryHooks: [{ topic: 'Interest Rates', concepts: ['discount rate'], linkToObjective: 'why return is required' }],
			formulas: [{ formula: '\\( HPR = \\frac{P_1 - P_0}{P_0} \\)', useCase: 'single period', interpretation: 'total return' }],
			distinctions: [{ scenario: 's1', rule: 'r1', apply: 'a1' }, { scenario: 's2', rule: 'r2', apply: 'a2' }, { scenario: 's3', rule: 'r3', apply: 'a3' }],
			examTraps: [{ trap: 't1' }, { trap: 't2' }, { trap: 't3' }],
			revisionCheck: [{ item: 'i1' }, { item: 'i2' }, { item: 'i3' }, { item: 'i4' }, { item: 'i5' }],
			quickDrills: [{ issue: 'None identified', recommendation: 'Ready for publication' }],
			useCase: 'PASS',
		}],
	};
}

function makeDeps({ activeProvider = 'openai', activeModel = 'gpt-4o-mini', apiKey = 'sk-test', generated = generatedSheet(), validation = { status: 'PASS', findings: [] } } = {}) {
	const calls = { chat: [] };
	return {
		calls,
		deps: {
			getActiveProvider: async () => activeProvider,
			getActiveModel: async () => activeModel,
			getDefaultModel: () => 'gpt-4o-mini',
			getAIApiKey: async () => apiKey,
			chatCompletion: async (opts) => {
				calls.chat.push(opts);
				const isValidation = String(opts?.messages?.[0]?.content || '').includes('QA validator');
				return { content: JSON.stringify(isValidation ? validation : generated) };
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
	app.use('/api/summary-sheets', summarySheetsRouter(prisma, deps));
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

// ─── Tests ────────────────────────────────────────────────

test('rejects unauthenticated requests', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await fetch(base + '/api/summary-sheets/generate-ai/preview', {
			method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
		});
		assert.equal(res.status, 401);
	});
});

test('requested provider + model are honoured', async () => {
	const prisma = makePrisma();
	const { deps, calls } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/summary-sheets/generate-ai/preview', {
			courseId: 'c1', moduleId: 'm1', level: 'LEVEL1', provider: 'anthropic', model: 'claude-sonnet-4-6',
		});
		assert.equal(res.status, 200);
		const body = await res.json();
		assert.equal(body.meta.provider, 'anthropic');
		assert.equal(body.meta.model, 'claude-sonnet-4-6');
		const generationCall = calls.chat.find(c => !String(c.messages[0].content).includes('QA validator'));
		assert.equal(generationCall.provider, 'anthropic');
		assert.equal(generationCall.model, 'claude-sonnet-4-6');
	});
});

test('invalid provider falls back to the active provider', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps({ activeProvider: 'openai' });
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/summary-sheets/generate-ai/preview', {
			courseId: 'c1', moduleId: 'm1', level: 'LEVEL1', provider: 'not-a-provider',
		});
		assert.equal(res.status, 200);
		const body = await res.json();
		assert.equal(body.meta.provider, 'openai');
	});
});

test('missing API key returns a friendly 400', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps({ apiKey: null });
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/summary-sheets/generate-ai/preview', {
			courseId: 'c1', moduleId: 'm1', level: 'LEVEL1', provider: 'anthropic',
		});
		assert.equal(res.status, 400);
		const body = await res.json();
		assert.match(body.error, /No API key configured for Anthropic/);
	});
});

test('course not found returns 400', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/summary-sheets/generate-ai/preview', { courseId: 'nope', level: 'LEVEL1' });
		assert.equal(res.status, 400);
		assert.match((await res.json()).error, /Course not found/);
	});
});

test('explicit Learning Module produces exactly one module-specific sheet', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/summary-sheets/generate-ai/preview', { courseId: 'c1', moduleId: 'm1', level: 'LEVEL1' });
		assert.equal(res.status, 200);
		const body = await res.json();
		assert.equal(body.generated.items.length, 1);
		assert.equal(body.generated.items[0].moduleId, 'm1');
		assert.equal(body.generated.items[0].validation.status, 'PASS');
	});
});

test('volume selection generates one sheet per module, limited by count', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/summary-sheets/generate-ai/preview', { courseId: 'c1', volumeId: 'v1', level: 'LEVEL1', count: 2 });
		assert.equal(res.status, 200);
		const body = await res.json();
		assert.equal(body.generated.items.length, 2);
		const ids = body.generated.items.map(i => i.moduleId);
		assert.deepEqual([...ids].sort(), ['m1', 'm2']);
	});
});

test('module without LOS is flagged INSTRUCTOR REVIEW REQUIRED', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/summary-sheets/generate-ai/preview', { courseId: 'c1', moduleId: 'm3', level: 'LEVEL1' });
		assert.equal(res.status, 200);
		const body = await res.json();
		assert.equal(body.generated.items[0].validation.status, 'INSTRUCTOR REVIEW REQUIRED');
		assert.ok(body.generated.items[0].validation.findings.some(f => /Learning Outcome Statements/.test(f)));
	});
});

test('empty volume returns 400', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/summary-sheets/generate-ai/preview', { courseId: 'c1', volumeId: 'vX', level: 'LEVEL1' });
		assert.equal(res.status, 400);
		assert.match((await res.json()).error, /No learning modules/);
	});
});

test('generation failure yields an error preview item instead of crashing', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	deps.chatCompletion = async () => { throw new Error('model unavailable'); };
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/summary-sheets/generate-ai/preview', { courseId: 'c1', moduleId: 'm1', level: 'LEVEL1' });
		assert.equal(res.status, 200);
		const body = await res.json();
		assert.equal(body.generated.items.length, 1);
		assert.ok(body.generated.items[0]._error);
		assert.equal(body.generated.items[0].validation.status, 'INSTRUCTOR REVIEW REQUIRED');
	});
});

test('accept saves each item against its own module and skips failed placeholders', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const generated = {
			items: [
				{ title: 'A', moduleId: 'm1', volumeId: 'v1', courseId: 'c1', level: 'LEVEL1', snapshot: 'x', diagrams: [{ topic: 'Interest Rates' }], useCase: 'PASS' },
				{ title: 'B', moduleId: 'm2', volumeId: 'v1', courseId: 'c1', level: 'LEVEL1', _error: 'boom' },
			],
		};
		const res = await post(base, '/api/summary-sheets/generate-ai/accept', {
			generated, meta: { courseId: 'c1', level: 'LEVEL1' }, selectedIndices: [0, 1],
		});
		assert.equal(res.status, 201);
		const body = await res.json();
		assert.equal(body.created, 1);
		assert.equal(body.skipped.length, 1);
		assert.equal(prisma.created[0].moduleId, 'm1');
		assert.equal(prisma.created[0].status, 'DRAFT');
		assert.ok(Array.isArray(prisma.created[0].diagrams));
	});
});

test('manual create accepts the diagrams field (schema bug fix)', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/summary-sheets', {
			title: 'Manual', level: 'LEVEL1', diagrams: [{ topic: 'X' }],
		});
		assert.equal(res.status, 201);
		assert.ok(Array.isArray(prisma.created[0].diagrams));
	});
});

test('deepValidation=false disables the AI validation pass', async () => {
	const prisma = makePrisma();
	const { deps, calls } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/summary-sheets/generate-ai/preview', {
			courseId: 'c1', moduleId: 'm1', level: 'LEVEL1', deepValidation: false,
		});
		assert.equal(res.status, 200);
		assert.equal(calls.chat.length, 1);
		assert.ok(!String(calls.chat[0].messages[0].content).includes('QA validator'));
	});
});

test('deepValidation=true forces the AI validation pass', async () => {
	const prisma = makePrisma();
	const { deps, calls } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/summary-sheets/generate-ai/preview', {
			courseId: 'c1', moduleId: 'm1', level: 'LEVEL1', deepValidation: true,
		});
		assert.equal(res.status, 200);
		assert.equal(calls.chat.length, 2);
		assert.ok(calls.chat.some(c => String(c.messages[0].content).includes('QA validator')));
	});
});
