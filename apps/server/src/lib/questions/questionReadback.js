import { inspectOptionText } from './optionText.js';
import { resolveWorkedSolution } from './questionPersistence.js';

function valueOf(value) {
	if (value === undefined || value === null) return null;
	if (typeof value === 'string') return value;
	return value;
}

function sameValue(expected, actual) {
	const left = valueOf(expected);
	const right = valueOf(actual);
	if (left === null && right === null) return true;
	if (left === null || right === null) return false;
	return String(left) === String(right);
}

function sameIdSet(expected, actual) {
	const left = [...new Set((expected || []).filter(Boolean))].sort();
	const right = [...new Set((actual || []).filter(Boolean))].sort();
	return JSON.stringify(left) === JSON.stringify(right);
}

function addMismatch(mismatches, path, expected, actual, code = 'COMMIT_READBACK_MISMATCH') {
	if (sameValue(expected, actual)) return;
	mismatches.push({ code, path, expected: valueOf(expected), actual: valueOf(actual) });
}

function checkText(mismatches, path, expected, actual) {
	const left = String(expected || '');
	const right = String(actual || '');
	if (left === right) return;
	const code = /\\/.test(left) || /\t|\f/.test(right) ? 'FORMULA_READBACK_MISMATCH' : 'COMMIT_READBACK_MISMATCH';
	mismatches.push({ code, path, expected: expected ?? null, actual: actual ?? null });
}

function verifyOptions(mismatches, path, expected, actual) {
	const left = Array.isArray(expected) ? expected : [];
	const right = Array.isArray(actual) ? [...actual].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : [];
	if (left.length !== right.length) {
		mismatches.push({ code: 'COMMIT_READBACK_MISMATCH', path: `${path}.length`, expected: left.length, actual: right.length });
		return;
	}
	left.forEach((option, index) => {
		const saved = right[index] || {};
		addMismatch(mismatches, `${path}[${index}].text`, option.text || '', saved.text || '');
		addMismatch(mismatches, `${path}[${index}].isCorrect`, Boolean(option.isCorrect), Boolean(saved.isCorrect));
		addMismatch(mismatches, `${path}[${index}].position`, index, saved.position ?? index);
		const inspection = inspectOptionText(saved.text);
		if (inspection.artifacts.length) {
			mismatches.push({ code: 'OPTION_TEXT_FORMATTING_ARTIFACT', path: `${path}[${index}].text`, expected: option.text || '', actual: saved.text || '', artifacts: inspection.artifacts });
		}
		const expectedRationale = option.rationale || null;
		const actualRationale = saved.rationale || null;
		if (!sameValue(expectedRationale, actualRationale)) {
			mismatches.push({ code: 'COMMIT_READBACK_MISMATCH', path: `${path}[${index}].rationale`, expected: expectedRationale, actual: actualRationale });
		}
	});
}

export function verifyPersistedQuestion(payload, question, mapping = {}) {
	const mismatches = [];
	const courseId = mapping.course?.id || payload.courseId;
	const volumeId = mapping.volume?.id || payload.volumeId;
	const moduleId = mapping.module?.id || payload.moduleId;
	const children = Array.isArray(payload.subQuestions) ? payload.subQuestions : [];
	const isBundle = children.length > 0;
	const totalMarks = isBundle ? children.reduce((sum, child) => sum + (child.marks || 1), 0) : payload.marks;
	checkText(mismatches, 'parent.qid', payload.externalQuestionId, question.qid);
	checkText(mismatches, 'parent.stem', payload.stem, question.stem);
	addMismatch(mismatches, 'parent.type', payload.questionType, question.type);
	addMismatch(mismatches, 'parent.difficulty', payload.difficulty, question.difficulty);
	addMismatch(mismatches, 'parent.marks', totalMarks, question.marks);
	addMismatch(mismatches, 'parent.courseId', courseId, question.courseId);
	addMismatch(mismatches, 'parent.volumeId', volumeId, question.volumeId);
	addMismatch(mismatches, 'parent.moduleId', moduleId, question.moduleId);
	addMismatch(mismatches, 'parent.topicId', payload.primaryTopicId, question.topicId);
	addMismatch(mismatches, 'parent.orderIndex', 0, question.orderIndex);
	checkText(mismatches, 'parent.vignetteText', payload.vignetteText, question.vignetteText);
	checkText(mismatches, 'parent.caseStudyTitle', payload.caseStudyTitle, question.caseStudyTitle);
	checkText(mismatches, 'parent.sourceSetId', payload.sourceSetId || payload.reviewMetadata?.sourceSetId, question.sourceSetId);
	checkText(mismatches, 'parent.los', payload.los, question.los);
	checkText(mismatches, 'parent.traceSection', payload.traceSection, question.traceSection);
	checkText(mismatches, 'parent.tracePage', payload.tracePage, question.tracePage);
	checkText(mismatches, 'parent.keyFormulas', payload.keyFormulas || payload.formulas, question.keyFormulas);
	checkText(mismatches, 'parent.workedSolution', resolveWorkedSolution(payload.workedSolution, payload.explanation, payload), question.workedSolution);
	checkText(mismatches, 'parent.correctAnswerExplanation', payload.correctAnswerExplanation, question.correctAnswerExplanation);
	checkText(mismatches, 'parent.incorrectOptionsExplanation', payload.incorrectOptionsExplanation, question.incorrectOptionsExplanation);
	checkText(mismatches, 'parent.commonMistake', payload.commonMistake, question.commonMistake);
	checkText(mismatches, 'parent.conceptsTested', payload.conceptsTested, question.conceptsTested);
	checkText(mismatches, 'parent.sourceConcept', payload.sourceConcept || payload.reviewMetadata?.sourceConcept, question.sourceConcept);
	checkText(mismatches, 'parent.questionGuidelines', payload.markingGuidelines, question.questionGuidelines);
	checkText(mismatches, 'parent.output', payload.expectedOutput, question.output);
	addMismatch(mismatches, 'parent.imageUrl', payload.imageUrl || null, question.imageUrl);
	if (!sameIdSet([payload.primaryTopicId, ...(payload.additionalTopicIds || [])], (question.topics || []).map(topic => topic.id))) {
		mismatches.push({ code: 'COMMIT_READBACK_MISMATCH', path: 'parent.topicIds', expected: [payload.primaryTopicId, ...(payload.additionalTopicIds || [])], actual: (question.topics || []).map(topic => topic.id) });
	}
	if (!sameIdSet(payload.conceptIds || [], (question.concepts || []).map(concept => concept.id))) {
		mismatches.push({ code: 'COMMIT_READBACK_MISMATCH', path: 'parent.conceptIds', expected: payload.conceptIds || [], actual: (question.concepts || []).map(concept => concept.id) });
	}
	if (!isBundle) verifyOptions(mismatches, 'parent.options', payload.options, question.options);
	if (question.children?.length !== children.length) {
		mismatches.push({ code: 'COMMIT_READBACK_MISMATCH', path: 'children.length', expected: children.length, actual: question.children?.length || 0 });
	}
	const savedChildren = [...(question.children || [])].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
	children.forEach((child, index) => {
		const saved = savedChildren[index];
		const path = `subQuestions[${index}]`;
		if (!saved) {
			mismatches.push({ code: 'COMMIT_READBACK_MISMATCH', path, expected: child.externalQuestionId, actual: null });
			return;
		}
		checkText(mismatches, `${path}.qid`, child.externalQuestionId, saved.qid);
		checkText(mismatches, `${path}.stem`, child.stem, saved.stem);
		addMismatch(mismatches, `${path}.type`, payload.questionType === 'VIGNETTE_MCQ' ? 'MCQ' : 'CONSTRUCTED_RESPONSE', saved.type);
		addMismatch(mismatches, `${path}.difficulty`, child.difficulty || payload.difficulty, saved.difficulty);
		addMismatch(mismatches, `${path}.marks`, child.marks || 1, saved.marks);
		addMismatch(mismatches, `${path}.parentId`, question.id, saved.parentId);
		addMismatch(mismatches, `${path}.orderIndex`, index + 1, saved.orderIndex);
		addMismatch(mismatches, `${path}.topicId`, child.primaryTopicId || payload.primaryTopicId, saved.topicId);
		addMismatch(mismatches, `${path}.courseId`, courseId, saved.courseId);
		addMismatch(mismatches, `${path}.volumeId`, volumeId, saved.volumeId);
		addMismatch(mismatches, `${path}.moduleId`, moduleId, saved.moduleId);
		checkText(mismatches, `${path}.los`, child.los, saved.los);
		checkText(mismatches, `${path}.traceSection`, child.traceSection, saved.traceSection);
		checkText(mismatches, `${path}.tracePage`, child.tracePage, saved.tracePage);
		checkText(mismatches, `${path}.keyFormulas`, child.keyFormulas || child.formulas, saved.keyFormulas);
		checkText(mismatches, `${path}.workedSolution`, resolveWorkedSolution(child.workedSolution, child.explanation, child), saved.workedSolution);
		checkText(mismatches, `${path}.correctAnswerExplanation`, child.correctAnswerExplanation, saved.correctAnswerExplanation);
		checkText(mismatches, `${path}.incorrectOptionsExplanation`, child.incorrectOptionsExplanation, saved.incorrectOptionsExplanation);
		checkText(mismatches, `${path}.commonMistake`, child.commonMistake, saved.commonMistake);
		checkText(mismatches, `${path}.conceptsTested`, child.conceptsTested, saved.conceptsTested);
		checkText(mismatches, `${path}.sourceConcept`, child.sourceConcept || child.reviewMetadata?.sourceConcept, saved.sourceConcept);
		checkText(mismatches, `${path}.sourceSetId`, child.sourceSetId || payload.sourceSetId || payload.reviewMetadata?.sourceSetId, saved.sourceSetId);
		checkText(mismatches, `${path}.questionGuidelines`, child.markingGuidelines, saved.questionGuidelines);
		checkText(mismatches, `${path}.output`, child.expectedOutput, saved.output);
		addMismatch(mismatches, `${path}.imageUrl`, child.imageUrl || null, saved.imageUrl);
		if (!sameIdSet([child.primaryTopicId || payload.primaryTopicId, ...(child.additionalTopicIds || [])], (saved.topics || []).map(topic => topic.id))) {
			mismatches.push({ code: 'COMMIT_READBACK_MISMATCH', path: `${path}.topicIds`, expected: [child.primaryTopicId || payload.primaryTopicId, ...(child.additionalTopicIds || [])], actual: (saved.topics || []).map(topic => topic.id) });
		}
		if (!sameIdSet(child.conceptIds || [], (saved.concepts || []).map(concept => concept.id))) {
			mismatches.push({ code: 'COMMIT_READBACK_MISMATCH', path: `${path}.conceptIds`, expected: child.conceptIds || [], actual: (saved.concepts || []).map(concept => concept.id) });
		}
		verifyOptions(mismatches, `${path}.options`, child.options, saved.options);
	});
	const formulaIssues = mismatches.filter(mismatch => mismatch.code === 'FORMULA_READBACK_MISMATCH');
	return {
		ok: mismatches.length === 0,
		checkedAt: new Date().toISOString(),
		checkedFields: mismatches.length ? undefined : 'all-supported-fields',
		formulaIssues,
		mismatches
	};
}

