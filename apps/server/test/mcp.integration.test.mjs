import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createReviewBatch, approveReviewBatch, commitApprovedBatch, deleteReviewBatch, getReviewBatch } from '../src/lib/questions/questionReview.js';

const runIntegration = process.env.RUN_MCP_INTEGRATION === '1';

test('MCP approval workflow persists and reuses option order', { skip: !runIntegration }, async () => {
	const prisma = new PrismaClient();
	const createdBatchIds = [];
	const createdQuestionIds = [];
	try {
		const course = await prisma.course.findFirst({ where: { level: 'LEVEL3' }, orderBy: { name: 'asc' } });
		if (!course) return;
		const link = await prisma.courseVolume.findFirst({ where: { courseId: course.id }, orderBy: { order: 'asc' }, include: { volume: true } });
		if (!link) return;
		const module = await prisma.module.findFirst({ where: { courseId: course.id, volumeId: link.volumeId }, orderBy: { order: 'asc' } });
		if (!module) return;
		const topic = await prisma.topic.findFirst({ where: { moduleId: module.id }, orderBy: { order: 'asc' } });
		if (!topic) return;
		const concept = await prisma.concept.findFirst({ where: { topicId: topic.id }, orderBy: { order: 'asc' } });
		const stamp = Date.now();
		const payload = {
			schemaVersion: '2026-11-08',
			externalQuestionId: `INTEGRATION-MCP-${stamp}`,
			questionType: 'MCQ',
			courseId: course.id,
			volumeId: link.volumeId,
			moduleId: module.id,
			primaryTopicId: topic.id,
			additionalTopicIds: [],
			conceptIds: concept ? [concept.id] : [],
			difficulty: 'MEDIUM',
			marks: 3,
			stem: 'A candidate is reviewing an investment process and must choose the most appropriate next action. Which action best preserves a documented and evidence-based decision process?',
			los: 'Evaluate the decision process.',
			traceSection: 'Asset Allocation',
			tracePage: 'p. 10',
			keyFormulas: '\\( E(R) = R_f + \\beta (E(R_m)-R_f) \\)',
			workedSolution: 'Step 1: review the evidence. Step 2: document the assumptions. Step 3: select the defensible action.',
			correctAnswerExplanation: 'The documented process preserves evidence and supports a defensible decision.',
			incorrectOptionsExplanation: 'The distractors skip documentation or ignore conflicting evidence.',
			commonMistake: 'Acting before documenting the evidence.',
			conceptsTested: 'Disciplined evidence-based decision making.',
			sourceConcept: 'Evidence-based decision process',
			sourceSetId: 'SET-READBACK',
			options: [
				{ label: 'A', text: 'Act immediately without documentation.`r`n`t`t', isCorrect: false, rationale: '`r`n`t`t' },
				{ label: 'B', text: 'Document the evidence and assumptions before deciding.\\r\\n\\t\\t', isCorrect: true, rationale: 'Matches a disciplined process.\\r\\n\\t\\t' },
				{ label: 'C', text: 'Ignore conflicting information.', isCorrect: false, rationale: 'Fails to evaluate the evidence.' }
			],
			generation: { source: 'INTEGRATION_TEST', client: 'milven-test', provider: 'test', model: 'none' },
			reviewMetadata: { integrationTest: true }
		};
		const created = await createReviewBatch(prisma, {
			idempotencyKey: `integration-${stamp}`,
			externalRequestId: `integration-${stamp}`,
			sourceClient: 'milven-integration-test',
			sourceProvider: 'test',
			questions: [payload]
		});
		assert.equal(created.ok, true);
		createdBatchIds.push(created.batch.id);
		assert.equal(created.batch.status, 'VALIDATED');

		const retry = await createReviewBatch(prisma, {
			idempotencyKey: `integration-${stamp}`,
			sourceClient: 'milven-integration-test',
			questions: [payload]
		});
		assert.equal(retry.idempotentReplay, true);

		const approved = await approveReviewBatch(prisma, created.batch.id, { actorId: null });
		assert.equal(approved.ok, true);
		const committed = await commitApprovedBatch(prisma, created.batch.id, { actorId: null });
		assert.equal(committed.ok, true);
		assert.equal(committed.summary.committedCount, 1);
		assert.equal(committed.summary.committedQuestionIds.length, 1);
		const questionId = committed.summary.committedQuestionIds[0];
		createdQuestionIds.push(questionId);

		const full = await prisma.question.findUnique({
			where: { id: questionId },
			include: { options: { orderBy: { position: 'asc' } }, concepts: true }
		});
		assert.equal(full.qid, payload.externalQuestionId);
		assert.equal(full.type, 'MCQ');
		assert.equal(full.courseId, course.id);
		assert.equal(full.volumeId, link.volumeId);
		assert.equal(full.moduleId, module.id);
		assert.equal(full.topicId, topic.id);
		assert.deepEqual(full.options.map(option => option.text), ['Act immediately without documentation.', 'Document the evidence and assumptions before deciding.', 'Ignore conflicting information.']);
		assert.deepEqual(full.options.map(option => option.rationale), [null, 'Matches a disciplined process.', 'Fails to evaluate the evidence.']);
		assert.deepEqual(full.options.map(option => option.position), [0, 1, 2]);
		assert.deepEqual(full.options.map(option => option.isCorrect), [false, true, false]);
		assert.equal(full.generationSource, 'MCP');
		const batch = await getReviewBatch(prisma, created.batch.id);
		assert.equal(batch.status, 'COMMITTED');
		assert.equal(batch.commitStatus, 'COMMITTED');

		const deleted = await deleteReviewBatch(prisma, created.batch.id, { actorId: null });
		assert.equal(deleted.ok, true);
		assert.equal(deleted.liveQuestionsRetained, true);
		assert.equal(await getReviewBatch(prisma, created.batch.id), null);
		assert.ok(await prisma.question.findUnique({ where: { id: questionId } }));
	} finally {
		if (createdQuestionIds.length) {
			const children = await prisma.question.findMany({ where: { parentId: { in: createdQuestionIds } }, select: { id: true } });
			const ids = [...createdQuestionIds, ...children.map(child => child.id)];
			await prisma.mcqOption.deleteMany({ where: { questionId: { in: ids } } });
			await prisma.question.deleteMany({ where: { parentId: { in: createdQuestionIds } } });
			await prisma.question.deleteMany({ where: { id: { in: createdQuestionIds } } });
		}
		if (createdBatchIds.length) await prisma.mcpImportBatch.deleteMany({ where: { id: { in: createdBatchIds } } });
		await prisma.$disconnect();
	}
});
test('MCP vignette commit preserves every child difficulty and parent difficulty', { skip: !runIntegration }, async () => {
	const prisma = new PrismaClient();
	const createdBatchIds = [];
	const createdQuestionIds = [];
	try {
		const course = await prisma.course.findFirst({ where: { level: 'LEVEL3' }, orderBy: { name: 'asc' } });
		if (!course) return;
		const link = await prisma.courseVolume.findFirst({ where: { courseId: course.id }, orderBy: { order: 'asc' } });
		if (!link) return;
		const module = await prisma.module.findFirst({ where: { courseId: course.id, volumeId: link.volumeId }, orderBy: { order: 'asc' } });
		if (!module) return;
		const topic = await prisma.topic.findFirst({ where: { moduleId: module.id }, orderBy: { order: 'asc' } });
		if (!topic) return;
		const stamp = Date.now();
		const difficulties = ['EASY', 'MEDIUM', 'HARD', 'HARD'];
		const children = difficulties.map((difficulty, index) => ({
			externalQuestionId: `DIFF-VIGNETTE-${stamp}-Q${index + 1}`,
			stem: `Which statement best supports the committee decision for item ${index + 1}?`,
			difficulty,
			marks: 3,
			primaryTopicId: topic.id,
			conceptIds: [],
			los: 'Evaluate the evidence in the case study.',
			traceSection: 'Asset Allocation',
			tracePage: '25',
			workedSolution: `Step 1: review the case facts for item ${index + 1}. Step 2: reach a documented conclusion.`,
			correctAnswerExplanation: 'The conclusion follows from the stated evidence and assumptions.',
			incorrectOptionsExplanation: 'The distractors contradict the supplied case facts.',
			commonMistake: 'Ignoring the stated evidence.',
			conceptsTested: 'Evidence-based decision making.',
			options: [
				{ label: 'A', text: `Statement ${index + 1}A`, isCorrect: true, rationale: 'Supported by the case facts.' },
				{ label: 'B', text: `Statement ${index + 1}B`, isCorrect: false, rationale: 'Contradicts the case facts.' },
				{ label: 'C', text: `Statement ${index + 1}C`, isCorrect: false, rationale: 'Adds an unsupported assumption.' }
			]
		}));
		const payload = {
			schemaVersion: '2026-11-16',
			externalQuestionId: `DIFF-SET-${stamp}`,
			questionType: 'VIGNETTE_MCQ',
			courseId: course.id,
			volumeId: link.volumeId,
			moduleId: module.id,
			primaryTopicId: topic.id,
			additionalTopicIds: [],
			conceptIds: [],
			difficulty: 'HARD',
			marks: 12,
			stem: 'Difficulty Preservation Case Study',
			vignetteText: 'An investment committee is reviewing a multi-asset portfolio after a change in inflation and policy rates. The committee must document the evidence, distinguish temporary noise from structural change, and explain the conditions under which the recommendation would be revised. Each question tests a separate part of the same case study, and every conclusion must be supported by the shared facts.',
			subQuestions: children,
			generation: { source: 'INTEGRATION_TEST', client: 'milven-test', provider: 'test', model: 'none' }
		};
		const created = await createReviewBatch(prisma, {
			idempotencyKey: `difficulty-vignette-${stamp}`,
			sourceClient: 'milven-difficulty-test',
			questions: [payload]
		});
		assert.equal(created.ok, true, JSON.stringify(created));
		createdBatchIds.push(created.batch.id);
		const approved = await approveReviewBatch(prisma, created.batch.id, { actorId: null });
		assert.equal(approved.ok, true, JSON.stringify(approved));
		const committed = await commitApprovedBatch(prisma, created.batch.id, { actorId: null });
		assert.equal(committed.ok, true, JSON.stringify(committed.summary));
		const parentId = committed.summary.committedQuestionIds[0];
		createdQuestionIds.push(parentId);
		const saved = await prisma.question.findUnique({
			where: { id: parentId },
			include: { children: { orderBy: { orderIndex: 'asc' } } }
		});
		assert.equal(saved.difficulty, 'HARD');
		assert.deepEqual(saved.children.map(child => child.difficulty), ['EASY', 'MEDIUM', 'HARD', 'HARD']);
		assert.deepEqual(saved.children.map(child => child.qid), children.map(child => child.externalQuestionId));
	} finally {
		if (createdQuestionIds.length) {
			const children = await prisma.question.findMany({ where: { parentId: { in: createdQuestionIds } }, select: { id: true } });
			const ids = [...createdQuestionIds, ...children.map(child => child.id)];
			await prisma.mcqOption.deleteMany({ where: { questionId: { in: ids } } });
			await prisma.question.deleteMany({ where: { parentId: { in: createdQuestionIds } } });
			await prisma.question.deleteMany({ where: { id: { in: createdQuestionIds } } });
		}
		if (createdBatchIds.length) await prisma.mcpImportBatch.deleteMany({ where: { id: { in: createdBatchIds } } });
		await prisma.$disconnect();
	}
});
test('MCP standalone commit preserves EASY, MEDIUM and HARD exactly', { skip: !runIntegration }, async () => {
	const prisma = new PrismaClient();
	const createdBatchIds = [];
	const createdQuestionIds = [];
	try {
		const course = await prisma.course.findFirst({ where: { level: 'LEVEL3' }, orderBy: { name: 'asc' } });
		if (!course) return;
		const link = await prisma.courseVolume.findFirst({ where: { courseId: course.id }, orderBy: { order: 'asc' } });
		if (!link) return;
		const module = await prisma.module.findFirst({ where: { courseId: course.id, volumeId: link.volumeId }, orderBy: { order: 'asc' } });
		if (!module) return;
		const topic = await prisma.topic.findFirst({ where: { moduleId: module.id }, orderBy: { order: 'asc' } });
		if (!topic) return;
		const stamp = Date.now();
		const questions = ['EASY', 'MEDIUM', 'HARD'].map((difficulty, index) => ({
			schemaVersion: '2026-11-16',
			externalQuestionId: `DIFF-STANDALONE-${stamp}-${difficulty}`,
			questionType: 'MCQ',
			courseId: course.id,
			volumeId: link.volumeId,
			moduleId: module.id,
			primaryTopicId: topic.id,
			additionalTopicIds: [],
			conceptIds: [],
			difficulty,
			marks: 1,
			stem: `Which conclusion is most appropriate for difficulty test ${index + 1}?`,
			los: 'Evaluate the conclusion.',
			traceSection: 'Asset Allocation',
			tracePage: '25',
			workedSolution: `Step 1: review the evidence for item ${index + 1}. Step 2: conclude.`,
			correctAnswerExplanation: 'The conclusion follows from the stated evidence.',
			incorrectOptionsExplanation: 'The other options contradict the evidence.',
			commonMistake: 'Ignoring the evidence.',
			conceptsTested: 'Evidence-based conclusions.',
			options: [
				{ label: 'A', text: `Conclusion ${index + 1}A`, isCorrect: true, rationale: 'Supported.' },
				{ label: 'B', text: `Conclusion ${index + 1}B`, isCorrect: false, rationale: 'Unsupported.' },
				{ label: 'C', text: `Conclusion ${index + 1}C`, isCorrect: false, rationale: 'Contradicts evidence.' }
			],
			generation: { source: 'INTEGRATION_TEST', client: 'milven-test', provider: 'test', model: 'none' }
		}));
		const created = await createReviewBatch(prisma, {
			idempotencyKey: `difficulty-standalone-${stamp}`,
			sourceClient: 'milven-difficulty-test',
			questions
		});
		assert.equal(created.ok, true, JSON.stringify(created));
		createdBatchIds.push(created.batch.id);
		const approved = await approveReviewBatch(prisma, created.batch.id, { actorId: null });
		assert.equal(approved.ok, true, JSON.stringify(approved));
		const committed = await commitApprovedBatch(prisma, created.batch.id, { actorId: null });
		assert.equal(committed.ok, true, JSON.stringify(committed.summary));
		createdQuestionIds.push(...committed.summary.committedQuestionIds);
		const saved = await prisma.question.findMany({ where: { id: { in: createdQuestionIds } }, orderBy: { qid: 'asc' } });
		assert.deepEqual(saved.map(question => question.difficulty).sort(), ['EASY', 'HARD', 'MEDIUM']);
		assert.deepEqual(saved.map(question => question.qid).sort(), questions.map(question => question.externalQuestionId).sort());
		assert.equal(committed.summary.readbackVerifiedCount, 3);
	} finally {
		if (createdQuestionIds.length) {
			await prisma.mcqOption.deleteMany({ where: { questionId: { in: createdQuestionIds } } });
			await prisma.question.deleteMany({ where: { id: { in: createdQuestionIds } } });
		}
		if (createdBatchIds.length) await prisma.mcpImportBatch.deleteMany({ where: { id: { in: createdBatchIds } } });
		await prisma.$disconnect();
	}
});