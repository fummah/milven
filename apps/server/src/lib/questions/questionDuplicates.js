function stripHtml(value) {
	return String(value || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/[^a-zA-Z0-9%$.,+\-=/ ]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function tokens(value) {
	return new Set(stripHtml(value).split(' ').filter(word => word.length > 2));
}

function jaccard(a, b) {
	const left = tokens(a);
	const right = tokens(b);
	if (!left.size || !right.size) return 0;
	let intersection = 0;
	for (const token of left) if (right.has(token)) intersection += 1;
	return intersection / (left.size + right.size - intersection);
}

function optionSignature(options) {
	return (Array.isArray(options) ? options : [])
		.map(option => stripHtml(option?.text || option))
		.filter(Boolean)
		.sort()
		.join('|');
}

function candidateShape(question, signals) {
	return {
		questionId: question.id,
		qid: question.qid,
		stem: question.stem?.slice(0, 300),
		vignetteText: question.vignetteText?.slice(0, 300),
		difficulty: question.difficulty,
		type: question.type,
		signals
	};
}

export async function checkQuestionDuplicates(prisma, payload, { excludeQuestionIds = [] } = {}) {
	const qid = String(payload.externalQuestionId || '').trim();
	const stem = stripHtml(payload.stem);
	const vignette = stripHtml(payload.vignetteText);
	const stemProbe = stem.slice(0, 80);
	const vignetteProbe = vignette.slice(0, 80);
	const baseOptions = optionSignature(payload.options);
	const childStems = (payload.subQuestions || []).map(child => child.stem);
	const or = [];
	if (qid) or.push({ qid });
	if (stemProbe.length >= 12) or.push({ stem: { contains: stemProbe, mode: 'insensitive' } });
	if (vignetteProbe.length >= 20) or.push({ vignetteText: { contains: vignetteProbe, mode: 'insensitive' } });
	const candidates = or.length
		? await prisma.question.findMany({
			where: {
				OR: or,
				...(excludeQuestionIds.length ? { id: { notIn: excludeQuestionIds } } : {})
			},
			include: { options: { orderBy: { position: 'asc' } } },
			take: 50
		})
		: [];

	const exact = [];
	const possible = [];
	for (const candidate of candidates) {
		const signals = [];
		let exactMatch = false;
		if (qid && candidate.qid === qid) {
			signals.push('EXTERNAL_QID_EXACT');
			exactMatch = true;
		}
		const candidateStem = stripHtml(candidate.stem);
		if (candidateStem && candidateStem === stem) {
			signals.push('STEM_NORMALIZED_EXACT');
			exactMatch = true;
		} else {
			const similarity = jaccard(candidate.stem, payload.stem);
			if (similarity >= 0.9) signals.push(`STEM_SIMILAR_${Math.round(similarity * 100)}`);
			else if (similarity >= 0.75) signals.push(`STEM_REVIEW_${Math.round(similarity * 100)}`);
		}
		if (vignette && candidate.vignetteText) {
			const similarity = jaccard(candidate.vignetteText, payload.vignetteText);
			if (stripHtml(candidate.vignetteText) === vignette) {
				signals.push('VIGNETTE_NORMALIZED_EXACT');
				exactMatch = true;
			} else if (similarity >= 0.85) signals.push(`VIGNETTE_SIMILAR_${Math.round(similarity * 100)}`);
		}
		if (baseOptions && optionSignature(candidate.options) === baseOptions) signals.push('OPTIONS_ORDER_INDEPENDENT_MATCH');
		if (childStems.length) {
			const candidateChildStems = await prisma.question.findMany({
				where: { parentId: candidate.id },
				select: { stem: true }
			});
			const overlap = childStems.filter(child => candidateChildStems.some(existing => jaccard(existing.stem, child) >= 0.88)).length;
			if (overlap >= Math.max(2, Math.ceil(childStems.length / 2))) signals.push(`CHILD_STEM_OVERLAP_${overlap}`);
		}
		if (!signals.length) continue;
		const shape = candidateShape(candidate, signals);
		if (exactMatch) exact.push(shape);
		else possible.push(shape);
	}

	return {
		exactDuplicate: exact.length > 0,
		requiresReview: exact.length > 0 || possible.length > 0,
		exactMatches: exact,
		possibleMatches: possible,
		reviewSignalOnly: possible.length > 0 && exact.length === 0,
		checkedAt: new Date().toISOString()
	};
}

export async function findDuplicateExternalIds(prisma, questions) {
	const ids = [...new Set((questions || []).flatMap(question => [
		String(question.externalQuestionId || '').trim(),
		...(question.subQuestions || []).map(child => String(child.externalQuestionId || '').trim())
	]).filter(Boolean))];
	if (!ids.length) return [];
	const existing = await prisma.question.findMany({
		where: { qid: { in: ids } },
		select: { id: true, qid: true }
	});
	return existing;
}
