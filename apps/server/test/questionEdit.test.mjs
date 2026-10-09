/**
 * Tests for the shared AI question editor field mapping and the Level 1 preview
 * edit pencil. Pure mapping helpers are imported directly; UI wiring is checked
 * against the AdminQuestions source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { questionToFormValues, formValuesToQuestion } from '../../web/src/lib/questionEdit.js';

const questionsFile = new URL('../../web/src/pages/admin/AdminQuestions.jsx', import.meta.url);
const questionsSrc = fs.readFileSync(questionsFile, 'utf8');

// The exact scenario from the bug report.
function bugQuestion() {
	return {
		stem: 'A hedge fund takes a position. What is the implicit leverage?',
		options: [
			{ text: '5.0x', isCorrect: false },
			{ text: '14.3x', isCorrect: true },
			{ text: '7.0x', isCorrect: false },
		],
		workedSolution: 'Initial margin = 7% × 5,000,000 = 350,000 ...',
		keyFormulas: 'Implicit leverage = Notional Exposure / Initial Cash Outlay',
		explanation: 'Leverage equals exposure divided by cash outlay.',
		difficulty: 'MEDIUM',
		topicId: 't1',
		topicName: 'Rates and Returns',
		qid: 'Q-RATE-AB12',
		marks: 1,
		conceptIds: ['c1'],
	};
}

test('editor: Key Formula and Worked Solution are mapped to their own fields', () => {
	const q = bugQuestion();
	const v = questionToFormValues(q);
	assert.equal(v.keyFormulas, 'Implicit leverage = Notional Exposure / Initial Cash Outlay');
	assert.equal(v.workedSolution, 'Initial margin = 7% × 5,000,000 = 350,000 ...');
	assert.notEqual(v.keyFormulas, v.workedSolution);
});

test('editor: saving without changes preserves both fields (no cross-binding)', () => {
	const q = bugQuestion();
	const updated = formValuesToQuestion(q, questionToFormValues(q));
	assert.equal(updated.keyFormulas, q.keyFormulas);
	assert.equal(updated.workedSolution, q.workedSolution);
});

test('editor: editing only the Key Formula does not touch the Worked Solution', () => {
	const q = bugQuestion();
	const form = questionToFormValues(q);
	form.keyFormulas = 'NEW KEY FORMULA';
	const updated = formValuesToQuestion(q, form);
	assert.equal(updated.keyFormulas, 'NEW KEY FORMULA');
	assert.equal(updated.workedSolution, q.workedSolution);
});

test('editor: editing only the Worked Solution does not touch the Key Formula', () => {
	const q = bugQuestion();
	const form = questionToFormValues(q);
	form.workedSolution = 'NEW WORKED SOLUTION';
	const updated = formValuesToQuestion(q, form);
	assert.equal(updated.workedSolution, 'NEW WORKED SOLUTION');
	assert.equal(updated.keyFormulas, q.keyFormulas);
});

test('editor: correct answer (C) is preserved on round-trip', () => {
	const q = bugQuestion();
	const v = questionToFormValues(q);
	assert.equal(v.correct, 1); // B
	const updated = formValuesToQuestion(q, v);
	assert.equal(updated.options.find(o => o.isCorrect).text, '14.3x');
	assert.equal(updated.options.filter(o => o.isCorrect).length, 1);
});

test('editor: changing the correct answer flips isCorrect flags', () => {
	const q = bugQuestion();
	const v = questionToFormValues(q);
	v.correct = 2; // choose C
	v.optionC = '7.0x';
	const updated = formValuesToQuestion(q, v);
	assert.equal(updated.options[2].isCorrect, true);
	assert.equal(updated.options[1].isCorrect, false);
	assert.equal(updated.options.filter(o => o.isCorrect).length, 1);
});

test('editor: correct answer never points at an empty option', () => {
	const q = { options: [{ text: 'Keep', isCorrect: true }, { text: 'B', isCorrect: false }, { text: '', isCorrect: false }] };
	const v = questionToFormValues(q);
	v.correct = 2; // point at the empty option
	const updated = formValuesToQuestion(q, v);
	assert.equal(updated.options.filter(o => o.isCorrect).length, 1);
	assert.ok(updated.options.find(o => o.isCorrect).text.length > 0);
});

test('editor: unrelated question fields are preserved', () => {
	const q = bugQuestion();
	const updated = formValuesToQuestion(q, questionToFormValues(q));
	assert.equal(updated.topicId, 't1');
	assert.equal(updated.topicName, 'Rates and Returns');
	assert.equal(updated.qid, 'Q-RATE-AB12');
	assert.equal(updated.marks, 1);
	assert.deepEqual(updated.conceptIds, ['c1']);
});

test('ui: Level 1 MCQ cards expose the top-right edit pencil', () => {
	assert.ok(questionsSrc.includes('openQuestionEditor(null, idx)'), 'Level 1 item pencil wired to the editor');
	assert.ok(questionsSrc.includes('<Tooltip title="Edit question">'), 'Level 1 pencil has the shared tooltip');
});

test('ui: Level 2/3 sub-questions reuse the same editor + pencil', () => {
	assert.ok(questionsSrc.includes('openQuestionEditor(bIdx, qIdx)'), 'sub-question pencil wired to the shared editor');
});

test('ui: the single-field edit modal remounts per field (key formula stale-value fix)', () => {
	assert.ok(/destroyOnClose/.test(questionsSrc), 'edit modal uses destroyOnClose');
	assert.ok(/key=\{`\$\{aiEditModal\?\.bundleIdx/.test(questionsSrc), 'textarea is keyed by target field');
});
