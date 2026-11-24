import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { scanOptionTextRepairs, applyOptionTextRepairs } from '../src/lib/questions/optionRepair.js';

const enabled = Boolean(process.env.DATABASE_URL);

test('option repair scans and safely cleans trailing artifacts without changing correctness or order', { skip: !enabled }, async () => {
	const prisma = new PrismaClient();
	let questionId;
	try {
		const course = await prisma.course.findFirst({ where: { level: 'LEVEL3' }, orderBy: { name: 'asc' } });
		if (!course) return;
		const link = await prisma.courseVolume.findFirst({ where: { courseId: course.id }, orderBy: { order: 'asc' } });
		if (!link) return;
		const module = await prisma.module.findFirst({ where: { courseId: course.id, volumeId: link.volumeId }, orderBy: { order: 'asc' } });
		if (!module) return;
		const topic = await prisma.topic.findFirst({ where: { moduleId: module.id }, orderBy: { order: 'asc' } });
		if (!topic) return;
		const stamp = Date.now();
		const question = await prisma.question.create({
			data: {
				qid: `OPTION-REPAIR-${stamp}`,
				stem: 'Which value is correct?',
				type: 'MCQ',
				level: course.level,
				difficulty: 'MEDIUM',
				topicId: topic.id,
				courseId: course.id,
				volumeId: link.volumeId,
				moduleId: module.id,
				topics: { connect: [{ id: topic.id }] },
				options: {
					create: [
						{ text: '153.03`r`n`t`t', isCorrect: false, position: 0, rationale: '`r`n`t`t' },
						{ text: '147.03\\r\\n\\t\\t', isCorrect: true, position: 1, rationale: 'Correct value.\\r\\n\\t\\t' },
						{ text: '144.12', isCorrect: false, position: 2 }
					]
				}
			},
			include: { options: { orderBy: { position: 'asc' } } }
		});
		questionId = question.id;
		const scan = await scanOptionTextRepairs(prisma, { limit: 10000 });
		const candidates = scan.candidates.filter(candidate => candidate.questionId === question.id);
		assert.equal(candidates.length, 4);
		assert.ok(candidates.every(candidate => candidate.safeToAutoClean));
		assert.deepEqual(candidates.filter(candidate => candidate.field === 'text').map(candidate => candidate.proposedText).sort(), ['147.03', '153.03']);
		assert.equal(candidates.filter(candidate => candidate.field === 'rationale').length, 2);
		assert.ok(candidates.some(candidate => candidate.field === 'rationale' && candidate.proposedText === null));
		assert.ok(candidates.some(candidate => candidate.field === 'rationale' && candidate.proposedText === 'Correct value.'));
		const applied = await applyOptionTextRepairs(prisma, candidates.map(candidate => ({ id: candidate.optionId, field: candidate.field, expectedText: candidate.originalText })), { actorId: null });
		assert.equal(applied.ok, true);
		const saved = await prisma.question.findUnique({ where: { id: question.id }, include: { options: { orderBy: { position: 'asc' } } } });
		assert.deepEqual(saved.options.map(option => option.text), ['153.03', '147.03', '144.12']);
		assert.deepEqual(saved.options.map(option => option.isCorrect), [false, true, false]);
		assert.deepEqual(saved.options.map(option => option.rationale), [null, 'Correct value.', null]);
		assert.deepEqual(saved.options.map(option => option.position), [0, 1, 2]);
		const audit = await prisma.mcpAuditLog.findFirst({ where: { action: 'OPTION_TEXT_REPAIRED', detail: { path: ['optionId'], equals: candidates[0].optionId } } });
		assert.ok(audit);
	} finally {
		if (questionId) await prisma.question.delete({ where: { id: questionId } }).catch(() => {});
		await prisma.$disconnect();
	}
});
