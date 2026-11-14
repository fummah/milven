import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuestionPayload } from '../src/lib/questions/questionSchema.js';
import { validateQuestionPayload } from '../src/lib/questions/questionValidation.js';
import { checkQuestionDuplicates } from '../src/lib/questions/questionDuplicates.js';
import { parseSampleBankIndex, parseSampleSetHtml, dryRunSampleImport } from '../src/lib/questions/sampleBank.js';
import { hashMcpToken, createMcpTokenValue, normalizeScopes } from '../src/lib/mcp/tokenAuth.js';

const ACADEMIC = {
	courseId: 'course-1',
	volumeId: 'volume-1',
	moduleId: 'module-1',
	primaryTopicId: 'topic-1',
	conceptIds: ['concept-1']
};

function fakePrisma({ duplicate = null } = {}) {
	const topics = [
		{ id: 'topic-1', name: 'Topic One', courseId: 'course-1', moduleId: 'module-1', level: 'LEVEL3', losCode: 'LOS 1.a', commandWord: 'evaluate', learningOutcomeStatement: 'Evaluate the framework.' },
		{ id: 'topic-2', name: 'Topic Two', courseId: 'course-1', moduleId: 'module-2', level: 'LEVEL3', losCode: 'LOS 2.a', commandWord: 'calculate', learningOutcomeStatement: 'Calculate the result.' }
	];
	const concepts = [
		{ id: 'concept-1', name: 'Concept One', topicId: 'topic-1', losCode: 'LOS 1.a', commandWord: 'evaluate', learningOutcomeStatement: 'Evaluate.' },
		{ id: 'concept-2', name: 'Concept Two', topicId: 'topic-2', losCode: 'LOS 2.a', commandWord: 'calculate', learningOutcomeStatement: 'Calculate.' }
	];
	return {
		course: { findUnique: async ({ where }) => where.id === 'course-1' ? { id: 'course-1', name: 'CFA III', level: 'LEVEL3', active: true } : null },
		volume: { findUnique: async ({ where }) => where.id === 'volume-1' ? { id: 'volume-1', name: 'Asset Allocation' } : null },
		courseVolume: { findUnique: async ({ where }) => where.courseId_volumeId.courseId === 'course-1' && where.courseId_volumeId.volumeId === 'volume-1' ? { courseId: 'course-1' } : null },
		module: { findUnique: async ({ where }) => {
			if (where.id === 'module-1') return { id: 'module-1', name: 'Module One', courseId: 'course-1', volumeId: 'volume-1', level: 'LEVEL3' };
			if (where.id === 'module-2') return { id: 'module-2', name: 'Module Two', courseId: 'course-1', volumeId: 'volume-1', level: 'LEVEL3' };
			return null;
		} },
		topic: {
			findMany: async ({ where }) => {
				const ids = where.id?.in || [];
				return topics.filter(topic => ids.includes(topic.id)).map(topic => ({ ...topic }));
			},
			findUnique: async ({ where }) => topics.find(topic => topic.id === where.id) || null
		},
		concept: {
			findMany: async ({ where }) => {
				const ids = where.id?.in || [];
				return concepts.filter(concept => ids.includes(concept.id));
			}
		},
		question: {
			findMany: async () => duplicate ? [duplicate] : []
		}
	};
}

function mcq(overrides = {}) {
	return normalizeQuestionPayload({
		schemaVersion: '2026-11-08',
		externalQuestionId: 'MCP-TEST-001',
		questionType: 'MCQ',
		...ACADEMIC,
		difficulty: 'HARD',
		marks: 3,
		stem: 'A committee is reviewing conflicting signals in a capital market expectation framework. Which action best preserves a disciplined process?',
		los: 'Evaluate the framework.',
		traceSection: 'Asset Allocation',
		tracePage: 'p. 10',
		keyFormulas: '\\( E(R) = R_f + \\beta (E(R_m)-R_f) \\)',
		workedSolution: 'Step 1: identify the evidence. Step 2: compare the assumptions. Step 3: document the defensible decision.',
		options: [
			{ label: 'A', text: 'Act without reviewing the evidence.', isCorrect: false, rationale: 'Ignores evidence.' },
			{ label: 'B', text: 'Document the evidence and assumptions before deciding.', isCorrect: true, rationale: 'Uses a disciplined process.' },
			{ label: 'C', text: 'Ignore all conflicting signals.', isCorrect: false, rationale: 'Fails to evaluate information.' }
		],
		...overrides
	});
}

test('schema normalises ordered labels and preserves child metadata', () => {
	const normalized = mcq({ options: [
		{ text: 'A text', isCorrect: false },
		{ text: 'B text', isCorrect: true },
		{ text: 'C text', isCorrect: false }
	] });
	assert.deepEqual(normalized.options.map(option => option.label), ['A', 'B', 'C']);
	assert.equal(normalized.options[1].isCorrect, true);
	assert.equal(normalized.questionType, 'MCQ');
});

test('valid MCQ passes automatic validation', async () => {
	const result = await validateQuestionPayload(fakePrisma(), mcq());
	assert.equal(result.ok, true, JSON.stringify(result.errors));
	assert.equal(result.summary.humanReviewRequired, true);
});

test('rejects zero and multiple correct options', async () => {
	const zero = mcq({ options: [
		{ label: 'A', text: 'One', isCorrect: false },
		{ label: 'B', text: 'Two', isCorrect: false },
		{ label: 'C', text: 'Three', isCorrect: false }
	] });
	const multiple = mcq({ options: [
		{ label: 'A', text: 'One', isCorrect: true },
		{ label: 'B', text: 'Two', isCorrect: true },
		{ label: 'C', text: 'Three', isCorrect: false }
	] });
	const zeroResult = await validateQuestionPayload(fakePrisma(), zero);
	const multipleResult = await validateQuestionPayload(fakePrisma(), multiple);
	assert.equal(zeroResult.ok, false);
	assert.ok(zeroResult.errors.some(error => error.code === 'CORRECT_OPTION_COUNT'));
	assert.equal(multipleResult.ok, false);
	assert.ok(multipleResult.errors.some(error => error.code === 'CORRECT_OPTION_COUNT'));
});

test('rejects NULL bytes, unsafe HTML and mismatched labels', async () => {
	const nullByte = mcq({ stem: 'Bad\u0000stem' });
	const unsafe = mcq({ stem: '<script>alert(1)</script> bad stem' });
	const label = mcq({ options: [
		{ label: 'B', text: 'One', isCorrect: false },
		{ label: 'A', text: 'Two', isCorrect: true },
		{ label: 'C', text: 'Three', isCorrect: false }
	] });
	const nullResult = await validateQuestionPayload(fakePrisma(), nullByte);
	const unsafeResult = await validateQuestionPayload(fakePrisma(), unsafe);
	const labelResult = await validateQuestionPayload(fakePrisma(), label);
	assert.ok(nullResult.errors.some(error => error.code === 'NULL_BYTE'));
	assert.ok(unsafeResult.errors.some(error => error.code === 'UNSAFE_HTML'));
	assert.ok(labelResult.errors.some(error => error.code === 'OPTION_LABEL_ORDER'));
});

test('rejects a topic from another module', async () => {
	const mismatched = mcq({ primaryTopicId: 'topic-2' });
	const result = await validateQuestionPayload(fakePrisma(), mismatched);
	assert.equal(result.ok, false);
	assert.ok(result.errors.some(error => error.code === 'TOPIC_NOT_IN_MODULE'));
});

test('validates a four-child vignette and preserves child fields', async () => {
	const child = index => ({
		externalQuestionId: `MCP-VIGNETTE-Q${index}`,
		stem: `Which action best addresses judgement ${index} in the committee framework?`,
		difficulty: 'HARD',
		marks: 3,
		primaryTopicId: 'topic-1',
		conceptIds: ['concept-1'],
		los: `LOS 1.${index}`,
		traceSection: 'Asset Allocation',
		tracePage: `p. ${10 + index}`,
		keyFormulas: '\\( E(R) = R_f + \\beta (E(R_m)-R_f) \\)',
		workedSolution: `Step 1 for child ${index}. Step 2 for child ${index}.`,
		options: [
			{ label: 'A', text: `A ${index}`, isCorrect: false, rationale: 'Wrong.' },
			{ label: 'B', text: `B ${index}`, isCorrect: true, rationale: 'Correct.' },
			{ label: 'C', text: `C ${index}`, isCorrect: false, rationale: 'Wrong.' }
		]
	});
	const normalized = normalizeQuestionPayload({
		schemaVersion: '2026-11-08',
		externalQuestionId: 'MCP-VIGNETTE-SET',
		questionType: 'VIGNETTE_MCQ',
		...ACADEMIC,
		difficulty: 'HARD',
		marks: 12,
		stem: 'Capital Market Expectations Committee Case',
		vignetteText: 'A global investment committee is reviewing capital market expectations after a period of shifting inflation and policy rates. The committee must document its assumptions, distinguish structural changes from temporary noise, and explain the conditions under which the conclusion would be revised. The chair requires an audit trail and a clear judgement for each question. The committee will review the conclusion at its next meeting and revise it only if the evidence satisfies the documented conditions.',
		subQuestions: [child(1), child(2), child(3), child(4)]
	});
	const result = await validateQuestionPayload(fakePrisma(), normalized);
	assert.equal(result.ok, true, JSON.stringify(result.errors));
	assert.equal(normalized.subQuestions.length, 4);
	assert.equal(normalized.subQuestions[0].los, 'LOS 1.1');
	assert.equal(normalized.subQuestions[0].conceptIds[0], 'concept-1');
	assert.equal(normalized.subQuestions[3].workedSolution, 'Step 1 for child 4. Step 2 for child 4.');
});

test('duplicate service detects exact external QID and normalized stem', async () => {
	const existing = {
		id: 'q-existing',
		qid: 'MCP-TEST-001',
		stem: mcq().stem,
		vignetteText: null,
		type: 'MCQ',
		difficulty: 'HARD',
		options: [
			{ text: 'One', isCorrect: false, position: 0 },
			{ text: 'Two', isCorrect: true, position: 1 }
		]
	};
	const report = await checkQuestionDuplicates(fakePrisma({ duplicate: existing }), mcq());
	assert.equal(report.exactDuplicate, true);
	assert.ok(report.exactMatches.some(match => match.signals.includes('EXTERNAL_QID_EXACT')));
});

test('MCP tokens are hashed and scopes are restricted', () => {
	const token = createMcpTokenValue();
	assert.match(token.value, /^mcp_/);
	assert.equal(hashMcpToken(token.value), token.tokenHash);
	assert.notEqual(hashMcpToken(token.value), token.value);
	assert.deepEqual(normalizeScopes(['questions:read', 'unknown', 'questions:draft']), ['questions:read', 'questions:draft']);
});

test('sample bank parser preserves set structure and field boundaries', async () => {
	const index = '<a href="SET-001.html">SET 1</a><a href="SET-002.html">SET 2</a>';
	assert.equal(parseSampleBankIndex(index).length, 2);
	const html = `
	<html><head><title>SET-001</title></head><body>
	<h1>Capital Market Expectations Case</h1>
	<p>Volume: Asset Allocation</p>
	<p>Learning Module: Capital Market Expectations</p>
	<div class="vignette">A committee reviews inflation, policy rates and long-run return assumptions. It documents evidence before changing the strategic allocation.</div>
	<div class="question" data-question>
		<h3>Question 1</h3><p class="stem">Which action is most appropriate?</p>
		<div class="option" data-label="A" data-correct="false"><span class="text">Act immediately.</span></div>
		<div class="option" data-label="B" data-correct="true"><span class="text">Document the evidence.</span></div>
		<div class="option" data-label="C" data-correct="false"><span class="text">Ignore the signals.</span></div>
		<p>LOS: LOS 1.a</p><p>Section: Asset Allocation</p><p>Page: p. 10</p><p>Marks: 3</p>
		<div class="worked-solution">Step 1: review evidence. Step 2: document conclusion.</div>
	</div>
	<div class="question" data-question>
		<h3>Question 2</h3><p class="stem">Which condition would justify a revision?</p>
		<div class="option" data-label="A" data-correct="true"><span class="text">Verified structural change.</span></div>
		<div class="option" data-label="B" data-correct="false"><span class="text">Unverified opinion.</span></div>
		<div class="option" data-label="C" data-correct="false"><span class="text">No new evidence.</span></div>
		<p>LOS: LOS 1.b</p><p>Section: Asset Allocation</p><p>Page: p. 11</p><p>Marks: 3</p>
		<div class="worked-solution">Step 1: distinguish structural change. Step 2: revise only with evidence.</div>
	</div>
	</body></html>`;
	const parsed = parseSampleSetHtml(html, { setId: 'SET-001', sourceFile: 'SET-001.html' });
	assert.equal(parsed.setId, 'SET-001');
	assert.equal(parsed.volume, 'Asset Allocation');
	assert.equal(parsed.learningModule, 'Capital Market Expectations');
	assert.equal(parsed.questions.length, 2);
	assert.equal(parsed.questions[0].options.length, 3);
	assert.equal(parsed.questions[0].options.find(option => option.isCorrect).label, 'B');
	assert.equal(parsed.questions[1].options.find(option => option.isCorrect).label, 'A');
	assert.match(parsed.questions[0].workedSolution, /Step 1: review evidence/);
	assert.match(parsed.questions[1].workedSolution, /structural change/);
	assert.equal(parsed.questions[0].los, 'LOS 1.a');
	assert.equal(parsed.questions[1].tracePage, 'p. 11');
	assert.equal(parsed.totalMarks, 6);
	const dryRun = await dryRunSampleImport(fakePrisma(), parsed, { ...ACADEMIC });
	assert.ok(Array.isArray(dryRun.validation?.errors));
	assert.equal(dryRun.automaticValidationOnly, true);
});
