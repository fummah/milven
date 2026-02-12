import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';

export function examsRouter(prisma) {
	const router = Router();

	// Dev-friendly subscription bypass
	const maybeRequireSubscription = (prisma) => (req, res, next) => {
		// If ALLOW_DEBUG=1 or the user is ADMIN, skip subscription requirement
		if ((process.env.ALLOW_DEBUG === '1') || (req.user && req.user.role === 'ADMIN')) {
			return next();
		}
		return requireActiveSubscription(prisma)(req, res, next);
	};

	// Custom exam builder: create quiz (topic) or course exam
	router.post('/custom', requireAuth(), maybeRequireSubscription(prisma), async (req, res) => {
    const schema = z.object({
			name: z.string().min(3),
			level: z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3', 'NONE']).optional(), // level may be derived server-side
			timeLimitMinutes: z.number().int().positive(),
			// topicIds not required for course exams
			topicIds: z.array(z.string()).optional(),
			questionCount: z.number().int().positive(),
      examType: z.enum(['COURSE','QUIZ']).optional(),
      topicId: z.string().optional(),
      courseId: z.string().optional(),
      startAt: z.coerce.date().optional().nullable(),
      endAt: z.coerce.date().optional().nullable()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const payload = parse.data;
    const isQuiz = (payload.examType === 'QUIZ') || (!!payload.topicId);
    // Derive level if not provided: for quiz from topic, for course from course
    let level = payload.level;
    try {
      if (!level && isQuiz && payload.topicId) {
        const t = await prisma.topic.findUnique({ where: { id: payload.topicId }, select: { level: true } });
        level = t?.level ?? 'LEVEL1';
      } else if (!level && payload.courseId) {
        const c = await prisma.course.findUnique({ where: { id: payload.courseId }, select: { level: true } });
        level = c?.level ?? 'LEVEL1';
      }
    } catch {}
    // Create exam record
		const exam = await prisma.exam.create({
			data: {
        name: payload.name,
        level: level ?? 'LEVEL1',
        timeLimitMinutes: payload.timeLimitMinutes,
        createdById: req.user.id,
        type: isQuiz ? 'QUIZ' : 'COURSE',
        topicId: isQuiz ? (payload.topicId ?? (payload.topicIds?.[0] ?? null)) : null,
        courseId: payload.courseId ?? null,
        active: false,
        startAt: payload.startAt ?? null,
        endAt: payload.endAt ?? null
      }
		});
		return res.status(201).json({ exam });
	});

  // Student-friendly: list active exams (filtered); for COURSE exams only show during startAt–endAt window
  router.get('/public', requireAuth(), async (req, res) => {
    try {
      const courseId = req.query.courseId?.toString();
      const topicId = req.query.topicId?.toString();
      const type = req.query.type?.toString(); // 'COURSE' | 'QUIZ'
      const now = new Date();
      const where = {
        AND: [
          { active: true },
          courseId ? { courseId } : {},
          topicId ? { topicId } : {},
          type ? { type } : {},
          // Time window: no startAt means no start limit; no endAt means no end limit
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] }
        ]
      };
      const exams = await prisma.exam.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, level: true, timeLimitMinutes: true, type: true, topicId: true, courseId: true, active: true, startAt: true, endAt: true }
      });
      return res.json({ exams });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to list exams' });
    }
  });

	// Get exam details
	router.get('/:examId', requireAuth(), async (req, res) => {
		const { examId } = req.params;
		const exam = await prisma.exam.findUnique({
			where: { id: examId },
			select: { id: true, name: true, level: true, timeLimitMinutes: true, createdAt: true, createdById: true, type: true, topicId: true, courseId: true, active: true, startAt: true, endAt: true }
		});
		if (!exam) return res.status(404).json({ error: 'Not found' });
		return res.json({ exam });
	});

  // List questions linked to an exam (admin: any exam; student: active exams only for taking quiz)
  router.get('/:examId/questions', requireAuth(), async (req, res) => {
    const { examId } = req.params;
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, active: true }
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (req.user.role !== 'ADMIN' && !exam.active) return res.status(403).json({ error: 'Forbidden' });
    const links = await prisma.examQuestion.findMany({
      where: { examId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: { question: { include: { options: true, vignette: true } } }
    });
    const questions = links.map(l => ({ ...l.question, order: l.order }));
    return res.json({ questions });
  });

  // Link an existing question to exam
  router.post('/:examId/questions', requireAuth(), async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const { examId } = req.params;
    const schema = z.object({ questionId: z.string(), order: z.number().int().optional() });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const last = await prisma.examQuestion.findFirst({ where: { examId }, orderBy: { order: 'desc' }, select: { order: true } });
    const link = await prisma.examQuestion.create({
      data: { examId, questionId: parse.data.questionId, order: parse.data.order ?? ((last?.order ?? 0) + 1) }
    });
    return res.status(201).json({ link });
  });

  // Unlink a question from exam
  router.delete('/:examId/questions/:questionId', requireAuth(), async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const { examId, questionId } = req.params;
    await prisma.examQuestion.delete({ where: { examId_questionId: { examId, questionId } } });
    return res.json({ ok: true });
  });
  // List exams (admin)
  router.get('/', requireAuth(), async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const courseId = req.query.courseId?.toString();
    const topicId = req.query.topicId?.toString();
    const type = req.query.type?.toString();
    const where = {
      AND: [
        courseId ? { courseId } : {},
        topicId ? { topicId } : {},
        type ? { type } : {}
      ]
    };
    const exams = await prisma.exam.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, level: true, timeLimitMinutes: true, createdAt: true, type: true, topicId: true, courseId: true, active: true, startAt: true, endAt: true }
    });
    return res.json({ exams });
  });

  // Update exam (admin)
  router.put('/:examId', requireAuth(), async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const { examId } = req.params;
    const schema = z.object({
      name: z.string().min(1).optional(),
      timeLimitMinutes: z.number().int().positive().optional(),
      active: z.boolean().optional(),
      startAt: z.coerce.date().optional().nullable(),
      endAt: z.coerce.date().optional().nullable()
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const data = { ...parse.data };
    if (Object.prototype.hasOwnProperty.call(parse.data, 'startAt')) data.startAt = parse.data.startAt ?? null;
    if (Object.prototype.hasOwnProperty.call(parse.data, 'endAt')) data.endAt = parse.data.endAt ?? null;
    const updated = await prisma.exam.update({
      where: { id: examId },
      data,
      select: { id: true, name: true, level: true, timeLimitMinutes: true, createdAt: true, active: true, type: true, startAt: true, endAt: true }
    });
    return res.json({ exam: updated });
  });

  // Delete exam (admin)
  router.delete('/:examId', requireAuth(), async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const { examId } = req.params;
    // cascade delete attempts
    await prisma.examAttempt.deleteMany({ where: { examId } });
    await prisma.exam.delete({ where: { id: examId } });
    return res.json({ ok: true });
  });
	// Create a simple exam (admin)
	router.post(
		'/',
		requireAuth(),
		async (req, res) => {
			if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
			const schema = z.object({
				name: z.string().min(3),
				level: z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3']),
				timeLimitMinutes: z.number().int().positive()
			});
			const parse = schema.safeParse(req.body);
			if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
			const exam = await prisma.exam.create({
				data: { ...parse.data, createdById: req.user.id }
			});
			return res.status(201).json({ exam });
		}
	);

	// Start an attempt (timed); for COURSE exams enforce startAt/endAt window; create answer placeholders for each exam question
	router.post('/:examId/attempts', requireAuth(), maybeRequireSubscription(prisma), async (req, res) => {
		const { examId } = req.params;
		const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true, active: true, timeLimitMinutes: true, startAt: true, endAt: true, type: true } });
		if (!exam) return res.status(404).json({ error: 'Exam not found' });
		if (!exam.active) return res.status(403).json({ error: 'Exam is not active' });
		const now = new Date();
		if (exam.startAt && now < exam.startAt) return res.status(403).json({ error: 'Exam has not started yet' });
		if (exam.endAt && now > exam.endAt) return res.status(403).json({ error: 'Exam has ended' });
		const attempt = await prisma.examAttempt.create({
			data: {
				examId: exam.id,
				userId: req.user.id,
				status: 'IN_PROGRESS',
				timeRemainingSec: exam.timeLimitMinutes * 60
			}
		});
		const links = await prisma.examQuestion.findMany({
			where: { examId },
			orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
			select: { questionId: true }
		});
		for (const link of links) {
			await prisma.examAnswer.create({
				data: {
					attemptId: attempt.id,
					questionId: link.questionId,
					flagged: false,
					timeSpentSec: 0
				}
			});
		}
		return res.status(201).json({ attempt });
	});

	// Save/flag answer (autosave support)
	router.post('/attempts/:attemptId/answers', requireAuth(), maybeRequireSubscription(prisma), async (req, res) => {
		const { attemptId } = req.params;
		const schema = z.object({
			questionId: z.string(),
			selectedOptionId: z.string().optional(),
			textAnswer: z.string().optional(),
			flagged: z.boolean().optional(),
			timeSpentSec: z.number().int().nonnegative().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const attempt = await prisma.examAttempt.findUnique({
			where: { id: attemptId },
			include: { exam: true }
		});
		if (!attempt || attempt.userId !== req.user.id) return res.status(404).json({ error: 'Attempt not found' });
		let isCorrect = null;
		if (parse.data.selectedOptionId) {
			const opt = await prisma.mcqOption.findUnique({ where: { id: parse.data.selectedOptionId } });
			isCorrect = opt ? opt.isCorrect : null;
		}
		const answer = await prisma.examAnswer.upsert({
			where: {
				attemptId_questionId: { attemptId, questionId: parse.data.questionId }
			},
			update: {
				selectedOptionId: parse.data.selectedOptionId ?? undefined,
				textAnswer: parse.data.textAnswer ?? undefined,
				flagged: parse.data.flagged ?? undefined,
				isCorrect: isCorrect ?? undefined,
				timeSpentSec: parse.data.timeSpentSec ?? undefined
			},
			create: {
				attemptId,
				questionId: parse.data.questionId,
				selectedOptionId: parse.data.selectedOptionId,
				textAnswer: parse.data.textAnswer,
				flagged: parse.data.flagged ?? false,
				isCorrect: isCorrect,
				timeSpentSec: parse.data.timeSpentSec ?? 0
			}
		});
		return res.json({ answer });
	});

	// Submit attempt (compute score); if COURSE exam, mark enrollment as COMPLETED
	router.post('/attempts/:attemptId/submit', requireAuth(), maybeRequireSubscription(prisma), async (req, res) => {
		const { attemptId } = req.params;
		const attempt = await prisma.examAttempt.findUnique({
			where: { id: attemptId },
			include: { answers: true, exam: { select: { type: true, courseId: true } } }
		});
		if (!attempt || attempt.userId !== req.user.id) return res.status(404).json({ error: 'Attempt not found' });
		const total = attempt.answers.length || 1;
		const correct = attempt.answers.filter(a => a.isCorrect === true).length;
		const scorePercent = (correct / total) * 100;
		const updated = await prisma.examAttempt.update({
			where: { id: attemptId },
			data: { status: 'SUBMITTED', submittedAt: new Date(), scorePercent }
		});
		if (attempt.exam?.type === 'COURSE' && attempt.exam.courseId) {
			await prisma.enrollment.updateMany({
				where: { userId: req.user.id, courseId: attempt.exam.courseId },
				data: { status: 'COMPLETED' }
			});
		}
		return res.json({ attempt: updated });
	});

	// List my attempts
	router.get('/attempts/me', requireAuth(), async (req, res) => {
		const attempts = await prisma.examAttempt.findMany({
			where: { userId: req.user.id },
			orderBy: { startedAt: 'desc' },
			select: { id: true, examId: true, status: true, startedAt: true, submittedAt: true, scorePercent: true }
		});
		return res.json({ attempts });
	});

	// Attempt details (include course name for exam platform header)
	router.get('/attempts/:attemptId', requireAuth(), async (req, res) => {
		const { attemptId } = req.params;
		const attempt = await prisma.examAttempt.findUnique({
			where: { id: attemptId },
			include: {
				exam: true,
				answers: {
					include: {
						question: { include: { options: true, topic: true, vignette: true } },
						selectedOption: true
					}
				}
			}
		});
		if (!attempt || attempt.userId !== req.user.id) return res.status(404).json({ error: 'Attempt not found' });
		let courseName = null;
		if (attempt.exam?.courseId) {
			const course = await prisma.course.findUnique({
				where: { id: attempt.exam.courseId },
				select: { name: true }
			});
			courseName = course?.name ?? null;
		}
		// Order answers by exam question order so client sees questions in the right sequence
		const links = await prisma.examQuestion.findMany({
			where: { examId: attempt.examId },
			orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
			select: { questionId: true }
		});
		const orderMap = new Map(links.map((l, i) => [l.questionId, i]));
		const sortedAnswers = [...(attempt.answers || [])].sort(
			(x, y) => (orderMap.get(x.questionId) ?? 999) - (orderMap.get(y.questionId) ?? 999)
		);
		return res.json({ attempt: { ...attempt, answers: sortedAnswers, courseName } });
	});

	// Attempt analytics (topic-level breakdown)
	router.get('/attempts/:attemptId/analytics', requireAuth(), async (req, res) => {
		const { attemptId } = req.params;
		const attempt = await prisma.examAttempt.findUnique({
			where: { id: attemptId },
			include: {
				answers: {
					include: { question: { include: { topic: true } } }
				}
			}
		});
		if (!attempt || attempt.userId !== req.user.id) return res.status(404).json({ error: 'Attempt not found' });
		const map = new Map();
		for (const a of attempt.answers) {
			const topicName = a.question.topic?.name ?? 'Unknown';
			if (!map.has(topicName)) map.set(topicName, { correct: 0, total: 0 });
			const agg = map.get(topicName);
			agg.total += 1;
			if (a.isCorrect) agg.correct += 1;
		}
		const byTopic = Array.from(map.entries()).map(([topic, v]) => ({
			topic, correct: v.correct, total: v.total, percent: (v.correct / (v.total || 1)) * 100
		}));
		return res.json({ byTopic });
	});

	return router;
}


