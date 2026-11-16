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
		const fixtureSets = ['SET-447', 'SET-448', 'SET-449', 'SET-450', 'SET-451', 'SET-452', 'SET-453', 'SET-454']
			.map(setId => bank.parsed.find(set => set.setId === setId));
		assert.equal(fixtureSets.filter(Boolean).length, 8);
		for (const fixture of fixtureSets) {
			assert.equal(fixture.questions.length, 4);
			assert.ok(fixture.caseStudyTitle);
			assert.ok(fixture.questions.every(question => question.correctAnswerExplanation));
			assert.ok(fixture.questions.every(question => question.incorrectOptionsExplanation));
			assert.ok(fixture.questions.every(question => question.commonMistake));
			assert.ok(fixture.questions.every(question => question.conceptsTested));
			assert.ok(fixture.questions.every(question => question.correctAnswerExplanation !== question.incorrectOptionsExplanation));
			assert.equal(fixture.rawFieldAvailability.correctAnswerExplanations, true);
			assert.equal(fixture.rawFieldAvailability.incorrectOptionsExplanations, true);
		}
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
		const fixtureIds = ['SET-447', 'SET-448', 'SET-449', 'SET-450', 'SET-451', 'SET-452', 'SET-453', 'SET-454'];
		for (const setId of fixtureIds) {
			const sample = bank.parsed.find(row => row.setId === setId);
			assert.ok(sample, `${setId} fixture is missing`);
			const { academic, payload } = await transformSampleSetToQuestion(prisma, sample, {
				courseId: mapping.courseId,
				moduleMap: mapping.moduleMap,
				topicMap: mapping.topicMap,
				difficulty: 'HARD'
			});
			assert.equal(academic.errors.length, 0, JSON.stringify(academic.errors));
			const normalized = normalizeQuestionPayload(payload);
			assert.equal(normalized.caseStudyTitle, sample.caseStudyTitle);
			assert.equal(normalized.sourceSetId, setId);
			assert.ok(normalized.subQuestions.every(question => question.correctAnswerExplanation));
			assert.ok(normalized.subQuestions.every(question => question.incorrectOptionsExplanation));
			assert.ok(normalized.subQuestions.every(question => question.commonMistake));
			assert.ok(normalized.subQuestions.every(question => question.conceptsTested));
			assert.ok(normalized.subQuestions.every(question => question.sourceSetId === setId));
			assert.ok(normalized.subQuestions.every(question => question.answerVerificationStatus === 'SOURCE_PROVIDED'));
			assert.ok(normalized.subQuestions.every(question => !/Explanation:/i.test(question.workedSolution || '')));
			assert.ok(payload.reviewMetadata.fieldMapping.children.every(child => child.unmappedFields.length === 0));
			const validation = await validateQuestionPayload(prisma, normalized);
			assert.equal(validation.summary.reviewStatus, 'READY_FOR_APPROVAL', JSON.stringify(validation.summary.completeness));
		}
	} finally {
		await prisma.$disconnect();
	}
});
