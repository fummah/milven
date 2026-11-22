import { inspectOptionText, normalizeOptionText } from './optionText.js';

export async function scanOptionTextRepairs(prisma, { limit = 2000 } = {}) {
	const take = Math.min(10000, Math.max(1, Number(limit) || 2000));
	const options = await prisma.mcqOption.findMany({
		orderBy: { id: 'desc' },
		take,
		include: {
			question: {
				select: { id: true, qid: true, parentId: true, stem: true }
			}
		}
	});
	const candidates = [];
	for (const option of options) {
		const inspection = inspectOptionText(option.text);
		const normalized = normalizeOptionText(option.text);
		if (!inspection.artifacts.length || !normalized.changed) continue;
		candidates.push({
			optionId: option.id,
			questionId: option.question?.id || option.questionId,
			qid: option.question?.qid || null,
			parentId: option.question?.parentId || null,
			position: option.position,
			isCorrect: option.isCorrect,
			originalText: option.text,
			proposedText: normalized.text,
			artifacts: inspection.artifacts,
			codepoints: inspection.codepoints,
			safeToAutoClean: inspection.safeToClean
		});
	}
	return {
		ok: true,
		scanned: options.length,
		candidateCount: candidates.length,
		autoCleanableCount: candidates.filter(candidate => candidate.safeToAutoClean).length,
		candidates
	};
}

export async function applyOptionTextRepairs(prisma, repairs, { actorId = null } = {}) {
	if (!Array.isArray(repairs) || repairs.length === 0) return { ok: false, statusCode: 400, error: 'At least one option repair is required.' };
	const results = [];
	for (const repair of repairs) {
		const option = await prisma.mcqOption.findUnique({
			where: { id: repair.id },
			include: { question: { select: { id: true, qid: true, parentId: true } } }
		});
		if (!option) {
			results.push({ id: repair.id, ok: false, error: 'Option not found.' });
			continue;
		}
		if (typeof repair.expectedText === 'string' && repair.expectedText !== option.text) {
			results.push({ id: repair.id, ok: false, error: 'The option changed since the audit preview. Re-run the audit.' });
			continue;
		}
		const inspection = inspectOptionText(option.text);
		const normalized = normalizeOptionText(option.text);
		if (!inspection.artifacts.length || !normalized.changed || !inspection.safeToClean) {
			results.push({ id: repair.id, ok: false, error: 'The option is not a safe unambiguous repair candidate.' });
			continue;
		}
		await prisma.$transaction(async tx => {
			await tx.mcqOption.update({ where: { id: option.id }, data: { text: normalized.text } });
			await tx.mcpAuditLog.create({
				data: {
					action: 'OPTION_TEXT_REPAIRED',
					actorId,
					detail: {
						optionId: option.id,
						questionId: option.question?.id || option.questionId,
						qid: option.question?.qid || null,
						parentId: option.question?.parentId || null,
						position: option.position,
						oldText: option.text,
						newText: normalized.text,
						artifacts: inspection.artifacts
					}
				}
			});
		});
		results.push({ id: option.id, ok: true, oldText: option.text, newText: normalized.text });
	}
	return {
		ok: results.every(result => result.ok),
		repairedCount: results.filter(result => result.ok).length,
		results
	};
}
