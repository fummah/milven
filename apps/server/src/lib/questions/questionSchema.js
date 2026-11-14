import { z } from 'zod';

export const QUESTION_SCHEMA_VERSION = '2026-11-08';
export const QUESTION_TYPES = ['MCQ', 'VIGNETTE_MCQ', 'CONSTRUCTED_RESPONSE'];
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];
export const CFA_LEVELS = ['NONE', 'LEVEL1', 'LEVEL2', 'LEVEL3'];

export const optionSchema = z.object({
	label: z.string().regex(/^[A-F]$/).optional(),
	text: z.string().min(1),
	isCorrect: z.boolean(),
	rationale: z.string().optional().nullable()
});

const subjectMetadata = {
	externalQuestionId: z.string().min(1).max(120),
	stem: z.string().min(5),
	difficulty: z.enum(DIFFICULTIES),
	marks: z.number().int().positive().max(100).optional(),
	primaryTopicId: z.string().min(1).optional(),
	additionalTopicIds: z.array(z.string().min(1)).max(20).optional().default([]),
	conceptIds: z.array(z.string().min(1)).max(50).optional().default([]),
	los: z.string().optional().nullable(),
	traceSection: z.string().optional().nullable(),
	tracePage: z.string().optional().nullable(),
	keyFormulas: z.string().optional().nullable(),
	workedSolution: z.string().optional().nullable(),
	explanation: z.string().optional().nullable(),
	imageUrl: z.string().url().optional().nullable()
};

export const subQuestionSchema = z.object({
	...subjectMetadata,
	options: z.array(optionSchema).max(10).optional(),
	markingGuidelines: z.string().optional().nullable(),
	expectedOutput: z.string().optional().nullable(),
	calculationSteps: z.array(z.string()).optional().default([]),
	formulas: z.string().optional().nullable(),
	difficultyAssessment: z.record(z.any()).optional().nullable()
});

export const questionPayloadSchema = z.object({
	schemaVersion: z.string().optional(),
	...subjectMetadata,
	questionType: z.enum(QUESTION_TYPES),
	courseId: z.string().min(1),
	volumeId: z.string().min(1),
	moduleId: z.string().min(1),
	primaryTopicId: z.string().min(1),
	options: z.array(optionSchema).max(10).optional(),
	vignetteText: z.string().optional().nullable(),
	subQuestions: z.array(subQuestionSchema).max(20).optional(),
	markingGuidelines: z.string().optional().nullable(),
	expectedOutput: z.string().optional().nullable(),
	calculationSteps: z.array(z.string()).optional().default([]),
	formulas: z.string().optional().nullable(),
	difficultyAssessment: z.record(z.any()).optional().nullable(),
	generation: z.object({
		source: z.string().min(1),
		client: z.string().optional().nullable(),
		provider: z.string().optional().nullable(),
		model: z.string().optional().nullable(),
		generatedAt: z.string().optional().nullable(),
		promptVersion: z.string().optional().nullable(),
		notes: z.string().optional().nullable()
	}).optional(),
	reviewMetadata: z.record(z.any()).optional().nullable()
});

export const questionBatchSchema = z.object({
	schemaVersion: z.string().optional(),
	idempotencyKey: z.string().min(8).max(200),
	externalRequestId: z.string().max(200).optional().nullable(),
	sourceClient: z.string().min(1).max(120),
	sourceProvider: z.string().max(120).optional().nullable(),
	academicScope: z.object({
		courseId: z.string().optional().nullable(),
		volumeId: z.string().optional().nullable(),
		moduleId: z.string().optional().nullable(),
		topicIds: z.array(z.string()).optional().nullable()
	}).optional().nullable(),
	questions: z.array(questionPayloadSchema).min(1).max(50)
});

function cleanText(value) {
	if (typeof value !== 'string') return value;
	return value
		.replace(/<p[^>]*>\s*(?:&nbsp;|<br\s*\/?>)\s*<\/p>/gi, '')
		.replace(/<p[^>]*>\s*<\/p>/gi, '')
		.replace(/(<br\s*\/?>\s*){3,}/gi, '<br>')
		.replace(/_x000D_/gi, '')
		.trim();
}

function cleanOptions(options) {
	if (!Array.isArray(options)) return options;
	return options.map((option, index) => ({
		...option,
		label: option.label || String.fromCharCode(65 + index),
		text: cleanText(option.text),
		rationale: cleanText(option.rationale || '') || null
	}));
}

export function normalizeQuestionPayload(input) {
	const parsed = questionPayloadSchema.parse(input);
	const cleaned = parsed;
	const normalized = {
		...cleaned,
		schemaVersion: QUESTION_SCHEMA_VERSION,
		stem: cleanText(cleaned.stem),
		vignetteText: cleanText(cleaned.vignetteText || '') || null,
		los: cleanText(cleaned.los || '') || null,
		traceSection: cleanText(cleaned.traceSection || '') || null,
		tracePage: cleanText(cleaned.tracePage || '') || null,
		keyFormulas: cleanText(cleaned.keyFormulas || '') || null,
		workedSolution: cleanText(cleaned.workedSolution || '') || null,
		explanation: cleanText(cleaned.explanation || '') || null,
		markingGuidelines: cleanText(cleaned.markingGuidelines || '') || null,
		expectedOutput: cleanText(cleaned.expectedOutput || '') || null,
		formulas: cleanText(cleaned.formulas || '') || null,
		options: cleanOptions(cleaned.options),
		subQuestions: Array.isArray(cleaned.subQuestions)
			? cleaned.subQuestions.map(sub => ({
				...sub,
				stem: cleanText(sub.stem),
				los: cleanText(sub.los || '') || null,
				traceSection: cleanText(sub.traceSection || '') || null,
				tracePage: cleanText(sub.tracePage || '') || null,
				keyFormulas: cleanText(sub.keyFormulas || '') || null,
				workedSolution: cleanText(sub.workedSolution || '') || null,
				explanation: cleanText(sub.explanation || '') || null,
				markingGuidelines: cleanText(sub.markingGuidelines || '') || null,
				expectedOutput: cleanText(sub.expectedOutput || '') || null,
				formulas: cleanText(sub.formulas || '') || null,
				options: cleanOptions(sub.options)
			}))
			: undefined
	};
	const childMarks = Array.isArray(normalized.subQuestions)
		? normalized.subQuestions.reduce((sum, child) => sum + (child.marks || 1), 0)
		: 0;
	if (childMarks > 0) normalized.marks = normalized.marks || childMarks;
	return normalized;
}

export function expectedLabels(count) {
	return Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index));
}
