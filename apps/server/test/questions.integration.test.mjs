/**
 * Integration test for AI Question Generation + database insert.
 *
 * Runs the REAL cms question-generation flow (auth → provider/model → AI request
 * → parsing/validation → SSE preview → accept → DB insert) with a stateful
 * in-memory Prisma fake and a mocked provider client (chatCompletion).
 *
 * Run with:  node --test "test/**\/*.test.mjs"   (from apps/server)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { cmsRouter } from '../src/routes/cms.js';
import { readSseStream } from '../../web/src/lib/sse.js';

const TOPICS = {
	t1: { id: 't1', name: 'Interest Rates', courseId: 'c1', moduleId: 'm1', level: 'LEVEL1', order: 1, module: { id: 'm1', courseId: 'c1', volumeId: 'v1', course: { level: 'LEVEL1' } } },
	t2: { id: 't2', name: 'Return Measurement', courseId: 'c1', moduleId: 'm1', level: 'LEVEL1', order: 2, module: { id: 'm1', courseId: 'c1', volumeId: 'v1', course: { level: 'LEVEL1' } } },
	t3: { id: 't3', name: 'Statistics', courseId: 'c1', moduleId: 'm1', level: 'LEVEL1', order: 3, module: { id: 'm1', courseId: 'c1', volumeId: 'v1', course: { level: 'LEVEL1' } } },
};

function makePrisma() {
	const questions = [];
	const options = [];
	let qseq = 0;
	let oseq = 0;
	const api = {
		_questions: questions,
		_options: options,
		course: { findUnique: async ({ where }) => (where.id === 'c1' ? { id: 'c1', name: 'Quantitative Methods', level: 'LEVEL1' } : null) },
		volume: { findUnique: async ({ where }) => (where.id === 'v1' ? { name: 'Vol 1' } : null) },
		module: { findUnique: async ({ where }) => ({ id: where.id }) },
		topic: {
			findMany: async ({ where }) => {
				let list = Object.values(TOPICS);
				if (where.courseId) list = list.filter(t => t.courseId === where.courseId);
				if (where.moduleId) list = list.filter(t => t.moduleId === where.moduleId);
				if (where.id?.in) list = list.filter(t => where.id.in.includes(t.id));
				return list.map(t => ({ id: t.id, name: t.name, order: t.order }));
			},
			findUnique: async ({ where }) => {
				const t = TOPICS[where.id];
				if (!t) return null;
				return { moduleId: t.moduleId, level: t.level, module: { courseId: t.module.courseId, volumeId: t.module.volumeId, course: t.module.course } };
			},
		},
		concept: { findMany: async () => [{ id: 'cpt1', name: 'Required Return', topicId: 't1' }] },
		curriculumDocument: { findUnique: async () => null },
		question: {
			findMany: async () => [],
			findFirst: async () => null,
			create: async ({ data }) => { const rec = { id: 'q' + (++qseq), ...data }; questions.push(rec); return rec; },
			findUnique: async ({ where }) => {
				const q = questions.find(x => x.id === where.id);
				if (!q) return null;
				return { ...q, options: options.filter(o => o.questionId === q.id) };
			},
		},
		mcqOption: {
			createMany: async ({ data }) => { for (const o of data) options.push({ id: 'o' + (++oseq), ...o }); return { count: data.length }; },
		},
		$transaction: async (arg) => {
			const qSnapshot = questions.slice();
			const oSnapshot = options.slice();
			try {
				if (typeof arg === 'function') return await arg(api);
				return await Promise.all(arg);
			} catch (err) {
				questions.length = 0; questions.push(...qSnapshot);
				options.length = 0; options.push(...oSnapshot);
				throw err;
			}
		},
	};
	return api;
}

function mcqItems() {
	const mk = (stem, correct, others) => ({
		stem,
		options: [{ text: correct, isCorrect: true }, ...others.map(t => ({ text: t, isCorrect: false }))],
		difficulty: 'MEDIUM',
		los: 'calculate and interpret return',
		traceSection: 'Rates and Returns',
		tracePage: 'p. 10',
		keyFormulas: '\\( HPR = \\frac{P_1 - P_0}{P_0} \\)',
		workedSolution: 'Step 1: apply the formula. Step 2: conclude.',
		explanation: 'The correct option follows from the formula.',
	});
	return [
		mk('What is 2 + 2?', '4', ['3', '5']),
		mk('What is 3 × 3?', '9', ['6', '12']),
		mk('What is 5 − 2?', '3', ['2', '7']),
	];
}

function makeDeps() {
	const calls = { chat: [] };
	return {
		calls,
		deps: {
			getActiveProvider: async () => 'openai',
			getActiveModel: async () => 'gpt-4o-mini',
			getDefaultModel: () => 'gpt-4o-mini',
			getAIApiKey: async () => 'sk-test',
			// Mock only the provider client layer.
			chatCompletion: async (opts) => {
				calls.chat.push(opts);
				const sys = String(opts?.messages?.[0]?.content || '');
				// The optional difficulty validation pass:
				if (sys.includes('difficulty validator') || sys.includes('QA validator')) {
					return { text: JSON.stringify({ mismatches: [] }), content: JSON.stringify({ mismatches: [] }), provider: opts.provider, model: opts.model };
				}
				const body = JSON.stringify({ items: mcqItems() });
				return { text: body, content: body, provider: opts.provider, model: opts.model, usage: {} };
			},
		},
	};
}

function token(role = 'ADMIN') {
	return jwt.sign({ sub: 'u1', role }, process.env.JWT_SECRET ?? 'dev_secret');
}

async function withServer(prisma, deps, fn) {
	const app = express();
	app.use(express.json({ limit: '10mb' }));
	app.use('/api/cms', cmsRouter(prisma, deps));
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

async function readResult(res) {
	let result = null;
	let sseError = null;
	await readSseStream(res.body, (evt) => {
		if (evt.event === 'result') result = evt.data;
		else if (evt.event === 'error') sseError = evt.data;
	});
	return { result, sseError };
}

test('questions: generates 3 MCQs with the selected provider + model', async () => {
	const prisma = makePrisma();
	const { deps, calls } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/cms/questions/generate-ai/preview', {
			courseId: 'c1', topicIds: ['t1', 't2', 't3'], questionType: 'MCQ', difficulty: 'MEDIUM', count: 3,
			provider: 'anthropic', model: 'claude-x',
		});
		assert.equal(res.status, 200);
		const { result, sseError } = await readResult(res);
		assert.equal(sseError, null);
		assert.ok(result, 'expected a result event');
		assert.equal(result.generated.items.length, 3);
		for (const q of result.generated.items) {
			assert.ok(q.stem, 'question stem present');
			assert.ok(Array.isArray(q.options) && q.options.length >= 2, 'options present');
			assert.ok(q.options.filter(o => o.isCorrect).length === 1, 'exactly one correct option');
			assert.ok(q.topicId, 'topic assigned');
			assert.ok(q.difficulty, 'difficulty assigned');
		}
		// The provider client received the selected provider/model.
		const genCall = calls.chat.find(c => !String(c.messages[0].content).includes('validator'));
		assert.equal(genCall.provider, 'anthropic');
		assert.equal(genCall.model, 'claude-x');
	});
});

test('questions: accept inserts generated questions and they can be queried back', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	await withServer(prisma, deps, async (base) => {
		// 1) Generate.
		const previewRes = await post(base, '/api/cms/questions/generate-ai/preview', {
			courseId: 'c1', topicIds: ['t1', 't2', 't3'], questionType: 'MCQ', difficulty: 'MEDIUM', count: 3,
			provider: 'openai', model: 'gpt-4o-mini',
		});
		const { result } = await readResult(previewRes);
		assert.equal(result.generated.items.length, 3);

		// 2) Insert.
		const acceptRes = await post(base, '/api/cms/questions/generate-ai/accept', {
			questionType: 'MCQ',
			generated: result.generated,
			selectedIndices: [0, 1, 2],
		});
		assert.equal(acceptRes.status, 201);
		const acceptBody = await acceptRes.json();
		assert.equal(acceptBody.created, 3);
		assert.equal(prisma._questions.length, 3);
		assert.equal(prisma._options.length, 9); // 3 options × 3 questions

		// 3) Query back through the admin GET endpoint.
		const firstId = acceptBody.questions[0].id;
		const getRes = await fetch(`${base}/api/cms/questions/${firstId}`, { headers: { Authorization: `Bearer ${token()}` } });
		assert.equal(getRes.status, 200);
		const got = (await getRes.json()).question;
		assert.ok(got.stem && got.stem.length > 0);
		assert.equal(got.type, 'MCQ');
		assert.equal(got.courseId, 'c1');
		assert.equal(got.volumeId, 'v1');
		assert.equal(got.moduleId, 'm1');
		assert.ok(Array.isArray(got.options) && got.options.length === 3);
		assert.equal(got.options.filter(o => o.isCorrect).length, 1);
	});
});

test('questions: empty AI response is surfaced as AI_GENERATION_EMPTY', async () => {
	const prisma = makePrisma();
	const { deps } = makeDeps();
	deps.chatCompletion = async (opts) => {
		const sys = String(opts?.messages?.[0]?.content || '');
		if (sys.includes('validator')) return { text: JSON.stringify({ mismatches: [] }), content: JSON.stringify({ mismatches: [] }) };
		return { text: JSON.stringify({ items: [] }), content: JSON.stringify({ items: [] }) };
	};
	await withServer(prisma, deps, async (base) => {
		const res = await post(base, '/api/cms/questions/generate-ai/preview', {
			courseId: 'c1', topicIds: ['t1'], questionType: 'MCQ', difficulty: 'MEDIUM', count: 1,
			provider: 'openai', model: 'gpt-4o-mini',
		});
		const { result, sseError } = await readResult(res);
		assert.equal(result, null);
		assert.equal(sseError.error, 'AI_GENERATION_EMPTY');
		assert.equal(sseError.provider, 'openai');
		assert.equal(sseError.model, 'gpt-4o-mini');
	});
});
