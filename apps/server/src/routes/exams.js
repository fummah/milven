import { Router } from 'express';
import OpenAI from 'openai';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { requireRole } from '../middleware/requireRole.js';
import { getOpenAIApiKey } from '../lib/openai.js';

export function examsRouter(prisma) {
	const router = Router();

	// Compute score from marks: totalPossible = sum(question.marks), earned = MCQ/Vignette (marks if correct) + Constructed (marksAwarded ?? 0)
	async function computeAttemptScorePercent(attemptId) {
		const attempt = await prisma.examAttempt.findUnique({
			where: { id: attemptId },
			include: { answers: { include: { question: { select: { marks: true, type: true } } } } }
		});
		if (!attempt || !attempt.answers?.length) return 0;
		let totalPossible = 0;
		let earned = 0;
		for (const a of attempt.answers) {
			const q = a.question;
			const marks = q?.marks ?? 1;
			totalPossible += marks;
			if (q?.type === 'CONSTRUCTED_RESPONSE') {
				earned += a.marksAwarded ?? 0;
			} else {
				earned += (a.isCorrect === true) ? marks : 0;
			}
		}
		if (totalPossible <= 0) return 0;
		return Math.min(100, Math.round((earned / totalPossible) * 1000) / 10);
	}

	function shuffleInPlace(arr) {
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			const tmp = arr[i];
			arr[i] = arr[j];
			arr[j] = tmp;
		}
		return arr;
	}

	function stripHtml(input, maxLen = 1200) {
		const raw = typeof input === 'string' ? input : '';
		return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
	}

	function buildAiHelpPrompt({
		question,
		selectedOptionText,
		correctOptionText,
		textAnswer,
		mode,
		courseName,
		volumeName,
		topicName,
		moduleName,
		caseStudyText
	}) {
		const qType = question?.type === 'CONSTRUCTED_RESPONSE' ? 'constructed response' : 'multiple choice';
		const stem = stripHtml(question?.stem, 1600);
		const worked = stripHtml(question?.workedSolution, 700);
		const keyFormulas = stripHtml(question?.keyFormulas, 400);
		const los = stripHtml(question?.los, 250);
		const traceSection = stripHtml(question?.traceSection, 250);
		const cleanCaseStudy = stripHtml(caseStudyText, 1800);
		const optionsText = (question?.options || [])
			.map((opt, idx) => `${String.fromCharCode(65 + idx)}. ${stripHtml(opt?.text, 220)}${opt?.isCorrect ? ' (correct)' : ''}`)
			.join('\n');

		return [
			'You are a concise CFA study coach helping a student understand a question they got wrong or want help with.',
			'Give practical teaching help, not just the final answer.',
			'Adapt to the question type and use the vignette case study when present.',
			'If the student answer is wrong, explain why it is wrong in a respectful way.',
			'Keep the response structured and brief but useful.',
			'',
			`Request mode: ${mode || 'study_help'}`,
			`Question type: ${qType}`,
			courseName ? `Course: ${courseName}` : null,
			volumeName ? `Volume: ${volumeName}` : null,
			moduleName ? `Module: ${moduleName}` : null,
			topicName ? `Topic: ${topicName}` : null,
			question?.difficulty ? `Difficulty: ${question.difficulty}` : null,
			los ? `LOS: ${los}` : null,
			traceSection ? `Reference section: ${traceSection}` : null,
			cleanCaseStudy ? `Case study: ${cleanCaseStudy}` : null,
			`Question: ${stem}`,
			optionsText ? `Options:\n${optionsText}` : null,
			selectedOptionText ? `Student selected: ${stripHtml(selectedOptionText, 250)}` : null,
			correctOptionText ? `Correct answer: ${stripHtml(correctOptionText, 250)}` : null,
			textAnswer ? `Student written answer: ${stripHtml(textAnswer, 600)}` : null,
			keyFormulas ? `Key formulas: ${keyFormulas}` : null,
			worked ? `Worked solution excerpt: ${worked}` : null,
			'',
			'Respond in markdown with exactly these sections:',
			'1. **Core idea** - 1 short paragraph',
			'2. **Why this question works this way** - 2 to 4 bullets',
			'3. **How to solve or think about it** - 2 to 4 bullets',
			'4. **Common mistake to avoid** - 1 bullet',
			'5. **What to revise next** - 1 to 3 bullets tied to the course/topic/volume when possible',
			'',
			'Do not mention that you are an AI. Do not include a disclaimer. Keep it focused on learning.'
		].filter(Boolean).join('\n');
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
      difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
      difficulties: z.array(z.enum(['EASY', 'MEDIUM', 'HARD'])).optional(),
      examType: z.enum(['COURSE','QUIZ']).optional(),
      topicId: z.string().optional(),
      courseId: z.string().optional(),
      volumeId: z.string().optional(),
      moduleId: z.string().optional(),
      questionType: z.enum(['ANY', 'MCQ', 'VIGNETTE_MCQ', 'CONSTRUCTED_RESPONSE']).optional(),
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
    let selectedQuestionIds = [];
    if (isStudent) {
      const topicIdList = payload.topicIds || (payload.topicId ? [payload.topicId] : []);
      const difficulties = payload.difficulties || (payload.difficulty ? [payload.difficulty] : []);
      const questionType = payload.questionType === 'ANY' || !payload.questionType ? null : payload.questionType;
      
      // Build type filter: MCQ should include VIGNETTE_MCQ parents, CONSTRUCTED_RESPONSE should include bundles
      let typeFilter = {};
      if (questionType === 'MCQ') {
        typeFilter = { type: { in: ['MCQ', 'VIGNETTE_MCQ'] } };
      } else if (questionType === 'CONSTRUCTED_RESPONSE') {
        typeFilter = { type: 'CONSTRUCTED_RESPONSE' };
      } else if (questionType === 'VIGNETTE_MCQ') {
        typeFilter = { type: 'VIGNETTE_MCQ' };
      }
      
      const where = {
        AND: [
          payload.courseId ? { courseId: payload.courseId } : {},
          payload.volumeId ? { volumeId: payload.volumeId } : {},
          payload.moduleId ? { moduleId: payload.moduleId } : {},
          topicIdList.length > 0 ? { topicId: { in: topicIdList } } : {},
          difficulties.length > 0 ? { difficulty: { in: difficulties } } : {},
          level ? { level } : {},
          typeFilter
        ]
      };
      const pool = await prisma.question.findMany({
        where: { ...where, parentId: null },
        include: { children: { select: { id: true }, orderBy: [{ orderIndex: 'asc' }] } }
      });
      const logicalItems = pool.map((q) => {
        const childIds = (q.children || []).map((c) => c.id);
        if (childIds.length > 0) return { ids: childIds };
        return { ids: [q.id] };
      });
      const maxLogical = logicalItems.length;
      if (maxLogical < payload.questionCount) {
        return res.status(400).json({ error: `Not enough questions in pool. Requested ${payload.questionCount}, found ${maxLogical} (counting each vignette as one question).` });
      }
      shuffleInPlace(logicalItems);
      selectedQuestionIds = logicalItems.slice(0, payload.questionCount).flatMap((item) => item.ids);
    }
    const createdById = isStudent ? req.user.id : null;
		const exam = await prisma.$transaction(async (tx) => {
      const createdExam = await tx.exam.create({
        data: {
          name: payload.name,
          level: level ?? 'LEVEL1',
          timeLimitMinutes: payload.timeLimitMinutes,
          createdById: createdById,
          type: isQuiz ? 'QUIZ' : 'COURSE',
          topicId: isQuiz ? (payload.topicIds?.[0] ?? payload.topicId ?? null) : null,
          courseId: payload.courseId ?? null,
          active: isStudent ? true : false,
          startAt: payload.startAt ?? null,
          endAt: payload.endAt ?? null
        }
      });
      if (isStudent && selectedQuestionIds.length > 0) {
        await tx.examQuestion.createMany({
          data: selectedQuestionIds.map((questionId, idx) => ({
            examId: createdExam.id,
            questionId,
            order: idx + 1
          }))
        });
      }
      return createdExam;
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
			replaceExisting: z.boolean().optional(),
			questionType: z.enum(['ANY', 'MCQ', 'VIGNETTE_MCQ', 'CONSTRUCTED_RESPONSE']).optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const payload = parse.data;
		const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true, level: true, courseId: true, topicId: true } });
		if (!exam) return res.status(404).json({ error: 'Exam not found' });

		const effectiveCourseId = payload.courseId ?? exam.courseId ?? undefined;
		const topicIdList = payload.topicIds || (payload.topicId ? [payload.topicId] : (exam.topicId ? [exam.topicId] : []));
		const difficulties = payload.difficulties || (payload.difficulty ? [payload.difficulty] : []);
		const questionType = payload.questionType === 'ANY' || !payload.questionType ? null : payload.questionType;
		
		// Build type filter: MCQ should include VIGNETTE_MCQ parents, CONSTRUCTED_RESPONSE should include bundles
		let typeFilter = {};
		if (questionType === 'MCQ') {
			typeFilter = { type: { in: ['MCQ', 'VIGNETTE_MCQ'] } };
		} else if (questionType === 'CONSTRUCTED_RESPONSE') {
			typeFilter = { type: 'CONSTRUCTED_RESPONSE' };
		} else if (questionType === 'VIGNETTE_MCQ') {
			typeFilter = { type: 'VIGNETTE_MCQ' };
		}
		
		const where = {
			AND: [
				effectiveCourseId ? { courseId: effectiveCourseId } : {},
				payload.volumeId ? { volumeId: payload.volumeId } : {},
				payload.moduleId ? { moduleId: payload.moduleId } : {},
				topicIdList.length > 0 ? { topicId: { in: topicIdList } } : {},
				difficulties.length > 0 ? { difficulty: { in: difficulties } } : {},
				exam.level ? { level: exam.level } : {},
				typeFilter
			]
		};

		// Only pool top-level questions (parentId IS NULL)
		const pool = await prisma.question.findMany({
			where: { ...where, parentId: null },
			
			include: { children: { select: { id: true }, orderBy: [{ orderIndex: 'asc' }] } }
		});
		const logicalItems = pool.map(q => {
			const childIds = (q.children || []).map(c => c.id);
			if (childIds.length > 0) {
				return { kind: 'vignette', ids: childIds };
			}
			return { kind: 'single', ids: [q.id] };
		});
		const maxLogical = logicalItems.length;
		if (maxLogical < payload.questionCount) {
			return res.status(400).json({ error: `Not enough questions in pool. Requested ${payload.questionCount}, found ${maxLogical} (counting each vignette as one question).` });
		}
		shuffleInPlace(logicalItems);
		const selectedLogical = logicalItems.slice(0, payload.questionCount);
		const ids = selectedLogical.flatMap(item => item.ids);

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
			topicId: z.string().optional(),
			questionType: z.enum(['ANY', 'MCQ', 'VIGNETTE_MCQ', 'CONSTRUCTED_RESPONSE']).optional()
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

		const questionType = payload.questionType === 'ANY' || !payload.questionType ? null : payload.questionType;
		
		// Build type filter: MCQ should include VIGNETTE_MCQ parents, CONSTRUCTED_RESPONSE should include bundles
		let typeFilter = {};
		if (questionType === 'MCQ') {
			typeFilter = { type: { in: ['MCQ', 'VIGNETTE_MCQ'] } };
		} else if (questionType === 'CONSTRUCTED_RESPONSE') {
			typeFilter = { type: 'CONSTRUCTED_RESPONSE' };
		} else if (questionType === 'VIGNETTE_MCQ') {
			typeFilter = { type: 'VIGNETTE_MCQ' };
		}
		
		const where = {
			AND: [
				payload.courseId ? { courseId: payload.courseId } : {},
				payload.volumeId ? { volumeId: payload.volumeId } : {},
				payload.moduleId ? { moduleId: payload.moduleId } : {},
				payload.topicId ? { topicId: payload.topicId } : {},
				payload.difficulty ? { difficulty: payload.difficulty } : {},
				level ? { level } : {},
				typeFilter
			]
		};

		// Only pool top-level questions (parentId IS NULL)
		const pool = await prisma.question.findMany({
			where: { ...where, parentId: null },
			
			include: { children: { select: { id: true }, orderBy: [{ orderIndex: 'asc' }] } }
		});
		const logicalItems = pool.map(q => {
			const childIds = (q.children || []).map(c => c.id);
			if (childIds.length > 0) {
				return { kind: 'vignette', ids: childIds };
			}
			return { kind: 'single', ids: [q.id] };
		});
		const maxLogical = logicalItems.length;
		if (maxLogical < payload.questionCount) {
			return res.status(400).json({ error: `Not enough questions in pool. Requested ${payload.questionCount}, found ${maxLogical} (counting each vignette as one question).` });
		}
		shuffleInPlace(logicalItems);
		const selectedLogical = logicalItems.slice(0, payload.questionCount);
		const ids = selectedLogical.flatMap(item => item.ids);

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
      include: { question: { include: { options: true, parent: { select: { id: true, vignetteText: true, type: true } } } } }
    });
    const questions = links.map(l => ({ ...l.question, order: l.order }));
    return res.json({ questions });
  });

  // List attempts for an exam (admin only) – for grading constructed responses
  router.get('/:examId/attempts', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const { examId } = req.params;
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, name: true }
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const attempts = await prisma.examAttempt.findMany({
      where: { examId },
      orderBy: { submittedAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        answers: {
          include: { question: { select: { topicId: true, topic: { select: { name: true } }, type: true, marks: true } } }
        }
      }
    });
    const list = attempts.map(a => {
      const byTopic = new Map();
      for (const ans of a.answers || []) {
        const topicName = ans.question?.topic?.name ?? 'Other';
        if (!byTopic.has(topicName)) byTopic.set(topicName, { correct: 0, total: 0 });
        const agg = byTopic.get(topicName);
        agg.total += 1;
        if (ans.question?.type === 'CONSTRUCTED_RESPONSE') {
          const maxM = ans.question?.marks ?? 1;
          if (ans.marksAwarded != null && ans.marksAwarded >= maxM) agg.correct += 1;
        } else if (ans.isCorrect === true) agg.correct += 1;
      }
      const areasToImprove = Array.from(byTopic.entries())
        .map(([topic, v]) => ({ topic, correct: v.correct, total: v.total, percent: v.total ? Math.round((v.correct / v.total) * 100) : 0 }))
        .filter(({ percent }) => percent < 70)
        .sort((x, y) => x.percent - y.percent)
        .map(({ topic }) => topic);
      return {
        id: a.id,
        userId: a.userId,
        user: a.user ? { id: a.user.id, email: a.user.email, name: [a.user.firstName, a.user.lastName].filter(Boolean).join(' ') || a.user.email } : null,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        status: a.status,
        scorePercent: a.scorePercent,
        areasToImprove
      };
    });
    return res.json({ attempts: list });
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

  // Update exam (admin or owner of student-created practice exam)
  router.put('/:examId', requireAuth(), async (req, res) => {
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
    const existing = await prisma.exam.findUnique({
      where: { id: examId },
      select: {
        id: true,
        createdById: true,
        type: true,
        timeLimitMinutes: true
      }
    });
    if (!existing) return res.status(404).json({ error: 'Exam not found' });
    const isAdmin = req.user.role === 'ADMIN';
    const isOwnedPracticeExam = existing.createdById === req.user.id;
    if (!isAdmin && !isOwnedPracticeExam) return res.status(403).json({ error: 'Forbidden' });
    if (!isAdmin) {
      const nonScheduleFields = Object.keys(parse.data).filter((key) => !['startAt', 'endAt'].includes(key));
      if (nonScheduleFields.length > 0) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
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
		const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true, active: true, timeLimitMinutes: true, startAt: true, endAt: true, type: true, courseId: true, createdById: true } });
		if (!exam) return res.status(404).json({ error: 'Exam not found' });
		if (!exam.active) return res.status(403).json({ error: 'Exam is not active' });
		if (exam.type === 'COURSE' && exam.courseId && req.user.role !== 'ADMIN') {
			const ok = await requireEnrollmentForCourseExam(req.user.id, exam.courseId);
			if (!ok) return res.status(403).json({ error: 'Not enrolled in course' });
		}
		const now = new Date();
		// Auto-reschedule student-created practice exams so "Start now" works immediately
		if (exam.startAt && now < exam.startAt && exam.createdById === req.user.id) {
			const newEndAt = new Date(now.getTime() + (exam.timeLimitMinutes || 60) * 60 * 1000);
			await prisma.exam.update({ where: { id: examId }, data: { startAt: now, endAt: newEndAt } });
			exam.startAt = now;
			exam.endAt = newEndAt;
		}
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

	// Admin: set marks awarded for a constructed-response answer and recalc attempt score
	router.put('/attempts/:attemptId/answers/:answerId', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const { attemptId, answerId } = req.params;
		const schema = z.object({
			marksAwarded: z.number().int().min(0)
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const answer = await prisma.examAnswer.findFirst({
			where: { id: answerId, attemptId },
			include: { question: { select: { type: true, marks: true } } }
		});
		if (!answer) return res.status(404).json({ error: 'Answer not found' });
		if (answer.question?.type !== 'CONSTRUCTED_RESPONSE') {
			return res.status(400).json({ error: 'Only constructed response answers can be awarded marks' });
		}
		const maxMarks = answer.question?.marks ?? 1;
		const marksAwarded = Math.min(parse.data.marksAwarded, maxMarks);
		await prisma.examAnswer.update({
			where: { id: answerId },
			data: { marksAwarded }
		});
		const scorePercent = await computeAttemptScorePercent(attemptId);
		await prisma.examAttempt.update({
			where: { id: attemptId },
			data: { scorePercent }
		});
		const updated = await prisma.examAttempt.findUnique({
			where: { id: attemptId },
			include: {
				exam: true,
				user: { select: { id: true, email: true, firstName: true, lastName: true } },
				answers: { include: { question: { include: { options: true, topic: true, parent: { select: { id: true, vignetteText: true, type: true } } } }, selectedOption: true } }
			}
		});
		let courseName = null;
		if (updated?.exam?.courseId) {
			const course = await prisma.course.findUnique({
				where: { id: updated.exam.courseId },
				select: { name: true }
			});
			courseName = course?.name ?? null;
		}
		const links = await prisma.examQuestion.findMany({
			where: { examId: updated?.examId },
			orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
			select: { questionId: true }
		});
		const orderMap = new Map(links.map((l, i) => [l.questionId, i]));
		const sortedAnswers = [...(updated?.answers || [])].sort(
			(x, y) => (orderMap.get(x.questionId) ?? 999) - (orderMap.get(y.questionId) ?? 999)
		);
		const userWithName = updated?.user ? {
			...updated.user,
			name: [updated.user.firstName, updated.user.lastName].filter(Boolean).join(' ').trim() || updated.user.email || updated.user.id
		} : null;
		return res.json({
			answer: { id: answerId, marksAwarded },
			attempt: updated ? { ...updated, user: userWithName, answers: sortedAnswers, courseName } : null
		});
	});

	// Submit attempt (compute score from marks; constructed use marksAwarded when set); if COURSE exam, mark enrollment as COMPLETED
	router.post('/attempts/:attemptId/submit', requireAuth(), maybeRequireSubscription(prisma), async (req, res) => {
		const { attemptId } = req.params;
		const attempt = await prisma.examAttempt.findUnique({
			where: { id: attemptId },
			include: { answers: { include: { question: { select: { marks: true, type: true } } } }, exam: { select: { type: true, courseId: true } } }
		});
		if (!attempt || attempt.userId !== req.user.id) return res.status(404).json({ error: 'Attempt not found' });
		const scorePercent = await computeAttemptScorePercent(attemptId);
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

	// List attempts pending marking (admin): submitted attempts with ≥1 constructed answer where marksAwarded is null
	router.get('/attempts/pending-marking', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const attempts = await prisma.examAttempt.findMany({
			where: {
				status: 'SUBMITTED',
				answers: {
					some: {
						question: { type: 'CONSTRUCTED_RESPONSE' },
						marksAwarded: null
					}
				}
			},
			orderBy: { submittedAt: 'desc' },
			include: {
				exam: { select: { id: true, name: true } },
				user: { select: { id: true, email: true, firstName: true, lastName: true } },
				answers: {
					where: { question: { type: 'CONSTRUCTED_RESPONSE' } },
					select: { id: true, marksAwarded: true }
				}
			}
		});
		const list = attempts.map((a) => {
			const pendingCount = (a.answers || []).filter((ans) => ans.marksAwarded == null).length;
			return {
				id: a.id,
				examId: a.examId,
				examName: a.exam?.name,
				userId: a.userId,
				user: a.user ? { id: a.user.id, email: a.user.email, name: [a.user.firstName, a.user.lastName].filter(Boolean).join(' ') || a.user.email } : null,
				submittedAt: a.submittedAt,
				pendingCount
			};
		});
		return res.json({ attempts: list });
	});

	// List attempts with completed marking (admin): submitted, have constructed responses, all constructed have marksAwarded set
	router.get('/attempts/completed-marking', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const attempts = await prisma.examAttempt.findMany({
			where: {
				status: 'SUBMITTED',
				answers: {
					some: { question: { type: 'CONSTRUCTED_RESPONSE' } }
				}
			},
			orderBy: { submittedAt: 'desc' },
			include: {
				exam: { select: { id: true, name: true } },
				user: { select: { id: true, email: true, firstName: true, lastName: true } },
				answers: {
					where: { question: { type: 'CONSTRUCTED_RESPONSE' } },
					select: { id: true, marksAwarded: true }
				}
			}
		});
		const list = attempts.filter((a) => {
			const constructed = a.answers || [];
			return constructed.length > 0 && constructed.every((ans) => ans.marksAwarded != null);
		}).map((a) => ({
			id: a.id,
			examId: a.examId,
			examName: a.exam?.name,
			userId: a.userId,
			user: a.user ? { id: a.user.id, email: a.user.email, name: [a.user.firstName, a.user.lastName].filter(Boolean).join(' ') || a.user.email } : null,
			submittedAt: a.submittedAt,
			scorePercent: a.scorePercent
		}));
		return res.json({ attempts: list });
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
				user: { select: { id: true, email: true, firstName: true, lastName: true } },
				answers: {
					include: {
						question: {
							include: { options: true, topic: true, parent: { select: { id: true, vignetteText: true, type: true } } }
						},
						selectedOption: true
					}
				}
			}
		});
		const isOwner = attempt.userId === req.user.id;
		const isAdmin = req.user.role === 'ADMIN';
		if (!attempt || (!isOwner && !isAdmin)) return res.status(404).json({ error: 'Attempt not found' });
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
		const userWithName = attempt.user ? {
			...attempt.user,
			name: [attempt.user.firstName, attempt.user.lastName].filter(Boolean).join(' ').trim() || attempt.user.email || attempt.user.id
		} : null;
		return res.json({ attempt: { ...attempt, user: userWithName, answers: sortedAnswers, courseName } });
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

	// AI-generated hints for failed questions in an attempt (student or admin)
	router.post('/attempts/:attemptId/hints', requireAuth(), async (req, res) => {
		const { attemptId } = req.params;
		const attempt = await prisma.examAttempt.findUnique({
			where: { id: attemptId },
			include: {
				answers: {
					include: {
						question: { include: { options: true } },
						selectedOption: true
					}
				}
			}
		});
		const isOwner = attempt?.userId === req.user.id;
		const isAdmin = req.user.role === 'ADMIN';
		if (!attempt || (!isOwner && !isAdmin)) return res.status(404).json({ error: 'Attempt not found' });

		const apiKey = await getOpenAIApiKey(prisma);
		if (!apiKey) return res.status(400).json({ error: 'AI hints are not configured. Admin must set OpenAI API key.' });

		// Failed: wrong MCQ/vignette, or constructed with partial/zero marks
		const failed = attempt.answers.filter((a) => {
			if (a.question?.type === 'CONSTRUCTED_RESPONSE') {
				const maxM = a.question?.marks ?? 1;
				return a.marksAwarded != null && a.marksAwarded < maxM;
			}
			return a.isCorrect === false;
		});
		if (failed.length === 0) return res.json({ hints: [] });

		const hints = [];
		const openai = new OpenAI({ apiKey });
		for (const ans of failed) {
			const q = ans.question;
			const stem = (q?.stem || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 800);
			const correctOpt = q?.options?.find(o => o.isCorrect);
			const correctText = correctOpt?.text?.replace(/<[^>]+>/g, ' ').trim().slice(0, 200) || '';
			const keyFormulas = (q?.keyFormulas || '').slice(0, 300);
			const worked = (q?.workedSolution || '').slice(0, 400);
			const prompt = `Exam question (student got it wrong). Give one short, brief study hint (1-2 sentences) to help them understand. Be concise.\n\nQuestion: ${stem}\n${correctText ? `Correct answer: ${correctText}\n` : ''}${keyFormulas ? `Key formula(s): ${keyFormulas}\n` : ''}${worked ? `Worked solution (excerpt): ${worked}\n` : ''}\nReply with only the hint, no preamble.`;
			try {
				const comp = await openai.chat.completions.create({
					model: 'gpt-4o-mini',
					messages: [{ role: 'user', content: prompt }],
					temperature: 0.5,
					max_tokens: 150
				});
				const hint = comp.choices?.[0]?.message?.content?.trim() || '';
				if (!hint) {
					hints.push({ answerId: ans.id, questionId: q?.id, hint: '', error: 'AI returned empty hint' });
				} else {
					hints.push({ answerId: ans.id, questionId: q?.id, hint });
				}
			} catch (err) {
				hints.push({ answerId: ans.id, questionId: q?.id, hint: '', error: err?.message || 'Failed to generate hint' });
			}
		}
		return res.json({ hints });
	});

	// Rich AI help for a single question, including vignette/case-study context and syllabus metadata
	router.post('/questions/:questionId/ai-help', requireAuth(), async (req, res) => {
		const { questionId } = req.params;
		const schema = z.object({
			selectedOptionId: z.string().optional().nullable(),
			selectedOptionText: z.string().optional().nullable(),
			textAnswer: z.string().optional().nullable(),
			mode: z.enum(['practice_failed', 'result_review', 'mistake_review', 'revision_review', 'study_help']).optional()
		});
		const parse = schema.safeParse(req.body || {});
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

		const apiKey = await getOpenAIApiKey(prisma);
		if (!apiKey) return res.status(400).json({ error: 'AI help is not configured. Admin must set OpenAI API key.' });

		const question = await prisma.question.findUnique({
			where: { id: questionId },
			include: {
				options: true,
				parent: {
					select: {
						id: true,
						vignetteText: true,
						stem: true
					}
				},
				topic: {
					include: {
						course: { select: { id: true, name: true } },
						module: {
							select: {
								id: true,
								name: true,
								volume: { select: { id: true, name: true } }
							}
						}
					}
				}
			}
		});
		if (!question) return res.status(404).json({ error: 'Question not found' });

		const correctOption = question.options?.find((opt) => opt.isCorrect);
		const selectedOption = parse.data.selectedOptionId
			? question.options?.find((opt) => opt.id === parse.data.selectedOptionId)
			: null;
		const selectedOptionText = parse.data.selectedOptionText || selectedOption?.text || '';
		const caseStudyText = question.parent?.vignetteText || question.vignetteText || '';
		const prompt = buildAiHelpPrompt({
			question,
			selectedOptionText,
			correctOptionText: correctOption?.text || '',
			textAnswer: parse.data.textAnswer || '',
			mode: parse.data.mode || 'study_help',
			courseName: question.topic?.course?.name || '',
			volumeName: question.topic?.module?.volume?.name || '',
			moduleName: question.topic?.module?.name || '',
			topicName: question.topic?.name || '',
			caseStudyText
		});

		try {
			const openai = new OpenAI({ apiKey });
			const comp = await openai.chat.completions.create({
				model: 'gpt-4o-mini',
				messages: [{ role: 'user', content: prompt }],
				temperature: 0.4,
				max_tokens: 500
			});
			const help = comp.choices?.[0]?.message?.content?.trim() || '';
			if (!help) return res.status(502).json({ error: 'AI returned empty help' });
			return res.json({ help });
		} catch (err) {
			const msg = err?.error?.message || err?.response?.data?.error?.message || err?.message || 'Failed to generate AI help';
			return res.status(500).json({ error: msg });
		}
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
					parent: { select: { id: true, vignetteText: true, type: true } }
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
			// Get unreviewed mistakes
			const mistakes = await prisma.mistakeEntry.findMany({
				where: { userId: req.user.id, retested: false },
				select: { questionId: true }
			});

			if (mistakes.length === 0) {
				return res.status(400).json({ error: 'No mistakes to retest' });
			}

			// Validate question IDs still exist and fetch parent info
			const mistakeQIds = mistakes.map(m => m.questionId);
			const existingQuestions = await prisma.question.findMany({
				where: { id: { in: mistakeQIds } },
				select: { id: true, parentId: true, type: true }
			});
			const validQIds = existingQuestions.map(q => q.id);
			if (validQIds.length === 0) {
				return res.status(400).json({ error: 'No valid questions found for retest' });
			}

			const questionCount = parse.data.questionCount || Math.min(validQIds.length, 20);
			const selectedIds = shuffleInPlace([...validQIds]).slice(0, questionCount);

			// For vignette/bundle children, also include sibling questions under the same parent
			const parentIds = new Set();
			const childIds = new Set(selectedIds);
			for (const q of existingQuestions) {
				if (selectedIds.includes(q.id) && q.parentId) {
					parentIds.add(q.parentId);
				}
			}
			// Include all children of selected parents for complete vignette rendering
			if (parentIds.size > 0) {
				const siblings = await prisma.question.findMany({
					where: { parentId: { in: Array.from(parentIds) } },
					select: { id: true },
					orderBy: { orderIndex: 'asc' }
				});
				for (const s of siblings) childIds.add(s.id);
			}
			const finalIds = Array.from(childIds);

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
				data: finalIds.map((qid, idx) => ({ examId: exam.id, questionId: qid, order: idx + 1 }))
			});

			return res.status(201).json({ examId: exam.id, questionCount: finalIds.length });
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
				include: { options: true, topic: true, parent: { select: { id: true, vignetteText: true, type: true } } }
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
			const userLevel = req.user.level;
			const enrollments = await prisma.enrollment.findMany({
				where: { userId },
				select: { courseId: true, course: { select: { id: true, name: true, level: true } } }
			});
			const enrolledCourseIds = enrollments.map((e) => e.courseId).filter(Boolean);
			
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
					improvement: 0,
					peerComparison: null
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

			const peerAttempts = await prisma.examAttempt.findMany({
				where: {
					status: 'SUBMITTED',
					scorePercent: { not: null },
					userId: { not: userId },
					user: { role: 'STUDENT', level: userLevel }
				},
				include: {
					user: { select: { id: true, level: true } },
					exam: { select: { id: true, courseId: true, level: true, name: true } },
					answers: {
						include: {
							question: { include: { topic: true } }
						}
					}
				}
			});

			const computeCohortSummary = (cohortAttempts) => {
				if (!cohortAttempts.length) {
					return {
						participants: 0,
						avgScore: null,
						avgAttempts: null,
						avgQuestions: null,
						avgTopicsCovered: null
					};
				}
				const byUser = new Map();
				cohortAttempts.forEach((attempt) => {
					const key = attempt.userId;
					if (!byUser.has(key)) {
						byUser.set(key, { attempts: [], topicSet: new Set(), questionCount: 0 });
					}
					const bucket = byUser.get(key);
					bucket.attempts.push(attempt);
					(attempt.answers || []).forEach((answer) => {
						bucket.questionCount += 1;
						const topicName = answer.question?.topic?.name;
						if (topicName) bucket.topicSet.add(topicName);
					});
				});
				const users = Array.from(byUser.values());
				const participants = users.length;
				const avgScore = Math.round(users.reduce((sum, user) => {
					const userAvg = user.attempts.reduce((s, a) => s + (a.scorePercent || 0), 0) / user.attempts.length;
					return sum + userAvg;
				}, 0) / participants);
				const avgAttempts = Math.round((users.reduce((sum, user) => sum + user.attempts.length, 0) / participants) * 10) / 10;
				const avgQuestions = Math.round(users.reduce((sum, user) => sum + user.questionCount, 0) / participants);
				const avgTopicsCovered = Math.round((users.reduce((sum, user) => sum + user.topicSet.size, 0) / participants) * 10) / 10;
				return { participants, avgScore, avgAttempts, avgQuestions, avgTopicsCovered };
			};

			const sameCoursePeerAttempts = peerAttempts.filter((attempt) => attempt.exam?.courseId && enrolledCourseIds.includes(attempt.exam.courseId));
			const userTopicSet = new Set(topicPerformance.map((item) => item.topic).filter(Boolean));
			const userCourseAttemptCount = attempts.filter((attempt) => attempt.exam?.courseId && enrolledCourseIds.includes(attempt.exam.courseId)).length;
			const userLevelAttemptCount = attempts.length;
			const userCourseQuestions = attempts
				.filter((attempt) => attempt.exam?.courseId && enrolledCourseIds.includes(attempt.exam.courseId))
				.reduce((sum, attempt) => sum + (attempt.answers?.length || 0), 0);

			const sameLevelSummary = computeCohortSummary(peerAttempts);
			const sameCourseSummary = computeCohortSummary(sameCoursePeerAttempts);
			const rankedScores = [
				...peerAttempts.reduce((acc, attempt) => {
					const idx = acc.findIndex((item) => item.userId === attempt.userId);
					if (idx === -1) {
						acc.push({ userId: attempt.userId, scores: [attempt.scorePercent || 0] });
					} else {
						acc[idx].scores.push(attempt.scorePercent || 0);
					}
					return acc;
				}, []),
				{ userId, scores: attempts.map((attempt) => attempt.scorePercent || 0) }
			].map((item) => ({ userId: item.userId, avg: item.scores.length ? item.scores.reduce((a, b) => a + b, 0) / item.scores.length : 0 }))
			.sort((a, b) => a.avg - b.avg);
			const userRankIndex = rankedScores.findIndex((item) => item.userId === userId);
			const percentile = rankedScores.length > 0 ? Math.round(((userRankIndex + 1) / rankedScores.length) * 100) : null;

			const commonPeerTopics = new Map();
			const peerTopicScores = new Map();
			peerAttempts.forEach((attempt) => {
				(attempt.answers || []).forEach((answer) => {
					const topicName = answer.question?.topic?.name;
					if (!topicName) return;
					if (!commonPeerTopics.has(topicName)) commonPeerTopics.set(topicName, new Set());
					commonPeerTopics.get(topicName).add(attempt.userId);
					if (!peerTopicScores.has(topicName)) peerTopicScores.set(topicName, { correct: 0, total: 0 });
					const bucket = peerTopicScores.get(topicName);
					bucket.total += 1;
					if (answer.isCorrect) bucket.correct += 1;
				});
			});
			const topicCoverageComparison = topicPerformance.slice(0, 6).map((item) => {
				const peerBucket = peerTopicScores.get(item.topic);
				const peerAvgScore = peerBucket && peerBucket.total > 0 ? Math.round((peerBucket.correct / peerBucket.total) * 100) : null;
				return {
					topic: item.topic,
					yourScore: item.percent,
					peerAvgScore,
					peerParticipation: commonPeerTopics.get(item.topic)?.size || 0
				};
			});

			// Score distribution buckets for level cohort
			const scoreDistribution = { below40: 0, range40to59: 0, range60to79: 0, above80: 0 };
			rankedScores.forEach((item) => {
				const avg = Math.round(item.avg);
				if (avg < 40) scoreDistribution.below40++;
				else if (avg < 60) scoreDistribution.range40to59++;
				else if (avg < 80) scoreDistribution.range60to79++;
				else scoreDistribution.above80++;
			});

			// Best streak of consecutive exams scoring >= 50%
			let bestStreak = 0;
			let currentStreak = 0;
			attempts.forEach((a) => {
				if ((a.scorePercent || 0) >= 50) { currentStreak++; bestStreak = Math.max(bestStreak, currentStreak); }
				else { currentStreak = 0; }
			});

			// Course-level score comparison
			const userCourseAttempts = attempts.filter((a) => a.exam?.courseId && enrolledCourseIds.includes(a.exam.courseId));
			const yourCourseAvgScore = userCourseAttempts.length > 0
				? Math.round(userCourseAttempts.reduce((s, a) => s + (a.scorePercent || 0), 0) / userCourseAttempts.length)
				: null;

			const strongestTopic = topicPerformance.length ? [...topicPerformance].sort((a, b) => b.percent - a.percent)[0] : null;
			const weakestTopic = topicPerformance.length ? [...topicPerformance].sort((a, b) => a.percent - b.percent)[0] : null;
			const peerComparison = {
				level: {
					label: userLevel,
					participants: sameLevelSummary.participants,
					avgScore: sameLevelSummary.avgScore,
					avgAttempts: sameLevelSummary.avgAttempts,
					avgQuestions: sameLevelSummary.avgQuestions,
					avgTopicsCovered: sameLevelSummary.avgTopicsCovered,
					yourAttempts: userLevelAttemptCount,
					yourQuestions: totalQuestions,
					yourTopicsCovered: userTopicSet.size,
					percentile,
					scoreDistribution
				},
				course: {
					participants: sameCourseSummary.participants,
					avgScore: sameCourseSummary.avgScore,
					avgAttempts: sameCourseSummary.avgAttempts,
					avgQuestions: sameCourseSummary.avgQuestions,
					avgTopicsCovered: sameCourseSummary.avgTopicsCovered,
					yourAttempts: userCourseAttemptCount,
					yourQuestions: userCourseQuestions,
					yourCourseAvgScore,
					courseNames: enrollments.map((item) => item.course?.name).filter(Boolean).slice(0, 3)
				},
				topics: {
					yourTopicsCovered: userTopicSet.size,
					coverageComparison: topicCoverageComparison,
					strongestTopic,
					weakestTopic
				},
				bestStreak
			};

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
				lastAttemptDate: attempts[attempts.length - 1]?.submittedAt,
				peerComparison
			});
		} catch (err) {
			console.error('Analytics error:', err);
			return res.status(500).json({ error: 'Failed to compute analytics' });
		}
	});

	// ==========================================
	// MOCK EXAM ROUTES
	// ==========================================

	// CFA default session configs per level
	const MOCK_DEFAULTS = {
		LEVEL1: { session1Minutes: 135, session2Minutes: 135, breakMinutes: 30, questionsPerSession: 90, questionType: 'MCQ' },
		LEVEL2: { session1Minutes: 132, session2Minutes: 132, breakMinutes: 30, questionsPerSession: 44, questionType: 'VIGNETTE_MCQ' },
		LEVEL3: { session1Minutes: 132, session2Minutes: 132, breakMinutes: 30, session1Type: 'CONSTRUCTED_RESPONSE', session2Type: 'VIGNETTE_MCQ', session1Questions: 22, session2Questions: 33 }
	};

	// Admin: Get topic weights for a course
	router.get('/mock/weights/:courseId', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const weights = await prisma.mockExamTopicWeight.findMany({
				where: { courseId: req.params.courseId },
				include: { volume: true },
				orderBy: [{ session: 'asc' }, { createdAt: 'asc' }]
			});
			return res.json({ weights });
		} catch (err) {
			return res.status(500).json({ error: 'Failed to fetch weights' });
		}
	});

	// Admin: Save/replace topic weights for a course
	router.put('/mock/weights/:courseId', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const weightSchema = z.object({
			weights: z.array(z.object({
				volumeId: z.string(),
				session: z.number().int().min(1).max(2),
				weightMin: z.number().min(0).max(100),
				weightMax: z.number().min(0).max(100)
			}))
		});
		const parse = weightSchema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

		try {
			const { courseId } = req.params;
			// Delete existing and recreate
			await prisma.mockExamTopicWeight.deleteMany({ where: { courseId } });
			if (parse.data.weights.length > 0) {
				await prisma.mockExamTopicWeight.createMany({
					data: parse.data.weights.map(w => ({
						courseId,
						volumeId: w.volumeId,
						session: w.session,
						weightMin: w.weightMin,
						weightMax: w.weightMax
					}))
				});
			}
			const weights = await prisma.mockExamTopicWeight.findMany({
				where: { courseId },
				include: { volume: true },
				orderBy: [{ session: 'asc' }, { createdAt: 'asc' }]
			});
			return res.json({ weights });
		} catch (err) {
			console.error('Save weights error:', err);
			return res.status(500).json({ error: 'Failed to save weights' });
		}
	});

	// Student: Get mock exam eligible courses (enrolled courses that have topic weights configured)
	router.get('/mock/eligible-courses', requireAuth(), async (req, res) => {
		try {
			const enrollments = await prisma.enrollment.findMany({
				where: {
					userId: req.user.id,
					status: { not: 'CANCELLED' },
					course: { active: true }
				},
				include: { course: true }
			});
			const courseIds = enrollments.map(e => e.courseId);
			// Only include courses that have topic weights configured
			const coursesWithWeights = await prisma.mockExamTopicWeight.findMany({
				where: { courseId: { in: courseIds } },
				select: { courseId: true },
				distinct: ['courseId']
			});
			const eligibleIds = new Set(coursesWithWeights.map(c => c.courseId));
			const courses = enrollments
				.filter(e => eligibleIds.has(e.courseId))
				.map(e => ({
					...e.course,
					enrollmentStatus: e.status
				}));
			return res.json({ courses });
		} catch (err) {
			return res.status(500).json({ error: 'Failed to fetch eligible courses' });
		}
	});

	// Student: Create a mock exam
	router.post('/mock/create', requireAuth(), async (req, res) => {
		const schema = z.object({ courseId: z.string() });
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

		try {
			const { courseId } = parse.data;
			const course = await prisma.course.findUnique({ where: { id: courseId } });
			if (!course) return res.status(404).json({ error: 'Course not found' });

			// Check enrollment
			const enrolled = await prisma.enrollment.findUnique({
				where: { userId_courseId: { userId: req.user.id, courseId } }
			});
			if (!enrolled || enrolled.status === 'CANCELLED') {
				return res.status(403).json({ error: 'Not enrolled in this course' });
			}

			// Check no in-progress mock exists
			const existing = await prisma.mockExam.findFirst({
				where: { userId: req.user.id, courseId, status: { notIn: ['COMPLETED', 'CANCELLED'] } }
			});
			if (existing) return res.status(400).json({ error: 'You already have an active mock exam for this course', mockExamId: existing.id });

			const level = course.level || 'LEVEL1';
			const defaults = MOCK_DEFAULTS[level] || MOCK_DEFAULTS.LEVEL1;

			// Get topic weights
			const weights = await prisma.mockExamTopicWeight.findMany({
				where: { courseId },
				include: { volume: { include: { modules: { include: { topics: true } } } } }
			});
			if (weights.length === 0) return res.status(400).json({ error: 'Mock exam topic weights not configured for this course' });

			// Build topic pool: map volumeId -> array of topic IDs
			const volumeTopicMap = {};
			for (const w of weights) {
				const topicIds = (w.volume?.modules || []).flatMap(m => (m.topics || []).map(t => t.id));
				volumeTopicMap[w.volumeId] = topicIds;
			}

			// Select questions per session based on weights
			async function selectQuestionsForSession(sessionNum, totalQuestions, questionType) {
				const sessionWeights = weights.filter(w => w.session === sessionNum);
				if (sessionWeights.length === 0) return [];

				const allQuestionIds = [];
				for (const sw of sessionWeights) {
					const midWeight = (sw.weightMin + sw.weightMax) / 2 / 100;
					const targetCount = Math.max(1, Math.round(totalQuestions * midWeight));
					const topicIds = volumeTopicMap[sw.volumeId] || [];
					if (topicIds.length === 0) continue;

					// Fetch questions from this volume's topics
					let where = { topicId: { in: topicIds }, parentId: null };
					if (questionType === 'MCQ') {
						where.type = 'MCQ';
					} else if (questionType === 'VIGNETTE_MCQ') {
						where.type = 'VIGNETTE_MCQ';
					} else if (questionType === 'CONSTRUCTED_RESPONSE') {
						where.OR = [{ type: 'CONSTRUCTED_RESPONSE', parentId: null }];
					}

					const questions = await prisma.question.findMany({
						where,
						select: { id: true, type: true },
						take: targetCount * 3 // fetch extra for shuffling
					});

					// For vignettes/bundles, each parent is one "logical" question
					shuffleInPlace(questions);
					const selected = questions.slice(0, targetCount);
					for (const q of selected) {
						allQuestionIds.push(q.id);
						// For vignette/bundle parents, also add children
						if (q.type === 'VIGNETTE_MCQ' || q.type === 'CONSTRUCTED_RESPONSE') {
							const children = await prisma.question.findMany({
								where: { parentId: q.id },
								select: { id: true },
								orderBy: { orderIndex: 'asc' }
							});
							for (const c of children) allQuestionIds.push(c.id);
						}
					}
				}
				return allQuestionIds;
			}

			let s1Ids, s2Ids, s1Minutes, s2Minutes;

			if (level === 'LEVEL3') {
				s1Ids = await selectQuestionsForSession(1, defaults.session1Questions, defaults.session1Type);
				s2Ids = await selectQuestionsForSession(2, defaults.session2Questions, defaults.session2Type);
				s1Minutes = defaults.session1Minutes;
				s2Minutes = defaults.session2Minutes;
			} else {
				s1Ids = await selectQuestionsForSession(1, defaults.questionsPerSession, defaults.questionType);
				s2Ids = await selectQuestionsForSession(2, defaults.questionsPerSession, defaults.questionType);
				s1Minutes = defaults.session1Minutes;
				s2Minutes = defaults.session2Minutes;
			}

			if (s1Ids.length === 0 && s2Ids.length === 0) {
				return res.status(400).json({ error: 'Not enough questions in the question bank to create a mock exam' });
			}

			// Create session 1 exam
			const exam1 = s1Ids.length > 0 ? await prisma.exam.create({
				data: {
					name: `${course.name} Mock - Session 1`,
					level: course.level,
					timeLimitMinutes: s1Minutes,
					type: 'MOCK',
					active: true,
					createdById: req.user.id
				}
			}) : null;
			if (exam1 && s1Ids.length > 0) {
				await prisma.examQuestion.createMany({
					data: s1Ids.map((qid, idx) => ({ examId: exam1.id, questionId: qid, order: idx + 1 }))
				});
			}

			// Create session 2 exam
			const exam2 = s2Ids.length > 0 ? await prisma.exam.create({
				data: {
					name: `${course.name} Mock - Session 2`,
					level: course.level,
					timeLimitMinutes: s2Minutes,
					type: 'MOCK',
					active: true,
					createdById: req.user.id
				}
			}) : null;
			if (exam2 && s2Ids.length > 0) {
				await prisma.examQuestion.createMany({
					data: s2Ids.map((qid, idx) => ({ examId: exam2.id, questionId: qid, order: idx + 1 }))
				});
			}

			// Create MockExam parent record
			const mockExam = await prisma.mockExam.create({
				data: {
					userId: req.user.id,
					courseId,
					session1ExamId: exam1?.id || null,
					session2ExamId: exam2?.id || null,
					breakMinutes: defaults.breakMinutes,
					session1Minutes: s1Minutes,
					session2Minutes: s2Minutes,
					status: 'PENDING'
				}
			});

			return res.status(201).json({
				mockExam,
				session1QuestionCount: s1Ids.length,
				session2QuestionCount: s2Ids.length
			});
		} catch (err) {
			console.error('Mock exam creation error:', err);
			return res.status(500).json({ error: 'Failed to create mock exam' });
		}
	});

	// Student: Get my mock exams
	router.get('/mock/me', requireAuth(), async (req, res) => {
		try {
			const mockExams = await prisma.mockExam.findMany({
				where: { userId: req.user.id },
				include: {
					course: { select: { id: true, name: true, level: true } },
					session1Exam: { select: { id: true, name: true, timeLimitMinutes: true, examQuestions: { select: { questionId: true } } } },
					session2Exam: { select: { id: true, name: true, timeLimitMinutes: true, examQuestions: { select: { questionId: true } } } }
				},
				orderBy: { createdAt: 'desc' }
			});
			return res.json({ mockExams });
		} catch (err) {
			return res.status(500).json({ error: 'Failed to fetch mock exams' });
		}
	});

	// Student: Get single mock exam detail
	router.get('/mock/:mockExamId', requireAuth(), async (req, res) => {
		try {
			const mockExam = await prisma.mockExam.findUnique({
				where: { id: req.params.mockExamId },
				include: {
					course: { select: { id: true, name: true, level: true } },
					session1Exam: {
						select: {
							id: true, name: true, timeLimitMinutes: true,
							examQuestions: { select: { questionId: true } },
							attempts: { where: { userId: req.user.id }, select: { id: true, status: true, score: true, submittedAt: true }, orderBy: { createdAt: 'desc' }, take: 1 }
						}
					},
					session2Exam: {
						select: {
							id: true, name: true, timeLimitMinutes: true,
							examQuestions: { select: { questionId: true } },
							attempts: { where: { userId: req.user.id }, select: { id: true, status: true, score: true, submittedAt: true }, orderBy: { createdAt: 'desc' }, take: 1 }
						}
					}
				}
			});
			if (!mockExam || mockExam.userId !== req.user.id) return res.status(404).json({ error: 'Mock exam not found' });
			return res.json({ mockExam });
		} catch (err) {
			return res.status(500).json({ error: 'Failed to fetch mock exam' });
		}
	});

	// Student: Start a mock exam session (advances status)
	router.post('/mock/:mockExamId/start-session', requireAuth(), async (req, res) => {
		const sessionSchema = z.object({ session: z.number().int().min(1).max(2) });
		const parse = sessionSchema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

		try {
			const mockExam = await prisma.mockExam.findUnique({ where: { id: req.params.mockExamId } });
			if (!mockExam || mockExam.userId !== req.user.id) return res.status(404).json({ error: 'Mock exam not found' });

			const { session } = parse.data;
			const examId = session === 1 ? mockExam.session1ExamId : mockExam.session2ExamId;
			if (!examId) return res.status(400).json({ error: `Session ${session} not available` });

			// Validate session order
			if (session === 1 && mockExam.status !== 'PENDING' && mockExam.status !== 'SESSION1') {
				return res.status(400).json({ error: 'Session 1 already completed' });
			}
			if (session === 2 && mockExam.status !== 'BREAK' && mockExam.status !== 'SESSION2') {
				return res.status(400).json({ error: 'Complete Session 1 and break first' });
			}

			// Create attempt for this session
			const attempt = await prisma.examAttempt.create({
				data: {
					examId,
					userId: req.user.id,
					status: 'IN_PROGRESS',
					timeRemainingSec: (session === 1 ? mockExam.session1Minutes : mockExam.session2Minutes) * 60
				}
			});

			// Create answer placeholders
			const links = await prisma.examQuestion.findMany({
				where: { examId },
				orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
				select: { questionId: true }
			});
			for (const link of links) {
				await prisma.examAnswer.create({
					data: { attemptId: attempt.id, questionId: link.questionId, flagged: false, timeSpentSec: 0 }
				});
			}

			// Update mock exam status
			const newStatus = session === 1 ? 'SESSION1' : 'SESSION2';
			await prisma.mockExam.update({
				where: { id: mockExam.id },
				data: {
					status: newStatus,
					...(session === 1 && !mockExam.startedAt ? { startedAt: new Date() } : {})
				}
			});

			return res.json({ attempt, examId });
		} catch (err) {
			console.error('Start mock session error:', err);
			return res.status(500).json({ error: 'Failed to start session' });
		}
	});

	// Student: Complete a mock session (called after submitting the session exam)
	router.post('/mock/:mockExamId/complete-session', requireAuth(), async (req, res) => {
		const sessionSchema = z.object({
			session: z.number().int().min(1).max(2),
			score: z.number().optional()
		});
		const parse = sessionSchema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

		try {
			const mockExam = await prisma.mockExam.findUnique({ where: { id: req.params.mockExamId } });
			if (!mockExam || mockExam.userId !== req.user.id) return res.status(404).json({ error: 'Mock exam not found' });

			const { session, score } = parse.data;
			let updateData = {};

			if (session === 1) {
				updateData.status = mockExam.session2ExamId ? 'BREAK' : 'COMPLETED';
				updateData.session1Score = score ?? null;
				if (!mockExam.session2ExamId) {
					updateData.completedAt = new Date();
					updateData.totalScore = score ?? null;
				}
			} else {
				updateData.status = 'COMPLETED';
				updateData.session2Score = score ?? null;
				updateData.completedAt = new Date();
				// Compute total score as average of both sessions
				const s1 = mockExam.session1Score ?? 0;
				const s2 = score ?? 0;
				updateData.totalScore = Math.round(((s1 + s2) / 2) * 10) / 10;
			}

			const updated = await prisma.mockExam.update({
				where: { id: mockExam.id },
				data: updateData
			});

			return res.json({ mockExam: updated });
		} catch (err) {
			console.error('Complete mock session error:', err);
			return res.status(500).json({ error: 'Failed to complete session' });
		}
	});

	// Student: Cancel a mock exam
	router.post('/mock/:mockExamId/cancel', requireAuth(), async (req, res) => {
		try {
			const mockExam = await prisma.mockExam.findUnique({ where: { id: req.params.mockExamId } });
			if (!mockExam || mockExam.userId !== req.user.id) return res.status(404).json({ error: 'Mock exam not found' });
			if (mockExam.status === 'COMPLETED') return res.status(400).json({ error: 'Cannot cancel completed mock exam' });

			await prisma.mockExam.update({
				where: { id: mockExam.id },
				data: { status: 'CANCELLED', completedAt: new Date() }
			});
			return res.json({ ok: true });
		} catch (err) {
			return res.status(500).json({ error: 'Failed to cancel mock exam' });
		}
	});

	return router;
}


