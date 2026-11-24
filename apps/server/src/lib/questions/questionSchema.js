import { z } from 'zod';
import { deriveExplanationFields, splitExplanation, splitMergedExplanation } from './explanationText.js';
import { inspectOptionText, normalizeOptionRationale, normalizeOptionText } from './optionText.js';
import { normalizeDifficultyValue } from '../questionDifficulty.js';

export const QUESTION_SCHEMA_VERSION = '2026-11-16';
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
	correctAnswerExplanation: z.string().optional().nullable(),
	incorrectOptionsExplanation: z.string().optional().nullable(),
	commonMistake: z.string().optional().nullable(),
	conceptsTested: z.string().optional().nullable(),
	sourceConcept: z.string().optional().nullable(),
	sourceSetId: z.string().max(120).optional().nullable(),
	answerVerificationStatus: z.enum(['UNVERIFIED', 'SOURCE_PROVIDED', 'AUTOMATIC_CHECKED', 'HUMAN_VERIFIED']).optional().nullable(),
	imageUrl: z.string().url().optional().nullable()
};

export const subQuestionSchema = z.object({
	...subjectMetadata,
	options: z.array(optionSchema).max(10).optional(),
	markingGuidelines: z.string().optional().nullable(),
	expectedOutput: z.string().optional().nullable(),
	calculationSteps: z.array(z.string()).optional().default([]),
	formulas: z.string().optional().nullable(),
	difficultyAssessment: z.record(z.any()).optional().nullable(),
	reviewMetadata: z.record(z.any()).optional().nullable()
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
	caseStudyTitle: z.string().optional().nullable(),
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

export const subQuestionInputSchema = subQuestionSchema.extend({ difficulty: z.string().optional().nullable() }).passthrough();
export const questionPayloadInputSchema = z.object({
	...questionPayloadSchema.shape,
	difficulty: z.string().optional().nullable(),
	subQuestions: z.array(subQuestionInputSchema).max(20).optional()
}).passthrough();

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
	questions: z.array(questionPayloadInputSchema).min(1).max(50)
});

export const FIELD_ALIASES = {
	correctExplanation: 'correctAnswerExplanation',
	whyCorrect: 'correctAnswerExplanation',
	wrongOptionsExplanation: 'incorrectOptionsExplanation',
	distractorExplanation: 'incorrectOptionsExplanation',
	commonError: 'commonMistake',
	concepts: 'conceptsTested',
	learningOutcomeStatement: 'los',
	sectionReference: 'traceSection',
	pageReference: 'tracePage'
};

const ALIAS_SOURCES = Object.entries(FIELD_ALIASES).reduce((map, [alias, field]) => {
	map[field] = [...(map[field] || []), alias];
	return map;
}, {});
const AUDIT_FIELDS = [
	'externalQuestionId', 'stem', 'difficulty', 'marks', 'los', 'traceSection', 'tracePage',
	'keyFormulas', 'workedSolution', 'correctAnswerExplanation', 'incorrectOptionsExplanation',
	'commonMistake', 'conceptsTested', 'sourceConcept', 'sourceSetId', 'answerVerificationStatus'
];
const ROOT_KEYS = new Set([...Object.keys(questionPayloadSchema.shape), ...Object.keys(FIELD_ALIASES)]);
const CHILD_KEYS = new Set([...Object.keys(subQuestionSchema.shape), ...Object.keys(FIELD_ALIASES)]);

function cleanText(value) {
	if (typeof value !== 'string') return value;
	return value
		.replace(/<p[^>]*>\s*(?:&nbsp;|<br\s*\/?>)\s*<\/p>/gi, '')
		.replace(/<p[^>]*>\s*<\/p>/gi, '')
		.replace(/(<br\s*\/?>\s*){3,}/gi, '<br>')
		.replace(/_x000D_/gi, '')
		.trim();
}

function normalizePage(value) {
	const text = cleanText(value || '');
	return text ? text.replace(/^(?:p\.?|page)\s*/i, '').trim() || null : null;
}

function cleanOptions(options) {
	if (!Array.isArray(options)) return options;
	return options.map((option, index) => ({
		...option,
		label: option.label || String.fromCharCode(65 + index),
		text: normalizeOptionText(option.text).text,
		rationale: normalizeOptionRationale(option.rationale)
	}));
}

function isNonEmpty(value) {
	return value !== undefined && value !== null && String(value).trim().length > 0;
}

function comparable(value) {
	return String(value || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function applyAliases(input) {
	const value = structuredClone(input || {});
	const issues = [];
	const applyTo = (object, path) => {
		if (!object || typeof object !== 'object' || Array.isArray(object)) return;
		for (const [alias, canonical] of Object.entries(FIELD_ALIASES)) {
			if (!Object.prototype.hasOwnProperty.call(object, alias)) continue;
			const raw = object[alias];
			if (!isNonEmpty(raw)) {
				delete object[alias];
				continue;
			}
			if (canonical === 'conceptsTested' && Array.isArray(raw)) {
				issues.push({
					milvenCode: 'CONCEPTS_ALIAS_REQUIRES_TEXT',
					path: [...path, alias],
					message: 'The concepts alias must be descriptive text. Use conceptIds for verified Concept IDs.'
				});
				continue;
			}
			if (typeof raw !== 'string') {
				issues.push({
					milvenCode: 'ALIAS_VALUE_INVALID',
					path: [...path, alias],
					message: `The ${alias} alias must be a string.`
				});
				continue;
			}
			if (isNonEmpty(object[canonical]) && comparable(object[canonical]) !== comparable(raw)) {
				issues.push({
					milvenCode: 'CONFLICTING_FIELD_ALIAS',
					path: [...path, canonical],
					message: `Both ${canonical} and its alias ${alias} were supplied with different values.`
				});
				continue;
			}
			if (!isNonEmpty(object[canonical])) object[canonical] = raw;
			delete object[alias];
		}
	};
	const applyDifficulty = (object, path) => {
		if (!object || typeof object !== 'object' || Array.isArray(object)) return;
		if (!isNonEmpty(object.difficulty)) {
			issues.push({
				milvenCode: 'QUESTION_DIFFICULTY_MISSING',
				path: [...path, 'difficulty'],
				message: 'The original question difficulty must be supplied.'
			});
			return;
		}
		const normalized = normalizeDifficultyValue(object.difficulty);
		if (!normalized) {
			issues.push({
				milvenCode: 'QUESTION_DIFFICULTY_INVALID',
				path: [...path, 'difficulty'],
				message: 'Question difficulty must be EASY, MEDIUM or HARD.'
			});
			return;
		}
		object.difficulty = normalized;
	};
	applyTo(value, []);
	applyDifficulty(value, []);
	if (Array.isArray(value.subQuestions)) {
		value.subQuestions.forEach((child, index) => {
			applyTo(child, ['subQuestions', index]);
			applyDifficulty(child, ['subQuestions', index]);
		});
	}
	return { value, issues };
}

function unknownKeys(object, allowed) {
	if (!object || typeof object !== 'object' || Array.isArray(object)) return [];
	return Object.keys(object).filter(key => !allowed.has(key));
}

function rawField(raw, field) {
	const sources = [field, ...(ALIAS_SOURCES[field] || [])];
	for (const source of sources) {
		if (isNonEmpty(raw?.[source])) return raw[source];
	}
	return undefined;
}

function auditSubject(raw, normalized, path, derived = []) {
	const unmappedFields = [];
	for (const field of AUDIT_FIELDS) {
		if (isNonEmpty(rawField(raw, field)) && !isNonEmpty(normalized[field])) {
			unmappedFields.push({ path, field });
		}
	}
	const explanationSource = rawField(raw, 'explanation') || splitMergedExplanation(rawField(raw, 'workedSolution')).explanation;
	for (const field of Object.keys(splitExplanation(explanationSource))) {
		if (!isNonEmpty(normalized[field]) && !unmappedFields.some(entry => entry.field === field)) {
			unmappedFields.push({ path, field, source: 'explanation' });
		}
	}
	return {
		path,
		unmappedFields,
		derivedFields: derived.map(entry => ({ path, field: entry.field, source: entry.source })),
		unknownFields: unknownKeys(raw, path === '' ? ROOT_KEYS : CHILD_KEYS).map(field => ({ path, field }))
	};
}

function collectOptionTextAudit(rawOptions, path, audits) {
	if (!Array.isArray(rawOptions)) return;
	rawOptions.forEach((option, index) => {
		for (const field of ['text', 'rationale']) {
			const inspection = inspectOptionText(option?.[field]);
			if (!inspection.artifacts.length) continue;
			audits.push({
				code: 'OPTION_TEXT_FORMATTING_ARTIFACT',
				path: `${path}.options[${index}].${field}`,
				field,
				artifacts: inspection.artifacts,
				original: inspection.original,
				cleaned: field === 'rationale' ? normalizeOptionRationale(inspection.original) : normalizeOptionText(inspection.original).text,
				codepoints: inspection.codepoints
			});
		}
	});
}

function normalizeSubject(source) {
	return {
		...source,
		stem: cleanText(source.stem),
		los: cleanText(source.los || '') || null,
		traceSection: cleanText(source.traceSection || '') || null,
		tracePage: normalizePage(source.tracePage),
		keyFormulas: cleanText(source.keyFormulas || '') || null,
		workedSolution: cleanText(source.workedSolution || '') || null,
		explanation: cleanText(source.explanation || '') || null,
		correctAnswerExplanation: cleanText(source.correctAnswerExplanation || '') || null,
		incorrectOptionsExplanation: cleanText(source.incorrectOptionsExplanation || '') || null,
		commonMistake: cleanText(source.commonMistake || '') || null,
		conceptsTested: cleanText(source.conceptsTested || '') || null,
		sourceConcept: cleanText(source.sourceConcept || '') || null,
		sourceSetId: cleanText(source.sourceSetId || '') || null,
		answerVerificationStatus: source.answerVerificationStatus || null,
		markingGuidelines: cleanText(source.markingGuidelines || '') || null,
		expectedOutput: cleanText(source.expectedOutput || '') || null,
		formulas: cleanText(source.formulas || '') || null,
		options: cleanOptions(source.options)
	};
}

function attachFieldAudit(normalized, raw, childAudits) {
	const reviewMetadata = normalized.reviewMetadata && typeof normalized.reviewMetadata === 'object' && !Array.isArray(normalized.reviewMetadata)
		? normalized.reviewMetadata
		: {};
	const rootAudit = normalized.questionType === 'VIGNETTE_MCQ'
		? { path: '', unmappedFields: [], derivedFields: [], unknownFields: unknownKeys(raw, ROOT_KEYS).map(field => ({ path: '', field })) }
		: auditSubject(raw, normalized, '');
	const audits = [rootAudit, ...childAudits].filter(Boolean);
	normalized.reviewMetadata = {
		...reviewMetadata,
		fieldMappingAudit: {
			audits,
			unmappedFields: audits.flatMap(audit => audit.unmappedFields || []),
			derivedFields: audits.flatMap(audit => audit.derivedFields || []),
			unknownFields: audits.flatMap(audit => audit.unknownFields || [])
		}
	};
}

export function normalizeQuestionPayload(input) {
	const aliased = applyAliases(input);
	if (aliased.issues.length) {
		const error = new Error(aliased.issues.map(issue => issue.message).join('; '));
		error.name = 'QuestionFieldMappingError';
		error.issues = aliased.issues;
		throw error;
	}
	const parsed = questionPayloadSchema.parse(aliased.value);
	const normalized = {
		...parsed,
		schemaVersion: QUESTION_SCHEMA_VERSION,
		stem: cleanText(parsed.stem),
		vignetteText: cleanText(parsed.vignetteText || '') || null,
		caseStudyTitle: cleanText(parsed.caseStudyTitle || '') || null,
		...normalizeSubject(parsed),
		options: cleanOptions(parsed.options),
		subQuestions: Array.isArray(parsed.subQuestions)
			? parsed.subQuestions.map(sub => normalizeSubject(sub))
			: undefined
	};
	const raw = aliased.value;
	const childAudits = [];
	const rootDerived = [];
	if (normalized.questionType === 'VIGNETTE_MCQ') {
		normalized.subQuestions = (normalized.subQuestions || []).map((child, index) => {
			const derived = deriveExplanationFields(child);
			const rawChild = raw.subQuestions?.[index] || {};
			childAudits.push(auditSubject(rawChild, child, `subQuestions[${index}]`, derived.derived || []));
			return child;
		});
	} else if (normalized.questionType === 'MCQ') {
		const derived = deriveExplanationFields(normalized);
		rootDerived.push(...(derived.derived || []));
	}
	attachFieldAudit(normalized, raw, childAudits);
	const optionTextAudit = [];
	collectOptionTextAudit(raw.options, 'question', optionTextAudit);
	if (Array.isArray(raw.subQuestions)) {
		raw.subQuestions.forEach((child, index) => collectOptionTextAudit(child?.options, `subQuestions[${index}]`, optionTextAudit));
	}
	normalized.reviewMetadata.optionTextAudit = optionTextAudit;
	if (rootDerived.length) {
		normalized.reviewMetadata.fieldMappingAudit.derivedFields.push(...rootDerived.map(entry => ({ path: '', field: entry.field, source: entry.source })));
	}
	const childMarks = Array.isArray(normalized.subQuestions)
		? normalized.subQuestions.reduce((sum, child) => sum + (child.marks || 1), 0)
		: 0;
	if (childMarks > 0) normalized.marks = normalized.marks || childMarks;
	return normalized;
}

export function expectedLabels(count) {
	return Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index));
}
