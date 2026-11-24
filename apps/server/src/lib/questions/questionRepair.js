import { splitExplanation, splitMergedExplanation } from './explanationText.js';
import { normalizeOptionRationale, normalizeOptionText } from './optionText.js';
import { assessCompleteness } from './questionValidation.js';
import { auditMcpAction, getReviewBatch, updateReviewItem } from './questionReview.js';
import { parseSampleSetHtml } from './sampleBank.js';

function hasText(value) {
	return value !== undefined && value !== null && String(value).trim().length > 0;
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
	if (!subject.sourceConcept && reviewMetadata.sourceConcept) {
		subject.sourceConcept = reviewMetadata.sourceConcept;
		changes.push({ path, field: 'sourceConcept', source: 'reviewMetadata' });
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
	if (Array.isArray(subject.options)) {
		subject.options.forEach((option, index) => {
			const normalized = normalizeOptionText(option.text);
			if (normalized.changed) {
				option.text = normalized.text;
				changes.push({ path, field: `options[${index}].text`, source: 'option text normalization' });
			}
			const rationale = normalizeOptionRationale(option.rationale);
			if (rationale !== (option.rationale || null)) {
				option.rationale = rationale;
				changes.push({ path, field: `options[${index}].rationale`, source: 'option rationale normalization' });
			}
		});
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
			after: repair.after,
			unrecoverableFields: repair.after.missingCoreFields
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
export async function reviewBatchSourceRepair(prisma, batchId, html, { apply = false, actorId = null, tokenId = null, setId = null } = {}) {
	if (!hasText(html)) return { ok: false, statusCode: 400, error: 'Source HTML is required.' };
	const batch = await getReviewBatch(prisma, batchId);
	if (!batch) return { ok: false, statusCode: 404, error: 'Batch not found.' };
	const committed = batch.commitStatus === 'COMMITTED' || batch.status === 'COMMITTED';
	if (apply && committed) return { ok: false, statusCode: 409, error: 'Committed batches cannot be repaired without a separate live-data review.' };
	let source;
	try {
		source = parseSampleSetHtml(html, { setId, sourceFile: 'reattached-source.html' });
	} catch (error) {
		return { ok: false, statusCode: 400, error: `Could not parse source HTML: ${error.message}` };
	}
	if (!source.questions.length) return { ok: false, statusCode: 400, error: 'No question sections were found in the source HTML.' };
	const sourceByQid = new Map(source.questions.map(question => [question.externalQuestionId, question]));
	const items = [];
	for (const item of batch.items) {
		const payload = JSON.parse(JSON.stringify(item.payload || {}));
		const changes = [];
		const before = assessCompleteness(payload);
		if (!payload.caseStudyTitle && source.caseStudyTitle) {
			payload.caseStudyTitle = source.caseStudyTitle;
			changes.push({ path: 'question', field: 'caseStudyTitle', source: 'reattached HTML' });
		}
		if (!payload.sourceSetId && (source.setId || setId)) {
			payload.sourceSetId = source.setId || setId;
			changes.push({ path: 'question', field: 'sourceSetId', source: 'reattached HTML' });
		}
		const children = payload.subQuestions || [];
		const sameCount = children.length === source.questions.length;
		children.forEach((child, index) => {
			const byQid = sourceByQid.get(child.externalQuestionId);
			const sourceChild = byQid || (sameCount ? source.questions[index] : null);
			if (!sourceChild) return;
			const path = `subQuestions[${index}]`;
			const fields = [
				'workedSolution', 'correctAnswerExplanation', 'incorrectOptionsExplanation',
				'commonMistake', 'conceptsTested', 'sourceConcept', 'los', 'traceSection', 'tracePage', 'keyFormulas'
			];
			for (const field of fields) {
				if (!hasText(child[field]) && hasText(sourceChild[field])) {
					child[field] = sourceChild[field];
					changes.push({ path, field, source: byQid ? 'reattached HTML by QID' : 'reattached HTML by order' });
				}
			}
			if (!hasText(child.sourceSetId) && (source.setId || setId)) {
				child.sourceSetId = source.setId || setId;
				changes.push({ path, field: 'sourceSetId', source: 'reattached HTML' });
			}
			if (!child.answerVerificationStatus) {
				child.answerVerificationStatus = 'SOURCE_PROVIDED';
				changes.push({ path, field: 'answerVerificationStatus', source: 'reattached HTML' });
			}
		});
		const after = assessCompleteness(payload);
		const report = {
			id: item.id,
			externalQuestionId: item.externalQuestionId,
			changed: changes.length > 0,
			changes,
			before,
			after,
			unrecoverableFields: after.missingCoreFields
		};
		if (apply && changes.length) {
			const updated = await updateReviewItem(prisma, batchId, item.id, payload, { actorId, tokenId });
			report.applied = updated.ok && Boolean(updated.validation?.summary?.ok);
			report.validationStatus = updated.validation?.summary?.reviewStatus || null;
			if (!updated.ok) report.error = updated.error || 'Could not apply source repair.';
			else if (!report.applied) report.error = 'Source repair was saved but the item still requires review.';
		}
		items.push(report);
	}
	const changedCount = items.filter(item => item.changed).length;
	if (apply && changedCount) {
		await auditMcpAction(prisma, {
			action: 'BATCH_SOURCE_REPAIR_APPLIED',
			actorId,
			tokenId,
			batchId,
			detail: { changedCount, sourceSetId: source.setId || setId, itemIds: items.filter(item => item.changed).map(item => item.id) }
		});
	}
	return {
		ok: true,
		apply,
		batchId,
		committed,
		sourceSetId: source.setId || setId,
		changedCount,
		items,
		batch: apply ? await getReviewBatch(prisma, batchId) : null
	};
}
