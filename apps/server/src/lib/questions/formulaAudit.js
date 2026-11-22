const FORMULA_FIELDS = ['keyFormulas', 'workedSolution', 'correctAnswerExplanation', 'incorrectOptionsExplanation'];

export function auditFormulaText(value) {
	const text = String(value || '');
	if (!text) return [];
	const issues = [];
	if (/[\t\f]/.test(text)) issues.push({ code: 'SUSPICIOUS_CONTROL_CHARACTER', message: 'Contains a tab or form-feed character where a TeX command may have been corrupted.' });
	if (/\\{2,}(text|frac|sqrt|times|cdot|left|right|sum|int)\b/.test(text)) issues.push({ code: 'POSSIBLE_DOUBLE_ESCAPE', message: 'Contains a possible double-escaped TeX command.' });
	if (/(^|[^\\])\b(text|frac|sqrt|times|imes|cdot|overline|mathbf|mathrm)\s*\{/i.test(text) || /(^|\s)imes\b/i.test(text)) issues.push({ code: 'MISSING_TEX_BACKSLASH', message: 'Contains a TeX-like command without a leading backslash.' });
	if (/&lt;|&gt;|&amp;/.test(text)) issues.push({ code: 'HTML_ENTITY_IN_FORMULA', message: 'Contains HTML entities inside a canonical formula field.' });
	return issues;
}

export async function auditQuestionFormulas(prisma, { limit = 200 } = {}) {
	const take = Math.min(500, Math.max(1, Number(limit) || 200));
	const questions = await prisma.question.findMany({
		where: {
			OR: FORMULA_FIELDS.map(field => ({ [field]: { not: null } }))
		},
		orderBy: { createdAt: 'desc' },
		take,
		select: {
			id: true,
			qid: true,
			parentId: true,
			keyFormulas: true,
			workedSolution: true,
			correctAnswerExplanation: true,
			incorrectOptionsExplanation: true
		}
	});
	const candidates = [];
	for (const question of questions) {
		const fields = [];
		for (const field of FORMULA_FIELDS) {
			const issues = auditFormulaText(question[field]);
			if (issues.length) fields.push({ field, issues, source: question[field] });
		}
		if (fields.length) candidates.push({ id: question.id, qid: question.qid, parentId: question.parentId, fields });
	}
	return {
		ok: true,
		automaticChanges: false,
		reviewRequired: candidates.length > 0,
		scanned: questions.length,
		candidates
	};
}
