import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDifficultyRepairs, scanDifficultyRepairs } from '../src/lib/questions/difficultyRepair.js';

function fakePrisma() {
	const question = { id: 'q-parent', qid: 'SET-DIFF', difficulty: 'MEDIUM', children: [
		{ id: 'q1', qid: 'Q1', difficulty: 'MEDIUM', orderIndex: 1 },
		{ id: 'q2', qid: 'Q2', difficulty: 'HARD', orderIndex: 2 }
	] };
	const calls = { updates: [], audits: [] };
	return {
		_calls: calls,
		mcpImportItem: {
			findMany: async () => [{
				id: 'item-1',
				batchId: 'batch-1',
				committedQuestionId: 'q-parent',
				payload: {
					difficulty: 'HARD',
					subQuestions: [
						{ externalQuestionId: 'Q1', difficulty: 'EASY' },
						{ externalQuestionId: 'Q2', difficulty: 'HARD' }
					]
				}
			}]
		},
		question: {
			findUnique: async ({ where }) => {
				if (where.id === 'q-parent') return question;
				return question.children.find(child => child.id === where.id) || null;
			},
			update: async ({ where, data }) => {
				calls.updates.push({ where, data });
				if (where.id === 'q-parent') question.difficulty = data.difficulty;
				else {
					const child = question.children.find(row => row.id === where.id);
					if (child) child.difficulty = data.difficulty;
				}
				return { id: where.id, ...data };
			}
		},
		$transaction: async callback => callback({
			question: {
				update: async ({ where, data }) => {
					calls.updates.push({ where, data });
					return { id: where.id, ...data };
				}
			},
			mcpAuditLog: { create: async ({ data }) => { calls.audits.push(data); return data; } }
		}),
		mcpAuditLog: { create: async ({ data }) => { calls.audits.push(data); return data; } }
	};
}

test('difficulty repair identifies only verified draft-to-committed mismatches', async () => {
	const prisma = fakePrisma();
	const report = await scanDifficultyRepairs(prisma);
	assert.equal(report.candidateCount, 2);
	assert.deepEqual(report.candidates.map(candidate => [candidate.qid, candidate.currentDifficulty, candidate.proposedDifficulty]), [
		['SET-DIFF', 'MEDIUM', 'HARD'],
		['Q1', 'MEDIUM', 'EASY']
	]);
	assert.deepEqual(report.manualReview, []);
});

test('difficulty repair applies only when the audited current value still matches', async () => {
	const prisma = fakePrisma();
	const result = await applyDifficultyRepairs(prisma, [
		{ questionId: 'q-parent', expectedDifficulty: 'MEDIUM', proposedDifficulty: 'HARD' },
		{ questionId: 'q1', expectedDifficulty: 'MEDIUM', proposedDifficulty: 'EASY' }
	], { actorId: 'admin-1' });
	assert.equal(result.ok, true);
	assert.equal(result.repairedCount, 2);
	assert.equal(prisma._calls.audits.length, 2);
	const conflict = await applyDifficultyRepairs(prisma, [
		{ questionId: 'q1', expectedDifficulty: 'HARD', proposedDifficulty: 'EASY' }
	], { actorId: 'admin-1' });
	assert.equal(conflict.ok, false);
});
