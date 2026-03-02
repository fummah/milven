import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';

export function examsRouter(prisma) {
	const router = Router();

	function shuffleInPlace(arr) {
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			const tmp = arr[i];
			arr[i] = arr[j];
			arr[j] = tmp;
		}
		return arr;
	}

	async function requireEnrollmentForCourseExam(userId, courseId) {
		if (!userId || !courseId) return false;
		const e = await prisma.enrollment.findFirst({ where: { userId: String(userId), courseId: String(courseId) }, select: { id: true } });
		return !!e;
	}

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
    const isStudent = req.user.role !== 'ADMIN';
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
      startAt: isStudent ? z.coerce.date() : z.coerce.date().optional().nullable(),
      endAt: isStudent ? z.coerce.date() : z.coerce.date().optional().nullable()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const payload = parse.data;
    // For students, validate that endAt is after startAt
    if (isStudent && payload.startAt && payload.endAt) {
      if (new Date(payload.endAt) <= new Date(payload.startAt)) {
        return res.status(400).json({ error: 'End time must be after start time' });
      }
    }
    // For students, check if they already have an open or pending custom exam
    if (isStudent) {
      const now = new Date();
      const existingExams = await prisma.exam.findMany({
        where: {
          createdById: req.user.id,
          active: true
        },
        select: {
          id: true,
          startAt: true,
          endAt: true
        }
      });
      const hasOpenExam = existingExams.some(exam => {
        const startDate = exam.startAt ? new Date(exam.startAt) : null;
        const endDate = exam.endAt ? new Date(exam.endAt) : null;
        // Check if exam is pending (not started yet) or open (between start and end)
        if (startDate && now < startDate) {
          return true; // Pending
        }
        if (startDate && now >= startDate && endDate && now <= endDate) {
          return true; // Open
        }
        if (!startDate && !endDate) {
          return true; // Always available
        }
        if (startDate && now >= startDate && !endDate) {
          return true; // Started but no end date
        }
        return false;
      });
      if (hasOpenExam) {
        return res.status(400).json({ error: 'You already have an open or pending custom exam. Please complete or delete it before creating a new one.' });
      }
    }
    // Prioritize examType - if explicitly set, use it; otherwise infer from topicIds
    const isQuiz = payload.examType === 'QUIZ' || (payload.examType !== 'COURSE' && (!!payload.topicIds && payload.topicIds.length > 0) || (!!payload.topicId));
    // Derive level if not provided: for quiz from topic, for course from course
    let level = payload.level;
    try {
      const firstTopicId = payload.topicIds?.[0] || payload.topicId;
      if (!level && isQuiz && firstTopicId) {
        const t = await prisma.topic.findUnique({ where: { id: firstTopicId }, select: { level: true } });
        level = t?.level ?? 'LEVEL1';
      } else if (!level && payload.courseId) {
        const c = await prisma.course.findUnique({ where: { id: payload.courseId }, select: { level: true } });
        level = c?.level ?? 'LEVEL1';
      }
    } catch {}
    // Create exam record
    // For admins creating exams via /admin/exams, set createdById to null (admin-created)
    // For students creating exams, set createdById to their user ID (student-created)
    const createdById = isStudent ? req.user.id : null;
		const exam = await prisma.exam.create({
			data: {
        name: payload.name,
        level: level ?? 'LEVEL1',
        timeLimitMinutes: payload.timeLimitMinutes,
        createdById: createdById,
        type: isQuiz ? 'QUIZ' : 'COURSE',
        topicId: isQuiz ? (payload.topicIds?.[0] ?? payload.topicId ?? null) : null,
        courseId: payload.courseId ?? null,
        active: isStudent ? true : false, // Students' exams are active by default (only visible to them)
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
      const isStudent = req.user.role !== 'ADMIN';
			// If requesting course exams for a course, require enrollment
			if (courseId && (!type || type === 'COURSE')) {
				const ok = await requireEnrollmentForCourseExam(req.user.id, courseId);
				if (!ok && req.user.role !== 'ADMIN') return res.json({ exams: [] });
			}
      // Build where clause with proper time window handling
      // Student-created exams: show regardless of time window
      // Admin-created exams: show all (active, pending, completed) - no time restrictions
      const where = {
        AND: [
          { active: true },
          courseId ? { courseId } : {},
          topicId ? { topicId } : {},
          type ? { type } : {},
          // For students: show public exams (createdById is null/admin) OR their own exams
          // For admins: show all active exams
          isStudent ? {
            OR: [
              { createdById: null }, // Admin-created public exams
              { createdById: req.user.id } // Student's own exams (show regardless of time)
            ]
          } : {}
          // Removed time window restrictions - show all active exams (pending, active, completed)
        ]
      };
      const exams = await prisma.exam.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, level: true, timeLimitMinutes: true, type: true, topicId: true, courseId: true, active: true, startAt: true, endAt: true, createdById: true }
      });
      return res.json({ exams });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to list exams' });
    }
  });

	// Admin/Student: randomize questions for an existing exam from question pool
	router.post('/:examId/randomize', requireAuth(), async (req, res) => {
		const { examId } = req.params;
		// Check if user owns the exam (for students) or is admin
		if (req.user.role !== 'ADMIN') {
			const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { createdById: true } });
			if (!exam || exam.createdById !== req.user.id) {
				return res.status(403).json({ error: 'Forbidden' });
			}
		}
		const schema = z.object({
			questionCount: z.number().int().positive(),
			difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
			difficulties: z.array(z.enum(['EASY', 'MEDIUM', 'HARD'])).optional(),
			courseId: z.string().optional(),
			volumeId: z.string().optional(),
			moduleId: z.string().optional(),
			topicId: z.string().optional(),
			topicIds: z.array(z.string()).optional(),
			replaceExisting: z.boolean().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const payload = parse.data;
		const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true, level: true, courseId: true, topicId: true } });
		if (!exam) return res.status(404).json({ error: 'Exam not found' });

		const effectiveCourseId = payload.courseId ?? exam.courseId ?? undefined;
		const topicIdList = payload.topicIds || (payload.topicId ? [payload.topicId] : (exam.topicId ? [exam.topicId] : []));
		const difficulties = payload.difficulties || (payload.difficulty ? [payload.difficulty] : []);
		const where = {
			AND: [
				effectiveCourseId ? { courseId: effectiveCourseId } : {},
				payload.volumeId ? { volumeId: payload.volumeId } : {},
				payload.moduleId ? { moduleId: payload.moduleId } : {},
				topicIdList.length > 0 ? { topicId: { in: topicIdList } } : {},
				difficulties.length > 0 ? { difficulty: { in: difficulties } } : {},
				exam.level ? { level: exam.level } : {}
			]
		};

		const pool = await prisma.question.findMany({ where, select: { id: true } });
		if (pool.length < payload.questionCount) {
			return res.status(400).json({ error: `Not enough questions in pool. Requested ${payload.questionCount}, found ${pool.length}.` });
		}
		const ids = shuffleInPlace(pool.map(p => p.id)).slice(0, payload.questionCount);

		await prisma.$transaction(async (tx) => {
			if (payload.replaceExisting !== false) {
				await tx.examQuestion.deleteMany({ where: { examId } });
			}
			await tx.examQuestion.createMany({
				data: ids.map((qid, idx) => ({ examId, questionId: qid, order: idx + 1 }))
			});
		});

		return res.json({ ok: true, count: ids.length });
	});

	// Student: generate a practice exam from pool (materialized exam + randomized ExamQuestions)
	router.post('/practice', requireAuth(), maybeRequireSubscription(prisma), async (req, res) => {
		const schema = z.object({
			name: z.string().min(3).optional(),
			timeLimitMinutes: z.number().int().positive().optional(),
			questionCount: z.number().int().positive(),
			difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
			courseId: z.string().optional(),
			volumeId: z.string().optional(),
			moduleId: z.string().optional(),
			topicId: z.string().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const payload = parse.data;

		if (payload.courseId) {
			const ok = await requireEnrollmentForCourseExam(req.user.id, payload.courseId);
			if (!ok && req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Not enrolled in course' });
		}

		let level = req.user.level;
		if (payload.courseId) {
			const c = await prisma.course.findUnique({ where: { id: payload.courseId }, select: { level: true } });
			level = c?.level ?? level;
		} else if (payload.topicId) {
			const t = await prisma.topic.findUnique({ where: { id: payload.topicId }, select: { level: true } });
			level = t?.level ?? level;
		}

		const where = {
			AND: [
				payload.courseId ? { courseId: payload.courseId } : {},
				payload.volumeId ? { volumeId: payload.volumeId } : {},
				payload.moduleId ? { moduleId: payload.moduleId } : {},
				payload.topicId ? { topicId: payload.topicId } : {},
				payload.difficulty ? { difficulty: payload.difficulty } : {},
				level ? { level } : {}
			]
		};

		const pool = await prisma.question.findMany({ where, select: { id: true } });
		if (pool.length < payload.questionCount) {
			return res.status(400).json({ error: `Not enough questions in pool. Requested ${payload.questionCount}, found ${pool.length}.` });
		}
		const ids = shuffleInPlace(pool.map(p => p.id)).slice(0, payload.questionCount);

		const exam = await prisma.exam.create({
			data: {
				name: payload.name ?? 'Practice Exam',
				level: level ?? 'LEVEL1',
				timeLimitMinutes: payload.timeLimitMinutes ?? 60,
				createdById: req.user.id,
				type: 'PRACTICE',
				courseId: payload.courseId ?? null,
				topicId: payload.topicId ?? null,
				active: true,
				startAt: null,
				endAt: null
			}
		});

		await prisma.examQuestion.createMany({
			data: ids.map((qid, idx) => ({ examId: exam.id, questionId: qid, order: idx + 1 }))
		});

		return res.status(201).json({ examId: exam.id });
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
      include: {
        _count: {
          select: {
            examQuestions: true,
            attempts: true
          }
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });
    // Map exams with stats
    const examsWithStats = exams.map(exam => ({
      id: exam.id,
      name: exam.name,
      level: exam.level,
      timeLimitMinutes: exam.timeLimitMinutes,
      createdAt: exam.createdAt,
      type: exam.type,
      topicId: exam.topicId,
      courseId: exam.courseId,
      active: exam.active,
      startAt: exam.startAt,
      endAt: exam.endAt,
      createdById: exam.createdById,
      questionCount: exam._count.examQuestions || 0,
      attemptCount: exam._count.attempts || 0,
      createdBy: exam.createdBy ? {
        id: exam.createdBy.id,
        name: [exam.createdBy.firstName, exam.createdBy.lastName].filter(Boolean).join(' ') || exam.createdBy.email || 'Unknown',
        email: exam.createdBy.email
      } : null
    }));
    return res.json({ exams: examsWithStats });
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
    const { examId } = req.params;
    // Check if user is admin OR if they created this exam (for students)
    if (req.user.role !== 'ADMIN') {
      const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { createdById: true } });
      if (!exam || exam.createdById !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
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
		const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true, active: true, timeLimitMinutes: true, startAt: true, endAt: true, type: true, courseId: true } });
		if (!exam) return res.status(404).json({ error: 'Exam not found' });
		if (!exam.active) return res.status(403).json({ error: 'Exam is not active' });
		if (exam.type === 'COURSE' && exam.courseId && req.user.role !== 'ADMIN') {
			const ok = await requireEnrollmentForCourseExam(req.user.id, exam.courseId);
			if (!ok) return res.status(403).json({ error: 'Not enrolled in course' });
		}
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

	// ==========================================
	// MISTAKE BANK ROUTES
	// ==========================================

	// Get all mistakes for current user
	router.get('/mistakes/me', requireAuth(), async (req, res) => {
		try {
			const mistakes = await prisma.mistakeEntry.findMany({
				where: { userId: req.user.id },
				orderBy: { createdAt: 'desc' }
			});

			// Fetch question details for each mistake
			const questionIds = mistakes.map(m => m.questionId);
			const questions = await prisma.question.findMany({
				where: { id: { in: questionIds } },
				include: {
					options: true,
					topic: true,
					vignette: true
				}
			});
			const questionMap = new Map(questions.map(q => [q.id, q]));

			const enrichedMistakes = mistakes.map(m => ({
				...m,
				question: questionMap.get(m.questionId) || null
			}));

			return res.json({ 
				mistakes: enrichedMistakes,
				total: mistakes.length,
				unreviewedCount: mistakes.filter(m => !m.retested).length
			});
		} catch (err) {
			console.error('Mistakes fetch error:', err);
			return res.status(500).json({ error: 'Failed to fetch mistakes' });
		}
	});

	// Add to mistake bank (called automatically when wrong answer submitted)
	router.post('/mistakes', requireAuth(), async (req, res) => {
		const schema = z.object({
			questionId: z.string(),
			attemptId: z.string().optional(),
			answerId: z.string().optional(),
			wrongOptionId: z.string().optional(),
			correctOptionId: z.string().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

		try {
			const mistake = await prisma.mistakeEntry.upsert({
				where: {
					userId_questionId: { userId: req.user.id, questionId: parse.data.questionId }
				},
				update: {
					attemptId: parse.data.attemptId,
					answerId: parse.data.answerId,
					wrongOptionId: parse.data.wrongOptionId,
					correctOptionId: parse.data.correctOptionId,
					retested: false,
					retestedAt: null,
					retestedCorrect: null
				},
				create: {
					userId: req.user.id,
					questionId: parse.data.questionId,
					attemptId: parse.data.attemptId,
					answerId: parse.data.answerId,
					wrongOptionId: parse.data.wrongOptionId,
					correctOptionId: parse.data.correctOptionId
				}
			});
			return res.status(201).json({ mistake });
		} catch (err) {
			console.error('Add mistake error:', err);
			return res.status(500).json({ error: 'Failed to add mistake' });
		}
	});

	// Mark mistake as retested
	router.put('/mistakes/:questionId/retest', requireAuth(), async (req, res) => {
		const { questionId } = req.params;
		const schema = z.object({ correct: z.boolean() });
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

		try {
			const mistake = await prisma.mistakeEntry.update({
				where: {
					userId_questionId: { userId: req.user.id, questionId }
				},
				data: {
					retested: true,
					retestedAt: new Date(),
					retestedCorrect: parse.data.correct
				}
			});
			return res.json({ mistake });
		} catch (err) {
			return res.status(404).json({ error: 'Mistake not found' });
		}
	});

	// Remove from mistake bank
	router.delete('/mistakes/:questionId', requireAuth(), async (req, res) => {
		const { questionId } = req.params;
		try {
			await prisma.mistakeEntry.delete({
				where: {
					userId_questionId: { userId: req.user.id, questionId }
				}
			});
			return res.json({ ok: true });
		} catch {
			return res.status(404).json({ error: 'Mistake not found' });
		}
	});

	// Generate a retest exam from mistakes
	router.post('/mistakes/retest', requireAuth(), async (req, res) => {
		const schema = z.object({
			questionCount: z.number().int().positive().optional(),
			timeLimitMinutes: z.number().int().positive().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

		try {
			// Get unreviewedmistakes
			const mistakes = await prisma.mistakeEntry.findMany({
				where: { userId: req.user.id, retested: false },
				select: { questionId: true }
			});

			if (mistakes.length === 0) {
				return res.status(400).json({ error: 'No mistakes to retest' });
			}

			const questionCount = parse.data.questionCount || Math.min(mistakes.length, 20);
			const selectedIds = shuffleInPlace(mistakes.map(m => m.questionId)).slice(0, questionCount);

			// Create exam
			const exam = await prisma.exam.create({
				data: {
					name: 'Mistake Retest',
					level: req.user.level || 'LEVEL1',
					timeLimitMinutes: parse.data.timeLimitMinutes || 30,
					createdById: req.user.id,
					type: 'RETEST',
					active: true
				}
			});

			// Link questions
			await prisma.examQuestion.createMany({
				data: selectedIds.map((qid, idx) => ({ examId: exam.id, questionId: qid, order: idx + 1 }))
			});

			return res.status(201).json({ examId: exam.id, questionCount: selectedIds.length });
		} catch (err) {
			console.error('Retest creation error:', err);
			return res.status(500).json({ error: 'Failed to create retest exam' });
		}
	});

	// ==========================================
	// REVISION LIST ROUTES
	// ==========================================

	// Get revision list
	router.get('/revision/me', requireAuth(), async (req, res) => {
		try {
			const entries = await prisma.revisionEntry.findMany({
				where: { userId: req.user.id },
				orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }]
			});

			// Fetch question details
			const questionIds = entries.map(e => e.questionId);
			const questions = await prisma.question.findMany({
				where: { id: { in: questionIds } },
				include: { options: true, topic: true, vignette: true }
			});
			const questionMap = new Map(questions.map(q => [q.id, q]));

			const enrichedEntries = entries.map(e => ({
				...e,
				question: questionMap.get(e.questionId) || null
			}));

			return res.json({
				entries: enrichedEntries,
				total: entries.length,
				unreviewedCount: entries.filter(e => !e.reviewed).length
			});
		} catch (err) {
			console.error('Revision fetch error:', err);
			return res.status(500).json({ error: 'Failed to fetch revision list' });
		}
	});

	// Add to revision list
	router.post('/revision', requireAuth(), async (req, res) => {
		const schema = z.object({
			questionId: z.string(),
			note: z.string().optional(),
			priority: z.number().int().min(1).max(3).optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

		try {
			const entry = await prisma.revisionEntry.upsert({
				where: {
					userId_questionId: { userId: req.user.id, questionId: parse.data.questionId }
				},
				update: {
					note: parse.data.note,
					priority: parse.data.priority ?? 1,
					reviewed: false,
					reviewedAt: null
				},
				create: {
					userId: req.user.id,
					questionId: parse.data.questionId,
					note: parse.data.note,
					priority: parse.data.priority ?? 1
				}
			});
			return res.status(201).json({ entry });
		} catch (err) {
			console.error('Add revision error:', err);
			return res.status(500).json({ error: 'Failed to add to revision list' });
		}
	});

	// Update revision entry
	router.put('/revision/:questionId', requireAuth(), async (req, res) => {
		const { questionId } = req.params;
		const schema = z.object({
			note: z.string().optional(),
			priority: z.number().int().min(1).max(3).optional(),
			reviewed: z.boolean().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

		try {
			const data = { ...parse.data };
			if (parse.data.reviewed === true) data.reviewedAt = new Date();
			
			const entry = await prisma.revisionEntry.update({
				where: {
					userId_questionId: { userId: req.user.id, questionId }
				},
				data
			});
			return res.json({ entry });
		} catch {
			return res.status(404).json({ error: 'Entry not found' });
		}
	});

	// Remove from revision list
	router.delete('/revision/:questionId', requireAuth(), async (req, res) => {
		const { questionId } = req.params;
		try {
			await prisma.revisionEntry.delete({
				where: {
					userId_questionId: { userId: req.user.id, questionId }
				}
			});
			return res.json({ ok: true });
		} catch {
			return res.status(404).json({ error: 'Entry not found' });
		}
	});

	// ==========================================
	// WEAK TOPICS ROUTES
	// ==========================================

	// Get weak topics
	router.get('/weak-topics/me', requireAuth(), async (req, res) => {
		try {
			const weakTopics = await prisma.weakTopic.findMany({
				where: { userId: req.user.id },
				orderBy: { percent: 'asc' }
			});

			// Fetch topic details
			const topicIds = weakTopics.map(w => w.topicId);
			const topics = await prisma.topic.findMany({
				where: { id: { in: topicIds } },
				include: { module: true }
			});
			const topicMap = new Map(topics.map(t => [t.id, t]));

			const enrichedTopics = weakTopics.map(w => ({
				...w,
				topic: topicMap.get(w.topicId) || null
			}));

			return res.json({ weakTopics: enrichedTopics });
		} catch (err) {
			console.error('Weak topics fetch error:', err);
			return res.status(500).json({ error: 'Failed to fetch weak topics' });
		}
	});

	// Add to weak topics
	router.post('/weak-topics', requireAuth(), async (req, res) => {
		const schema = z.object({
			topicId: z.string(),
			wrongCount: z.number().int().optional(),
			totalCount: z.number().int().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

		try {
			const wrongCount = parse.data.wrongCount || 1;
			const totalCount = parse.data.totalCount || 1;
			const percent = totalCount > 0 ? ((totalCount - wrongCount) / totalCount) * 100 : 0;

			const entry = await prisma.weakTopic.upsert({
				where: {
					userId_topicId: { userId: req.user.id, topicId: parse.data.topicId }
				},
				update: {
					wrongCount: { increment: wrongCount },
					totalCount: { increment: totalCount },
					percent
				},
				create: {
					userId: req.user.id,
					topicId: parse.data.topicId,
					wrongCount,
					totalCount,
					percent
				}
			});
			return res.status(201).json({ entry });
		} catch (err) {
			console.error('Add weak topic error:', err);
			return res.status(500).json({ error: 'Failed to add weak topic' });
		}
	});

	// Remove from weak topics
	router.delete('/weak-topics/:topicId', requireAuth(), async (req, res) => {
		const { topicId } = req.params;
		try {
			await prisma.weakTopic.delete({
				where: {
					userId_topicId: { userId: req.user.id, topicId }
				}
			});
			return res.json({ ok: true });
		} catch {
			return res.status(404).json({ error: 'Entry not found' });
		}
	});

	// Student Performance Analytics (aggregated across all attempts)
	router.get('/analytics/me', requireAuth(), async (req, res) => {
		try {
			const userId = req.user.id;
			
			// Get all submitted attempts for this user with answers and topic info
			const attempts = await prisma.examAttempt.findMany({
				where: { 
					userId,
					status: 'SUBMITTED',
					scorePercent: { not: null }
				},
				include: {
					exam: { select: { name: true, courseId: true } },
					answers: {
						include: { question: { include: { topic: true } } }
					}
				},
				orderBy: { submittedAt: 'asc' }
			});

			if (attempts.length === 0) {
				return res.json({
					hasData: false,
					readinessScore: 0,
					passEstimate: 0,
					totalAttempts: 0,
					totalQuestions: 0,
					avgScore: 0,
					scoreTrend: [],
					topicPerformance: [],
					weeklyProgress: [],
					improvement: 0
				});
			}

			// Calculate score trend over time (by week)
			const weeklyScores = new Map();
			const scoreTrend = [];
			
			attempts.forEach(attempt => {
				if (attempt.submittedAt && attempt.scorePercent != null) {
					scoreTrend.push({
						date: attempt.submittedAt,
						score: Math.round(attempt.scorePercent),
						examName: attempt.exam?.name || 'Exam'
					});
					
					// Group by week for weekly progress
					const weekStart = new Date(attempt.submittedAt);
					weekStart.setHours(0, 0, 0, 0);
					weekStart.setDate(weekStart.getDate() - weekStart.getDay());
					const weekKey = weekStart.toISOString().split('T')[0];
					
					if (!weeklyScores.has(weekKey)) {
						weeklyScores.set(weekKey, { total: 0, count: 0 });
					}
					const ws = weeklyScores.get(weekKey);
					ws.total += attempt.scorePercent;
					ws.count += 1;
				}
			});

			// Convert weekly scores to array
			const weeklyProgress = Array.from(weeklyScores.entries())
				.sort((a, b) => a[0].localeCompare(b[0]))
				.slice(-8) // Last 8 weeks
				.map(([week, data], idx) => ({
					week: `Week ${idx + 1}`,
					weekDate: week,
					avgScore: Math.round(data.total / data.count)
				}));

			// Aggregate topic performance across all attempts
			const topicMap = new Map();
			let totalCorrect = 0;
			let totalQuestions = 0;

			attempts.forEach(attempt => {
				attempt.answers.forEach(answer => {
					const topicName = answer.question?.topic?.name || 'General';
					if (!topicMap.has(topicName)) {
						topicMap.set(topicName, { correct: 0, total: 0 });
					}
					const topic = topicMap.get(topicName);
					topic.total += 1;
					totalQuestions += 1;
					if (answer.isCorrect) {
						topic.correct += 1;
						totalCorrect += 1;
					}
				});
			});

			const topicPerformance = Array.from(topicMap.entries())
				.map(([topic, data]) => ({
					topic,
					correct: data.correct,
					total: data.total,
					percent: Math.round((data.correct / (data.total || 1)) * 100)
				}))
				.sort((a, b) => b.total - a.total) // Sort by most questions
				.slice(0, 10); // Top 10 topics

			// Calculate overall stats
			const avgScore = Math.round(attempts.reduce((sum, a) => sum + (a.scorePercent || 0), 0) / attempts.length);
			
			// Calculate improvement (first vs last attempt)
			const firstScore = attempts[0]?.scorePercent || 0;
			const lastScore = attempts[attempts.length - 1]?.scorePercent || 0;
			const improvement = Math.round(lastScore - firstScore);

			// Calculate readiness score (weighted average of recent performance)
			// Weights more recent attempts higher
			let weightedSum = 0;
			let weightTotal = 0;
			attempts.slice(-5).forEach((attempt, idx) => {
				const weight = idx + 1; // More recent = higher weight
				weightedSum += (attempt.scorePercent || 0) * weight;
				weightTotal += weight;
			});
			const readinessScore = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;

			// Estimate pass probability (simplified model based on readiness and trend)
			let passEstimate = readinessScore;
			if (improvement > 0) passEstimate = Math.min(95, passEstimate + Math.round(improvement / 2));
			if (readinessScore >= 70) passEstimate = Math.min(95, passEstimate + 5);
			passEstimate = Math.max(5, Math.min(95, passEstimate));

			return res.json({
				hasData: true,
				readinessScore,
				passEstimate,
				totalAttempts: attempts.length,
				totalQuestions,
				avgScore,
				scoreTrend,
				topicPerformance,
				weeklyProgress,
				improvement,
				lastAttemptDate: attempts[attempts.length - 1]?.submittedAt
			});
		} catch (err) {
			console.error('Analytics error:', err);
			return res.status(500).json({ error: 'Failed to compute analytics' });
		}
	});

	return router;
}


