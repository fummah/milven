import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';

export function learningRouter(prisma) {
  const router = Router();

  // Heartbeat for material progress
  router.post('/progress/materials/:materialId/heartbeat', requireAuth(), async (req, res) => {
    const { materialId } = req.params;
    const schema = z.object({
      kind: z.enum(['LINK','PDF','VIDEO','IMAGE','HTML']),
      deltaSec: z.number().int().nonnegative().optional(),
      positionSec: z.number().int().nonnegative().optional(),
      durationSec: z.number().int().positive().optional(),
      scrollDepth: z.number().min(0).max(1).optional(),
      percent: z.number().min(0).max(100).optional(),
      meta: z.any().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { kind, deltaSec = 0, positionSec, durationSec, scrollDepth, percent, meta } = parsed.data;
    const userId = req.user.id;
    // Find material estimate to apply anti-inflation cap
    const material = await prisma.learningMaterial.findUnique({
      where: { id: materialId },
      select: { estimatedSeconds: true }
    }).catch(() => null);
    const est = Math.max(0, material?.estimatedSeconds ?? 0);
    const MULTIPLIER = Number(process.env.LEARNING_TIME_CAP_MULTIPLIER ?? 1.5); // allow up to 150% of estimate
    // Compute newPercent
    let incPercent = 0;
    if (typeof percent === 'number') {
      incPercent = percent;
    } else if (kind === 'VIDEO' && typeof positionSec === 'number' && typeof durationSec === 'number' && durationSec > 0) {
      incPercent = Math.min(100, Math.round((positionSec / durationSec) * 100));
    } else if (typeof scrollDepth === 'number') {
      incPercent = Math.round(scrollDepth * 100);
    }
    const existing = await prisma.materialProgress.findUnique({ where: { userId_materialId: { userId, materialId } } }).catch(() => null);
    const nextPercent = Math.max(existing?.percent ?? 0, incPercent);
    // Cap per call and overall per-material accumulation
    const cappedDelta = Math.max(0, Math.min(deltaSec, 60));
    const rawNextTime = (existing?.timeSpentSec ?? 0) + cappedDelta;
    const overallCap = est > 0 ? Math.round(est * MULTIPLIER) : undefined;
    const nextTime = overallCap ? Math.min(rawNextTime, overallCap) : rawNextTime;
    const mp = await prisma.materialProgress.upsert({
      where: { userId_materialId: { userId, materialId } },
      update: { percent: nextPercent, timeSpentSec: nextTime, lastPosSec: positionSec ?? existing?.lastPosSec ?? null, meta },
      create: { userId, materialId, kind, percent: nextPercent, timeSpentSec: nextTime, lastPosSec: positionSec ?? null, meta }
    });
    // Derive remaining for convenience
    const totalEstimated = est || (typeof durationSec === 'number' ? durationSec : undefined);
    const remainingSec = totalEstimated ? Math.max(0, totalEstimated - mp.timeSpentSec) : undefined;
    return res.json({ progress: mp, totalEstimatedSeconds: totalEstimated, remainingSeconds: remainingSec });
  });

  router.post('/progress/materials/:materialId/complete', requireAuth(), async (req, res) => {
    const { materialId } = req.params;
    const userId = req.user.id;
    const mp = await prisma.materialProgress.upsert({
      where: { userId_materialId: { userId, materialId } },
      update: { percent: 100, completedAt: new Date() },
      create: { userId, materialId, kind: 'HTML', percent: 100, timeSpentSec: 0, completedAt: new Date() }
    });
    return res.json({ progress: mp });
  });

  // Simple aggregations (demo)
  router.get('/topics/:topicId/progress', requireAuth(), async (req, res) => {
    const { topicId } = req.params;
    const userId = req.user.id;
    const mats = await prisma.learningMaterial.findMany({ where: { topicId } });
    const ids = mats.map(m => m.id);
    if (!ids.length) return res.json({ percent: 0, timeSpentSec: 0 });
    const rows = await prisma.materialProgress.findMany({ where: { userId, materialId: { in: ids } } });
    const byId = new Map(rows.map(r => [r.materialId, r]));
    let time = 0;
    // Weighted by estimatedSeconds; fallback to equal weights
    const weights = mats.map(m => Math.max(0, m.estimatedSeconds || 0));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let percent = 0;
    // Compute remaining seconds from weighted remainder
    let remainingSeconds = 0;
    if (totalWeight > 0) {
      let weighted = 0;
      mats.forEach((m, idx) => {
        const p = byId.get(m.id);
        weighted += (p ? p.percent : 0) * weights[idx];
        time += p?.timeSpentSec ?? 0;
        const matRemaining = Math.max(0, weights[idx] - Math.round((weights[idx] * (p?.percent ?? 0)) / 100));
        remainingSeconds += matRemaining;
      });
      percent = Math.round(weighted / totalWeight);
    } else {
      // Fallback equal average
      let sum = 0;
      mats.forEach((m) => {
        const p = byId.get(m.id);
        sum += p ? p.percent : 0;
        time += p?.timeSpentSec ?? 0;
      });
      percent = Math.round(sum / ids.length);
      // Without weights, approximate remaining by uncompleted portions equally
      remainingSeconds = 0;
    }
    await prisma.topicProgress.upsert({
      where: { userId_topicId: { userId, topicId } },
      update: {
        percent,
        timeSpentSec: time,
        gateSatisfied: percent >= 100,
        completedAt: percent >= 100 ? new Date() : null
      },
      create: {
        userId,
        topicId,
        percent,
        timeSpentSec: time,
        gateSatisfied: percent >= 100,
        completedAt: percent >= 100 ? new Date() : null
      }
    });
    return res.json({
      percent,
      timeSpentSec: time,
      gateSatisfied: percent >= 100,
      estimatedSeconds: totalWeight || undefined,
      remainingSeconds
    });
  });

  // Public list of active courses (no auth) for homepage
  router.get('/courses/public', async (req, res) => {
    const courses = await prisma.course.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      include: { courseProducts: { include: { product: { select: { id: true, name: true, priceCents: true, interval: true } } } } }
    });
    const items = courses.map(c => {
      const products = (c.courseProducts || []).map(cp => cp.product).filter(Boolean);
      const freeProduct = products.find(p => !p.priceCents || p.priceCents === 0);
      const paidProduct = products.find(p => p.priceCents > 0) || products[0];
      return {
        id: c.id,
        name: c.name,
        level: c.level,
        description: c.description,
        durationHours: c.durationHours,
        isFree: !!freeProduct || products.length === 0,
        product: paidProduct || null
      };
    });
    return res.json({ courses: items });
  });

  // Browse courses not yet enrolled (with optional search) - must be before :courseId
  router.get('/courses/browse', requireAuth(), async (req, res) => {
    const userId = req.user.id;
    const q = (req.query.q ?? '').toString().trim();
    const enrolls = await prisma.enrollment.findMany({
      where: { userId },
      select: { courseId: true }
    });
    const enrolledIds = new Set(enrolls.map(e => e.courseId));
    const where = {
      active: true,
      ...(enrolledIds.size > 0 ? { id: { notIn: Array.from(enrolledIds) } } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] } : {})
    };
    const courses = await prisma.course.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { courseProducts: { include: { product: { select: { id: true, name: true, priceCents: true, interval: true } } } } }
    });
    const items = courses.map(c => {
      const products = (c.courseProducts || []).map(cp => cp.product).filter(Boolean);
      const freeProduct = products.find(p => !p.priceCents || p.priceCents === 0);
      const paidProduct = products.find(p => p.priceCents > 0) || products[0];
      return {
        id: c.id,
        name: c.name,
        level: c.level,
        description: c.description,
        durationHours: c.durationHours,
        isFree: !!freeProduct || products.length === 0,
        product: paidProduct || null
      };
    });
    return res.json({ courses: items });
  });

  router.get('/courses/:courseId/progress', requireAuth(), async (req, res) => {
    const { courseId } = req.params;
    const userId = req.user.id;
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return res.status(404).json({ error: 'Not found' });
    const topics = await prisma.topic.findMany({ where: { level: course.level } });
    if (!topics.length) return res.json({ percent: 0, timeSpentSec: 0 });
    const tprog = await prisma.topicProgress.findMany({ where: { userId, topicId: { $in: topics.map(t => t.id) } } }).catch(async () => {
      // Fallback for older Prisma versions: query in JS
      const all = await prisma.topicProgress.findMany({ where: { userId } });
      return all.filter(tp => topics.find(t => t.id === tp.topicId));
    });
    const percent = Math.round((tprog.reduce((a, b) => a + b.percent, 0) / Math.max(1, topics.length)));
    const timeSpentSec = tprog.reduce((a, b) => a + (b.timeSpentSec || 0), 0);
    // Derive course-level estimated and remaining by summing topic-level estimates
    const topicIds = topics.map(t => t.id);
    const mats = await prisma.learningMaterial.findMany({ where: { topicId: { in: topicIds } }, select: { estimatedSeconds: true, topicId: true } });
    const estByTopic = new Map();
    mats.forEach(m => estByTopic.set(m.topicId, (estByTopic.get(m.topicId) ?? 0) + Math.max(0, m.estimatedSeconds ?? 0)));
    const estimatedSeconds = Array.from(estByTopic.values()).reduce((a, b) => a + b, 0);
    const remainingSeconds = tprog.reduce((acc, tp) => {
      const est = estByTopic.get(tp.topicId) ?? 0;
      const rem = Math.max(0, est - Math.round((est * tp.percent) / 100));
      return acc + rem;
    }, 0);
    await prisma.courseProgress.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: {
        percent,
        timeSpentSec,
        completedAt: percent >= 100 ? new Date() : null
      },
      create: {
        userId,
        courseId,
        percent,
        timeSpentSec,
        completedAt: percent >= 100 ? new Date() : null
      }
    });
    return res.json({ percent, timeSpentSec, estimatedSeconds, remainingSeconds });
  });

  // Student-friendly: course detail with topics and modules (read-only)
  router.get('/courses/:courseId/detail', requireAuth(), async (req, res) => {
    const { courseId } = req.params;
    try {
      const course = await prisma.course.findUnique({
        where: { id: courseId, active: true },
        select: { id: true, name: true, level: true, description: true, durationHours: true }
      });
      if (!course) return res.status(404).json({ error: 'Not found' });
      const [topics, modules] = await Promise.all([
        prisma.topic.findMany({
          where: { level: course.level },
          orderBy: [{ moduleId: 'asc' }, { moduleNumber: 'asc' }, { order: 'asc' }],
          select: { id: true, name: true, moduleNumber: true, moduleId: true, order: true, level: true }
        }),
        prisma.module.findMany({
          where: { level: course.level },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          include: {
            topics: {
              orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
              select: { id: true, name: true, moduleNumber: true, order: true, level: true }
            }
          }
        })
      ]);
      return res.json({ course, topics, modules });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to load course' });
    }
  });

  // Student-friendly: list learning materials for a topic (read-only)
  router.get('/topics/:topicId/materials', requireAuth(), async (req, res) => {
    const { topicId } = req.params;
    try {
      const mats = await prisma.learningMaterial.findMany({
        where: { topicId },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, kind: true, title: true, url: true, imageUrl: true, contentHtml: true, estimatedSeconds: true }
      });
      const etaSeconds = mats.reduce((acc, m) => acc + Math.max(0, m.estimatedSeconds ?? 0), 0);
      return res.json({ materials: mats, etaSeconds });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to load materials' });
    }
  });

  // Enroll in a course (free = direct enroll; paid = returns productId for checkout)
  router.post('/courses/:courseId/enroll', requireAuth(), async (req, res) => {
    const { courseId } = req.params;
    const userId = req.user.id;
    const course = await prisma.course.findUnique({
      where: { id: courseId, active: true },
      include: { courseProducts: { include: { product: true } } }
    });
    if (!course) return res.status(404).json({ error: 'Course not found' });
    const existing = await prisma.enrollment.findFirst({
      where: { userId, courseId }
    });
    if (existing) return res.status(400).json({ error: 'Already enrolled' });
    const products = (course.courseProducts || []).map(cp => cp.product).filter(Boolean);
    const freeProduct = products.find(p => !p.priceCents || p.priceCents === 0);
    if (freeProduct || products.length === 0) {
      await prisma.enrollment.create({ data: { userId, courseId } });
      return res.json({ enrolled: true });
    }
    const paidProduct = products.find(p => p.priceCents > 0) || products[0];
    return res.json({
      requiresPayment: true,
      productId: paidProduct.id,
      productName: paidProduct.name,
      priceCents: paidProduct.priceCents
    });
  });

  // My courses (enrollments) with progress snapshot and latest course exam result
  router.get('/me/courses', requireAuth(), async (req, res) => {
    const userId = req.user.id;
    const enrolls = await prisma.enrollment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        courseId: true,
        course: {
          select: { id: true, name: true, level: true, active: true, description: true }
        },
        createdAt: true
      }
    });
    const courseIds = enrolls.map(e => e.course?.id).filter(Boolean);
    let progressByCourse = {};
    if (courseIds.length) {
      const cps = await prisma.courseProgress.findMany({
        where: { userId, courseId: { in: courseIds } },
        select: { courseId: true, percent: true, timeSpentSec: true, updatedAt: true }
      });
      progressByCourse = Object.fromEntries(cps.map(c => [c.courseId, c]));
    }
    // Latest submitted course exam attempt per course (for passed/failed)
    let examResultByCourse = {};
    if (courseIds.length) {
      const courseExams = await prisma.exam.findMany({
        where: { courseId: { in: courseIds }, type: 'COURSE' },
        select: { id: true, courseId: true }
      });
      const examIds = courseExams.map(e => e.id);
      const courseByExamId = Object.fromEntries(courseExams.map(e => [e.id, e.courseId]));
      const attempts = await prisma.examAttempt.findMany({
        where: { userId, examId: { in: examIds }, status: 'SUBMITTED' },
        orderBy: { submittedAt: 'desc' },
        select: { id: true, examId: true, scorePercent: true, submittedAt: true }
      });
      for (const a of attempts) {
        const cid = courseByExamId[a.examId];
        if (cid && !examResultByCourse[cid]) {
          examResultByCourse[cid] = {
            attemptId: a.id,
            scorePercent: a.scorePercent,
            submittedAt: a.submittedAt,
            passed: (a.scorePercent ?? 0) >= 70
          };
        }
      }
    }
    const items = enrolls.map(e => {
      const p = e.course?.id ? progressByCourse[e.course.id] : null;
      const examResult = e.course?.id ? examResultByCourse[e.course.id] : null;
      return {
        courseId: e.course?.id,
        name: e.course?.name,
        level: e.course?.level,
        active: e.course?.active,
        description: e.course?.description,
        enrollmentStatus: e.status,
        enrolledAt: e.createdAt,
        progressPercent: Math.round(p?.percent ?? 0),
        timeSpentSec: p?.timeSpentSec ?? 0,
        lastUpdated: p?.updatedAt ?? null,
        examResult: examResult || null
      };
    });
    return res.json({ courses: items });
  });

  return router;
}

