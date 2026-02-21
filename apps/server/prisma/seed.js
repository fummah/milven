import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
	const adminEmail = 'admin@milven.local';
	const studentEmail = 'student@milven.local';
	const defaultPassword = 'Password123!';
	const passwordHash = await bcrypt.hash(defaultPassword, 10);

	const admin = await prisma.user.upsert({
		where: { email: adminEmail },
		update: {
			role: 'ADMIN'
		},
		create: {
			email: adminEmail,
			passwordHash,
			firstName: 'Admin',
			lastName: 'User',
			role: 'ADMIN',
			level: 'LEVEL1'
		}
	});

	const student = await prisma.user.upsert({
		where: { email: studentEmail },
		update: {
			role: 'STUDENT'
		},
		create: {
			email: studentEmail,
			passwordHash,
			firstName: 'Student',
			lastName: 'User',
			role: 'STUDENT',
			level: 'LEVEL1'
		}
	});

	let course = await prisma.course.findFirst({
		where: { name: 'CFA Level 1 Prep (Seed)', level: 'LEVEL1' }
	});
	if (!course) {
		course = await prisma.course.create({
			data: {
				name: 'CFA Level 1 Prep (Seed)',
				level: 'LEVEL1',
				description: 'Seed course for local development.',
				active: true
			}
		});
	}

	let volume = await prisma.volume.findFirst({
		where: { name: 'Volume 1 (Seed)' }
	});
	if (!volume) {
		volume = await prisma.volume.create({
			data: {
				name: 'Volume 1 (Seed)'
			}
		});
	}
	await prisma.courseVolume.upsert({
		where: { courseId_volumeId: { courseId: course.id, volumeId: volume.id } },
		update: { order: 1 },
		create: { courseId: course.id, volumeId: volume.id, order: 1 }
	});

	let module = await prisma.module.findFirst({
		where: { volumeId: volume.id, courseId: course.id, name: 'Module 1: Ethics (Seed)' }
	});
	if (!module) {
		module = await prisma.module.create({
			data: {
				name: 'Module 1: Ethics (Seed)',
				level: 'LEVEL1',
				volumeId: volume.id,
				courseId: course.id,
				order: 1
			}
		});
	}

	let topic = await prisma.topic.findFirst({
		where: { moduleId: module.id, name: 'Topic 1: Code of Ethics (Seed)' }
	});
	if (!topic) {
		topic = await prisma.topic.create({
			data: {
				name: 'Topic 1: Code of Ethics (Seed)',
				level: 'LEVEL1',
				moduleId: module.id,
				courseId: course.id,
				order: 1,
				moduleNumber: 1
			}
		});
	}

	const existingQCount = await prisma.question.count({ where: { topicId: topic.id } });
	if (existingQCount === 0) {
		const q1 = await prisma.question.create({
			data: {
				stem: 'A CFA charterholder must act with integrity, competence, diligence, respect, and in an ethical manner with the public, clients, prospective clients, employers, employees, colleagues in the investment profession, and other participants in the global capital markets. True or False?',
				type: 'MCQ',
				level: 'LEVEL1',
				difficulty: 'EASY',
				marks: 1,
				topicId: topic.id,
				courseId: course.id,
				volumeId: volume.id,
				moduleId: module.id
			}
		});
		await prisma.mcqOption.createMany({
			data: [
				{ questionId: q1.id, text: 'True', isCorrect: true },
				{ questionId: q1.id, text: 'False', isCorrect: false }
			]
		});

		const q2 = await prisma.question.create({
			data: {
				stem: 'Which action is most consistent with the CFA Institute Code and Standards?',
				type: 'MCQ',
				level: 'LEVEL1',
				difficulty: 'MEDIUM',
				marks: 1,
				topicId: topic.id,
				courseId: course.id,
				volumeId: volume.id,
				moduleId: module.id
			}
		});
		await prisma.mcqOption.createMany({
			data: [
				{ questionId: q2.id, text: 'Guarantee clients a minimum return to win business.', isCorrect: false },
				{ questionId: q2.id, text: 'Maintain independence and objectivity when providing investment analysis.', isCorrect: true },
				{ questionId: q2.id, text: 'Trade ahead of clients when a strong recommendation is issued.', isCorrect: false },
				{ questionId: q2.id, text: 'Use material nonpublic information if it benefits clients.', isCorrect: false }
			]
		});
	}

	const enrollment = await prisma.enrollment.upsert({
		where: { userId_courseId: { userId: student.id, courseId: course.id } },
		update: {},
		create: {
			userId: student.id,
			courseId: course.id,
			status: 'IN_PROGRESS'
		}
	});

	let courseExam = await prisma.exam.findFirst({
		where: { type: 'COURSE', courseId: course.id }
	});
	if (!courseExam) {
		courseExam = await prisma.exam.create({
			data: {
				name: 'Course Exam (Seed)',
				level: 'LEVEL1',
				timeLimitMinutes: 60,
				type: 'COURSE',
				courseId: course.id,
				active: true,
				createdById: admin.id
			}
		});
	}

	let quiz = await prisma.exam.findFirst({
		where: { type: 'QUIZ', topicId: topic.id }
	});
	if (!quiz) {
		quiz = await prisma.exam.create({
			data: {
				name: 'Topic Quiz (Seed)',
				level: 'LEVEL1',
				timeLimitMinutes: 10,
				type: 'QUIZ',
				topicId: topic.id,
				courseId: course.id,
				active: true,
				createdById: admin.id
			}
		});
	}

	const topicQuestionIds = await prisma.question.findMany({ where: { topicId: topic.id }, select: { id: true } });
	const qids = topicQuestionIds.map(q => q.id);
	if (qids.length > 0) {
		await prisma.examQuestion.deleteMany({ where: { examId: quiz.id } });
		await prisma.examQuestion.createMany({
			data: qids.map((qid, idx) => ({ examId: quiz.id, questionId: qid, order: idx + 1 }))
		});

		await prisma.examQuestion.deleteMany({ where: { examId: courseExam.id } });
		await prisma.examQuestion.createMany({
			data: qids.map((qid, idx) => ({ examId: courseExam.id, questionId: qid, order: idx + 1 }))
		});
	}

	console.log('Seed completed');
	console.log(`Admin login: ${adminEmail} / ${defaultPassword}`);
	console.log(`Student login: ${studentEmail} / ${defaultPassword}`);
	console.log(`Course: ${course.id}`);
	console.log(`Enrollment: ${enrollment.id}`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
