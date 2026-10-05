/**
 * Unit tests for AI Question Generation difficulty handling.
 * Verifies the selected difficulty produces explicit, mandatory instructions
 * in the prompt sent to the AI (not just metadata).
 *
 * Run with:  node --test "test/**\/*.test.mjs"   (from apps/server)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
	normalizeDifficultyValue,
	buildDifficultyInstructionBlock,
	buildDifficultyRegenerationNote,
	buildDifficultyValidationPrompt,
	DIFFICULTY_INSTRUCTIONS,
} from '../src/routes/cms.js';

test('normalizeDifficultyValue accepts the enum case-insensitively', () => {
	assert.equal(normalizeDifficultyValue('EASY'), 'EASY');
	assert.equal(normalizeDifficultyValue('hard'), 'HARD');
	assert.equal(normalizeDifficultyValue('  Medium '), 'MEDIUM');
	assert.equal(normalizeDifficultyValue('IMPOSSIBLE'), null);
	assert.equal(normalizeDifficultyValue(''), null);
	assert.equal(normalizeDifficultyValue(undefined), null);
});

test('EASY instruction block contains the required EASY guidance', () => {
	const block = buildDifficultyInstructionBlock(['EASY']);
	assert.match(block, /Requested difficulty: EASY/);
	assert.match(block, /ALL questions .* MUST be EASY/);
	assert.match(block, /basic understanding, recognition or straightforward application/);
	assert.match(block, /one main concept at a time/);
	assert.match(block, /Do not generate a medium or hard question/);
	// Must not accidentally include another level's instruction
	assert.doesNotMatch(block, /Do not simplify the question to medium or easy difficulty/);
});

test('MEDIUM instruction block contains the required MEDIUM guidance', () => {
	const block = buildDifficultyInstructionBlock(['MEDIUM']);
	assert.match(block, /Requested difficulty: MEDIUM/);
	assert.match(block, /meaningful application and interpretation/);
	assert.match(block, /normal CFA exam difficulty/);
	assert.match(block, /Do not make the question trivially easy or unusually difficult/);
});

test('HARD instruction block contains the required HARD guidance', () => {
	const block = buildDifficultyInstructionBlock(['HARD']);
	assert.match(block, /Requested difficulty: HARD/);
	assert.match(block, /advanced application, interpretation or multi-step reasoning/);
	assert.match(block, /several reasoning or calculation steps/);
	assert.match(block, /realistic candidate mistakes/);
	assert.match(block, /Do not simplify the question to medium or easy difficulty/);
});

test('difficulty instruction is mandatory and overrides conflicting guidance', () => {
	const block = buildDifficultyInstructionBlock(['HARD']);
	assert.match(block, /DIFFICULTY REQUIREMENT \(MANDATORY/);
	assert.match(block, /OVERRIDES ANY CONFLICTING INSTRUCTION/);
	assert.match(block, /internally verify that each question matches the requested difficulty/);
	assert.match(block, /DIFFICULTY MUST AFFECT THE WHOLE QUESTION/);
	assert.match(block, /IGNORE any fixed difficulty labels/);
	assert.match(block, /"difficulty" field/);
});

test('multiple difficulties produce a distribution instruction', () => {
	const block = buildDifficultyInstructionBlock(['MEDIUM', 'HARD']);
	assert.match(block, /Requested difficulty: MEDIUM, HARD/);
	assert.match(block, /Generate the set across these requested difficulty levels/);
	assert.match(block, /meaningful application and interpretation/);
	assert.match(block, /multi-step reasoning/);
});

test('empty difficulty falls back to MEDIUM (not silently dropping instructions)', () => {
	const block = buildDifficultyInstructionBlock([]);
	assert.match(block, /Requested difficulty: MEDIUM/);
	assert.match(block, /meaningful application and interpretation/);
});

test('all three difficulty instruction texts are distinct', () => {
	const easy = DIFFICULTY_INSTRUCTIONS.EASY;
	const medium = DIFFICULTY_INSTRUCTIONS.MEDIUM;
	const hard = DIFFICULTY_INSTRUCTIONS.HARD;
	assert.notEqual(easy, medium);
	assert.notEqual(medium, hard);
	assert.notEqual(easy, hard);
});

test('validation prompt asks the reviewer to classify actual difficulty', () => {
	const prompt = buildDifficultyValidationPrompt([{ index: 0, stem: 'What is X?' }], 'HARD');
	assert.match(prompt, /Requested difficulty for every question: HARD/);
	assert.match(prompt, /"mismatches"/);
	assert.match(prompt, /classify its ACTUAL difficulty/);
});

test('regeneration note demands strict compliance and full regeneration', () => {
	const note = buildDifficultyRegenerationNote('HARD', [{ label: 'Question 1', found: 'EASY' }]);
	assert.match(note, /STRICT DIFFICULTY CORRECTION REQUIRED/);
	assert.match(note, /exactly HARD difficulty/);
	assert.match(note, /Regenerate the ENTIRE response/);
});
