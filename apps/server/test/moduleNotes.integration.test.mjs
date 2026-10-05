/**
 * Route-level integration tests for the Milven Notes AI generator (topic-level).
 * Injects a fake Prisma client and fake AI so the full HTTP/SSE route can be
 * exercised without a database or network.
 *
 * Run with:  node --test "test/**\/*.test.mjs"   (from apps/server)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { moduleNotesRouter } from '../src/routes/moduleNotes.js';

const COURSE = { id: 'c1', name: 'Quantitative Methods', level: 'LEVEL1' };
const MODULES = {
	m1: { id: 'm1', name: 'Rates and Returns', volumeId: 'v1', volume: { id: 'v1', name: 'Vol 1' } },
	m2: { id: 'm2', name: 'Time Value', volumeId: 'v1', volume: { id: 'v1', name: 'Vol 1' } },
};
const TOPICS = [
	{ id: 't1', name: 'Interest Rates', losCode: 'LOS 1.a', commandWord: 'interpret', learningOutcomeStatement: 'interpret interest rates', courseId: 'c1', moduleId: 'm1', module: MODULES.m1 },
	{ id: 't2', name: 'Return Measurement', losCode: 'LOS 1.b', commandWord: 'calculate', learningOutcomeStatement: 'calculate returns', courseId: 'c1', moduleId: 'm1', module: MODULES.m1 },
	{ id: 't3', name: 'No LOS Topic', losCode: null, commandWord: null, learningOutcomeStatement: null, courseId: 'c1', moduleId: 'm2', module: MODULES.m2 },
];

function makePrisma() {
	const created = [];
	return {
		created,
		course: { findUnique: async ({ where }) => (where.id === COURSE.id ? COURSE : null) },
		topic: {
			findUnique: async ({ where }) => TOPICS.find(t => t.id === where.id) || null,
			findMany: async ({ where }) => TOPICS.filter(t => t.courseId === where.courseId
				&& (!where.moduleId || t.moduleId === where.moduleId)
				&& (!where.module || !where.module.volumeId || t.module.volumeId === where.module.volumeId)),
		},
		concept: {
			findMany: async ({ where }) => (where.topicId === 't1'
				? [{ name: 'Required Return', losCode: 'LOS 1.a', commandWord: 'interpret', learningOutcomeStatement: 'interpret interest rates' }]
				: []),
		},
		formula: {
			findMany: async ({ where }) => (where.OR && where.OR[0].topicId === 't1'
				? [{ name: 'HPR', formula: '\\( HPR \\)', variables: 'x', interpretation: 'i', whenToUse: 'u', watchOut: '', losTag: '' }]
				: []),
		},
		moduleNote: {
			findMany: async () => [],
			create: async ({ data }) => { created.push(data); return { id: 'note-' + created.length, ...data }; },
		},
		curriculumDocument: {
			findUnique: async ({ where }) => (where.courseId_volumeId.volumeId === 'v1' ? { extractedText: 'curriculum for v1' } : null),
		},
	};
}

function noteFixture() {
	return {
		notes: [{
			title: 'Interest Rates',
			studyTime: '1.5 hours',
			difficulty: 'Foundational',
			calculatorUse: 'Moderate',
			overview: 'Introduction to interest rates.',
			losStatements: [{ ref: 'LOS 1.a', statement: 'interpret interest rates', commandWord: 'interpret' }],
			conceptMap: [{ node: 'Interest Rates', connectsTo: 'objective', concepts: ['required return'] }],
			concepts: [
				{ sectionNumber: '4.1', title: 'Meaning', meaning: 'm', explanation: 'e', formula: '\\( x \\)', formulaVariables: 'x', formulaUseCase: 'u', formulaExamTrap: 't', interpretation: 'i', workedExample: { title: 'ex', given: 'g', solution: 's', conclusion: 'c' }, examTip: 'et', commonMistake: 'cm' },
				{ title: 'B' }, { title: 'C' },
			],
			formulaRecap: [{ name: 'HPR', formula: '\\( HPR \\)', useCase: 'u', interpretation: 'i' }],
			workedSolutions: [{ label: 'A', title: 'W', question: 'q', method: 's', interpretation: 'i', trap: 't' }],
			practiceSet: [
				{ question: 'q1', options: ['a', 'b', 'c'], correctAnswer: 'A. a', explanation: 'e', losRef: 'LOS 1.a' },
				{ question: 'q2' }, { question: 'q3' }, { question: 'q4' }, { question: 'q5' },
			],
			commonMistakes: [{ mistake: 'm1', correction: 'c1' }, { mistake: 'm2', correction: 'c2' }],
			examTips: [{ tip: 't1' }, { tip: 't2' }],
			revisionCheck: [{ item: 'i1' }, { item: 'i2' }, { item: 'i3' }, { item: 'i4' }, { item: 'i5' }],
			coverageCheck: { status: 'PASS', notes: [] },
		}],
	};
}

function makeDeps({ activeProvider = 'openai', activeModel = 'gpt-4o-mini', apiKey = 'sk-test', generated = noteFixture() } = {}) {
	const calls = { chat: [] };
	return {
		calls,
		deps: {
			getActiveProvider: async () => activeProvider,
			getActiveModel: async () => activeModel,
			getDefaultModel: () => 'gpt-4o-mini',
			getAIApiKey: async () => apiKey,
			chatCompletion: async (opts) => { calls.chat.push(opts); return { content: JSON.stringify(generated) }; },
		},
	};
}

function token(role = 'ADMIN') {
	return jwt.sign({ sub: 'u1', role }, process.env.JWT_SECRET ?? 'dev_secret');
}

async function withServer(prisma, deps, fn) {
	const app = express();
	app.use(express.json());
	app.use('/api/module-notes', moduleNotesRouter(prisma, deps));
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

test('notes: requested provider + model are honoured', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/module-notes/generate-ai/preview', {
			courseId: 'c1', topicId: 't1', level: 'LEVEL1', provider: 'anthropic', model: 'claude-x',
		});
		assert.equal(res.status, 200);
		const sse = await readSse(res);
		assert.equal(sse.type, 'result');
		assert.equal(sse.data.meta.provider, 'anthropic');
		assert.equal(sse.data.meta.model, 'claude-x');
	});
});

test('notes: explicit topic generates exactly one topic-level note', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/module-notes/generate-ai/preview', { courseId: 'c1', topicId: 't1', level: 'LEVEL1' });
		const sse = await readSse(res);
		assert.equal(sse.type, 'result');
		assert.equal(sse.data.generated.items.length, 1);
		assert.equal(sse.data.generated.items[0].topicId, 't1');
		assert.equal(sse.data.generated.items[0].coverageCheck.status, 'PASS');
	});
});

test('notes: module selection generates one note per topic', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/module-notes/generate-ai/preview', { courseId: 'c1', moduleId: 'm1', level: 'LEVEL1' });
		const sse = await readSse(res);
		assert.equal(sse.type, 'result');
		const ids = sse.data.generated.items.map(i => i.topicId);
		assert.deepEqual([...ids].sort(), ['t1', 't2']);
	});
});

test('notes: topic without LOS is flagged INSTRUCTOR REVIEW REQUIRED', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/module-notes/generate-ai/preview', { courseId: 'c1', topicId: 't3', level: 'LEVEL1' });
		const sse = await readSse(res);
		assert.equal(sse.type, 'result');
		assert.equal(sse.data.generated.items[0].coverageCheck.status, 'INSTRUCTOR REVIEW REQUIRED');
	});
});

test('notes: missing API key returns friendly 400', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps({ apiKey: null });
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/module-notes/generate-ai/preview', { courseId: 'c1', topicId: 't1', level: 'LEVEL1', provider: 'anthropic' });
		assert.equal(res.status, 400);
		assert.match((await res.json()).error, /No API key configured for Anthropic/);
	});
});

test('notes: unknown topic returns SSE error', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/module-notes/generate-ai/preview', { courseId: 'c1', topicId: 'nope', level: 'LEVEL1' });
		assert.equal(res.status, 200);
		const sse = await readSse(res);
		assert.equal(sse.type, 'error');
		assert.match(sse.data.error, /Topic not found/);
	});
});

test('notes: accept maps each note to its own topic and skips failures', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const generated = {
			items: [
				{ title: 'A', topicId: 't1', moduleId: 'm1', volumeId: 'v1', courseId: 'c1', level: 'LEVEL1', overview: 'x', conceptMap: [{ node: 'n' }], coverageCheck: { status: 'PASS' } },
				{ title: 'B', topicId: 't2', moduleId: 'm1', volumeId: 'v1', courseId: 'c1', level: 'LEVEL1', _error: 'boom' },
			],
		};
		const res = await post(base, '/api/module-notes/generate-ai/accept', {
			generated, meta: { courseId: 'c1', level: 'LEVEL1' }, selectedIndices: [0, 1],
		});
		assert.equal(res.status, 201);
		const body = await res.json();
		assert.equal(body.created, 1);
		assert.equal(body.skipped.length, 1);
		assert.equal(prisma.created[0].topicId, 't1');
		assert.equal(prisma.created[0].status, 'DRAFT');
		assert.ok(Array.isArray(prisma.created[0].conceptMap));
	});
});

test('notes: manual create accepts new section fields', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/module-notes', {
			title: 'Manual', level: 'LEVEL1',
			conceptMap: [{ node: 'n' }], commonMistakes: [{ mistake: 'm' }], examTips: [{ tip: 't' }], coverageCheck: { status: 'PASS' },
		});
		assert.equal(res.status, 201);
		assert.ok(Array.isArray(prisma.created[0].conceptMap));
		assert.ok(Array.isArray(prisma.created[0].commonMistakes));
		assert.ok(Array.isArray(prisma.created[0].examTips));
		assert.equal(prisma.created[0].coverageCheck.status, 'PASS');
	});
});
