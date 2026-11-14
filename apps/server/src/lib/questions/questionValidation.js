import katex from 'katex';
import { normalizeDifficultyValue } from '../questionDifficulty.js';
import { validateAcademicMapping } from './questionCurriculum.js';
import { expectedLabels, QUESTION_TYPES } from './questionSchema.js';

const UNSAFE_HTML = /<\s*(script|iframe|object|embed|form|input|button|meta|link)\b|on[a-z]+\s*=|javascript\s*:/i;
const MATH_PATTERN = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g;

function issue(code, message, path, severity = 'error', details = undefined) {
	return { code, message, path, severity, ...(details ? { details } : {}) };
}

function stripHtml(value) {
	return String(value || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function wordCount(value) {
	return stripHtml(value).split(/\s+/).filter(Boolean).length;
}

function walkStrings(value, path = '', visitor) {
	if (typeof value === 'string') {
		visitor(value, path);
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((entry, index) => walkStrings(entry, `${path}[${index}]`, visitor));
		return;
	}
	if (value && typeof value === 'object' && !(value instanceof Date)) {
		for (const [key, entry] of Object.entries(value)) {
			walkStrings(entry, path ? `${path}.${key}` : key, visitor);
		}
	}
}

function validateMathFields(payload, errors, warnings) {
	const fields = [
		['keyFormulas', payload.keyFormulas],
		['workedSolution', payload.workedSolution],
		['formulas', payload.formulas],
		['expectedOutput', payload.expectedOutput]
	];
	for (const child of payload.subQuestions || []) {
		fields.push(
			[`subQuestions.${child.externalQuestionId}.keyFormulas`, child.keyFormulas],
			[`subQuestions.${child.externalQuestionId}.workedSolution`, child.workedSolution],
			[`subQuestions.${child.externalQuestionId}.expectedOutput`, child.expectedOutput]
		);
	}
	for (const [path, value] of fields) {
		if (!value) continue;
		const text = String(value);
		if (/\b(ext|rac)\{/.test(text) || /\bimes\b/.test(text)) {
			errors.push(issue('MALFORMED_LATEX', `Malformed LaTeX command in ${path}.`, path));
		}
		for (const match of text.matchAll(MATH_PATTERN)) {
			const expression = match[1] || match[2] || match[3] || match[4] || '';
			if (!expression.trim()) {
				warnings.push(issue('EMPTY_MATH', `Empty math delimiter in ${path}.`, path, 'warning'));
				continue;
			}
			try {
				katex.renderToString(expression, { throwOnError: true, strict: 'ignore', displayMode: Boolean(match[2] || match[3]) });
			} catch (error) {
				errors.push(issue('INVALID_LATEX', `Invalid LaTeX in ${path}: ${error.message}`, path));
			}
		}
	}
}

function numericValues(text) {
	const values = [];
	const clean = String(text || '').replace(/,/g, '');
	const magnitudes = { trillion: 1e12, billion: 1e9, million: 1e6, thousand: 1e3 };
	for (const [word, multiplier] of Object.entries(magnitudes)) {
		for (const match of clean.matchAll(new RegExp(`(-?\\d+(?:\\.\\d+)?)\\s*${word}`, 'gi'))) {
			values.push(Number(match[1]) * multiplier);
		}
	}
	for (const match of clean.matchAll(/-?\d+(?:\.\d+)?/g)) values.push(Number(match[0]));
	return values.filter(Number.isFinite);
}

function closeNumber(a, b) {
	if (Math.abs(a - b) < 0.000001) return true;
	if (a !== 0 && Math.abs((a - b) / a) <= 0.006) return true;
	return false;
}

function numericConsistency(option, options, workedSolution, errors) {
	const valueMatch = String(option?.text || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
	if (!valueMatch) return;
	const correctValue = Number(valueMatch[0]);
	if (!Number.isFinite(correctValue)) return;
	const solutionNumbers = numericValues(workedSolution);
	if (solutionNumbers.some(number => closeNumber(number, correctValue))) return;
	const otherMatch = options
		.filter(candidate => candidate !== option)
		.map(candidate => String(candidate.text || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/))
		.find(Boolean);
	if (otherMatch) {
		const otherValue = Number(otherMatch[0]);
		if (solutionNumbers.some(number => closeNumber(number, otherValue))) {
			errors.push(issue(
				'ANSWER_SOLUTION_NUMERIC_MISMATCH',
				`The correct option ${correctValue} is not supported by the worked solution, while distractor ${otherValue} appears in it.`,
				'options',
				'error'
			));
		}
	}
}

function validateOptions(options, path, errors, warnings, { required = true } = {}) {
	const list = Array.isArray(options) ? options : [];
	if (required && list.length === 0) {
		errors.push(issue('OPTIONS_REQUIRED', 'MCQ options are required.', path));
		return;
	}
	if (!required && list.length === 0) return;
	if (list.length !== 3) {
		errors.push(issue('OPTION_COUNT', 'CFA MCQs must contain exactly three options (A, B, C).', path, 'error', { count: list.length }));
	}
	const labels = expectedLabels(list.length);
	const texts = new Set();
	let correct = 0;
	list.forEach((option, index) => {
		const optionPath = `${path}[${index}]`;
		if (!String(option.text || '').trim()) errors.push(issue('OPTION_TEXT_REQUIRED', 'Option text is required.', `${optionPath}.text`));
		if (option.label && option.label !== labels[index]) {
			errors.push(issue('OPTION_LABEL_ORDER', `Option label ${option.label} must be ${labels[index]} at position ${index + 1}.`, `${optionPath}.label`));
		}
		if (option.isCorrect) correct += 1;
		const normalized = stripHtml(option.text).toLowerCase();
		if (normalized) {
			if (texts.has(normalized)) errors.push(issue('DUPLICATE_OPTION', 'Options must be distinct.', `${optionPath}.text`));
			texts.add(normalized);
		}
		if (!option.rationale) warnings.push(issue('DISTRACTOR_RATIONALE_MISSING', 'Distractor rationale is optional but recommended.', `${optionPath}.rationale`, 'warning'));
	});
	if (correct !== 1) {
		errors.push(issue('CORRECT_OPTION_COUNT', `Exactly one option must be correct; received ${correct}.`, path));
	}
}

function validateCommon(payload, errors, warnings) {
	if (!QUESTION_TYPES.includes(payload.questionType)) {
		errors.push(issue('QUESTION_TYPE_INVALID', 'Unsupported question type.', 'questionType'));
	}
	const difficulty = normalizeDifficultyValue(payload.difficulty);
	if (!difficulty) errors.push(issue('DIFFICULTY_INVALID', 'Difficulty must be EASY, MEDIUM or HARD.', 'difficulty'));
	const assessed = normalizeDifficultyValue(payload.difficultyAssessment?.actualDifficulty || payload.reviewMetadata?.assessedDifficulty);
	if (assessed && difficulty && assessed !== difficulty) {
		warnings.push(issue(
			'DIFFICULTY_MISMATCH',
			`Requested ${difficulty} but the supplied assessment reports ${assessed}. Review before approval; the requested target was not changed.`,
			'difficulty',
			'warning',
			{ requested: difficulty, assessed }
		));
	}
	if (!payload.marks || payload.marks < 1) errors.push(issue('MARKS_INVALID', 'Marks must be a positive integer.', 'marks'));
	if (!(payload.subQuestions || []).length && !payload.workedSolution && !payload.expectedOutput && !payload.markingGuidelines) {
		errors.push(issue('SOLUTION_REQUIRED', 'A worked solution, marking guideline, or expected output is required.', 'workedSolution'));
	}
}

function validateSubject(subject, path, errors, warnings, { mcq = false, constructed = false } = {}) {
	if (!subject.stem || String(subject.stem).trim().length < 5) {
		errors.push(issue('STEM_REQUIRED', 'Question stem is required.', `${path}.stem`));
	}
	if (!subject.externalQuestionId) {
		errors.push(issue('EXTERNAL_QID_REQUIRED', 'externalQuestionId is required.', `${path}.externalQuestionId`));
	}
	if (!normalizeDifficultyValue(subject.difficulty)) {
		errors.push(issue('DIFFICULTY_INVALID', 'Difficulty must be EASY, MEDIUM or HARD.', `${path}.difficulty`));
	}
	if (mcq) validateOptions(subject.options, `${path}.options`, errors, warnings);
	if (mcq) {
		const correct = (subject.options || []).find(option => option?.isCorrect);
		if (correct) numericConsistency(correct, subject.options, subject.workedSolution, errors);
		if (!subject.workedSolution && !subject.explanation) {
			errors.push(issue('WORKED_SOLUTION_REQUIRED', 'MCQ worked solution or explanation is required.', `${path}.workedSolution`));
		}
	}
	if (constructed) {
		if (!subject.markingGuidelines && !subject.workedSolution && !subject.expectedOutput) {
			errors.push(issue('MARKING_GUIDELINES_REQUIRED', 'Constructed-response marking guidance is required.', `${path}.markingGuidelines`));
		}
	}
}

export async function validateQuestionPayload(prisma, payload, { batchExternalIds = [] } = {}) {
	const errors = [];
	const warnings = [];
	const info = [];

	walkStrings(payload, '', (value, path) => {
		if (value.includes('\u0000')) errors.push(issue('NULL_BYTE', 'U+0000 NULL bytes are not allowed.', path));
		if (UNSAFE_HTML.test(value)) errors.push(issue('UNSAFE_HTML', 'Scripts, event handlers and executable HTML are not allowed.', path));
	});

	validateCommon(payload, errors, warnings);
	validateMathFields(payload, errors, warnings);

	const parentMapping = await validateAcademicMapping(prisma, {
		courseId: payload.courseId,
		volumeId: payload.volumeId,
		moduleId: payload.moduleId,
		primaryTopicId: payload.primaryTopicId,
		additionalTopicIds: payload.additionalTopicIds,
		conceptIds: payload.conceptIds
	});
	errors.push(...parentMapping.errors);
	warnings.push(...parentMapping.warnings);

	const externalIds = new Set(batchExternalIds.filter(Boolean));
	if (payload.externalQuestionId) {
		if (externalIds.has(payload.externalQuestionId)) {
			errors.push(issue('DUPLICATE_EXTERNAL_QID_BATCH', 'External question ID is duplicated within this batch.', 'externalQuestionId'));
		}
		externalIds.add(payload.externalQuestionId);
	}

	if (payload.questionType === 'MCQ') {
		validateSubject(payload, 'question', errors, warnings, { mcq: true });
		if (Array.isArray(payload.subQuestions) && payload.subQuestions.length) {
			errors.push(issue('MCQ_CHILDREN_UNSUPPORTED', 'A standalone MCQ cannot contain sub-questions.', 'subQuestions'));
		}
	}

	if (payload.questionType === 'VIGNETTE_MCQ') {
		const proseWords = wordCount(payload.vignetteText);
		if (!payload.vignetteText || proseWords < 30) {
			errors.push(issue('VIGNETTE_REQUIRED', 'A substantive vignette/case study is required.', 'vignetteText'));
		} else if (proseWords < 150) {
			warnings.push(issue('VIGNETTE_SHORT', `Vignette has ${proseWords} words; CFA item sets normally use at least 250.`, 'vignetteText', 'warning'));
		}
		if (!Array.isArray(payload.options) || payload.options.length === 0) {
			// Parent item sets should not carry standalone MCQ options.
		} else {
			warnings.push(issue('VIGNETTE_PARENT_OPTIONS_IGNORED', 'Parent vignette options are ignored; options belong on each sub-question.', 'options', 'warning'));
		}
		const children = payload.subQuestions || [];
		if (children.length === 0) errors.push(issue('VIGNETTE_CHILDREN_REQUIRED', 'At least one vignette sub-question is required.', 'subQuestions'));
		else if (children.length !== 4) info.push(issue('VIGNETTE_CHILD_COUNT', `Item set contains ${children.length} sub-question(s); four is the usual CFA format.`, 'subQuestions', 'info'));
		const childIdSet = new Set();
		for (const [index, child] of children.entries()) {
			if (child.externalQuestionId) {
				if (childIdSet.has(child.externalQuestionId)) {
					errors.push(issue('DUPLICATE_CHILD_QID', 'Child external question IDs must be unique.', `subQuestions[${index}].externalQuestionId`));
				}
				if (batchExternalIds.includes(child.externalQuestionId)) {
					errors.push(issue('DUPLICATE_EXTERNAL_QID_BATCH', 'Child external question ID is already used by another batch item.', `subQuestions[${index}].externalQuestionId`));
				}
				childIdSet.add(child.externalQuestionId);
			}
			const childTopicId = child.primaryTopicId || payload.primaryTopicId;
			const childMapping = await validateAcademicMapping(prisma, {
				courseId: payload.courseId,
				volumeId: payload.volumeId,
				moduleId: payload.moduleId,
				primaryTopicId: childTopicId,
				additionalTopicIds: child.additionalTopicIds,
				conceptIds: child.conceptIds
			});
			errors.push(...childMapping.errors.map(error => ({ ...error, path: `subQuestions[${index}].${error.path || ''}` })));
			warnings.push(...childMapping.warnings.map(warning => ({ ...warning, path: `subQuestions[${index}].${warning.path || ''}` })));
			validateSubject(child, `subQuestions[${index}]`, errors, warnings, { mcq: true });
			validateMathFields(child, errors, warnings);
		}
		const totalMarks = children.reduce((sum, child) => sum + (child.marks || 0), 0);
		if (payload.marks && totalMarks && payload.marks !== totalMarks) {
			warnings.push(issue('MARKS_TOTAL_MISMATCH', `Parent marks (${payload.marks}) differ from the sub-question total (${totalMarks}).`, 'marks', 'warning'));
		}
	}

	if (payload.questionType === 'CONSTRUCTED_RESPONSE') {
		const children = payload.subQuestions || [];
		if (children.length) {
			if (!payload.vignetteText || wordCount(payload.vignetteText) < 20) {
				warnings.push(issue('CASE_STUDY_SHORT', 'Constructed-response item sets should include a case study.', 'vignetteText', 'warning'));
			}
			for (const [index, child] of children.entries()) {
				validateSubject(child, `subQuestions[${index}]`, errors, warnings, { constructed: true });
				validateMathFields(child, errors, warnings);
			}
			const totalMarks = children.reduce((sum, child) => sum + (child.marks || 0), 0);
			if (payload.marks && totalMarks && payload.marks !== totalMarks) {
				warnings.push(issue('MARKS_TOTAL_MISMATCH', `Parent marks (${payload.marks}) differ from the sub-question total (${totalMarks}).`, 'marks', 'warning'));
			}
		} else {
			validateSubject(payload, 'question', errors, warnings, { constructed: true });
		}
	}

	const summary = {
		errors: errors.length,
		warnings: warnings.length,
		info: info.length,
		ok: errors.length === 0,
		automaticValidationOnly: true,
		humanReviewRequired: true,
		checkedAt: new Date().toISOString()
	};

	return {
		ok: errors.length === 0,
		errors,
		warnings,
		info,
		summary,
		academic: parentMapping.ok ? {
			course: parentMapping.course,
			volume: parentMapping.volume,
			module: parentMapping.module,
			topics: parentMapping.topics,
			concepts: parentMapping.concepts,
			level: parentMapping.level
		} : null
	};
}
