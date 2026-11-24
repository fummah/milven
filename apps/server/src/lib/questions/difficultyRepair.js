import { normalizeDifficultyValue } from '../questionDifficulty.js';

export async function scanDifficultyRepairs(prisma, { limit = 500 } = {}) {
	const take = Math.min(5000, Math.max(1, Number(limit) || 500));
	const items = await prisma.mcpImportItem.findMany({
		where: { committedQuestionId: { not: null } },
		orderBy: { committedAt: 'desc' },
		take,
		include: {
			batch: { select: { id: true, sourceClient: true, status: true, commitStatus: true } }
		}
	});
	const candidates = [];
	const manualReview = [];
	for (const item of items) {
		const payload = item.payload || {};
		const expectedParent = normalizeDifficultyValue(payload.difficulty);
		const question = await prisma.question.findUnique({
			where: { id: item.committedQuestionId },
			include: { children: { orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }], select: { id: true, qid: true, difficulty: true, orderIndex: true } } }
		});
		if (!question) {
			manualReview.push({ itemId: item.id, committedQuestionId: item.committedQuestionId, reason: 'Committed question not found.' });
			continue;
		}
		if (!expectedParent) {
			manualReview.push({ itemId: item.id, committedQuestionId: question.id, qid: question.qid, reason: 'Original staged difficulty is missing or invalid.' });
		} else if (question.difficulty !== expectedParent) {
			candidates.push({
				type: 'PARENT',
				itemId: item.id,
				batchId: item.batchId,
				committedQuestionId: question.id,
				qid: question.qid,
				currentDifficulty: question.difficulty,
				originalDifficulty: expectedParent,
				proposedDifficulty: expectedParent,
				safeToApply: true
			});
		}
		const children = Array.isArray(payload.subQuestions) ? payload.subQuestions : [];
		const byQid = new Map(question.children.map(child => [child.qid, child]));
		const sameCount = children.length === question.children.length;
		children.forEach((child, index) => {
			const saved = byQid.get(child.externalQuestionId) || (sameCount ? question.children[index] : null);
			const expected = normalizeDifficultyValue(child.difficulty) || expectedParent;
			if (!saved) {
				manualReview.push({ itemId: item.id, committedQuestionId: question.id, qid: child.externalQuestionId, reason: 'Committed child could not be matched.' });
				return;
			}
			if (!expected) {
				manualReview.push({ itemId: item.id, committedQuestionId: saved.id, qid: saved.qid, reason: 'Original child difficulty is missing or invalid.' });
				return;
			}
			if (saved.difficulty !== expected) {
				candidates.push({
					type: 'CHILD',
					itemId: item.id,
					batchId: item.batchId,
					committedQuestionId: saved.id,
					parentQuestionId: question.id,
					qid: saved.qid,
					currentDifficulty: saved.difficulty,
					originalDifficulty: expected,
					proposedDifficulty: expected,
					safeToApply: true
				});
			}
		});
	}
	return {
		ok: true,
		scanned: items.length,
		candidateCount: candidates.length,
		manualReviewCount: manualReview.length,
		candidates,
		manualReview
	};
}

export async function applyDifficultyRepairs(prisma, repairs, { actorId = null } = {}) {
	if (!Array.isArray(repairs) || !repairs.length) return { ok: false, statusCode: 400, error: 'At least one difficulty repair is required.' };
	const results = [];
	for (const repair of repairs) {
		if (!repair.questionId) {
			results.push({ questionId: null, ok: false, error: 'questionId is required.' });
			continue;
		}
		const expected = normalizeDifficultyValue(repair.expectedDifficulty);
		const proposed = normalizeDifficultyValue(repair.proposedDifficulty);
		if (!expected || !proposed) {
			results.push({ questionId: repair.questionId, ok: false, error: 'Expected and proposed difficulty must be valid EASY, MEDIUM or HARD values.' });
			continue;
		}
		const question = await prisma.question.findUnique({ where: { id: repair.questionId }, select: { id: true, qid: true, difficulty: true } });
		if (!question) {
			results.push({ questionId: repair.questionId, ok: false, error: 'Question not found.' });
			continue;
		}
		if (question.difficulty !== expected) {
			results.push({ questionId: question.id, qid: question.qid, ok: false, error: 'The question changed since the audit preview. Re-run the audit.' });
			continue;
		}
		await prisma.$transaction(async tx => {
			await tx.question.update({ where: { id: question.id }, data: { difficulty: proposed } });
			await tx.mcpAuditLog.create({
				data: {
					action: 'QUESTION_DIFFICULTY_REPAIRED',
					actorId,
					detail: { questionId: question.id, qid: question.qid, oldDifficulty: question.difficulty, newDifficulty: proposed }
				}
			});
		});
		results.push({ questionId: question.id, qid: question.qid, ok: true, oldDifficulty: question.difficulty, newDifficulty: proposed });
	}
	return { ok: results.every(result => result.ok), repairedCount: results.filter(result => result.ok).length, results };
}
