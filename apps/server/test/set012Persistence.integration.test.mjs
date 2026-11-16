import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { loadSampleBank, transformSampleSetToQuestion } from '../src/lib/questions/sampleBank.js';
import { normalizeQuestionPayload } from '../src/lib/questions/questionSchema.js';
import { validateQuestionPayload } from '../src/lib/questions/questionValidation.js';
import { validateAcademicMapping } from '../src/lib/questions/questionCurriculum.js';
import { persistQuestionPayload } from '../src/lib/questions/questionPersistence.js';

const folder = process.env.SAMPLE_BANK_DIR;
const enabled = Boolean(folder && fs.existsSync(path.join(folder, 'SET-012.html')) && process.env.DATABASE_URL);

test('SET-012 persists and reads back every child explanation and academic field', { skip: !enabled }, async () => {
	const prisma = new PrismaClient();
	try {
		const mapping = JSON.parse(fs.readFileSync(new URL('../src/data/cfaLevel3SampleMapping.json', import.meta.url), 'utf8'));
		const bank = await loadSampleBank(folder);
		const sample = bank.parsed.find(set => set.setId === 'SET-012');
		assert.ok(sample);
		const { payload } = await transformSampleSetToQuestion(prisma, sample, {
			courseId: mapping.courseId,
			moduleMap: mapping.moduleMap,
			topicMap: mapping.topicMap,
			difficulty: 'HARD'
		});
		const normalized = normalizeQuestionPayload(payload);
		const validation = await validateQuestionPayload(prisma, normalized);
		assert.equal(validation.ok, true, JSON.stringify(validation.errors));
		const academic = await validateAcademicMapping(prisma, {
			courseId: normalized.courseId,
			volumeId: normalized.volumeId,
			moduleId: normalized.moduleId,
			primaryTopicId: normalized.primaryTopicId,
			additionalTopicIds: normalized.additionalTopicIds,
			conceptIds: normalized.conceptIds
		});
		assert.equal(academic.ok, true, JSON.stringify(academic.errors));

		let captured;
		try {
			await prisma.$transaction(async tx => {
				captured = await persistQuestionPayload(prisma, normalized, {
					tx,
					mapping: academic,
					generationSource: 'MCP',
					validation
				});
				throw new Error('ROLLBACK_SET012_READBACK');
			});
		} catch (error) {
			if (error.message !== 'ROLLBACK_SET012_READBACK') throw error;
		}

		const parent = captured.question;
		assert.equal(parent.caseStudyTitle, 'Driftwood Family Office');
		assert.equal(parent.sourceSetId, 'SET-012');
		assert.equal(parent.children.length, 4);
		assert.equal(parent.workedSolution, null);
		const first = parent.children.find(child => child.qid === 'Q-AA-IBGG7');
		assert.ok(first);
		assert.equal(first.correctAnswerExplanation, "Combining approaches lets each offset the others' weaknesses, which is why careful forecasters do so.");
		assert.equal(first.incorrectOptionsExplanation, 'The approaches are complementary, not incompatible. Combination does not necessarily create look-ahead bias.');
		assert.equal(first.commonMistake, 'Assuming approaches must be used in isolation.');
		assert.equal(first.conceptsTested, 'Approaches to economic forecasting.');
		assert.equal(first.sourceConcept, 'Combining forecasting approaches');
		assert.equal(first.los, 'compare major approaches to economic forecasting');
		assert.equal(first.traceSection, 'Approaches to Economic Forecasting');
		assert.equal(first.tracePage, '25');
		assert.ok(first.workedSolution.includes('Step 1: The three main approaches'));
		assert.equal(first.answerVerificationStatus, 'SOURCE_PROVIDED');
		assert.equal(first.options.length, 3);
		assert.equal(first.options.filter(option => option.isCorrect).length, 1);
	} finally {
		await prisma.$disconnect();
	}
});

