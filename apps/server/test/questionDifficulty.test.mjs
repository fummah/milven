/**
 * Unit tests for the central difficulty specification + enforcement.
 *
 * Run with:  node --test "test/**\/*.test.mjs"   (from apps/server)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
	DIFFICULTY_LEVELS,
	DIFFICULTY_RUBRICS,
	HARD_RULES,
	HARD_CRITERIA,
	HARD_ARCHETYPES,
	normalizeDifficultyValue,
	buildTargetPlan,
	buildDifficultyMandatoryBlock,
	buildDifficultyAuditorPrompt,
	buildDifficultyRepairPrompt,
	normalizeRepairedQuestion,
	enforceDifficulty,
} from '../src/lib/questionDifficulty.js';

test('normalizeDifficultyValue accepts the enum case-insensitively', () => {
	assert.equal(normalizeDifficultyValue('EASY'), 'EASY');
	assert.equal(normalizeDifficultyValue('hard'), 'HARD');
	assert.equal(normalizeDifficultyValue('  Medium '), 'MEDIUM');
	assert.equal(normalizeDifficultyValue('IMPOSSIBLE'), null);
	assert.equal(normalizeDifficultyValue(''), null);
	assert.equal(normalizeDifficultyValue(undefined), null);
});

test('rubrics describe the three levels with the required guidance', () => {
	assert.match(DIFFICULTY_RUBRICS.EASY, /one primary concept/i);
	assert.match(DIFFICULTY_RUBRICS.MEDIUM, /2-3 connected reasoning/i);
	assert.match(DIFFICULTY_RUBRICS.HARD, /AT LEAST FOUR/i);
	assert.match(DIFFICULTY_RUBRICS.HARD, /reasoning depth/i);
	assert.match(DIFFICULTY_RUBRICS.HARD, /NOT.*one-step arithmetic/is);
	assert.deepEqual(DIFFICULTY_LEVELS, ['EASY', 'MEDIUM', 'HARD']);
});

test('buildTargetPlan: single difficulty => all the same', () => {
	assert.deepEqual(buildTargetPlan(['HARD'], 3), ['HARD', 'HARD', 'HARD']);
	assert.deepEqual(buildTargetPlan(['EASY'], 2), ['EASY', 'EASY']);
});

test('buildTargetPlan: mixed difficulties => only the selected levels', () => {
	const plan = buildTargetPlan(['MEDIUM', 'HARD'], 6);
	assert.equal(plan.length, 6);
	for (const d of plan) assert.ok(['MEDIUM', 'HARD'].includes(d));
	assert.ok(plan.includes('MEDIUM') && plan.includes('HARD'));
});

test('mandatory block: HARD gate + design blueprint + plan + self-check, no 70% rule', () => {
	const block = buildDifficultyMandatoryBlock(['HARD'], { questionType: 'MCQ', count: 3 });
	assert.match(block, /MANDATORY TARGET DIFFICULTY: HARD/);
	assert.match(block, /The administrator explicitly requested HARD/);
	assert.match(block, /AT LEAST FOUR/);
	assert.match(block, /HARD, HARD, HARD/);
	assert.match(block, /MANDATORY PROHIBITIONS|must NOT be:/);
	assert.match(block, /direct recall/);
	assert.match(block, /one obvious step/);
	assert.match(block, /PROMPT PRIORITY/);
	// Pre-generation blueprint: design the reasoning path BEFORE writing.
	assert.match(block, /HARD DESIGN PROCESS/);
	assert.match(block, /DO NOT WRITE THE QUESTION IMMEDIATELY/);
	assert.match(block, /QUANTITATIVE BLUEPRINT/);
	assert.match(block, /CONCEPTUAL BLUEPRINT/);
	assert.match(block, /PRE-GENERATION CHECK/);
	assert.match(block, /POST-GENERATION CHECK/);
	// Archetypes and distractor-from-solution rule.
	assert.ok(HARD_ARCHETYPES.some(a => block.includes(a.split(':')[0])));
	assert.match(block, /BUILD THE DISTRACTORS FROM THE SOLUTION/);
	// Internal design metadata for quality checking.
	assert.match(block, /"difficultyDesign"/);
	assert.match(block, /hardCriteriaSatisfied/);
	assert.doesNotMatch(block, /70%/);
});

test('mandatory block: multiple difficulties => distribute only across them', () => {
	const block = buildDifficultyMandatoryBlock(['MEDIUM', 'HARD'], { questionType: 'MCQ', count: 4 });
	assert.match(block, /MANDATORY TARGET DIFFICULTY: MEDIUM, HARD/);
	assert.match(block, /Never generate a level outside: MEDIUM, HARD/);
	assert.match(block, /2-3 connected reasoning/);
	assert.match(block, /AT LEAST FOUR/);
	assert.doesNotMatch(block, /70%/);
});

test('shared rubric: generator, auditor and repair use the SAME HARD definition', () => {
	// HARD_RULES is the single authoritative HARD text.
	assert.match(HARD_RULES, /AT LEAST FOUR/);
	assert.equal(DIFFICULTY_RUBRICS.HARD, HARD_RULES);
	const generator = buildDifficultyMandatoryBlock(['HARD'], { questionType: 'MCQ', count: 1 });
	const auditor = buildDifficultyAuditorPrompt({ stem: 's', options: [{ text: 'A', isCorrect: true }, { text: 'B' }], workedSolution: 'w' }, 'HARD', 'LEVEL1');
	const repair = buildDifficultyRepairPrompt('HARD', { actualDifficulty: 'MEDIUM', issues: [] }, { stem: 's' }, 'LEVEL1');
	for (const p of [generator, auditor, repair]) {
		assert.match(p, /HARD — requires genuine analysis and exam-level judgement/);
	}
	assert.ok(HARD_CRITERIA.every(c => generator.includes(c)), 'generator lists all 7 HARD criteria');
});

test('auditor prompt forbids using the stored label and asks to be strict', () => {
	const prompt = buildDifficultyAuditorPrompt(
		{ stem: 'A multi-step question', options: [{ text: 'A', isCorrect: true }, { text: 'B' }, { text: 'C' }], workedSolution: 'w' },
		'HARD',
		'LEVEL1',
	);
	assert.match(prompt, /Do NOT use the question's stored difficulty label/);
	assert.match(prompt, /Target difficulty: HARD/);
	assert.match(prompt, /A\. A/);
	assert.match(prompt, /actualDifficulty/);
	assert.match(prompt, /Be strict/i);
	assert.match(prompt, /one-step calculation is NOT HARD/);
});

test('repair prompt states target and validator classification', () => {
	const prompt = buildDifficultyRepairPrompt('HARD', { actualDifficulty: 'MEDIUM', issues: ['only one calculation step'] }, { stem: 'x' }, 'LEVEL1');
	assert.match(prompt, /TARGET: HARD/);
	assert.match(prompt, /VALIDATOR CLASSIFIED IT: MEDIUM/);
	assert.match(prompt, /only one calculation step/);
	assert.match(prompt, /For HARD specifically/);
});

test('normalizeRepairedQuestion keeps one correct option and the schema fields', () => {
	const out = normalizeRepairedQuestion({ stem: 'New', options: [{ text: 'A' }, { text: 'B' }, { text: 'C' }], workedSolution: 'ws', keyFormulas: 'kf' }, { los: 'L' });
	assert.equal(out.stem, 'New');
	assert.equal(out.options.length, 3);
	assert.equal(out.options.filter(o => o.isCorrect).length, 1);
	assert.equal(out.workedSolution, 'ws');
	assert.equal(out.keyFormulas, 'kf');
	assert.equal(out.los, 'L');
});

// ── enforceDifficulty orchestrator ─────────────────────────────
function unit(over = {}) {
	return { loc: { i: 0 }, qid: 'Q1', stem: 's', options: [{ text: 'A', isCorrect: true }, { text: 'B' }, { text: 'C' }], workedSolution: 'w', ...over };
}

function auditorResponse(target, actual) {
	return { text: JSON.stringify({ actualDifficulty: actual, targetDifficulty: target, pass: actual === target, reasoningStepCount: 3, conceptIntegrationCount: 2, requiresInterpretation: true, requiresJudgement: true, issues: actual === target ? [] : ['too easy'], reason: 'ok' }) };
}

test('enforceDifficulty: passing question needs no repair', async () => {
	let repairCalls = 0;
	const chatCompletion = async ({ messages }) => {
		const sys = String(messages[0].content);
		if (sys.includes('Difficulty Auditor')) return auditorResponse('HARD', 'HARD');
		repairCalls++;
		return { text: '{}' };
	};
	const res = await enforceDifficulty({ units: [unit()], targets: ['HARD'], chatCompletion, level: 'LEVEL1', logger: { log() {}, warn() {} } });
	assert.equal(res[0].pass, true);
	assert.equal(res[0].attempts, 0);
	assert.equal(repairCalls, 0);
});

test('enforceDifficulty: failed question is regenerated then passes', async () => {
	let auditCount = 0;
	let repairCalls = 0;
	const chatCompletion = async ({ messages }) => {
		const sys = String(messages[0].content);
		if (sys.includes('Difficulty Auditor')) {
			auditCount++;
			// First audit fails, second passes.
			return auditorResponse('HARD', auditCount === 1 ? 'MEDIUM' : 'HARD');
		}
		repairCalls++;
		return { text: JSON.stringify({ stem: 'Rewritten HARD question', options: [{ text: 'A', isCorrect: true }, { text: 'B' }, { text: 'C' }], workedSolution: 'w2', keyFormulas: 'kf', explanation: 'e', los: 'L' }) };
	};
	const res = await enforceDifficulty({ units: [unit()], targets: ['HARD'], chatCompletion, level: 'LEVEL1', logger: { log() {}, warn() {} } });
	assert.equal(res[0].pass, true);
	assert.equal(res[0].attempts, 1);
	assert.equal(repairCalls, 1);
	assert.equal(res[0].unit.stem, 'Rewritten HARD question');
});

test('enforceDifficulty: persistently failing question is excluded (pass=false) after max attempts', async () => {
	let repairCalls = 0;
	const chatCompletion = async ({ messages }) => {
		const sys = String(messages[0].content);
		if (sys.includes('Difficulty Auditor')) return auditorResponse('HARD', 'EASY'); // never satisfies HARD
		repairCalls++;
		return { text: JSON.stringify({ stem: 'still easy', options: [{ text: 'A', isCorrect: true }, { text: 'B' }, { text: 'C' }] }) };
	};
	const res = await enforceDifficulty({ units: [unit()], targets: ['HARD'], chatCompletion, maxAttempts: 2, level: 'LEVEL1', logger: { log() {}, warn() {} } });
	assert.equal(res[0].pass, false);
	assert.equal(res[0].attempts, 2);
	assert.equal(repairCalls, 2); // 2 regeneration attempts
});

test('enforceDifficulty: each question is validated against its own target (mixed)', async () => {
	const seen = [];
	const chatCompletion = async ({ messages }) => {
		const user = String(messages[1].content);
		const m = user.match(/Target difficulty:\s*(EASY|MEDIUM|HARD)/);
		const target = m ? m[1] : 'MEDIUM';
		seen.push(target);
		return auditorResponse(target, target);
	};
	const res = await enforceDifficulty({
		units: [unit({ loc: { i: 0 } }), unit({ loc: { i: 1 } })],
		targets: ['MEDIUM', 'HARD'],
		chatCompletion, level: 'LEVEL1', logger: { log() {}, warn() {} },
	});
	assert.deepEqual(seen, ['MEDIUM', 'HARD']);
	assert.equal(res[0].target, 'MEDIUM');
	assert.equal(res[1].target, 'HARD');
	assert.ok(res.every(r => r.pass));
});

test('enforceDifficulty: auditor failure is non-fatal (does not wipe generation)', async () => {
	// First auditor call throws, but the orchestrator should not reject the question set.
	const chatCompletion = async ({ messages }) => {
		const sys = String(messages[0].content);
		if (sys.includes('Difficulty Auditor')) throw new Error('validator offline');
		return { text: '{}' };
	};
	const res = await enforceDifficulty({ units: [unit()], targets: ['HARD'], chatCompletion, level: 'LEVEL1', logger: { log() {}, warn() {} } });
	assert.equal(res[0].pass, true);
	assert.equal(res[0].verdict.audited, false);
});
