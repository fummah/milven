import { splitExplanation } from './sampleBank.js';
import { assessCompleteness } from './questionValidation.js';
import { auditMcpAction, getReviewBatch, updateReviewItem } from './questionReview.js';

function splitMergedExplanation(value) {
	const text = String(value || '').trim();
	if (!text) return { workedSolution: null, explanation: null };
	const separator = '\n\n--- Worked Solution ---\n';
	const legacy = '\n\nExplanation: ';
	if (text.includes(separator)) {
		const [explanation, workedSolution] = text.split(separator);
		return { workedSolution: workedSolution?.trim() || null, explanation: explanation?.trim() || null };
	}
	if (text.includes(legacy)) {
		const index = text.indexOf(legacy);
		return {
			workedSolution: text.slice(0, index).trim() || null,
			explanation: text.slice(index + legacy.length).trim() || null
		};
	}
	if (/^Explanation:\s*/i.test(text)) {
		return { workedSolution: null, explanation: text.replace(/^Explanation:\s*/i, '').trim() || null };
	}
	return { workedSolution: text, explanation: null };
}

function repairSubject(subject, path, changes) {
	if (!subject || typeof subject !== 'object') return;
	const reviewMetadata = subject.reviewMetadata || {};
	const merged = splitMergedExplanation(subject.workedSolution);
	const explanationText = merged.explanation || subject.explanation;
	const parts = splitExplanation(explanationText);
	const parsed = {
		correctAnswerExplanation: parts.correctAnswerExplanation,
		incorrectOptionsExplanation: parts.incorrectOptionsExplanation,
		commonMistake: parts.commonMistake,
		conceptsTested: parts.conceptsTested
	};
	const mappedAny = Boolean(parsed.correctAnswerExplanation || parsed.incorrectOptionsExplanation || parsed.commonMistake || parsed.conceptsTested);
	for (const field of ['correctAnswerExplanation', 'incorrectOptionsExplanation']) {
		if (!subject[field] && parsed[field]) {
			subject[field] = parsed[field];
			changes.push({ path, field, source: 'merged explanation' });
		}
	}
	if (!subject.commonMistake && (parsed.commonMistake || reviewMetadata.commonMistake)) {
		subject.commonMistake = parsed.commonMistake || reviewMetadata.commonMistake;
		changes.push({ path, field: 'commonMistake', source: parsed.commonMistake ? 'merged explanation' : 'reviewMetadata' });
	}
	if (!subject.conceptsTested && (parsed.conceptsTested || reviewMetadata.conceptsTested)) {
		subject.conceptsTested = parsed.conceptsTested || reviewMetadata.conceptsTested;
		changes.push({ path, field: 'conceptsTested', source: parsed.conceptsTested ? 'merged explanation' : 'reviewMetadata' });
	}
	if (mappedAny && merged.explanation) {
		subject.workedSolution = merged.workedSolution;
		changes.push({ path, field: 'workedSolution', source: 'removed merged explanation' });
	}
	if (!subject.sourceSetId && (reviewMetadata.sourceSetId || subject.sourceSetId)) {
		subject.sourceSetId = reviewMetadata.sourceSetId;
		changes.push({ path, field: 'sourceSetId', source: 'reviewMetadata' });
	}
	if (!subject.answerVerificationStatus && subject.sourceSetId) {
		subject.answerVerificationStatus = 'SOURCE_PROVIDED';
		changes.push({ path, field: 'answerVerificationStatus', source: 'sourceSetId' });
	}
}

export function repairQuestionPayload(input) {
	const payload = JSON.parse(JSON.stringify(input || {}));
	const changes = [];
	const before = assessCompleteness(payload);
	if (payload.questionType === 'VIGNETTE_MCQ') {
		if (!payload.caseStudyTitle && payload.stem) {
			payload.caseStudyTitle = payload.stem;
			changes.push({ path: 'question', field: 'caseStudyTitle', source: 'stem' });
		}
		if (!payload.sourceSetId && payload.reviewMetadata?.sourceSetId) {
			payload.sourceSetId = payload.reviewMetadata.sourceSetId;
			changes.push({ path: 'question', field: 'sourceSetId', source: 'reviewMetadata' });
		}
		if (!payload.answerVerificationStatus && payload.sourceSetId) {
			payload.answerVerificationStatus = 'SOURCE_PROVIDED';
			changes.push({ path: 'question', field: 'answerVerificationStatus', source: 'sourceSetId' });
		}
		(payload.subQuestions || []).forEach((child, index) => repairSubject(child, `subQuestions[${index}]`, changes));
	} else if (payload.questionType === 'MCQ') {
		repairSubject(payload, 'question', changes);
	}
	const after = assessCompleteness(payload);
	return {
		payload,
		changes,
		changed: changes.length > 0,
		before,
		after
	};
}

export async function reviewBatchFieldRepair(prisma, batchId, { apply = false, actorId = null, tokenId = null } = {}) {
	const batch = await getReviewBatch(prisma, batchId);
	if (!batch) return { ok: false, statusCode: 404, error: 'Batch not found.' };
	const committed = batch.commitStatus === 'COMMITTED' || batch.status === 'COMMITTED';
	if (apply && committed) return { ok: false, statusCode: 409, error: 'Committed batches cannot be repaired without a separate live-data review.' };
	const items = [];
	for (const item of batch.items) {
		const repair = repairQuestionPayload(item.payload);
		const report = {
			id: item.id,
			externalQuestionId: item.externalQuestionId,
			changed: repair.changed,
			changes: repair.changes,
			before: repair.before,
			after: repair.after
		};
		if (apply && repair.changed) {
			const updated = await updateReviewItem(prisma, batchId, item.id, repair.payload, { actorId, tokenId });
			report.applied = updated.ok && Boolean(updated.validation?.summary?.ok);
			report.validationStatus = updated.validation?.summary?.reviewStatus || null;
			if (!updated.ok) report.error = updated.error || 'Could not apply repair.';
			else if (!report.applied) report.error = 'Repair was saved but the item still requires review.';
		}
		items.push(report);
	}
	const changedCount = items.filter(item => item.changed).length;
	if (apply && changedCount) {
		await auditMcpAction(prisma, {
			action: 'BATCH_FIELD_REPAIR_APPLIED',
			actorId,
			tokenId,
			batchId,
			detail: { changedCount, itemIds: items.filter(item => item.changed).map(item => item.id) }
		});
	}
	return {
		ok: true,
		apply,
		batchId,
		committed,
		changedCount,
		items,
		batch: apply ? await getReviewBatch(prisma, batchId) : null
	};
}
