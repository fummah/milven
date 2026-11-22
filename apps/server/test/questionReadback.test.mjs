import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPersistedQuestion } from '../src/lib/questions/questionReadback.js';

function fixture() {
	const payload = {
		externalQuestionId: 'READBACK-1',
		questionType: 'MCQ',
		courseId: 'course-1',
		volumeId: 'volume-1',
		moduleId: 'module-1',
		primaryTopicId: 'topic-1',
		additionalTopicIds: [],
		conceptIds: ['concept-1'],
		difficulty: 'HARD',
		marks: 3,
		stem: 'A formula question using EV and EBITDA.',
		los: 'calculate enterprise value',
		traceSection: 'Valuation',
		tracePage: '25',
		keyFormulas: String.raw`$\text{EV} = \text{EV/EBITDA} \times \text{EBITDA}$`,
		workedSolution: String.raw`Step 1: $EV = 10 \times 100$. Step 2: conclude.`,
		correctAnswerExplanation: 'The enterprise value is 1,000.',
		incorrectOptionsExplanation: 'The other options misuse the multiple.',
		commonMistake: 'Applying the multiple to the wrong metric.',
		conceptsTested: 'Enterprise value multiples.',
		sourceConcept: 'EV/EBITDA multiple',
		sourceSetId: 'SET-999',
		answerVerificationStatus: 'SOURCE_PROVIDED',
		options: [
			{ text: '1,000', isCorrect: true, rationale: 'Correct.' },
			{ text: '900', isCorrect: false, rationale: 'Wrong metric.' },
			{ text: '1,100', isCorrect: false, rationale: 'Arithmetic error.' }
		]
	};
	const question = {
		id: 'question-1',
		qid: payload.externalQuestionId,
		stem: payload.stem,
		type: 'MCQ',
		difficulty: 'HARD',
		marks: 3,
		courseId: 'course-1',
		volumeId: 'volume-1',
		moduleId: 'module-1',
		topicId: 'topic-1',
		orderIndex: 0,
		vignetteText: null,
		caseStudyTitle: null,
		sourceSetId: payload.sourceSetId,
		los: payload.los,
		traceSection: payload.traceSection,
		tracePage: payload.tracePage,
		keyFormulas: payload.keyFormulas,
		workedSolution: payload.workedSolution,
		correctAnswerExplanation: payload.correctAnswerExplanation,
		incorrectOptionsExplanation: payload.incorrectOptionsExplanation,
		commonMistake: payload.commonMistake,
		conceptsTested: payload.conceptsTested,
		sourceConcept: payload.sourceConcept,
		questionGuidelines: null,
		output: null,
		imageUrl: null,
		topics: [{ id: 'topic-1' }],
		concepts: [{ id: 'concept-1' }],
		options: payload.options.map((option, position) => ({ ...option, position })),
		children: []
	};
	return { payload, question };
}

test('readback verification passes when every supported field matches', () => {
	const { payload, question } = fixture();
	const verification = verifyPersistedQuestion(payload, question, {});
	assert.equal(verification.ok, true, JSON.stringify(verification.mismatches));
	assert.equal(verification.formulaIssues.length, 0);
});

test('readback verification detects missing fields, option order and formula corruption', () => {
	const { payload, question } = fixture();
	question.correctAnswerExplanation = null;
	question.commonMistake = null;
	question.keyFormulas = String.raw`$\text{EV} = \text{EV/EBITDA} 	imes \text{EBITDA}$`;
	question.options = [question.options[1], question.options[0], question.options[2]].map((option, position) => ({ ...option, position }));
	const verification = verifyPersistedQuestion(payload, question, {});
	assert.equal(verification.ok, false);
	assert.ok(verification.mismatches.some(mismatch => mismatch.path === 'parent.correctAnswerExplanation'));
	assert.ok(verification.mismatches.some(mismatch => mismatch.path === 'parent.commonMistake'));
	assert.ok(verification.mismatches.some(mismatch => mismatch.path === 'parent.keyFormulas' && mismatch.code === 'FORMULA_READBACK_MISMATCH'));
	assert.ok(verification.mismatches.some(mismatch => mismatch.path === 'parent.options[0].text'));
});
