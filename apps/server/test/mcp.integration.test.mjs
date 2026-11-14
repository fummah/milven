import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createReviewBatch, approveReviewBatch, commitApprovedBatch, getReviewBatch } from '../src/lib/questions/questionReview.js';

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
			options: [
				{ label: 'A', text: 'Act immediately without documentation.', isCorrect: false, rationale: 'Ignores evidence.' },
				{ label: 'B', text: 'Document the evidence and assumptions before deciding.', isCorrect: true, rationale: 'Matches a disciplined process.' },
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
		assert.deepEqual(full.options.map(option => option.position), [0, 1, 2]);
		assert.deepEqual(full.options.map(option => option.isCorrect), [false, true, false]);
		assert.equal(full.generationSource, 'MCP');
		const batch = await getReviewBatch(prisma, created.batch.id);
		assert.equal(batch.status, 'COMMITTED');
		assert.equal(batch.commitStatus, 'COMMITTED');
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
