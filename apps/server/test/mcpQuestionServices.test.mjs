import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuestionPayload } from '../src/lib/questions/questionSchema.js';
import { validateQuestionPayload } from '../src/lib/questions/questionValidation.js';
import { checkQuestionDuplicates } from '../src/lib/questions/questionDuplicates.js';
import { parseSampleBankIndex, parseSampleSetHtml, dryRunSampleImport } from '../src/lib/questions/sampleBank.js';
import { hashMcpToken, createMcpTokenValue, normalizeScopes } from '../src/lib/mcp/tokenAuth.js';
import { repairQuestionPayload } from '../src/lib/questions/questionRepair.js';

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

test('staged vignette repair recovers legacy explained fields without overwriting content', () => {
	const legacy = {
		questionType: 'VIGNETTE_MCQ',
		stem: 'Legacy Case Study',
		reviewMetadata: { sourceSetId: 'SET-447' },
		subQuestions: [{
			externalQuestionId: 'Q-LEGACY-1',
			stem: 'Which action is best?',
			difficulty: 'HARD',
			marks: 3,
			los: 'Evaluate the evidence.',
			traceSection: 'Framework',
			tracePage: 'p. 4',
			workedSolution: 'Step 1: review evidence.\n\nExplanation: <p><strong>Correct answer:</strong> Document the evidence.</p><p><strong>Why the other options are wrong:</strong> The distractors skip evidence.</p><p><strong>Common mistake:</strong> Acting immediately.</p><p><strong>Concepts tested:</strong> Disciplined process.</p>',
			options: [
				{ label: 'A', text: 'Act now.', isCorrect: false },
				{ label: 'B', text: 'Document the evidence.', isCorrect: true },
				{ label: 'C', text: 'Ignore the evidence.', isCorrect: false }
			],
			reviewMetadata: { sourceSetId: 'SET-447', commonMistake: 'Acting immediately.', conceptsTested: 'Disciplined process.' }
		}]
	};
	const repair = repairQuestionPayload(legacy);
	assert.equal(repair.changed, true);
	const child = repair.payload.subQuestions[0];
	assert.equal(child.workedSolution, 'Step 1: review evidence.');
	assert.match(child.correctAnswerExplanation, /Document the evidence/);
	assert.match(child.incorrectOptionsExplanation, /distractors skip evidence/);
	assert.equal(child.commonMistake, 'Acting immediately.');
	assert.equal(child.conceptsTested, 'Disciplined process.');
	assert.equal(child.sourceSetId, 'SET-447');
	assert.equal(repair.payload.caseStudyTitle, 'Legacy Case Study');
	assert.equal(repair.payload.sourceSetId, 'SET-447');
	assert.equal(legacy.subQuestions[0].workedSolution.includes('Explanation:'), true);
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
	<html><head><title>SET-001</title></head><body><main>
	<header><h1>Capital Market Expectations Case</h1><p>SET-001 \u00b7 Asset Allocation \u00b7 Learning Module 1: Capital Market Expectations \u00b7 6 points \u00b7 review: unchecked</p></header>
	<div class="vig"><p><strong>Asset Allocation</strong></p><p><strong>TOTAL POINT VALUE OF THIS QUESTION SET IS 6 POINTS</strong></p><p>A committee reviews inflation, policy rates and long-run return assumptions. It documents evidence before changing the strategic allocation.</p></div>
	<h2>Questions</h2>
	<section class="q"><div class="qhead"><span class="qn">Question 1</span><span class="meta">Topic One \u00b7 Q-TEST-001</span></div>
	<p>Which action is most appropriate?</p>
	<ol class="opts"><li class="opt"><span class="ltr">A</span><span>Act immediately.</span></li><li class="opt ok"><span class="ltr">B</span><span>Document the evidence.</span></li><li class="opt"><span class="ltr">C</span><span>Ignore the signals.</span></li></ol>
	<button class="reveal">Show answer and solution</button>
	<div class="sol" hidden><p class="key">Answer: B</p><h4>Worked solution</h4><p>Step 1: review evidence. Step 2: document conclusion.</p><h4>Explanation</h4><p><strong>Correct answer:</strong> Evidence must be documented.</p><p><strong>Why the other options are wrong:</strong> Acting immediately ignores evidence, and ignoring signals abandons the process.</p><p><strong>Common mistake:</strong> Acting without evidence.</p><p><strong>Concepts tested:</strong> Framework for developing capital market expectations.</p><h4>Key formulas</h4><p>None (conceptual question)</p><dl class="trace"><dt>LOS</dt><dd>discuss the framework for capital market expectations</dd><dt>Section</dt><dd>Framework (p. 10)</dd><dt>Concept</dt><dd>Framework for developing capital market expectations</dd></dl></div></section>
	<section class="q"><div class="qhead"><span class="qn">Question 2</span><span class="meta">Topic One \u00b7 Q-TEST-002</span></div>
	<p>Which condition would justify a revision?</p>
	<ol class="opts"><li class="opt ok"><span class="ltr">A</span><span>Verified structural change.</span></li><li class="opt"><span class="ltr">B</span><span>Unverified opinion.</span></li><li class="opt"><span class="ltr">C</span><span>No new evidence.</span></li></ol>
	<button class="reveal">Show answer and solution</button>
	<div class="sol" hidden><p class="key">Answer: A</p><h4>Worked solution</h4><p>Step 1: distinguish structural change. Step 2: revise only with evidence.</p><h4>Explanation</h4><p><strong>Correct answer:</strong> A verified structural change can justify revision.</p><h4>Key formulas</h4><p>\\[ E(R) = R_f + \\beta(E(R_m)-R_f) \\]</p><dl class="trace"><dt>LOS</dt><dd>explain structural change</dd><dt>Section</dt><dd>Challenges (p. 11)</dd><dt>Concept</dt><dd>Data limitations</dd></dl></div></section>
	</main></body></html>`;
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
	assert.equal(parsed.questions[0].los, 'discuss the framework for capital market expectations');
	assert.equal(parsed.questions[1].tracePage, 'p. 11');
	assert.equal(parsed.questions[1].keyFormulas, '\\[ E(R) = R_f + \\beta(E(R_m)-R_f) \\]');
	assert.match(parsed.questions[0].correctAnswerExplanation, /Evidence must be documented/);
	assert.match(parsed.questions[0].incorrectOptionsExplanation, /Acting immediately ignores evidence/);
	assert.equal(parsed.questions[0].commonMistake, 'Acting without evidence.');
	assert.equal(parsed.questions[0].conceptsTested, 'Framework for developing capital market expectations.');
	assert.equal(parsed.questions[0].keyFormulas, null);
	assert.equal(parsed.rawFieldAvailability.correctAnswerExplanations, true);
	assert.equal(parsed.rawFieldAvailability.incorrectOptionsExplanations, false);
	assert.equal(parsed.totalMarks, 6);
	const dryRun = await dryRunSampleImport(fakePrisma(), parsed, { ...ACADEMIC });
	assert.ok(Array.isArray(dryRun.validation?.errors));
	assert.match(dryRun.mappedPayload.subQuestions[0].correctAnswerExplanation, /Evidence must be documented/);
	assert.match(dryRun.mappedPayload.subQuestions[0].incorrectOptionsExplanation, /Acting immediately/);
	assert.equal(dryRun.mappedPayload.subQuestions[0].commonMistake, 'Acting without evidence.');
	assert.equal(dryRun.mappedPayload.caseStudyTitle, 'Capital Market Expectations Case');
	assert.equal(dryRun.mappedPayload.sourceSetId, 'SET-001');
	assert.deepEqual(dryRun.fieldMapping.children[0].unmappedFields, []);
	assert.equal(dryRun.automaticValidationOnly, true);
});

test('combined explanations are stored once and satisfy MCQ completeness', async () => {
	const normalized = mcq({
		correctAnswerExplanation: 'The documented process preserves evidence.',
		incorrectOptionsExplanation: 'The distractors skip evidence or ignore conflicting signals.',
		commonMistake: 'Acting before documenting the evidence.',
		conceptsTested: 'Disciplined capital market expectations.',
		options: [
			{ label: 'A', text: 'Act without reviewing the evidence.', isCorrect: false },
			{ label: 'B', text: 'Document the evidence and assumptions before deciding.', isCorrect: true },
			{ label: 'C', text: 'Ignore all conflicting signals.', isCorrect: false }
		]
	});
	const result = await validateQuestionPayload(fakePrisma(), normalized);
	assert.equal(result.ok, true, JSON.stringify(result.errors));
	assert.equal(result.summary.structuralStatus, 'STRUCTURALLY_VALID');
	assert.equal(result.summary.reviewStatus, 'READY_FOR_APPROVAL');
	assert.equal(result.summary.completeness.missingCoreFields.length, 0);
	assert.equal(result.warnings.some(warning => warning.code === 'DISTRACTOR_EXPLANATION_MISSING'), false);
});

test('missing distractor explanations produce one question-level warning', async () => {
	const normalized = mcq({
		options: [
			{ label: 'A', text: 'Act without reviewing the evidence.', isCorrect: false },
			{ label: 'B', text: 'Document the evidence and assumptions before deciding.', isCorrect: true },
			{ label: 'C', text: 'Ignore all conflicting signals.', isCorrect: false }
		]
	});
	const result = await validateQuestionPayload(fakePrisma(), normalized);
	const warnings = result.warnings.filter(warning => warning.code === 'DISTRACTOR_EXPLANATION_MISSING');
	assert.equal(warnings.length, 1);
	assert.equal(warnings[0].path, 'question.incorrectOptionsExplanation');
	assert.equal(result.summary.reviewStatus, 'NEEDS_REVIEW');
	assert.equal(result.summary.structuralStatus, 'STRUCTURALLY_VALID');
});
