import { sanitizeDbData } from '../dbText.js';

function mergeWorkedSolution(workedSolution, explanation) {
	const ws = String(workedSolution || '').trim();
	const explanationText = String(explanation || '').trim();
	if (ws && explanationText) return `${explanationText}\n\n--- Worked Solution ---\n${ws}`;
	return explanationText || ws || null;
}

function generationMetadata(payload, { sourceClient, sourceProvider, validation } = {}) {
	return sanitizeDbData({
		schemaVersion: payload.schemaVersion,
		generation: payload.generation || null,
		reviewMetadata: payload.reviewMetadata || null,
		sourceClient: sourceClient || payload.generation?.client || null,
		sourceProvider: sourceProvider || payload.generation?.provider || null,
		difficultyAssessment: payload.difficultyAssessment || null,
		validationSummary: validation?.summary || null,
		calculationSteps: payload.calculationSteps || undefined,
		formulas: payload.formulas || undefined
	});
}

async function createOptions(tx, questionId, options) {
	if (!Array.isArray(options) || options.length === 0) return;
	await tx.mcqOption.createMany({
		data: options.map((option, index) => ({
			questionId,
			text: option.text,
			isCorrect: option.isCorrect,
			position: index,
			rationale: option.rationale || null
		}))
	});
}

export async function persistQuestionPayload(prisma, payload, {
	tx: outerTx,
	mapping,
	userId = null,
	sourceClient = null,
	sourceProvider = null,
	generationSource = 'MCP',
	validation = null
} = {}) {
	const run = async tx => {
		const parentMapping = mapping || null;
		if (!parentMapping || !parentMapping.ok) {
			const error = new Error('Academic mapping is invalid.');
			error.code = 'ACADEMIC_MAPPING_INVALID';
			error.details = parentMapping?.errors || [];
			throw error;
		}
		const parentTopicIds = [...new Set([payload.primaryTopicId, ...(payload.additionalTopicIds || [])].filter(Boolean))];
		const parentConceptIds = [...new Set(payload.conceptIds || [])];
		const children = Array.isArray(payload.subQuestions) ? payload.subQuestions : [];
		const isBundle = children.length > 0;
		const totalMarks = isBundle ? children.reduce((sum, child) => sum + (child.marks || 1), 0) : payload.marks;
		const metadata = generationMetadata(payload, { sourceClient, sourceProvider, validation });
		const isAiGenerated = generationSource !== 'MANUAL' && generationSource !== 'BULK_IMPORT';

		const parent = await tx.question.create({
			data: {
				qid: payload.externalQuestionId || null,
				stem: payload.stem,
				type: payload.questionType,
				level: parentMapping.level,
				difficulty: payload.difficulty,
				topicId: payload.primaryTopicId,
				courseId: parentMapping.course?.id || payload.courseId,
				volumeId: parentMapping.volume?.id || payload.volumeId,
				moduleId: parentMapping.module?.id || payload.moduleId,
				topics: { connect: parentTopicIds.map(id => ({ id })) },
				...(parentConceptIds.length ? { concepts: { connect: parentConceptIds.map(id => ({ id })) } } : {}),
				marks: totalMarks,
				orderIndex: 0,
				vignetteText: payload.vignetteText || null,
				imageUrl: payload.imageUrl || null,
				los: payload.los || null,
				traceSection: payload.traceSection || null,
				tracePage: payload.tracePage || null,
				keyFormulas: payload.keyFormulas || payload.formulas || null,
				workedSolution: mergeWorkedSolution(payload.workedSolution, payload.explanation),
				questionGuidelines: payload.markingGuidelines || null,
				output: payload.expectedOutput || null,
				calculationSteps: payload.calculationSteps?.length ? payload.calculationSteps : undefined,
				isAiGenerated,
				generationSource,
				generationClient: sourceClient || payload.generation?.client || null,
				generationMetadata: metadata
			}
		});

		const committedQuestionIds = [parent.id];
		if (!isBundle) {
			if (payload.questionType === 'MCQ') await createOptions(tx, parent.id, payload.options);
		} else {
			const childType = payload.questionType === 'VIGNETTE_MCQ' ? 'MCQ' : 'CONSTRUCTED_RESPONSE';
			for (const [index, child] of children.entries()) {
				const childTopicId = child.primaryTopicId || payload.primaryTopicId;
				const extraTopicIds = (child.additionalTopicIds || []).filter(Boolean);
				const topicIds = [...new Set([childTopicId, ...extraTopicIds])];
				const conceptIds = [...new Set(child.conceptIds || [])];
				const childRecord = await tx.question.create({
					data: {
						qid: child.externalQuestionId || null,
						stem: child.stem,
						type: childType,
						level: parentMapping.level,
						difficulty: child.difficulty || payload.difficulty,
						topicId: childTopicId,
						courseId: parentMapping.course?.id || payload.courseId,
						volumeId: parentMapping.volume?.id || payload.volumeId,
						moduleId: parentMapping.module?.id || payload.moduleId,
						topics: { connect: topicIds.map(id => ({ id })) },
						...(conceptIds.length ? { concepts: { connect: conceptIds.map(id => ({ id })) } } : {}),
						parentId: parent.id,
						orderIndex: index + 1,
						marks: child.marks || 1,
						imageUrl: child.imageUrl || null,
						los: child.los || null,
						traceSection: child.traceSection || null,
						tracePage: child.tracePage || null,
						keyFormulas: child.keyFormulas || child.formulas || null,
						workedSolution: mergeWorkedSolution(child.workedSolution, child.explanation),
						questionGuidelines: child.markingGuidelines || null,
						output: child.expectedOutput || null,
						calculationSteps: child.calculationSteps?.length ? child.calculationSteps : undefined,
						isAiGenerated,
						generationSource,
						generationClient: sourceClient || payload.generation?.client || null,
						generationMetadata: generationMetadata(child, { sourceClient, sourceProvider, validation })
					}
				});
				committedQuestionIds.push(childRecord.id);
				if (childType === 'MCQ') await createOptions(tx, childRecord.id, child.options);
			}
		}

		const full = await tx.question.findUnique({
			where: { id: parent.id },
			include: {
				options: { orderBy: { position: 'asc' } },
				children: {
					orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
					include: { options: { orderBy: { position: 'asc' } } }
				}
			}
		});
		return { parentId: parent.id, questionIds: committedQuestionIds, question: full };
	};

	if (outerTx) return run(outerTx);
	return prisma.$transaction(run);
}

export function serializeQuestionOptions(question) {
	const attach = options => (options || []).map((option, index) => ({
		...option,
		label: String.fromCharCode(65 + (option.position ?? index))
	}));
	if (!question) return question;
	return {
		...question,
		options: attach(question.options),
		children: Array.isArray(question.children)
			? question.children.map(child => ({ ...child, options: attach(child.options) }))
			: question.children
	};
}

export async function persistLegacyGeneratedItem(prisma, { item, questionType, mapping, userId, client = 'milven-admin-ai', validation = null }) {
	const isBundle = Array.isArray(item?.questions) && item.questions.length > 0;
	const children = isBundle ? item.questions : [];
	const payload = {
		schemaVersion: 'legacy-admin-ai',
		externalQuestionId: item?.qid || item?.externalQuestionId || `legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		questionType,
		courseId: mapping.course?.id,
		volumeId: mapping.volume?.id,
		moduleId: mapping.module?.id,
		primaryTopicId: item?.topicId || item?.questions?.[0]?.topicId || mapping.topicIds?.[0],
		additionalTopicIds: [],
		conceptIds: item?.conceptIds || [],
		difficulty: item?.difficulty || 'MEDIUM',
		marks: isBundle ? children.reduce((sum, child) => sum + (Number(child.marks) || 1), 0) : (Number(item?.marks) || 1),
		stem: item?.stem || (isBundle ? '(Vignette parent)' : ''),
		los: item?.los || null,
		traceSection: item?.traceSection || null,
		tracePage: item?.tracePage || null,
		keyFormulas: item?.keyFormulas || null,
		workedSolution: item?.workedSolution || null,
		explanation: item?.explanation || null,
		options: Array.isArray(item?.options) ? item.options.map((option, index) => ({ ...option, label: String.fromCharCode(65 + index) })) : undefined,
		vignetteText: item?.vignetteText || null,
		subQuestions: isBundle ? children.map(child => ({
			externalQuestionId: child.qid || `legacy-child-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			stem: child.stem,
			difficulty: child.difficulty || item.difficulty || 'MEDIUM',
			marks: Number(child.marks) || 1,
			primaryTopicId: child.topicId || item.topicId || mapping.topicIds?.[0],
			conceptIds: child.conceptIds || [],
			los: child.los || null,
			traceSection: child.traceSection || null,
			tracePage: child.tracePage || null,
			keyFormulas: child.keyFormulas || null,
			workedSolution: child.workedSolution || null,
			explanation: child.explanation || null,
			options: Array.isArray(child.options) ? child.options.map((option, index) => ({ ...option, label: String.fromCharCode(65 + index) })) : undefined,
			markingGuidelines: child.questionGuidelines || null,
			expectedOutput: child.output || null,
			calculationSteps: []
		})) : undefined,
		markingGuidelines: item?.questionGuidelines || null,
		expectedOutput: item?.output || null,
		calculationSteps: [],
		generation: { source: 'INTERNAL_AI', client, generatedAt: new Date().toISOString() }
	};
	return persistQuestionPayload(prisma, payload, {
		mapping,
		userId,
		sourceClient: client,
		generationSource: 'INTERNAL_AI',
		validation
	});
}
