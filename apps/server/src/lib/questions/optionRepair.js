import { inspectOptionText, normalizeOptionRationale, normalizeOptionText } from './optionText.js';

function normalizeField(field, value) {
	return field === 'rationale' ? normalizeOptionRationale(value) : normalizeOptionText(value).text;
}

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
		for (const field of ['text', 'rationale']) {
			const originalText = option[field] || '';
			if (!originalText) continue;
			const inspection = inspectOptionText(originalText);
			if (!inspection.artifacts.length) continue;
			const proposedText = normalizeField(field, originalText);
			const changed = (field === 'rationale' ? (proposedText || null) : proposedText) !== (option[field] || null);
			candidates.push({
				optionId: option.id,
				questionId: option.question?.id || option.questionId,
				qid: option.question?.qid || null,
				parentId: option.question?.parentId || null,
				position: option.position,
				isCorrect: option.isCorrect,
				field,
				originalText,
				proposedText,
				artifacts: inspection.artifacts,
				codepoints: inspection.codepoints,
				safeToAutoClean: inspection.safeToClean && changed && (field !== 'text' || Boolean(proposedText))
			});
		}
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
		const field = repair.field === 'rationale' ? 'rationale' : 'text';
		const option = await prisma.mcqOption.findUnique({
			where: { id: repair.id },
			include: { question: { select: { id: true, qid: true, parentId: true } } }
		});
		if (!option) {
			results.push({ id: repair.id, field, ok: false, error: 'Option not found.' });
			continue;
		}
		const current = option[field] || null;
		if (typeof repair.expectedText === 'string' && repair.expectedText !== (current || '')) {
			results.push({ id: repair.id, field, ok: false, error: 'The option changed since the audit preview. Re-run the audit.' });
			continue;
		}
		const inspection = inspectOptionText(current || '');
		const cleaned = normalizeField(field, current || '');
		const changed = (field === 'rationale' ? (cleaned || null) : cleaned) !== current;
		if (!inspection.artifacts.length || !changed || !inspection.safeToClean) {
			results.push({ id: repair.id, field, ok: false, error: 'The option is not a safe unambiguous repair candidate.' });
			continue;
		}
		if (field === 'text' && !cleaned) {
			results.push({ id: repair.id, field, ok: false, error: 'The option text would become empty.' });
			continue;
		}
		const stored = field === 'rationale' ? (cleaned || null) : cleaned;
		await prisma.$transaction(async tx => {
			await tx.mcqOption.update({ where: { id: option.id }, data: { [field]: stored } });
			await tx.mcpAuditLog.create({
				data: {
					action: 'OPTION_TEXT_REPAIRED',
					actorId,
					detail: {
						optionId: option.id,
						questionId: option.question?.id || option.questionId,
						qid: option.question?.qid || null,
						parentId: option.question?.parentId || null,
						field,
						position: option.position,
						oldText: current,
						newText: stored,
						artifacts: inspection.artifacts
					}
				}
			});
		});
		results.push({ id: option.id, field, ok: true, oldText: current, newText: stored });
	}
	return {
		ok: results.every(result => result.ok),
		repairedCount: results.filter(result => result.ok).length,
		results
	};
}
