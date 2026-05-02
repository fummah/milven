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
      conceptIds: z.array(z.string()).optional(),
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
      
      const conceptIdList = Array.isArray(payload.conceptIds) ? payload.conceptIds.filter(Boolean) : [];
      const where = {
        AND: [
          payload.courseId ? { courseId: payload.courseId } : {},
          payload.volumeId ? { volumeId: payload.volumeId } : {},
          payload.moduleId ? { moduleId: payload.moduleId } : {},
          topicIdList.length > 0 ? { OR: [{ topicId: { in: topicIdList } }, { topics: { some: { id: { in: topicIdList } } } }] } : {},
          conceptIdList.length > 0 ? { concepts: { some: { id: { in: conceptIdList } } } } : {},
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
				topicIdList.length > 0 ? { OR: [{ topicId: { in: topicIdList } }, { topics: { some: { id: { in: topicIdList } } } }] } : {},
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
				payload.topicId ? { OR: [{ topicId: payload.topicId }, { topics: { some: { id: payload.topicId } } }] } : {},
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
    // Cascade delete all related entities in correct order
    try {
      await prisma.$transaction(async (tx) => {
        // 1. Delete all answers for all attempts of this exam
        const attempts = await tx.examAttempt.findMany({ where: { examId }, select: { id: true } });
        const attemptIds = attempts.map(a => a.id);
        if (attemptIds.length > 0) {
          await tx.examAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
        }
        // 2. Delete all attempts
        await tx.examAttempt.deleteMany({ where: { examId } });
        // 3. Delete exam-question links
        await tx.examQuestion.deleteMany({ where: { examId } });
        // 4. Nullify mock exam references
        await tx.mockExam.updateMany({ where: { session1ExamId: examId }, data: { session1ExamId: null } });
        await tx.mockExam.updateMany({ where: { session2ExamId: examId }, data: { session2ExamId: null } });
        // 5. Delete the exam itself
        await tx.exam.delete({ where: { id: examId } });
      });
      return res.json({ ok: true });
    } catch (err) {
      console.error('[exam-delete] Failed:', err.message);
      return res.status(500).json({ error: 'Failed to delete exam. ' + (err.message || '') });
    }
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
		// NOTE: Auto-completion removed. Only admins can mark a course as completed via PUT /users/:id/enrollments/:courseId
		return res.json({ attempt: updated });
	});

	// Set marking preference for an attempt (SELF or ADMIN)
	router.post('/attempts/:attemptId/marking-preference', requireAuth(), async (req, res) => {
		const schema = z.object({ preference: z.enum(['SELF', 'ADMIN']) });
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: 'Invalid preference' });

		const attempt = await prisma.examAttempt.findUnique({ where: { id: req.params.attemptId } });
		if (!attempt || attempt.userId !== req.user.id) return res.status(404).json({ error: 'Attempt not found' });
		if (attempt.status !== 'SUBMITTED') return res.status(400).json({ error: 'Attempt must be submitted first' });

		const updated = await prisma.examAttempt.update({
			where: { id: req.params.attemptId },
			data: { markingPreference: parse.data.preference }
		});
		return res.json({ attempt: updated });
	});

	// Student self-grade: award marks for constructed response answers
	router.post('/attempts/:attemptId/self-grade', requireAuth(), async (req, res) => {
		const schema = z.object({
			grades: z.array(z.object({
				answerId: z.string(),
				marksAwarded: z.number().int().min(0)
			}))
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: 'Invalid grades' });

		const attempt = await prisma.examAttempt.findUnique({
			where: { id: req.params.attemptId },
			include: { answers: { include: { question: { select: { type: true, marks: true } } } } }
		});
		if (!attempt || attempt.userId !== req.user.id) return res.status(404).json({ error: 'Attempt not found' });
		if (attempt.markingPreference !== 'SELF') return res.status(400).json({ error: 'This attempt is not set for self-marking' });

		// Apply grades
		for (const { answerId, marksAwarded } of parse.data.grades) {
			const answer = attempt.answers.find(a => a.id === answerId);
			if (!answer) continue;
			if (answer.question?.type !== 'CONSTRUCTED_RESPONSE') continue;
			const maxMarks = answer.question?.marks || 10;
			await prisma.examAnswer.update({
				where: { id: answerId },
				data: { marksAwarded: Math.min(marksAwarded, maxMarks) }
			});
		}

		// Recompute score
		const scorePercent = await computeAttemptScorePercent(req.params.attemptId);
		const updated = await prisma.examAttempt.update({
			where: { id: req.params.attemptId },
			data: { scorePercent }
		});
		return res.json({ attempt: updated });
	});

	// List attempts pending marking (admin): submitted attempts with ≥1 constructed answer where marksAwarded is null
	// Only show attempts where student chose admin marking (or legacy null preference)
	router.get('/attempts/pending-marking', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const attempts = await prisma.examAttempt.findMany({
			where: {
				status: 'SUBMITTED',
				OR: [{ markingPreference: 'ADMIN' }, { markingPreference: null }],
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

	// Attempt analytics (hierarchical Volume → Module → Topic breakdown)
	router.get('/attempts/:attemptId/analytics', requireAuth(), async (req, res) => {
		const { attemptId } = req.params;
		const attempt = await prisma.examAttempt.findUnique({
			where: { id: attemptId },
			include: {
				answers: {
					include: {
						question: {
							include: {
								topic: {
									include: {
										module: {
											include: { volume: true }
										}
									}
								}
							}
						}
					}
				}
			}
		});
		if (!attempt || attempt.userId !== req.user.id) return res.status(404).json({ error: 'Attempt not found' });

		// Build hierarchical tree: Volume → Module → Topic
		const volumeMap = new Map(); // volumeId -> { name, modules: Map<moduleId, { name, topics: Map<topicName, {correct, total}> }> }

		for (const a of attempt.answers) {
			const topic = a.question?.topic;
			const mod = topic?.module;
			const vol = mod?.volume;

			const volumeId = vol?.id || 'unknown';
			const volumeName = vol?.name || 'Unknown Volume';
			const moduleId = mod?.id || 'unknown';
			const moduleName = mod?.name || 'Unknown Module';
			const topicName = topic?.name || 'Unknown Topic';
			const topicId = topic?.id || 'unknown';

			if (!volumeMap.has(volumeId)) {
				volumeMap.set(volumeId, { id: volumeId, name: volumeName, correct: 0, total: 0, modules: new Map() });
			}
			const volEntry = volumeMap.get(volumeId);

			if (!volEntry.modules.has(moduleId)) {
				volEntry.modules.set(moduleId, { id: moduleId, name: moduleName, correct: 0, total: 0, topics: new Map() });
			}
			const modEntry = volEntry.modules.get(moduleId);

			if (!modEntry.topics.has(topicId)) {
				modEntry.topics.set(topicId, { id: topicId, name: topicName, correct: 0, total: 0 });
			}
			const topicEntry = modEntry.topics.get(topicId);

			topicEntry.total += 1;
			modEntry.total += 1;
			volEntry.total += 1;

			if (a.isCorrect) {
				topicEntry.correct += 1;
				modEntry.correct += 1;
				volEntry.correct += 1;
			}
		}

		// Convert to serializable structure
		const tree = Array.from(volumeMap.values()).map(vol => ({
			id: vol.id,
			name: vol.name,
			correct: vol.correct,
			total: vol.total,
			percent: vol.total ? Math.round((vol.correct / vol.total) * 100) : 0,
			modules: Array.from(vol.modules.values()).map(mod => ({
				id: mod.id,
				name: mod.name,
				correct: mod.correct,
				total: mod.total,
				percent: mod.total ? Math.round((mod.correct / mod.total) * 100) : 0,
				topics: Array.from(mod.topics.values()).map(t => ({
					id: t.id,
					name: t.name,
					correct: t.correct,
					total: t.total,
					percent: t.total ? Math.round((t.correct / t.total) * 100) : 0
				}))
			}))
		}));

		// Also keep flat byTopic for backward compatibility
		const flatTopicMap = new Map();
		for (const a of attempt.answers) {
			const topicName = a.question.topic?.name ?? 'Unknown';
			if (!flatTopicMap.has(topicName)) flatTopicMap.set(topicName, { correct: 0, total: 0 });
			const agg = flatTopicMap.get(topicName);
			agg.total += 1;
			if (a.isCorrect) agg.correct += 1;
		}
		const byTopic = Array.from(flatTopicMap.entries()).map(([topic, v]) => ({
			topic, correct: v.correct, total: v.total, percent: (v.correct / (v.total || 1)) * 100
		}));

		return res.json({ byTopic, tree });
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
		LEVEL1: { sessions: 2, session1Minutes: 135, session2Minutes: 135, breakMinutes: 30, questionsPerSession: 90, questionType: 'MCQ' },
		LEVEL2: { sessions: 2, session1Minutes: 132, session2Minutes: 132, breakMinutes: 30, itemSetsPerSession: 11, questionType: 'VIGNETTE_MCQ' },
		LEVEL3: { sessions: 2, session1Minutes: 132, session2Minutes: 132, breakMinutes: 30, totalItemSets: 11, marksPerItemSet: 12, questionType: 'MIXED_VIGNETTE' }
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
				session: z.number().int().min(0).max(2),
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

	// Student: Get mock exam weight breakdown for a course (for instruction page)
	router.get('/mock/weight-breakdown/:courseId', requireAuth(), async (req, res) => {
		try {
			const { courseId } = req.params;
			const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, level: true, examConditions: true } });
			if (!course) return res.status(404).json({ error: 'Course not found' });

			const level = course.level || 'LEVEL1';
			const defaults = MOCK_DEFAULTS[level] || MOCK_DEFAULTS.LEVEL1;

			const weights = await prisma.mockExamTopicWeight.findMany({
				where: { courseId },
				include: { volume: { select: { id: true, name: true, description: true } } },
				orderBy: [{ session: 'asc' }, { createdAt: 'asc' }]
			});

			let breakdown;
			if (defaults.sessions === 2 && (defaults.questionsPerSession || defaults.itemSetsPerSession || defaults.totalItemSets)) {
				// L1/L2/L3: weights are % of total. Compute per-session targets.
				// L1: 90 per session (180 total), L2: 11 per session (22 total), L3: 11 total (5+6 split)
				const totalTarget = defaults.questionsPerSession ? defaults.questionsPerSession * 2
					: defaults.itemSetsPerSession ? defaults.itemSetsPerSession * 2
					: defaults.totalItemSets || 11;
				const perSession = Math.ceil(totalTarget / 2);

				// For each weight, compute raw target from the full total
				const raw = weights.map(w => {
					const mid = (w.weightMin + w.weightMax) / 2;
					return { ...w, rawTarget: Math.max(1, Math.round((mid / 100) * totalTarget)) };
				});

				// Group by session to normalize each session to exactly perSession
				const sessions = { 1: [], 2: [], 0: [] };
				for (const r of raw) sessions[r.session ?? 0]?.push(r) || sessions[0].push(r);

				// Unassigned (session=0) volumes split evenly: half to S1, half to S2
				for (const r of sessions[0]) {
					const s1Half = Math.ceil(r.rawTarget / 2);
					sessions[1].push({ ...r, rawTarget: s1Half, session: 1 });
					sessions[2].push({ ...r, rawTarget: r.rawTarget - s1Half, session: 2 });
				}

				// Normalize each session so targets sum to exactly perSession
				const normalizeSession = (items, target) => {
					const rawSum = items.reduce((s, i) => s + i.rawTarget, 0);
					if (rawSum === 0 || items.length === 0) return items;
					let assigned = items.map(i => ({ ...i, estQuestions: Math.max(1, Math.round((i.rawTarget / rawSum) * target)) }));
					let sum = assigned.reduce((s, i) => s + i.estQuestions, 0);
					// Adjust the largest bucket to hit exact target
					while (sum !== target && assigned.length > 0) {
						assigned.sort((a, b) => b.estQuestions - a.estQuestions);
						assigned[0].estQuestions += (target - sum > 0 ? 1 : -1);
						sum = assigned.reduce((s, i) => s + i.estQuestions, 0);
					}
					return assigned;
				};

				const s1Norm = normalizeSession(sessions[1], perSession);
				const s2Norm = normalizeSession(sessions[2], perSession);

				// For L1: return per-session breakdown (frontend shows separate session tables)
				// For L2/L3: aggregate by volume to avoid duplicates (frontend shows single table)
				if (level === 'LEVEL1') {
					breakdown = [...s1Norm, ...s2Norm].map(w => ({
						volumeId: w.volumeId,
						volumeName: w.volume?.description ? `${w.volume.description} (${w.volume.name})` : (w.volume?.name || 'Unknown'),
						session: w.session,
						weightMin: w.weightMin,
						weightMax: w.weightMax,
						estimatedQuestions: w.estQuestions
					}));
				} else {
					// Aggregate by volumeId for L2/L3
					const volumeMap = new Map();
					for (const w of [...s1Norm, ...s2Norm]) {
						const vid = w.volumeId;
						if (!volumeMap.has(vid)) {
							volumeMap.set(vid, {
								volumeId: vid,
								volumeName: w.volume?.description ? `${w.volume.description} (${w.volume.name})` : (w.volume?.name || 'Unknown'),
								weightMin: w.weightMin,
								weightMax: w.weightMax,
								estimatedQuestions: 0
							});
						}
						volumeMap.get(vid).estimatedQuestions += w.estQuestions;
					}
					breakdown = Array.from(volumeMap.values());
				}
			} else {
				// L3 or single-session: simple calculation
				const totalQuestions = defaults.totalQuestions || 55;
				breakdown = weights.map(w => {
					const midWeight = (w.weightMin + w.weightMax) / 2 / 100;
					const estQuestions = Math.max(1, Math.round(totalQuestions * midWeight));
					return {
						volumeId: w.volumeId,
						volumeName: w.volume?.description ? `${w.volume.description} (${w.volume.name})` : (w.volume?.name || 'Unknown'),
						session: w.session,
						weightMin: w.weightMin,
						weightMax: w.weightMax,
						estimatedQuestions: estQuestions
					};
				});
			}

			return res.json({ course, defaults, breakdown });
		} catch (err) {
			console.error('Weight breakdown error:', err);
			return res.status(500).json({ error: 'Failed to fetch weight breakdown' });
		}
	});

	// Student: Get mock exam eligible courses (enrolled courses that have topic weights configured)
	router.get('/mock/eligible-courses', requireAuth(), async (req, res) => {
		try {
			// Step 1: Get all enrollments for this user (any status)
			const enrollments = await prisma.enrollment.findMany({
				where: {
					userId: req.user.id
				},
				include: { course: true },
				orderBy: { createdAt: 'desc' }
			});
			console.log(`[eligible-courses] User ${req.user.id}: ${enrollments.length} enrollments found`);

			// Step 2: Get all courses that have mock exam weights configured (regardless of enrollment)
			const allWeights = await prisma.mockExamTopicWeight.findMany({
				select: { courseId: true },
				distinct: ['courseId']
			});
			const allWeightCourseIds = new Set(allWeights.map(w => w.courseId));
			console.log(`[eligible-courses] Courses with weights: ${[...allWeightCourseIds].join(', ')}`);

			// Step 3: Filter enrolled courses that have weights
			const courses = enrollments
				.filter(e => allWeightCourseIds.has(e.courseId))
				.map(e => ({
					...e.course,
					enrollmentStatus: e.status,
					enrolledAt: e.createdAt
				}));

			if (courses.length === 0 && enrollments.length > 0) {
				const enrolledCourseIds = enrollments.map(e => e.courseId);
				console.log(`[eligible-courses] No match. Enrolled courseIds: ${enrolledCourseIds.join(', ')} | Weighted courseIds: ${[...allWeightCourseIds].join(', ')}`);
			}

			return res.json({ courses });
		} catch (err) {
			console.error('[eligible-courses] Error:', err);
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
			if (!course) return res.status(404).json({ error: 'Course not found', advice: 'Please go back and select a valid course.' });

			// Check enrollment (any status counts)
			const enrolled = await prisma.enrollment.findUnique({
				where: { userId_courseId: { userId: req.user.id, courseId } }
			});
			if (!enrolled) {
				return res.status(403).json({ error: 'You are not enrolled in this course.', advice: 'Please enrol in the course first, then try creating a mock exam again.' });
			}

			// Check no in-progress mock exists
			const existing = await prisma.mockExam.findFirst({
				where: { userId: req.user.id, courseId, status: { notIn: ['COMPLETED', 'CANCELLED'] } }
			});
			if (existing) return res.status(400).json({ error: 'You already have an active mock exam for this course.', advice: 'Please complete or cancel your existing mock exam before creating a new one.', mockExamId: existing.id });

			const level = course.level || 'LEVEL1';
			const defaults = MOCK_DEFAULTS[level] || MOCK_DEFAULTS.LEVEL1;

			// Get topic weights
			const allWeights = await prisma.mockExamTopicWeight.findMany({
				where: { courseId },
				include: { volume: { include: { modules: { include: { topics: true } } } } }
			});
			if (allWeights.length === 0) return res.status(400).json({ error: 'Mock exam topic weights have not been configured for this course yet.', advice: 'Please contact your course administrator to set up mock exam weights.' });

			// Pathway filtering: if student has a pathwayVolumeId, exclude other pathway volumes
			// For courses with pathway volumes, REQUIRE the student to have a pathway selected
			const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { pathwayVolumeId: true } });
			const hasPathwayVolumes = allWeights.some(w => w.volume?.isPathway);
			if (hasPathwayVolumes && !user?.pathwayVolumeId) {
				return res.status(400).json({
					error: 'You must select a pathway before creating a mock exam for this course.',
					advice: 'Please go to your Profile and choose your pathway, then try again.',
					code: 'PATHWAY_REQUIRED'
				});
			}
			const weights = allWeights.filter(w => {
				if (!w.volume?.isPathway) return true; // non-pathway volumes always included
				if (!user?.pathwayVolumeId) return true; // no preference set -> include all (shouldn't reach here with enforcement above)
				return w.volumeId === user.pathwayVolumeId; // only include student's chosen pathway
			});
			if (weights.length === 0) return res.status(400).json({ error: 'No topic weights match your pathway selection.', advice: 'Please check your pathway setting in your profile.' });

			// Build topic pool: map volumeId -> array of topic IDs
			const volumeTopicMap = {};
			for (const w of weights) {
				const topicIds = (w.volume?.modules || []).flatMap(m => (m.topics || []).map(t => t.id));
				volumeTopicMap[w.volumeId] = topicIds;
			}

			// Select questions based on weights, respecting target count and deduplicating
			async function selectWeightedQuestions(weightRows, totalQuestions, questionType, excludeIds = new Set(), { childrenPerItem = null } = {}) {
				if (weightRows.length === 0) return [];

				// Step 1: Calculate proportional target per weight row
				const totalWeight = weightRows.reduce((sum, sw) => sum + (sw.weightMin + sw.weightMax) / 2, 0);
				const weightTargets = weightRows.map(sw => {
					const midWeight = (sw.weightMin + sw.weightMax) / 2;
					const proportion = totalWeight > 0 ? midWeight / totalWeight : 1 / weightRows.length;
					return { ...sw, target: Math.max(1, Math.round(totalQuestions * proportion)) };
				});

				// Step 2: Fetch and select questions per weight row
				const usedIds = new Set(excludeIds);
				const selectedParents = []; // { id, type } for each selected parent question

				for (const sw of weightTargets) {
					const topicIds = volumeTopicMap[sw.volumeId] || [];
					if (topicIds.length === 0) continue;

					let where = { topicId: { in: topicIds }, parentId: null, id: { notIn: [...usedIds] } };
					if (questionType === 'MCQ') {
						where.type = 'MCQ';
					} else if (questionType === 'VIGNETTE_MCQ') {
						where.type = 'VIGNETTE_MCQ';
					} else if (questionType === 'CONSTRUCTED_RESPONSE') {
						where.type = 'CONSTRUCTED_RESPONSE';
					} else if (questionType === 'MIXED_VIGNETTE') {
						where.type = { in: ['VIGNETTE_MCQ', 'CONSTRUCTED_RESPONSE'] };
					}

					// If childrenPerItem is set, only select parents that have enough children
					const includeChildren = childrenPerItem ? { _count: { select: { children: true } } } : {};
					const available = await prisma.question.findMany({
						where,
						select: { id: true, type: true, ...includeChildren }
					});

					// Filter: only parents with at least childrenPerItem children
					const filtered = childrenPerItem
						? available.filter(q => (q._count?.children || 0) >= childrenPerItem)
						: available;

					shuffleInPlace(filtered);
					// Take up to target, or all available if fewer
					const picked = filtered.slice(0, sw.target);
					for (const q of picked) {
						usedIds.add(q.id);
						selectedParents.push(q);
					}
				}

				// Step 3: If we have more than totalQuestions, trim; if fewer, that's all we have
				shuffleInPlace(selectedParents);
				const finalParents = selectedParents.slice(0, totalQuestions);

				// Step 4: Build final ID list — for vignette/bundle parents, include ONLY children
				// (children reference parent via relation, so frontend gets vignetteText from question.parent)
				const allQuestionIds = [];
				for (const q of finalParents) {
					if (q.type === 'VIGNETTE_MCQ' || q.type === 'CONSTRUCTED_RESPONSE') {
						const children = await prisma.question.findMany({
							where: { parentId: q.id },
							select: { id: true },
							orderBy: { orderIndex: 'asc' }
						});
						// If childrenPerItem is set, take exactly that many; otherwise take all
						const childSlice = childrenPerItem ? children.slice(0, childrenPerItem) : children;
						for (const c of childSlice) allQuestionIds.push(c.id);
					} else {
						allQuestionIds.push(q.id);
					}
				}
				return allQuestionIds;
			}

			let s1Ids = [], s2Ids = [], s1Minutes = 0, s2Minutes = 0;

			if (level === 'LEVEL3') {
				// L3: Two sessions — 11 total item sets (case studies), split 6+5 or 5+6
				// Each item set is a parent question (VIGNETTE_MCQ or CONSTRUCTED_RESPONSE) with children
				// Mixed: some item sets are vignette MCQ bundles, some are constructed response (essay) bundles
				const totalItemSets = defaults.totalItemSets || 11;
				const allItemSetIds = await selectWeightedQuestions(weights, totalItemSets, defaults.questionType, new Set());

				// allItemSetIds contains child question IDs — group by parentId
				const allQs = await prisma.question.findMany({
					where: { id: { in: allItemSetIds } },
					select: { id: true, parentId: true }
				});
				const qMap = new Map(allQs.map(q => [q.id, q]));
				const groupMap = new Map();
				const groupOrder = [];
				for (const id of allItemSetIds) {
					const q = qMap.get(id);
					const pid = q?.parentId;
					if (!pid) continue;
					if (!groupMap.has(pid)) { groupMap.set(pid, []); groupOrder.push(pid); }
					groupMap.get(pid).push(id);
				}
				const itemSetGroups = groupOrder.map(pid => groupMap.get(pid));
				shuffleInPlace(itemSetGroups);

				// Split: session 1 gets 6 (or 5), session 2 gets 5 (or 6)
				const s1ItemSets = Math.min(6, itemSetGroups.length);
				const s1Groups = itemSetGroups.slice(0, s1ItemSets);
				const s2Groups = itemSetGroups.slice(s1ItemSets);

				s1Ids = s1Groups.flat();
				s2Ids = s2Groups.flat();
				s1Minutes = defaults.session1Minutes;
				s2Minutes = defaults.session2Minutes;

				console.log(`[mock-create] L3: ${itemSetGroups.length} item sets total — S1=${s1Groups.length} (${s1Ids.length} Qs), S2=${s2Groups.length} (${s2Ids.length} Qs)`);
			} else if (level === 'LEVEL2') {
				// L2: Two sessions of 11 vignette item sets each (22 total), 132 min each
				// All topics can appear in either or both sessions
				// Each item set = 1 vignette parent + exactly 4 child sub-questions
				const totalItemSets = (defaults.itemSetsPerSession || 11) * 2;
				const allItemSetIds = await selectWeightedQuestions(weights, totalItemSets, defaults.questionType, new Set(), { childrenPerItem: 4 });

				// allItemSetIds contains only child question IDs (parents excluded)
				// Group children by their parentId to form item set groups
				const allQs = await prisma.question.findMany({
					where: { id: { in: allItemSetIds } },
					select: { id: true, parentId: true }
				});
				const qMap = new Map(allQs.map(q => [q.id, q]));

				// Group by parentId, preserving order within each group
				const groupMap = new Map(); // parentId -> [childId, ...]
				const groupOrder = []; // track insertion order of parentIds
				for (const id of allItemSetIds) {
					const q = qMap.get(id);
					const pid = q?.parentId;
					if (!pid) continue; // skip any orphan
					if (!groupMap.has(pid)) {
						groupMap.set(pid, []);
						groupOrder.push(pid);
					}
					groupMap.get(pid).push(id);
				}
				const itemSetGroups = groupOrder.map(pid => groupMap.get(pid));

				// Validate item set count
				console.log(`[mock-create] L2: Found ${itemSetGroups.length} item set groups from ${allItemSetIds.length} total IDs (target: ${totalItemSets} item sets)`);
				if (itemSetGroups.length < totalItemSets) {
					console.warn(`[mock-create] L2: Only ${itemSetGroups.length} vignette item sets available (need ${totalItemSets}). The question bank may not have enough qualifying vignettes with ${4} sub-questions each.`);
				}

				// Shuffle and split into 2 sessions of exactly perSession each
				shuffleInPlace(itemSetGroups);
				const perSession = defaults.itemSetsPerSession || 11;
				const s1Groups = itemSetGroups.slice(0, perSession);
				const s2Groups = itemSetGroups.slice(perSession, perSession * 2);

				s1Ids = s1Groups.flat();
				s2Ids = s2Groups.flat();
				s1Minutes = defaults.session1Minutes;
				s2Minutes = defaults.session2Minutes;

				console.log(`[mock-create] L2 sessions: S1=${s1Groups.length} item sets (${s1Ids.length} Qs), S2=${s2Groups.length} item sets (${s2Ids.length} Qs)`);
			} else {
				// L1: Two sessions of 90 MCQs each (180 total), 135 min each
				// IMPORTANT: Volume weight percentages apply to the TOTAL of 180 questions.
				// We normalize per-session targets so each session sums to exactly 90.
				const perSession = defaults.questionsPerSession || 90;
				const totalTarget = perSession * 2; // 180
				const usedIds = new Set();

				// Helper: pick N MCQ parents from a volume's topics, excluding already-used IDs
				const pickFromVolume = async (volumeId, count) => {
					if (count <= 0) return [];
					const topicIds = volumeTopicMap[volumeId] || [];
					if (topicIds.length === 0) return [];
					const available = await prisma.question.findMany({
						where: { topicId: { in: topicIds }, parentId: null, type: 'MCQ', id: { notIn: [...usedIds] } },
						select: { id: true }
					});
					shuffleInPlace(available);
					const picked = available.slice(0, count).map(q => q.id);
					for (const id of picked) usedIds.add(id);
					return picked;
				};

				// Helper: pick N MCQ questions from ALL course topics (for padding)
				const allCourseTopicIds = Object.values(volumeTopicMap).flat();
				const pickFromPool = async (count) => {
					if (count <= 0) return [];
					const available = await prisma.question.findMany({
						where: { topicId: { in: allCourseTopicIds }, parentId: null, type: 'MCQ', id: { notIn: [...usedIds] } },
						select: { id: true }
					});
					shuffleInPlace(available);
					const picked = available.slice(0, count).map(q => q.id);
					for (const id of picked) usedIds.add(id);
					return picked;
				};

				// Compute raw volume targets from 180 total
				const rawTargets = weights.map(w => {
					const mid = (w.weightMin + w.weightMax) / 2;
					return { ...w, rawTarget: Math.max(1, Math.round((mid / 100) * totalTarget)) };
				});

				// Split by session and split unassigned volumes evenly
				const s1Weights = [], s2Weights = [];
				for (const vt of rawTargets) {
					if (vt.session === 1) {
						s1Weights.push({ ...vt });
					} else if (vt.session === 2) {
						s2Weights.push({ ...vt });
					} else {
						const s1Half = Math.ceil(vt.rawTarget / 2);
						s1Weights.push({ ...vt, rawTarget: s1Half });
						s2Weights.push({ ...vt, rawTarget: vt.rawTarget - s1Half });
					}
				}

				// Normalize each session's targets so they sum to exactly perSession (90)
				const normalizeTargets = (items, target) => {
					const rawSum = items.reduce((s, i) => s + i.rawTarget, 0);
					if (rawSum === 0 || items.length === 0) return items;
					let assigned = items.map(i => ({ ...i, normalizedTarget: Math.max(1, Math.round((i.rawTarget / rawSum) * target)) }));
					let sum = assigned.reduce((s, i) => s + i.normalizedTarget, 0);
					while (sum !== target && assigned.length > 0) {
						assigned.sort((a, b) => b.normalizedTarget - a.normalizedTarget);
						assigned[0].normalizedTarget += (target - sum > 0 ? 1 : -1);
						sum = assigned.reduce((s, i) => s + i.normalizedTarget, 0);
					}
					return assigned;
				};

				const s1Norm = normalizeTargets(s1Weights, perSession);
				const s2Norm = normalizeTargets(s2Weights, perSession);

				console.log(`[mock-create] L1 S1 normalized targets:`, s1Norm.map(v => `vol=${v.volumeId} target=${v.normalizedTarget}`));
				console.log(`[mock-create] L1 S2 normalized targets:`, s2Norm.map(v => `vol=${v.volumeId} target=${v.normalizedTarget}`));

				// Pick questions per volume for each session
				const s1Selected = [];
				for (const vt of s1Norm) {
					s1Selected.push(...await pickFromVolume(vt.volumeId, vt.normalizedTarget));
				}
				const s2Selected = [];
				for (const vt of s2Norm) {
					s2Selected.push(...await pickFromVolume(vt.volumeId, vt.normalizedTarget));
				}

				// Pad shortfall from general pool if a volume didn't have enough questions
				if (s1Selected.length < perSession) {
					console.log(`[mock-create] L1 S1 shortfall: ${perSession - s1Selected.length} — padding from pool`);
					s1Selected.push(...await pickFromPool(perSession - s1Selected.length));
				}
				if (s2Selected.length < perSession) {
					console.log(`[mock-create] L1 S2 shortfall: ${perSession - s2Selected.length} — padding from pool`);
					s2Selected.push(...await pickFromPool(perSession - s2Selected.length));
				}

				shuffleInPlace(s1Selected);
				shuffleInPlace(s2Selected);
				s1Ids = s1Selected.slice(0, perSession);
				s2Ids = s2Selected.slice(0, perSession);
				s1Minutes = defaults.session1Minutes;
				s2Minutes = defaults.session2Minutes;

				console.log(`[mock-create] L1 final: S1=${s1Ids.length} Qs, S2=${s2Ids.length} Qs (target ${perSession} each)`);
			}

			if (s1Ids.length === 0 && s2Ids.length === 0) {
				return res.status(400).json({ error: 'No questions found in the question bank for this course.', advice: 'Please ask your administrator to add questions to this course, then try again.' });
			}

			// Log how many questions were selected
			const actualTotal = s1Ids.length + s2Ids.length;
			console.log(`[mock-create] Selected ${actualTotal} question IDs total for ${course.name} (${level}). S1=${s1Ids.length}, S2=${s2Ids.length}`);

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
			const mockExamData = {
				user: { connect: { id: req.user.id } },
				course: { connect: { id: courseId } },
				breakMinutes: defaults.breakMinutes || 30,
				session1Minutes: s1Minutes,
				session2Minutes: s2Minutes || 0,
				status: 'PENDING'
			};
			if (exam1) mockExamData.session1Exam = { connect: { id: exam1.id } };
			if (exam2) mockExamData.session2Exam = { connect: { id: exam2.id } };

			const mockExam = await prisma.mockExam.create({ data: mockExamData });

			// Fetch the created mock exam with full details for the frontend
			const fullMockExam = await prisma.mockExam.findUnique({
				where: { id: mockExam.id },
				include: {
					course: { select: { id: true, name: true, level: true, examConditions: true } },
					session1Exam: { select: { id: true, name: true, timeLimitMinutes: true, examQuestions: { select: { questionId: true } } } },
					session2Exam: { select: { id: true, name: true, timeLimitMinutes: true, examQuestions: { select: { questionId: true } } } }
				}
			});

			return res.status(201).json({ mockExam: fullMockExam });
		} catch (err) {
			console.error('Mock exam creation error:', err);
			let userMessage = 'Failed to create mock exam. Please try again later.';
			let userAdvice = 'If this problem persists, please contact your course administrator.';
			if (err.code === 'P2003' || err.message?.includes('Foreign key')) {
				userMessage = 'Some questions referenced by the exam weights no longer exist.';
				userAdvice = 'Please ask your administrator to regenerate questions for this course, then try again.';
			} else if (err.code === 'P2002') {
				userMessage = 'A duplicate record was detected.';
				userAdvice = 'You may already have a mock exam in progress. Check your mock exams list and cancel any stale ones before trying again.';
			} else if (err.code === 'P2025') {
				userMessage = 'A required record was not found during creation.';
				userAdvice = 'Please refresh the page and try again. If the issue persists, contact your administrator.';
			}
			return res.status(500).json({ error: userMessage, advice: userAdvice });
		}
	});

	// ==========================================
	// ADMIN: Schedule mock exams for students
	// ==========================================
	router.post('/mock/schedule', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			courseId: z.string(),
			studentIds: z.array(z.string()).min(1),
			title: z.string().min(1).max(200),
			availableFrom: z.string().optional(),
			availableUntil: z.string().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

		try {
			const { courseId, studentIds, title, availableFrom, availableUntil } = parse.data;
			const course = await prisma.course.findUnique({ where: { id: courseId } });
			if (!course) return res.status(404).json({ error: 'Course not found' });

			const level = course.level || 'LEVEL1';
			const defaults = MOCK_DEFAULTS[level] || MOCK_DEFAULTS.LEVEL1;

			// Get topic weights
			const weights = await prisma.mockExamTopicWeight.findMany({
				where: { courseId },
				include: { volume: { include: { modules: { include: { topics: true } } } } }
			});
			if (weights.length === 0) return res.status(400).json({ error: 'Mock exam topic weights have not been configured for this course.' });

			// Build topic pool
			const volumeTopicMap = {};
			for (const w of weights) {
				const topicIds = (w.volume?.modules || []).flatMap(m => (m.topics || []).map(t => t.id));
				volumeTopicMap[w.volumeId] = topicIds;
			}

			// Weighted question selector (same logic as student create)
			async function selectWeightedQuestions(weightRows, totalQuestions, questionType, excludeIds = new Set(), { childrenPerItem = null } = {}) {
				if (weightRows.length === 0) return [];
				const totalWeight = weightRows.reduce((sum, sw) => sum + (sw.weightMin + sw.weightMax) / 2, 0);
				const weightTargets = weightRows.map(sw => {
					const midWeight = (sw.weightMin + sw.weightMax) / 2;
					const proportion = totalWeight > 0 ? midWeight / totalWeight : 1 / weightRows.length;
					return { ...sw, target: Math.max(1, Math.round(totalQuestions * proportion)) };
				});
				const usedIds = new Set(excludeIds);
				const selectedParents = [];
				for (const sw of weightTargets) {
					const topicIds = volumeTopicMap[sw.volumeId] || [];
					if (topicIds.length === 0) continue;
					let where = { topicId: { in: topicIds }, parentId: null, id: { notIn: [...usedIds] } };
					if (questionType === 'MCQ') where.type = 'MCQ';
					else if (questionType === 'VIGNETTE_MCQ') where.type = 'VIGNETTE_MCQ';
					else if (questionType === 'CONSTRUCTED_RESPONSE') where.type = 'CONSTRUCTED_RESPONSE';
					else if (questionType === 'MIXED_VIGNETTE') where.type = { in: ['VIGNETTE_MCQ', 'CONSTRUCTED_RESPONSE'] };
					const includeChildren = childrenPerItem ? { _count: { select: { children: true } } } : {};
					const available = await prisma.question.findMany({ where, select: { id: true, type: true, ...includeChildren } });
					const filtered = childrenPerItem ? available.filter(q => (q._count?.children || 0) >= childrenPerItem) : available;
					shuffleInPlace(filtered);
					const picked = filtered.slice(0, sw.target);
					for (const q of picked) { usedIds.add(q.id); selectedParents.push(q); }
				}
				shuffleInPlace(selectedParents);
				const finalParents = selectedParents.slice(0, totalQuestions);
				const allQuestionIds = [];
				for (const q of finalParents) {
					if (q.type === 'VIGNETTE_MCQ' || q.type === 'CONSTRUCTED_RESPONSE') {
						const children = await prisma.question.findMany({ where: { parentId: q.id }, select: { id: true }, orderBy: { orderIndex: 'asc' } });
						const childSlice = childrenPerItem ? children.slice(0, childrenPerItem) : children;
						for (const c of childSlice) allQuestionIds.push(c.id);
					} else {
						allQuestionIds.push(q.id);
					}
				}
				return allQuestionIds;
			}

			// Select questions once — all students get the same exam
			let s1Ids = [], s2Ids = [], s1Minutes = 0, s2Minutes = 0;

			if (level === 'LEVEL3') {
				// L3: Two sessions — 11 total item sets (case studies), split 6+5 or 5+6
				const totalItemSets = defaults.totalItemSets || 11;
				const allItemSetIds = await selectWeightedQuestions(weights, totalItemSets, defaults.questionType, new Set());
				const allQs = await prisma.question.findMany({ where: { id: { in: allItemSetIds } }, select: { id: true, parentId: true } });
				const qMap = new Map(allQs.map(q => [q.id, q]));
				const groupMap = new Map();
				const groupOrder = [];
				for (const id of allItemSetIds) {
					const q = qMap.get(id);
					const pid = q?.parentId;
					if (!pid) continue;
					if (!groupMap.has(pid)) { groupMap.set(pid, []); groupOrder.push(pid); }
					groupMap.get(pid).push(id);
				}
				const itemSetGroups = groupOrder.map(pid => groupMap.get(pid));
				shuffleInPlace(itemSetGroups);
				const s1ItemSets = Math.min(6, itemSetGroups.length);
				s1Ids = itemSetGroups.slice(0, s1ItemSets).flat();
				s2Ids = itemSetGroups.slice(s1ItemSets).flat();
				s1Minutes = defaults.session1Minutes;
				s2Minutes = defaults.session2Minutes;
				console.log(`[mock-schedule] L3: ${itemSetGroups.length} item sets — S1=${s1ItemSets}, S2=${itemSetGroups.length - s1ItemSets}`);
			} else if (level === 'LEVEL2') {
				const totalItemSets = (defaults.itemSetsPerSession || 11) * 2;
				const allItemSetIds = await selectWeightedQuestions(weights, totalItemSets, defaults.questionType, new Set(), { childrenPerItem: 4 });
				const allQs = await prisma.question.findMany({ where: { id: { in: allItemSetIds } }, select: { id: true, parentId: true } });
				const qMap = new Map(allQs.map(q => [q.id, q]));
				const groupMap = new Map();
				const groupOrder = [];
				for (const id of allItemSetIds) {
					const q = qMap.get(id);
					const pid = q?.parentId;
					if (!pid) continue;
					if (!groupMap.has(pid)) { groupMap.set(pid, []); groupOrder.push(pid); }
					groupMap.get(pid).push(id);
				}
				const itemSetGroups = groupOrder.map(pid => groupMap.get(pid));
				shuffleInPlace(itemSetGroups);
				const perSession = defaults.itemSetsPerSession || 11;
				s1Ids = itemSetGroups.slice(0, perSession).flat();
				s2Ids = itemSetGroups.slice(perSession, perSession * 2).flat();
				s1Minutes = defaults.session1Minutes;
				s2Minutes = defaults.session2Minutes;
			} else {
				// L1 — normalize per-session targets to exactly 90
				const perSession = defaults.questionsPerSession || 90;
				const totalTarget = perSession * 2;
				const usedIds = new Set();
				const pickFromVolume = async (volumeId, count) => {
					if (count <= 0) return [];
					const topicIds = volumeTopicMap[volumeId] || [];
					if (topicIds.length === 0) return [];
					const available = await prisma.question.findMany({ where: { topicId: { in: topicIds }, parentId: null, type: 'MCQ', id: { notIn: [...usedIds] } }, select: { id: true } });
					shuffleInPlace(available);
					const picked = available.slice(0, count).map(q => q.id);
					for (const id of picked) usedIds.add(id);
					return picked;
				};
				const allCourseTopicIds = Object.values(volumeTopicMap).flat();
				const pickFromPool = async (count) => {
					if (count <= 0) return [];
					const available = await prisma.question.findMany({ where: { topicId: { in: allCourseTopicIds }, parentId: null, type: 'MCQ', id: { notIn: [...usedIds] } }, select: { id: true } });
					shuffleInPlace(available);
					const picked = available.slice(0, count).map(q => q.id);
					for (const id of picked) usedIds.add(id);
					return picked;
				};
				const rawTargets = weights.map(w => {
					const mid = (w.weightMin + w.weightMax) / 2;
					return { ...w, rawTarget: Math.max(1, Math.round((mid / 100) * totalTarget)) };
				});
				const s1Weights = [], s2Weights = [];
				for (const vt of rawTargets) {
					if (vt.session === 1) { s1Weights.push({ ...vt }); }
					else if (vt.session === 2) { s2Weights.push({ ...vt }); }
					else { const h = Math.ceil(vt.rawTarget / 2); s1Weights.push({ ...vt, rawTarget: h }); s2Weights.push({ ...vt, rawTarget: vt.rawTarget - h }); }
				}
				const normalizeTargets = (items, target) => {
					const rawSum = items.reduce((s, i) => s + i.rawTarget, 0);
					if (rawSum === 0 || items.length === 0) return items;
					let assigned = items.map(i => ({ ...i, normalizedTarget: Math.max(1, Math.round((i.rawTarget / rawSum) * target)) }));
					let sum = assigned.reduce((s, i) => s + i.normalizedTarget, 0);
					while (sum !== target && assigned.length > 0) {
						assigned.sort((a, b) => b.normalizedTarget - a.normalizedTarget);
						assigned[0].normalizedTarget += (target - sum > 0 ? 1 : -1);
						sum = assigned.reduce((s, i) => s + i.normalizedTarget, 0);
					}
					return assigned;
				};
				const s1Norm = normalizeTargets(s1Weights, perSession);
				const s2Norm = normalizeTargets(s2Weights, perSession);
				const s1Selected = [], s2Selected = [];
				for (const vt of s1Norm) s1Selected.push(...await pickFromVolume(vt.volumeId, vt.normalizedTarget));
				for (const vt of s2Norm) s2Selected.push(...await pickFromVolume(vt.volumeId, vt.normalizedTarget));
				if (s1Selected.length < perSession) s1Selected.push(...await pickFromPool(perSession - s1Selected.length));
				if (s2Selected.length < perSession) s2Selected.push(...await pickFromPool(perSession - s2Selected.length));
				shuffleInPlace(s1Selected); shuffleInPlace(s2Selected);
				s1Ids = s1Selected.slice(0, perSession);
				s2Ids = s2Selected.slice(0, perSession);
				s1Minutes = defaults.session1Minutes;
				s2Minutes = defaults.session2Minutes;
			}

			if (s1Ids.length === 0 && s2Ids.length === 0) {
				return res.status(400).json({ error: 'No questions found in the question bank for this course.' });
			}

			// Create shared exam shells (all students share the same exam questions)
			const exam1 = s1Ids.length > 0 ? await prisma.exam.create({ data: { name: `${title} - Session 1`, level: course.level, timeLimitMinutes: s1Minutes, type: 'MOCK', active: true, createdById: req.user.id } }) : null;
			if (exam1) await prisma.examQuestion.createMany({ data: s1Ids.map((qid, idx) => ({ examId: exam1.id, questionId: qid, order: idx + 1 })) });

			const exam2 = s2Ids.length > 0 ? await prisma.exam.create({ data: { name: `${title} - Session 2`, level: course.level, timeLimitMinutes: s2Minutes, type: 'MOCK', active: true, createdById: req.user.id } }) : null;
			if (exam2) await prisma.examQuestion.createMany({ data: s2Ids.map((qid, idx) => ({ examId: exam2.id, questionId: qid, order: idx + 1 })) });

			// Create one MockExam per student
			const created = [];
			for (const studentId of studentIds) {
				// Skip if student already has an active scheduled mock for this course
				const existing = await prisma.mockExam.findFirst({ where: { userId: studentId, courseId, isScheduled: true, status: { notIn: ['COMPLETED', 'CANCELLED'] } } });
				if (existing) continue;

				const mockData = {
					user: { connect: { id: studentId } },
					course: { connect: { id: courseId } },
					breakMinutes: defaults.breakMinutes || 30,
					session1Minutes: s1Minutes,
					session2Minutes: s2Minutes || 0,
					status: 'PENDING',
					isScheduled: true,
					scheduledBy: { connect: { id: req.user.id } },
					title,
					...(availableFrom ? { availableFrom: new Date(availableFrom) } : {}),
					...(availableUntil ? { availableUntil: new Date(availableUntil) } : {})
				};
				if (exam1) mockData.session1Exam = { connect: { id: exam1.id } };
				if (exam2) mockData.session2Exam = { connect: { id: exam2.id } };

				const mock = await prisma.mockExam.create({ data: mockData });
				created.push(mock);
			}

			console.log(`[mock-schedule] Admin ${req.user.id} scheduled "${title}" for ${created.length}/${studentIds.length} students on course ${courseId}`);
			return res.status(201).json({ created: created.length, skipped: studentIds.length - created.length, mockExams: created });
		} catch (err) {
			console.error('Mock exam schedule error:', err);
			return res.status(500).json({ error: 'Failed to schedule mock exams' });
		}
	});

	// Admin: List all scheduled mock exams
	router.get('/mock/scheduled', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const { courseId } = req.query;
			const where = { isScheduled: true };
			if (courseId) where.courseId = courseId;

			const mockExams = await prisma.mockExam.findMany({
				where,
				include: {
					user: { select: { id: true, email: true, firstName: true, lastName: true } },
					course: { select: { id: true, name: true, level: true } },
					scheduledBy: { select: { id: true, email: true, firstName: true, lastName: true } },
					session1Exam: { select: { id: true, name: true, timeLimitMinutes: true, examQuestions: { select: { questionId: true } } } },
					session2Exam: { select: { id: true, name: true, timeLimitMinutes: true, examQuestions: { select: { questionId: true } } } }
				},
				orderBy: { createdAt: 'desc' }
			});
			return res.json({ mockExams });
		} catch (err) {
			console.error('Fetch scheduled mocks error:', err);
			return res.status(500).json({ error: 'Failed to fetch scheduled mock exams' });
		}
	});

	// Admin: Cancel a scheduled mock exam
	router.delete('/mock/scheduled/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const mock = await prisma.mockExam.findUnique({ where: { id: req.params.id } });
			if (!mock) return res.status(404).json({ error: 'Mock exam not found' });
			if (!mock.isScheduled) return res.status(400).json({ error: 'This is not a scheduled mock exam' });
			if (mock.status !== 'PENDING') return res.status(400).json({ error: 'Cannot cancel a mock exam that has already been started' });

			await prisma.mockExam.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });
			return res.json({ success: true });
		} catch (err) {
			console.error('Cancel scheduled mock error:', err);
			return res.status(500).json({ error: 'Failed to cancel scheduled mock exam' });
		}
	});

	// Student: Get my mock exams
	router.get('/mock/me', requireAuth(), async (req, res) => {
		try {
			const mockExams = await prisma.mockExam.findMany({
				where: { userId: req.user.id },
				include: {
					course: { select: { id: true, name: true, level: true, examConditions: true } },
					session1Exam: { select: { id: true, name: true, timeLimitMinutes: true, examQuestions: { select: { questionId: true, question: { select: { parentId: true, type: true } } } }, attempts: { where: { userId: req.user.id }, select: { id: true, status: true, scorePercent: true, submittedAt: true }, orderBy: { startedAt: 'desc' }, take: 1 } } },
					session2Exam: { select: { id: true, name: true, timeLimitMinutes: true, examQuestions: { select: { questionId: true, question: { select: { parentId: true, type: true } } } }, attempts: { where: { userId: req.user.id }, select: { id: true, status: true, scorePercent: true, submittedAt: true }, orderBy: { startedAt: 'desc' }, take: 1 } } }
				},
				orderBy: { createdAt: 'desc' }
			});
			return res.json({ mockExams });
		} catch (err) {
			console.error('Fetch my mock exams error:', err);
			return res.status(500).json({ error: 'Failed to fetch mock exams' });
		}
	});

	// Student: Get single mock exam detail
	router.get('/mock/:mockExamId', requireAuth(), async (req, res) => {
		try {
			const mockExam = await prisma.mockExam.findUnique({
				where: { id: req.params.mockExamId },
				include: {
					course: { select: { id: true, name: true, level: true, examConditions: true } },
					session1Exam: {
						select: {
							id: true, name: true, timeLimitMinutes: true,
							examQuestions: { select: { questionId: true, question: { select: { parentId: true, type: true } } } },
							attempts: { where: { userId: req.user.id }, select: { id: true, status: true, scorePercent: true, submittedAt: true }, orderBy: { startedAt: 'desc' }, take: 1 }
						}
					},
					session2Exam: {
						select: {
							id: true, name: true, timeLimitMinutes: true,
							examQuestions: { select: { questionId: true, question: { select: { parentId: true, type: true } } } },
							attempts: { where: { userId: req.user.id }, select: { id: true, status: true, scorePercent: true, submittedAt: true }, orderBy: { startedAt: 'desc' }, take: 1 }
						}
					}
				}
			});
			if (!mockExam || mockExam.userId !== req.user.id) return res.status(404).json({ error: 'Mock exam not found' });
			return res.json({ mockExam });
		} catch (err) {
			console.error('Fetch mock exam detail error:', err);
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

			// Check availability window for scheduled mocks
			if (mockExam.isScheduled) {
				const now = new Date();
				if (mockExam.availableFrom && now < new Date(mockExam.availableFrom)) {
					return res.status(403).json({ error: 'This mock exam is not available yet.', availableFrom: mockExam.availableFrom });
				}
				if (mockExam.availableUntil && now > new Date(mockExam.availableUntil)) {
					return res.status(403).json({ error: 'This mock exam has expired.', availableUntil: mockExam.availableUntil });
				}
			}

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


