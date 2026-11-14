import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { loadSampleBank, dryRunSampleImport, transformSampleSetToQuestion } from '../src/lib/questions/sampleBank.js';
import { normalizeQuestionPayload } from '../src/lib/questions/questionSchema.js';
import { validateQuestionPayload } from '../src/lib/questions/questionValidation.js';

const folder = process.env.SAMPLE_BANK_DIR;
const enabled = Boolean(folder && fs.existsSync(path.join(folder, 'index.html')) && process.env.DATABASE_URL);

test('real CFA Level III 500-set bank parses completely and SET-001 dry-runs', { skip: !enabled }, async () => {
	const prisma = new PrismaClient();
	try {
		const bank = await loadSampleBank(folder);
		assert.equal(bank.sets.length, 500);
		assert.equal(bank.missing.length, 0);
		assert.equal(bank.parsed.length, 500);
		const questions = bank.parsed.flatMap(set => set.questions);
		assert.equal(questions.length, 2000);
		assert.ok(bank.parsed.every(set => set.vignette && set.questions.length === 4));
		assert.ok(questions.every(question => question.externalQuestionId && question.options.length === 3));
		assert.ok(questions.every(question => question.options.filter(option => option.isCorrect).length === 1));
		assert.ok(questions.every(question => question.workedSolution && question.los && question.tracePage));
		const first = bank.parsed.find(set => set.setId === 'SET-001');
		assert.ok(first);
		assert.equal(first.volume, 'Asset Allocation');
		assert.equal(first.learningModule, 'Capital Market Expectations, Part 1: Framework and Macro Considerations');
		assert.equal(first.totalMarks, 12);
		assert.equal(first.questions[0].externalQuestionId, 'Q-AA-UZLZL');
		assert.equal(first.questions[0].correctAnswer, 'B');
		const course = await prisma.course.findFirst({ where: { name: 'CFA III' } });
		const volume = await prisma.volume.findFirst({ where: { name: 'Asset Allocation' } });
		const module = await prisma.module.findFirst({ where: { courseId: course.id, volumeId: volume.id, name: first.learningModule } });
		const topic = await prisma.topic.findFirst({ where: { moduleId: module.id, name: first.questions[0].topicName } });
		const dryRun = await dryRunSampleImport(prisma, first, {
			courseId: course.id,
			volumeId: volume.id,
			moduleId: module.id,
			primaryTopicId: topic.id
		});
		assert.equal(dryRun.ok, true, JSON.stringify({ mappingErrors: dryRun.mappingErrors, validation: dryRun.validation?.errors }));
		assert.equal(dryRun.mappedPayload.subQuestions.length, 4);
		assert.equal(dryRun.mappedPayload.subQuestions[0].options.filter(option => option.isCorrect).length, 1);
		assert.ok(dryRun.warnings.some(warning => warning.code === 'DIFFICULTY_PROVISIONAL'));
	} finally {
		await prisma.$disconnect();
	}
});

test('all 500 supplied sets map and validate with the reviewed mapping file', { skip: !enabled }, async () => {
	const prisma = new PrismaClient();
	try {
		const mapping = JSON.parse(fs.readFileSync(new URL('../src/data/cfaLevel3SampleMapping.json', import.meta.url), 'utf8'));
		const bank = await loadSampleBank(folder);
		const failures = [];
		let valid = 0;
		for (const sample of bank.parsed) {
			const { academic, payload } = await transformSampleSetToQuestion(prisma, sample, {
				courseId: mapping.courseId,
				moduleMap: mapping.moduleMap,
				topicMap: mapping.topicMap,
				difficulty: 'HARD'
			});
			if (academic.errors.length) {
				failures.push({ setId: sample.setId, mappingErrors: academic.errors });
				continue;
			}
			const validation = await validateQuestionPayload(prisma, normalizeQuestionPayload(payload));
			if (!validation.ok) failures.push({ setId: sample.setId, validationErrors: validation.errors });
			else valid += 1;
		}
		assert.deepEqual(failures, []);
		assert.equal(valid, 500);
	} finally {
		await prisma.$disconnect();
	}
});
