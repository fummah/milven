import { DIFFICULTY_RUBRICS, HARD_CRITERIA, normalizeDifficultyValue } from '../questionDifficulty.js';
import { QUESTION_SCHEMA_VERSION, questionPayloadSchema } from './questionSchema.js';

export const REQUIRED_QUESTION_RULES = [
	'Use only the supplied Milven course, volume, module, topic and concept IDs.',
	'Do not invent academic records or silently substitute a similar-looking topic.',
	'Question stems and option text must use plain candidate-facing language.',
	'Put formulas and mathematical notation in keyFormulas and workedSolution.',
	'MCQ items contain exactly three ordered options A, B and C with exactly one correct answer.',
	'Every MCQ must include a worked solution and a specific rationale for each distractor where available.',
	'Vignette item sets require one shared case study and independently complete sub-questions.',
	'Each sub-question must retain its own difficulty, marks, LOS, trace references, formulas, worked solution and concept mapping.',
	'Constructed responses require marking guidelines and an expected model answer.',
	'Do not copy curriculum or third-party wording; write original Milven exam-style material.',
	'All externally generated questions are staged for administrator review and are never auto-committed.'
];

export const QUESTION_BLUEPRINT = {
	schemaVersion: QUESTION_SCHEMA_VERSION,
	payloadShape: {
		externalQuestionId: 'Stable client-generated ID, unique within the batch.',
		questionType: 'MCQ | VIGNETTE_MCQ | CONSTRUCTED_RESPONSE',
		courseId: 'Milven Course ID',
		volumeId: 'Milven Volume ID belonging to the course',
		moduleId: 'Milven Module ID belonging to the volume',
		primaryTopicId: 'Primary Milven Topic ID belonging to the module',
		additionalTopicIds: 'Optional additional Topic IDs from the same module',
		conceptIds: 'Optional Concept IDs belonging to the selected topic(s)',
		difficulty: 'EASY | MEDIUM | HARD',
		marks: 'Positive integer; parent total must equal the child total',
		stem: 'Candidate-facing question stem or case title',
		los: 'Learning outcome statement or LOS code',
		traceSection: 'Curriculum section reference',
		tracePage: 'Curriculum page reference',
		keyFormulas: 'Key formulas with KaTeX-compatible LaTeX',
		workedSolution: 'Complete worked solution',
		options: 'MCQ only: exactly 3 options with label, text, isCorrect and rationale',
		vignetteText: 'VIGNETTE_MCQ / case-study: shared scenario',
		subQuestions: 'Ordered, complete child questions',
		markingGuidelines: 'CONSTRUCTED_RESPONSE: mark allocation',
		expectedOutput: 'CONSTRUCTED_RESPONSE: model answer',
		calculationSteps: 'CONSTRUCTED_RESPONSE: ordered calculation steps',
		difficultyAssessment: 'Optional review-only self-assessment; never overrides the requested target',
		generation: 'Source/client/provider/model/generatedAt provenance',
		reviewMetadata: 'Review-only metadata that is not treated as a database field'
	},
	rules: REQUIRED_QUESTION_RULES,
	difficultyRubrics: DIFFICULTY_RUBRICS,
	hardCriteria: HARD_CRITERIA,
	workflow: ['VALIDATE', 'CREATE_DRAFT_OR_BATCH', 'ADMIN_REVIEW', 'APPROVE', 'COMMIT'],
	sideEffects: {
		milven_validate_questions: 'none',
		milven_check_question_duplicates: 'none',
		milven_create_question_draft: 'creates a staged review batch only',
		milven_create_question_batch: 'creates a staged review batch only',
		milven_update_question_draft: 'updates a staged review item only',
		milven_commit_approved_questions: 'writes approved questions to the live question bank'
	}
};

export function buildQuestionBlueprint({ difficulty, questionType, academicContext } = {}) {
	const requested = normalizeDifficultyValue(difficulty);
	return {
		...QUESTION_BLUEPRINT,
		requestedDifficulty: requested,
		requestedDifficultyRubric: requested ? DIFFICULTY_RUBRICS[requested] : null,
		questionType: questionType || null,
		academicContext: academicContext || null,
		jsonSchema: null,
		strictZodSchemaAvailable: true,
		responseExpectation: 'Return the completed question payload as data. Validate it with milven_validate_questions before creating a draft or batch.'
	};
}

export function describeQuestionSchema() {
	return {
		version: QUESTION_SCHEMA_VERSION,
		strict: true,
		schema: questionPayloadSchema,
		requiredQuestionFields: [
			'externalQuestionId', 'questionType', 'courseId', 'volumeId', 'moduleId',
			'primaryTopicId', 'difficulty', 'marks', 'stem'
		]
	};
}
