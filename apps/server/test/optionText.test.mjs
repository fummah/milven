import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectOptionText, normalizeOptionRationale, normalizeOptionText } from '../src/lib/questions/optionText.js';
import { normalizeQuestionPayload } from '../src/lib/questions/questionSchema.js';

test('normalizes trailing PowerShell-style escape artifacts only', () => {
	const cases = [
		'153.03`r`n`t`t`t`t',
		'147.03\\r\\n\\t\\t\\t\\t',
		'144.12\r\n\t\t\t\t',
		String.raw`Statement 1\\r\\n\\t\\t`
	];
	for (const value of cases) {
		const result = normalizeOptionText(value);
		assert.equal(result.text, value.split(/[`\\\r\n\t]/)[0], value);
		assert.equal(result.changed, true);
	}
});

test('preserves valid text, LaTeX, Unicode, apostrophes and meaningful line breaks', () => {
	const samples = [
		String.raw`The value is $\text{EV} = \text{EV/EBITDA} \times \text{EBITDA}$.`,
		String.raw`$c_0 = S_0 + p_0 - \frac{X}{1+rT}$`,
		'Dividend yield – 4.25% (EUR)',
		"Analyst's estimate `PV` remains unchanged.",
		'Line one with a complete sentence.\nLine two with a second sentence.'
	];
	for (const sample of samples) {
		const result = normalizeOptionText(sample);
		assert.equal(result.text, sample);
		assert.equal(result.changed, false);
	}
});

test('normalization is idempotent and does not touch option order or correctness', () => {
	const normalized = normalizeQuestionPayload({
		externalQuestionId: 'OPTION-1',
		questionType: 'MCQ',
		courseId: 'course-1',
		volumeId: 'volume-1',
		moduleId: 'module-1',
		primaryTopicId: 'topic-1',
		difficulty: 'HARD',
		marks: 3,
		stem: 'Which value is correct?',
		workedSolution: 'Step 1: compute. Step 2: conclude.',
		options: [
			{ text: '153.03`r`n`t`t', isCorrect: false },
			{ text: '147.03\\r\\n\\t\\t', isCorrect: true },
			{ text: '144.12\r\n\t\t', isCorrect: false }
		]
	});
	assert.deepEqual(normalized.options.map(option => option.text), ['153.03', '147.03', '144.12']);
	assert.deepEqual(normalized.options.map(option => option.isCorrect), [false, true, false]);
	assert.equal(normalized.reviewMetadata.optionTextAudit.length, 3);
	assert.equal(normalized.reviewMetadata.optionTextAudit[1].path, 'question.options[1].text');
	const again = normalizeQuestionPayload(normalized);
	assert.deepEqual(again.options.map(option => option.text), ['153.03', '147.03', '144.12']);
	assert.equal(again.reviewMetadata.optionTextAudit.length, 0);
});

test('inspection reports confidence and code points for secure diagnostics', () => {
	const inspection = inspectOptionText('147.03\\r\\n\\t\\t');
	assert.equal(inspection.safeToClean, true);
	assert.deepEqual(inspection.artifacts.map(artifact => artifact.code), ['TRAILING_ESCAPE_ARTIFACT']);
	assert.deepEqual(inspection.codepoints.slice(-8), [92, 114, 92, 110, 92, 116, 92, 116]);
});
test('normalizes option rationales and clears artifact-only rationales', () => {
	assert.equal(normalizeOptionRationale('`r`n`t`t'), null);
	assert.equal(normalizeOptionRationale('Meaningful rationale.`r`n`t`t'), 'Meaningful rationale.');
	assert.equal(normalizeOptionRationale('`text` is a variable.'), '`text` is a variable.');
});