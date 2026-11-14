import { questionBatchSchema, normalizeQuestionPayload } from './questionSchema.js';
import { validateQuestionPayload } from './questionValidation.js';
import { checkQuestionDuplicates, findDuplicateExternalIds } from './questionDuplicates.js';
import { validateAcademicMapping } from './questionCurriculum.js';
import { persistQuestionPayload } from './questionPersistence.js';
import { sanitizeDbData } from '../dbText.js';

function zodErrors(error) {
	return (error?.issues || error?.errors || []).map(issue => ({
		code: 'SCHEMA_VALIDATION',
		path: Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path || ''),
		message: issue.message,
		severity: 'error'
	}));
}

function summarizeItems(items) {
	return {
		total: items.length,
		valid: items.filter(item => item.status === 'VALIDATED').length,
		invalid: items.filter(item => item.status === 'INVALID').length,
		errors: items.reduce((sum, item) => sum + (item.errors?.length || 0), 0),
		warnings: items.reduce((sum, item) => sum + (item.validation?.warnings?.length || 0), 0),
		duplicateRisks: items.filter(item => item.duplicates?.requiresReview).length
	};
}

export async function auditMcpAction(prisma, { action, actorId = null, tokenId = null, batchId = null, detail = null }) {
	try {
		await prisma.mcpAuditLog.create({
			data: { action, actorId, tokenId, batchId, detail: detail || undefined }
		});
	} catch (error) {
		console.error('[mcp.audit]', error?.message || error);
	}
}

async function validateOne(prisma, rawPayload, { batchExternalIds = [] } = {}) {
	let normalized;
	try {
		normalized = normalizeQuestionPayload(rawPayload);
	} catch (error) {
		return {
			normalized: null,
			errors: zodErrors(error),
			warnings: [],
			info: [],
			summary: { ok: false, errors: zodErrors(error).length, warnings: 0 },
			duplicates: { requiresReview: false, exactMatches: [], possibleMatches: [] }
		};
	}
	const validation = await validateQuestionPayload(prisma, normalized, { batchExternalIds });
	let duplicates = { requiresReview: false, exactMatches: [], possibleMatches: [] };
	if (validation.academic) {
		try {
			duplicates = await checkQuestionDuplicates(prisma, normalized);
		} catch (error) {
			validation.warnings.push({
				code: 'DUPLICATE_CHECK_FAILED',
				message: `Duplicate check could not complete: ${error.message}`,
				path: 'duplicates',
				severity: 'warning'
			});
		}
	}
	return {
		normalized,
		errors: validation.errors,
		warnings: validation.warnings,
		info: validation.info,
		summary: {
			...validation.summary,
			ok: validation.ok,
			duplicateRisk: duplicates.requiresReview
		},
		academic: validation.academic,
		duplicates
	};
}

export async function validateQuestionSet(prisma, questions) {
	const externalIds = questions.map(question => String(question?.externalQuestionId || '').trim()).filter(Boolean);
	const results = [];
	for (const [index, question] of questions.entries()) {
		const others = externalIds.filter(id => id !== String(question?.externalQuestionId || '').trim());
		const result = await validateOne(prisma, question, { batchExternalIds: others });
		results.push({ index, ...result });
	}
	return {
		ok: results.every(result => result.summary.ok),
		results,
		summary: {
			total: results.length,
			valid: results.filter(result => result.summary.ok).length,
			invalid: results.filter(result => !result.summary.ok).length,
			automaticValidationOnly: true,
			humanReviewRequired: true
		}
	};
}

export async function getQuestionDuplicateReport(prisma, questions) {
	const results = [];
	for (const [index, question] of questions.entries()) {
		let normalized;
		try {
			normalized = normalizeQuestionPayload(question);
		} catch (error) {
			results.push({ index, ok: false, errors: zodErrors(error) });
			continue;
		}
		const duplicates = await checkQuestionDuplicates(prisma, normalized);
		results.push({ index, externalQuestionId: normalized.externalQuestionId, ...duplicates });
	}
	return { results };
}

export async function createReviewBatch(prisma, rawBatch, { actorId = null, tokenId = null } = {}) {
	let batchInput;
	try {
		batchInput = questionBatchSchema.parse(rawBatch);
	} catch (error) {
		return { ok: false, statusCode: 400, error: 'Invalid batch payload.', errors: zodErrors(error) };
	}

	const existing = await prisma.mcpImportBatch.findUnique({
		where: { idempotencyKey: batchInput.idempotencyKey },
		include: { items: { orderBy: { orderIndex: 'asc' } } }
	});
	if (existing) {
		return { ok: true, idempotentReplay: true, batch: existing };
	}

	const externalQids = batchInput.questions.flatMap(question => [
		String(question.externalQuestionId || '').trim(),
		...(question.subQuestions || []).map(child => String(child.externalQuestionId || '').trim())
	]).filter(Boolean);
	const alreadyCommitted = await findDuplicateExternalIds(prisma, batchInput.questions);
	const validationResults = [];
	for (const [index, question] of batchInput.questions.entries()) {
		const ownQids = new Set([
			String(question.externalQuestionId || '').trim(),
			...(question.subQuestions || []).map(child => String(child.externalQuestionId || '').trim())
		].filter(Boolean));
		const others = externalQids.filter(id => !ownQids.has(id));
		const result = await validateOne(prisma, question, { batchExternalIds: others });
		const duplicateQid = alreadyCommitted.find(row => row.qid === question.externalQuestionId || (question.subQuestions || []).some(child => child.externalQuestionId === row.qid));
		const errors = [...result.errors];
		if (duplicateQid) {
			errors.push({
				code: 'EXTERNAL_QID_EXISTS',
				message: `A question with external ID ${question.externalQuestionId} already exists.`,
				path: 'externalQuestionId',
				severity: 'error',
				details: { questionId: duplicateQid.id }
			});
		}
		validationResults.push({
			index,
			normalized: result.normalized || question,
			errors,
			warnings: result.warnings,
			info: result.info,
			summary: { ...result.summary, ok: errors.length === 0 },
			duplicates: result.duplicates
		});
	}

	const allValid = validationResults.every(result => result.summary.ok);
	const status = allValid ? 'VALIDATED' : 'NEEDS_REVISION';
	const duplicateSummary = {
		requiresReview: validationResults.some(result => result.duplicates?.requiresReview),
		items: validationResults
			.filter(result => result.duplicates?.requiresReview)
			.map(result => ({
				externalQuestionId: result.normalized.externalQuestionId,
				...(result.duplicates || {})
			}))
	};
	const validationSummary = {
		...summarizeItems(validationResults.map(result => ({
			status: result.summary.ok ? 'VALIDATED' : 'INVALID',
			errors: result.errors,
			validation: { warnings: result.warnings }
		}))),
		automaticValidationOnly: true,
		humanReviewRequired: true
	};

	let batch;
	try {
		batch = await prisma.$transaction(async tx => {
			const created = await tx.mcpImportBatch.create({
				data: {
					externalRequestId: batchInput.externalRequestId || null,
					idempotencyKey: batchInput.idempotencyKey,
					sourceClient: batchInput.sourceClient,
					sourceProvider: batchInput.sourceProvider || null,
					createdById: actorId,
					status,
					commitStatus: 'NOT_COMMITTED',
					academicScope: batchInput.academicScope || undefined,
					itemCount: batchInput.questions.length,
					validationSummary,
					duplicateSummary,
					errors: allValid ? undefined : validationResults.flatMap(result => result.errors)
				}
			});
			for (const [index, result] of validationResults.entries()) {
				const payload = sanitizeDbData(result.normalized || batchInput.questions[index]);
				await tx.mcpImportItem.create({
					data: {
						batchId: created.id,
						externalQuestionId: payload.externalQuestionId || null,
						orderIndex: index,
						questionType: payload.questionType,
						payload,
						status: result.summary.ok ? 'VALIDATED' : 'INVALID',
						validation: {
							errors: result.errors,
							warnings: result.warnings,
							info: result.info,
							summary: result.summary
						},
						duplicates: result.duplicates,
						errors: result.errors.length ? result.errors : undefined
					}
				});
			}
			return tx.mcpImportBatch.findUnique({
				where: { id: created.id },
				include: { items: { orderBy: { orderIndex: 'asc' } } }
			});
		});
	} catch (error) {
		if (error?.code === 'P2002') {
			const replay = await prisma.mcpImportBatch.findUnique({
				where: { idempotencyKey: batchInput.idempotencyKey },
				include: { items: { orderBy: { orderIndex: 'asc' } } }
			});
			if (replay) return { ok: true, idempotentReplay: true, batch: replay };
		}
		throw error;
	}

	await auditMcpAction(prisma, {
		action: 'BATCH_CREATED',
		actorId,
		tokenId,
		batchId: batch.id,
		detail: { status, itemCount: batch.itemCount, sourceClient: batch.sourceClient }
	});
	return { ok: true, batch };
}

export async function getReviewBatch(prisma, batchId) {
	const batch = await prisma.mcpImportBatch.findUnique({
		where: { id: batchId },
		include: { items: { orderBy: { orderIndex: 'asc' } } }
	});
	if (!batch) return null;
	return {
		...batch,
		items: batch.items.map(item => ({
			...item,
			validation: item.validation || null,
			duplicates: item.duplicates || null
		}))
	};
}

export async function listReviewBatches(prisma, { status, page = 1, limit = 20 } = {}) {
	const pageNum = Math.max(1, Number(page) || 1);
	const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));
	const where = status ? { status } : {};
	const [total, batches] = await Promise.all([
		prisma.mcpImportBatch.count({ where }),
		prisma.mcpImportBatch.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			skip: (pageNum - 1) * pageSize,
			take: pageSize,
			include: { items: { orderBy: { orderIndex: 'asc' }, select: { id: true, status: true, externalQuestionId: true, questionType: true } } }
		})
	]);
	return { batches, total, page: pageNum, limit: pageSize };
}

export async function updateReviewItem(prisma, batchId, itemId, rawPayload, { actorId = null, tokenId = null } = {}) {
	const batch = await prisma.mcpImportBatch.findUnique({ where: { id: batchId }, select: { id: true, status: true, commitStatus: true } });
	if (!batch) return { ok: false, statusCode: 404, error: 'Batch not found.' };
	if (batch.commitStatus === 'COMMITTED') return { ok: false, statusCode: 409, error: 'Committed batches cannot be edited.' };
	const item = await prisma.mcpImportItem.findFirst({ where: { id: itemId, batchId } });
	if (!item) return { ok: false, statusCode: 404, error: 'Batch item not found.' };
	const others = await prisma.mcpImportItem.findMany({
		where: { batchId, id: { not: itemId } },
		select: { externalQuestionId: true }
	});
	const result = await validateOne(prisma, rawPayload, {
		batchExternalIds: others.map(row => row.externalQuestionId).filter(Boolean)
	});
	const payload = sanitizeDbData(result.normalized || rawPayload);
	await prisma.$transaction(async tx => {
		await tx.mcpImportItem.update({
			where: { id: itemId },
			data: {
				externalQuestionId: payload.externalQuestionId || null,
				questionType: payload.questionType || item.questionType,
				payload,
				status: result.summary.ok ? 'VALIDATED' : 'INVALID',
				validation: {
					errors: result.errors,
					warnings: result.warnings,
					info: result.info,
					summary: result.summary
				},
				duplicates: result.duplicates,
				errors: result.errors.length ? result.errors : undefined,
				committedQuestionId: null,
				committedAt: null
			}
		});
		const allItems = await tx.mcpImportItem.findMany({ where: { batchId }, select: { status: true, validation: true, duplicates: true } });
		const allValid = allItems.every(row => row.status === 'VALIDATED');
		await tx.mcpImportBatch.update({
			where: { id: batchId },
			data: {
				status: allValid ? 'VALIDATED' : 'NEEDS_REVISION',
				commitStatus: 'NOT_COMMITTED',
				approvedAt: null,
				approvedById: null,
				validationSummary: summarizeItems(allItems.map(row => ({ status: row.status, errors: row.validation?.errors || [], validation: row.validation || {} }))),
				duplicateSummary: {
					requiresReview: allItems.some(row => row.duplicates?.requiresReview),
					items: allItems.filter(row => row.duplicates?.requiresReview).map(row => row.duplicates)
				},
				errors: allItems.flatMap(row => row.validation?.errors || [])
			}
		});
	});
	await auditMcpAction(prisma, { action: 'DRAFT_UPDATED', actorId, tokenId, batchId, detail: { itemId } });
	const updated = await getReviewBatch(prisma, batchId);
	return { ok: true, batch: updated, item: updated.items.find(row => row.id === itemId), validation: result };
}

export async function approveReviewBatch(prisma, batchId, { actorId, tokenId = null } = {}) {
	const batch = await getReviewBatch(prisma, batchId);
	if (!batch) return { ok: false, statusCode: 404, error: 'Batch not found.' };
	if (batch.commitStatus === 'COMMITTED') return { ok: true, idempotentReplay: true, batch };
	if (batch.status === 'REJECTED') return { ok: false, statusCode: 409, error: 'Rejected batches cannot be approved.' };
	const invalid = batch.items.filter(item => item.status !== 'VALIDATED');
	if (invalid.length) {
		return {
			ok: false,
			statusCode: 409,
			error: 'All items must pass validation before approval.',
			invalidItems: invalid.map(item => ({ id: item.id, externalQuestionId: item.externalQuestionId, errors: item.validation?.errors || [] }))
		};
	}
	const updated = await prisma.mcpImportBatch.update({
		where: { id: batchId },
		data: { status: 'APPROVED', approvedById: actorId, approvedAt: new Date() },
		include: { items: { orderBy: { orderIndex: 'asc' } } }
	});
	await auditMcpAction(prisma, { action: 'BATCH_APPROVED', actorId, tokenId, batchId, detail: { itemCount: updated.itemCount } });
	return { ok: true, batch: updated };
}

export async function rejectReviewBatch(prisma, batchId, { actorId, reason, tokenId = null } = {}) {
	const batch = await prisma.mcpImportBatch.findUnique({ where: { id: batchId } });
	if (!batch) return { ok: false, statusCode: 404, error: 'Batch not found.' };
	if (batch.commitStatus === 'COMMITTED') return { ok: false, statusCode: 409, error: 'Committed batches cannot be rejected.' };
	const updated = await prisma.mcpImportBatch.update({
		where: { id: batchId },
		data: { status: 'REJECTED', errors: { reason: reason || 'Rejected by administrator' } }
	});
	await auditMcpAction(prisma, { action: 'BATCH_REJECTED', actorId, tokenId, batchId, detail: { reason } });
	return { ok: true, batch: updated };
}

export async function cancelReviewBatch(prisma, batchId, { actorId, tokenId = null } = {}) {
	const batch = await prisma.mcpImportBatch.findUnique({ where: { id: batchId } });
	if (!batch) return { ok: false, statusCode: 404, error: 'Batch not found.' };
	if (batch.commitStatus === 'COMMITTED') return { ok: false, statusCode: 409, error: 'Committed batches cannot be cancelled.' };
	const updated = await prisma.mcpImportBatch.update({
		where: { id: batchId },
		data: { status: 'CANCELLED', commitStatus: 'CANCELLED' }
	});
	await auditMcpAction(prisma, { action: 'BATCH_CANCELLED', actorId, tokenId, batchId });
	return { ok: true, batch: updated };
}

export async function commitApprovedBatch(prisma, batchId, { actorId, tokenId = null } = {}) {
	const batch = await getReviewBatch(prisma, batchId);
	if (!batch) return { ok: false, statusCode: 404, error: 'Batch not found.' };
	if (batch.status === 'COMMITTED' || batch.commitStatus === 'COMMITTED') {
		return { ok: true, idempotentReplay: true, batch, summary: { committedCount: batch.committedCount, items: batch.items.map(item => ({ id: item.id, committedQuestionId: item.committedQuestionId })) } };
	}
	if (batch.status !== 'APPROVED') {
		return { ok: false, statusCode: 409, error: 'Batch must be approved by an administrator before commit.' };
	}

	const results = [];
	for (const item of batch.items) {
		if (item.committedQuestionId) {
			results.push({ itemId: item.id, externalQuestionId: item.externalQuestionId, ok: true, idempotentReplay: true, committedQuestionId: item.committedQuestionId });
			continue;
		}
		let payload;
		try {
			payload = normalizeQuestionPayload(item.payload);
		} catch (error) {
			const errors = zodErrors(error);
			await prisma.mcpImportItem.update({ where: { id: item.id }, data: { status: 'FAILED', errors } });
			results.push({ itemId: item.id, externalQuestionId: item.externalQuestionId, ok: false, errors });
			continue;
		}
		const mapping = await validateAcademicMapping(prisma, {
			courseId: payload.courseId,
			volumeId: payload.volumeId,
			moduleId: payload.moduleId,
			primaryTopicId: payload.primaryTopicId,
			additionalTopicIds: payload.additionalTopicIds,
			conceptIds: payload.conceptIds
		});
		if (!mapping.ok) {
			await prisma.mcpImportItem.update({ where: { id: item.id }, data: { status: 'FAILED', errors: mapping.errors } });
			results.push({ itemId: item.id, externalQuestionId: item.externalQuestionId, ok: false, errors: mapping.errors });
			continue;
		}
		const duplicates = await checkQuestionDuplicates(prisma, payload);
		if (duplicates.exactDuplicate) {
			const errors = [{
				code: 'DUPLICATE_ON_COMMIT',
				message: 'An exact duplicate exists in the question bank.',
				path: 'duplicates',
				severity: 'error',
				details: duplicates.exactMatches
			}];
			await prisma.mcpImportItem.update({ where: { id: item.id }, data: { status: 'FAILED', errors, duplicates } });
			results.push({ itemId: item.id, externalQuestionId: item.externalQuestionId, ok: false, errors, duplicates });
			continue;
		}
		try {
			const persisted = await prisma.$transaction(async tx => {
				const result = await persistQuestionPayload(prisma, payload, {
					tx,
					mapping,
					userId: actorId,
					sourceClient: batch.sourceClient,
					sourceProvider: batch.sourceProvider,
					generationSource: 'MCP',
					validation: item.validation
				});
				await tx.mcpImportItem.update({
					where: { id: item.id },
					data: {
						status: 'COMMITTED',
						committedQuestionId: result.parentId,
						committedAt: new Date(),
						errors: null,
						duplicates
					}
				});
				return result;
			});
			results.push({ itemId: item.id, externalQuestionId: item.externalQuestionId, ok: true, ...persisted });
		} catch (error) {
			const errors = [{ code: error.code || 'COMMIT_FAILED', message: error.message, severity: 'error' }];
			await prisma.mcpImportItem.update({ where: { id: item.id }, data: { status: 'FAILED', errors } });
			results.push({ itemId: item.id, externalQuestionId: item.externalQuestionId, ok: false, errors });
		}
	}

	const committedCount = await prisma.mcpImportItem.count({ where: { batchId, status: 'COMMITTED' } });
	const failedCount = await prisma.mcpImportItem.count({ where: { batchId, status: 'FAILED' } });
	const complete = failedCount === 0 && committedCount === batch.items.length;
	const updated = await prisma.mcpImportBatch.update({
		where: { id: batchId },
		data: {
			status: complete ? 'COMMITTED' : 'PARTIAL_COMMIT',
			commitStatus: complete ? 'COMMITTED' : 'PARTIAL',
			committedCount,
			committedAt: new Date(),
			errors: failedCount ? results.filter(result => !result.ok) : undefined
		},
		include: { items: { orderBy: { orderIndex: 'asc' } } }
	});
	await auditMcpAction(prisma, {
		action: 'BATCH_COMMITTED',
		actorId,
		tokenId,
		batchId,
		detail: { committedCount, failedCount, status: updated.status }
	});
	return {
		ok: complete,
		partial: !complete,
		batch: updated,
		summary: {
			committedCount,
			failedCount,
			total: batch.items.length,
			committedQuestionIds: results.filter(result => result.ok).map(result => result.parentId || result.committedQuestionId).filter(Boolean),
			failures: results.filter(result => !result.ok)
		}
	};
}
