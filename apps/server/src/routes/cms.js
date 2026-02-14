import { Router } from 'express';
import Stripe from 'stripe';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

export function cmsRouter(prisma) {
	const router = Router();
  // Local Stripe helper (mirrors billing.ensureStripeProductAndPrice)
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: '2023-10-16' }) : null;

  async function ensureStripeProductAndPriceLocal(p) {
    if (!stripe) return p;
    let sp = p.stripeProductId ? await stripe.products.retrieve(p.stripeProductId).catch(() => null) : null;
    if (!sp) {
      sp = await stripe.products.create({ name: p.name, active: p.active, description: p.description || undefined });
    } else {
      await stripe.products.update(sp.id, { name: p.name, active: p.active, description: p.description ?? undefined });
    }
    // Prices are immutable for amount/interval
    let needNewPrice = !p.stripePriceId;
    if (p.stripePriceId) {
      try {
        const existing = await stripe.prices.retrieve(p.stripePriceId);
        const recurring = (p.interval === 'MONTHLY' || p.interval === 'YEARLY');
        const intervalOk = recurring ? (existing.recurring && ((p.interval === 'MONTHLY' && existing.recurring.interval === 'month') || (p.interval === 'YEARLY' && existing.recurring.interval === 'year'))) : !existing.recurring;
        const amountOk = existing.unit_amount === p.priceCents;
        const activeOk = existing.active;
        if (!(intervalOk && amountOk && activeOk)) {
          needNewPrice = true;
          await stripe.prices.update(existing.id, { active: false });
        }
      } catch {
        needNewPrice = true;
      }
    }
    let priceId = p.stripePriceId || null;
    if (needNewPrice) {
      const base = { product: sp.id, unit_amount: p.priceCents, currency: 'usd', nickname: p.name };
      const created = await stripe.prices.create({
        ...base,
        ...(p.interval === 'ONE_TIME' ? {} : (p.interval === 'MONTHLY' ? { recurring: { interval: 'month' } } : { recurring: { interval: 'year' } }))
      });
      priceId = created.id;
    }
    if (sp.id !== p.stripeProductId || priceId !== p.stripePriceId) {
      const updated = await prisma.product.update({ where: { id: p.id }, data: { stripeProductId: sp.id, stripePriceId: priceId } });
      return updated;
    }
    return p;
  }
  // file upload setup
  const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');
  try { fs.mkdirSync(uploadDir, { recursive: true }); } catch {}
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const base = path.basename(file.originalname || 'file', ext).replace(/[^\w\-]+/g, '');
      cb(null, `${Date.now()}_${base}${ext}`);
    }
  });
  const upload = multer({ storage });
  router.post('/upload', requireAuth(), requireRole('ADMIN'), upload.single('file'), (req, res) => {
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'file missing' });
    const fileUrl = `/uploads/${f.filename}`;
    return res.json({ url: fileUrl, filename: f.originalname, size: f.size, mime: f.mimetype });
  });

  // Levels
  router.get('/levels', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const levels = await prisma.levelDef.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] });
    return res.json({ levels });
  });
  router.post('/levels', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      code: z.string().min(2),
      order: z.number().int().optional(),
      active: z.boolean().optional()
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const level = await prisma.levelDef.create({ data: parse.data });
    return res.status(201).json({ level });
  });
  router.put('/levels/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const schema = z.object({
      name: z.string().min(2).optional(),
      code: z.string().min(2).optional(),
      order: z.number().int().optional(),
      active: z.boolean().optional()
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const level = await prisma.levelDef.update({ where: { id }, data: parse.data });
    return res.json({ level });
  });
  router.delete('/levels/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    await prisma.levelDef.delete({ where: { id } });
    return res.json({ ok: true });
  });

  // Courses
  router.get('/courses', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const q = (req.query.q ?? '').toString().trim();
    const level = req.query.level;
    const active = req.query.active;
    const where = {
      AND: [
        q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] } : {},
        level ? { level } : {},
        typeof active !== 'undefined' ? { active: active === 'true' } : {}
      ]
    };
    const [total, rows] = await Promise.all([
      prisma.course.count({ where }),
      prisma.course.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { courseProducts: { include: { product: true } } }
      })
    ]);
    const courses = rows.map(c => ({
      ...c,
      products: (c.courseProducts || []).map(cp => cp.product)
    }));
    return res.json({ total, courses });
  });
  // Course detail
  router.get('/courses/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        courseProducts: { include: { product: true } },
        enrollments: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true, email: true, firstName: true, lastName: true, phone: true, country: true, createdAt: true
              }
            }
          }
        }
      }
    });
    if (!course) return res.status(404).json({ error: 'Not found' });
    const level = course.level;
    const [modulesWithTopics, topics] = await Promise.all([
      prisma.module.findMany({
        where: { courseId: id },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: {
          topics: {
            where: { courseId: id },
            orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
          }
        }
      }),
      prisma.topic.findMany({
        where: { courseId: id },
        orderBy: [{ moduleId: 'asc' }, { moduleNumber: 'asc' }, { order: 'asc' }, { createdAt: 'desc' }],
        include: { module: true }
      })
    ]);
    const [revisionSummaries, exams] = await Promise.all([
      prisma.revisionSummary.findMany({ where: { level }, orderBy: { createdAt: 'desc' } }),
      prisma.exam.findMany({
        where: { courseId: id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, level: true, timeLimitMinutes: true, createdAt: true, type: true, topicId: true, courseId: true, active: true, startAt: true, endAt: true }
      })
    ]);
    // Subscriptions of enrolled users
    const userIds = (course.enrollments || []).map(e => e.userId);
    let subscriptions = [];
    if (userIds.length) {
      subscriptions = await prisma.subscription.findMany({
        where: { userId: { in: userIds } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, userId: true, provider: true, status: true, plan: true, currency: true, currentPeriodEnd: true, updatedAt: true }
      });
    }
    // Products
    const products = (course.courseProducts || []).map(cp => cp.product);
    // De-duplicate enrollments by userId (keep latest)
    const seen = new Map();
    for (const e of course.enrollments) {
      const prev = seen.get(e.userId);
      if (!prev || new Date(e.createdAt) > new Date(prev.createdAt)) {
        seen.set(e.userId, e);
      }
    }
    const uniqueEnrollments = Array.from(seen.values()).map(e => ({ id: e.id, createdAt: e.createdAt, user: e.user }));
    return res.json({
      course: {
        ...course,
        products,
        enrollments: uniqueEnrollments
      },
      modules: modulesWithTopics,
      topics,
      revisionSummaries,
      exams,
      subscriptions
    });
  });
  router.post('/courses', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const { name, level, description, durationHours, active, createProduct, productName, productDescription, productPriceCents, productInterval, productActive } = req.body ?? {};
    if (!name || !level) return res.status(400).json({ error: 'name and level are required' });
    const created = await prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          name,
          level,
          description: description ?? null,
          durationHours: typeof durationHours === 'number' ? durationHours : null,
          active: typeof active === 'boolean' ? active : true
        }
      });
      let products = [];
      if (createProduct && productName && typeof productPriceCents === 'number' && productInterval) {
        const levelLabel =
          level === 'LEVEL1' ? 'Level I' :
          level === 'LEVEL2' ? 'Level II' :
          level === 'LEVEL3' ? 'Level III' :
          level === 'NONE' ? 'None' : level;
        const enforcedName = `${course.name} - ${levelLabel}`;
        const p = await tx.product.create({
          data: {
            // Enforce product name to include Course Name and Level
            name: enforcedName,
            description: productDescription ?? null,
            priceCents: productPriceCents,
            interval: productInterval,
            active: typeof productActive === 'boolean' ? productActive : true,
            courseLinks: { create: [{ courseId: course.id }] }
          }
        });
        products = [p];
      }
      return { ...course, products };
    });
    // If auto-created product, ensure Stripe linkage
    try {
      if (created?.products?.length) {
        const first = created.products[0];
        const synced = await ensureStripeProductAndPriceLocal(first);
        if (synced && (synced.stripeProductId || synced.stripePriceId)) {
          created.products = [synced];
        }
      }
    } catch (e) {
      console.warn('[cms] Stripe sync for auto-created product failed:', e?.message ?? e);
    }
    return res.status(201).json({ course: created });
  });
  router.put('/courses/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const { name, level, description, durationHours, priceCents, active } = req.body ?? {};
    const course = await prisma.course.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(level ? { level } : {}),
        ...(typeof description !== 'undefined' ? { description } : {}),
        ...(typeof durationHours !== 'undefined' ? { durationHours } : {}),
        ...(typeof priceCents !== 'undefined' ? { priceCents } : {}),
        ...(typeof active !== 'undefined' ? { active } : {})
      }
    });
    return res.json({ course });
  });
  router.delete('/courses/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    await prisma.enrollment.deleteMany({ where: { courseId: id } });
    await prisma.course.delete({ where: { id } });
    return res.json({ ok: true });
  });

  	// Modules (containers for topics; a module has many topics)
	router.get('/modules', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const level = req.query.level;
		const courseId = (req.query.courseId ?? '').toString().trim();
		const where = courseId
			? { courseId }
			: (level ? { level } : {});
		const modules = await prisma.module.findMany({
			where,
			orderBy: [{ level: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
			include: {
				topics: {
					...(courseId ? { where: { courseId } } : {}),
					orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
				}
			}
		});
		return res.json({ modules });
	});
	router.post('/modules', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			name: z.string().min(2),
			courseId: z.string().min(1),
			order: z.number().int().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const courseId = parse.data.courseId;
		const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, level: true } });
		if (!course) return res.status(400).json({ error: 'Invalid courseId' });
		const level = course.level;
		const max = await prisma.module.findFirst({ where: { courseId }, orderBy: { order: 'desc' }, select: { order: true } });
		const order = parse.data.order ?? (max?.order ?? 0) + 1;
		const module_ = await prisma.module.create({ data: { name: parse.data.name, level, courseId, order } });
		return res.status(201).json({ module: module_ });
	});
	router.put('/modules/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		const schema = z.object({
			name: z.string().min(2).optional(),
			courseId: z.string().optional().nullable(),
			order: z.number().int().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const courseId = typeof parse.data.courseId === 'undefined'
			? undefined
			: (parse.data.courseId || null);
		const course = courseId ? await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, level: true } }) : null;
		if (courseId && !course) return res.status(400).json({ error: 'Invalid courseId' });
		const level = course ? course.level : undefined;
		const module_ = await prisma.module.update({
			where: { id },
			data: {
				...(typeof parse.data.name !== 'undefined' ? { name: parse.data.name } : {}),
				...(typeof level !== 'undefined' ? { level } : {}),
				...(typeof courseId !== 'undefined' ? { courseId } : {}),
				...(typeof parse.data.order !== 'undefined' ? { order: parse.data.order } : {})
			}
		});
		return res.json({ module: module_ });
	});
	router.delete('/modules/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		await prisma.topic.updateMany({ where: { moduleId: id }, data: { moduleId: null } });
		await prisma.module.delete({ where: { id } });
		return res.json({ ok: true });
	});

	// Topics
	router.get('/topics', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const level = req.query.level;
		const courseId = (req.query.courseId ?? '').toString().trim();
		const moduleId = req.query.moduleId;
		const q = (req.query.q ?? '').toString().trim();
		const where = {
			AND: [
				courseId ? { courseId } : {},
				(!courseId && level) ? { level } : {},
				moduleId ? { moduleId } : {},
				q ? { name: { contains: q, mode: 'insensitive' } } : {}
			]
		};
		const [total, topics] = await Promise.all([
			prisma.topic.count({ where }),
			prisma.topic.findMany({
				where,
				orderBy: [{ moduleId: 'asc' }, { moduleNumber: 'asc' }, { order: 'asc' }, { createdAt: 'desc' }],
				include: { module: true }
			})
		]);
		return res.json({ topics, total });
	});
  router.post('/topics', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			name: z.string().min(2),
			courseId: z.string().min(1),
			moduleId: z.string().optional().nullable(),
			moduleNumber: z.number().int().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const courseId = parse.data.courseId;
		const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, level: true } });
		if (!course) return res.status(400).json({ error: 'Invalid courseId' });
		const level = course.level;
		if (parse.data.moduleId) {
			const m = await prisma.module.findUnique({ where: { id: parse.data.moduleId }, select: { id: true, courseId: true } });
			if (!m) return res.status(400).json({ error: 'Invalid moduleId' });
			if (m.courseId && m.courseId !== courseId) return res.status(400).json({ error: 'Module does not belong to this course' });
		}
		const data = { ...parse.data, courseId, level, moduleId: parse.data.moduleId || undefined };
		const max = await prisma.topic.findFirst({
			where: data.moduleId ? { moduleId: data.moduleId, courseId } : { courseId },
			orderBy: { order: 'desc' },
			select: { order: true }
		});
		const nextOrder = (max?.order ?? 0) + 1;
		const topic = await prisma.topic.create({ data: { ...data, order: nextOrder }, include: { module: true } });
		return res.status(201).json({ topic });
	});
	router.put('/topics/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		const schema = z.object({
			name: z.string().min(2).optional(),
			courseId: z.string().optional().nullable(),
			moduleId: z.string().optional().nullable(),
			moduleNumber: z.number().int().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const courseId = typeof parse.data.courseId === 'undefined'
			? undefined
			: (parse.data.courseId || null);
		const existing = await prisma.topic.findUnique({ where: { id }, select: { id: true, courseId: true } });
		if (!existing) return res.status(404).json({ error: 'Not found' });
		const effectiveCourseId = (typeof courseId !== 'undefined') ? courseId : (existing.courseId ?? null);
		const course = effectiveCourseId ? await prisma.course.findUnique({ where: { id: effectiveCourseId }, select: { id: true, level: true } }) : null;
		if (effectiveCourseId && !course) return res.status(400).json({ error: 'Invalid courseId' });
		const level = course ? course.level : undefined;
		const nextModuleId = (typeof parse.data.moduleId === 'undefined')
			? undefined
			: (parse.data.moduleId === null || parse.data.moduleId === '' ? null : parse.data.moduleId);
		if (nextModuleId) {
			const m = await prisma.module.findUnique({ where: { id: nextModuleId }, select: { id: true, courseId: true } });
			if (!m) return res.status(400).json({ error: 'Invalid moduleId' });
			if (effectiveCourseId && m.courseId && m.courseId !== effectiveCourseId) return res.status(400).json({ error: 'Module does not belong to this course' });
		}
		const data = {
			...parse.data,
			...(typeof level !== 'undefined' ? { level } : {}),
			...(typeof courseId !== 'undefined' ? { courseId } : {}),
			...(typeof nextModuleId !== 'undefined' ? { moduleId: nextModuleId } : {})
		};
		const topic = await prisma.topic.update({ where: { id }, data, include: { module: true } });
		return res.json({ topic });
	});
	router.delete('/topics/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		await prisma.topic.delete({ where: { id } });
		return res.json({ ok: true });
	});
  router.post('/topics/reorder', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const ids = (req.body?.ids ?? []).filter(Boolean);
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });
    await prisma.$transaction(ids.map((id, idx) => prisma.topic.update({ where: { id }, data: { order: idx + 1 } })));
    return res.json({ ok: true });
  });

  // Learning Materials
  router.get('/topics/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const topic = await prisma.topic.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        level: true,
        order: true,
        moduleNumber: true,
        moduleId: true,
        createdAt: true,
        updatedAt: true,
        module: {
          select: { id: true, name: true, level: true, order: true, createdAt: true, updatedAt: true }
        },
        materials: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
        revisionSummaries: { orderBy: { createdAt: 'desc' } },
        videos: { orderBy: { createdAt: 'desc' } }
      }
    });
    if (!topic) return res.status(404).json({ error: 'Not found' });
    // Count practice questions
    const questionCount = await prisma.question.count({ where: { topicId: id } });
    return res.json({ topic, questionCount });
  });
  router.get('/topics/:id/materials', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const topicId = req.params.id;
    const materials = await prisma.learningMaterial.findMany({
      where: { topicId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
    });
    const etaSeconds = (materials || []).reduce((acc, m) => acc + (m.estimatedSeconds || 0), 0);
    return res.json({ materials, etaSeconds });
  });
  router.post('/topics/:id/materials', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const topicId = req.params.id;
    const schema = z.object({
      kind: z.enum(['LINK','PDF','VIDEO','IMAGE','HTML']),
      title: z.string().min(2),
      // Accept relative paths from uploader or absolute URLs
      url: z.string().min(1).optional(),
      contentHtml: z.string().optional(),
      imageUrl: z.string().min(1).optional(),
      // time estimation inputs (optional)
      estimatedSeconds: z.number().int().positive().optional(),
      estimatedMinutes: z.number().int().positive().optional(),
      durationSec: z.number().int().positive().optional()
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const max = await prisma.learningMaterial.findFirst({ where: { topicId }, orderBy: { order: 'desc' }, select: { order: true } });
    const nextOrder = (max?.order ?? 0) + 1;
    const payload = parse.data;
    const estimatedSeconds = computeEstimatedSeconds(payload.kind, payload);
    const material = await prisma.learningMaterial.create({
      data: {
        topicId,
        order: nextOrder,
        kind: payload.kind,
        title: payload.title,
        url: payload.url ?? null,
        contentHtml: payload.contentHtml ?? null,
        imageUrl: payload.imageUrl ?? null,
        estimatedSeconds
      }
    });
    return res.status(201).json({ material });
  });
  router.put('/materials/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const schema = z.object({
      kind: z.enum(['LINK','PDF','VIDEO','IMAGE','HTML']).optional(),
      title: z.string().min(2).optional(),
      url: z.string().nullable().optional(),
      contentHtml: z.string().nullable().optional(),
      imageUrl: z.string().nullable().optional(),
      order: z.number().int().optional(),
      // time estimation inputs (optional)
      estimatedSeconds: z.number().int().positive().nullable().optional(),
      estimatedMinutes: z.number().int().positive().optional(),
      durationSec: z.number().int().positive().optional()
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const existing = await prisma.learningMaterial.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const payload = parse.data;
    // Recompute estimate if any relevant field provided
    let estimatedSeconds = existing.estimatedSeconds ?? null;
    const needsRecompute = typeof payload.estimatedSeconds !== 'undefined'
      || typeof payload.estimatedMinutes !== 'undefined'
      || typeof payload.durationSec !== 'undefined'
      || (typeof payload.contentHtml !== 'undefined')
      || (payload.kind && payload.kind !== existing.kind);
    if (needsRecompute) {
      estimatedSeconds = computeEstimatedSeconds(payload.kind ?? existing.kind, {
        ...payload,
        contentHtml: (typeof payload.contentHtml !== 'undefined') ? payload.contentHtml ?? undefined : existing.contentHtml ?? undefined
      });
    }
    const material = await prisma.learningMaterial.update({
      where: { id },
      data: {
        ...(payload.kind ? { kind: payload.kind } : {}),
        ...(typeof payload.title !== 'undefined' ? { title: payload.title } : {}),
        ...(typeof payload.url !== 'undefined' ? { url: payload.url } : {}),
        ...(typeof payload.contentHtml !== 'undefined' ? { contentHtml: payload.contentHtml } : {}),
        ...(typeof payload.imageUrl !== 'undefined' ? { imageUrl: payload.imageUrl } : {}),
        ...(typeof payload.order !== 'undefined' ? { order: payload.order } : {}),
        ...(estimatedSeconds != null ? { estimatedSeconds } : {})
      }
    });
    return res.json({ material });
  });
  router.delete('/materials/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    await prisma.learningMaterial.delete({ where: { id } });
    return res.json({ ok: true });
  });

	// Questions (MCQ or Vignette-based, CR)
	router.get('/questions', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const topicId = req.query.topicId?.toString();
		const level = req.query.level?.toString();
		const where = {
			AND: [
				topicId ? { topicId } : {},
				level ? { level } : {}
			]
		};
		const questions = await prisma.question.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			select: { id: true, stem: true, type: true, level: true, difficulty: true, createdAt: true }
		});
		return res.json({ questions });
  });
	router.post('/questions', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			stem: z.string().min(5),
			type: z.enum(['MCQ', 'VIGNETTE_MCQ', 'CONSTRUCTED_RESPONSE']),
			level: z.enum(['NONE','LEVEL1', 'LEVEL2', 'LEVEL3']),
			difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
			topicId: z.string(),
			vignetteText: z.string().optional(),
			options: z.array(z.object({ text: z.string(), isCorrect: z.boolean() })).optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const { vignetteText, options, ...q } = parse.data;
		let vignette = null;
		if (q.type === 'VIGNETTE_MCQ' && vignetteText) {
			vignette = await prisma.vignette.create({ data: { text: vignetteText } });
		}
		const question = await prisma.question.create({
			data: { ...q, vignetteId: vignette?.id ?? null }
		});
		if (q.type !== 'CONSTRUCTED_RESPONSE' && options && options.length) {
			await prisma.mcqOption.createMany({
				data: options.map(o => ({ questionId: question.id, text: o.text, isCorrect: o.isCorrect }))
			});
		}
		const full = await prisma.question.findUnique({
			where: { id: question.id },
			include: { options: true, vignette: true }
		});
		return res.status(201).json({ question: full });
	});
  router.get('/questions/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const q = await prisma.question.findUnique({
      where: { id },
      include: { options: true, vignette: true }
    });
    if (!q) return res.status(404).json({ error: 'Not found' });
    return res.json({ question: q });
  });
  router.put('/questions/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    const schema = z.object({
      stem: z.string().min(5).optional(),
      type: z.enum(['MCQ', 'VIGNETTE_MCQ', 'CONSTRUCTED_RESPONSE']).optional(),
      level: z.enum(['NONE','LEVEL1', 'LEVEL2', 'LEVEL3']).optional(),
      difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
      topicId: z.string().optional(),
      vignetteText: z.string().optional(),
      options: z.array(z.object({ text: z.string(), isCorrect: z.boolean() })).optional()
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const payload = parse.data;
    const existing = await prisma.question.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const newType = payload.type ?? existing.type;
    let vignetteId = existing.vignetteId ?? null;
    // Handle vignette changes
    if (newType === 'VIGNETTE_MCQ') {
      if (payload.vignetteText) {
        if (vignetteId) {
          const v = await prisma.vignette.update({ where: { id: vignetteId }, data: { text: payload.vignetteText } });
          vignetteId = v.id;
        } else {
          const v = await prisma.vignette.create({ data: { text: payload.vignetteText } });
          vignetteId = v.id;
        }
      }
    } else {
      vignetteId = null;
    }
    // Update core question fields
    const updated = await prisma.question.update({
      where: { id },
      data: {
        ...(typeof payload.stem !== 'undefined' ? { stem: payload.stem } : {}),
        ...(typeof payload.type !== 'undefined' ? { type: payload.type } : {}),
        ...(typeof payload.level !== 'undefined' ? { level: payload.level } : {}),
        ...(typeof payload.difficulty !== 'undefined' ? { difficulty: payload.difficulty } : {}),
        ...(typeof payload.topicId !== 'undefined' ? { topicId: payload.topicId } : {}),
        vignetteId
      }
    });
    // Options
    if (newType !== 'CONSTRUCTED_RESPONSE' && payload.options) {
      await prisma.mcqOption.deleteMany({ where: { questionId: id } });
      if (payload.options.length) {
        await prisma.mcqOption.createMany({
          data: payload.options.map(o => ({ questionId: id, text: o.text, isCorrect: o.isCorrect }))
        });
      }
    } else if (newType === 'CONSTRUCTED_RESPONSE') {
      await prisma.mcqOption.deleteMany({ where: { questionId: id } });
    }
    const full = await prisma.question.findUnique({
      where: { id },
      include: { options: true, vignette: true }
    });
    return res.json({ question: full });
  });
  router.delete('/questions/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
    const id = req.params.id;
    await prisma.mcqOption.deleteMany({ where: { questionId: id } });
    await prisma.question.delete({ where: { id } });
    return res.json({ ok: true });
  });

	// Revision summaries
	router.get('/revision-summaries', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const level = req.query.level;
		const q = (req.query.q ?? '').toString().trim();
		const where = {
			AND: [level ? { level } : {}, q ? { title: { contains: q, mode: 'insensitive' } } : {}]
		};
		const [total, summaries] = await Promise.all([
			prisma.revisionSummary.count({ where }),
			prisma.revisionSummary.findMany({ where, orderBy: { createdAt: 'desc' } })
		]);
		return res.json({ summaries, total });
	});
	router.post('/revision-summaries', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			title: z.string().min(3),
			level: z.enum(['NONE','LEVEL1', 'LEVEL2', 'LEVEL3']),
			topicId: z.string().optional(),
			contentUrl: z.string().url().optional(),
			contentHtml: z.string().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const summary = await prisma.revisionSummary.create({ data: parse.data });
		return res.status(201).json({ summary });
	});
	router.put('/revision-summaries/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		const schema = z.object({
			title: z.string().min(3),
			level: z.enum(['NONE','LEVEL1', 'LEVEL2', 'LEVEL3']),
			topicId: z.string().optional(),
			contentUrl: z.string().url().optional(),
			contentHtml: z.string().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const summary = await prisma.revisionSummary.update({ where: { id }, data: parse.data });
		return res.json({ summary });
	});
	router.delete('/revision-summaries/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		await prisma.revisionSummary.delete({ where: { id } });
		return res.json({ ok: true });
	});

	return router;
}

// Helpers
function computeEstimatedSeconds(kind, payload) {
  // 1) Direct inputs
  if (typeof payload.estimatedSeconds === 'number' && payload.estimatedSeconds > 0) {
    return payload.estimatedSeconds;
  }
  if (typeof payload.estimatedMinutes === 'number' && payload.estimatedMinutes > 0) {
    return payload.estimatedMinutes * 60;
  }
  // 2) Kind-based heuristics
  if (kind === 'VIDEO') {
    if (typeof payload.durationSec === 'number' && payload.durationSec > 0) {
      return Math.max(60, payload.durationSec); // at least 1 minute
    }
    return 5 * 60; // default 5 min if unknown
  }
  if (kind === 'HTML' && typeof payload.contentHtml === 'string') {
    const text = payload.contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const words = text ? text.split(' ').length : 0;
    const minutes = Math.max(1, Math.ceil(words / 200)); // ~200 wpm
    return minutes * 60;
  }
  // PDFs/Links/Images default small slot unless provided
  return 2 * 60;
}


