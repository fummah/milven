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

  async function getDefaultVolumeIdForCourse(courseId) {
    if (!courseId) return null;
    const existingLink = await prisma.courseVolume.findFirst({
      where: { courseId: String(courseId) },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { volumeId: true }
    });
    if (existingLink?.volumeId) return existingLink.volumeId;

    const createdVolume = await prisma.volume.create({
      data: { name: 'Volume 1' },
      select: { id: true }
    });
    await prisma.courseVolume.create({
      data: { courseId: String(courseId), volumeId: createdVolume.id, order: 1 }
    });
    return createdVolume.id;
  }

  async function getOrCreateUnassignedModuleForCourse(courseId) {
    if (!courseId) return null;
    const course = await prisma.course.findUnique({ where: { id: String(courseId) }, select: { id: true, level: true } });
    if (!course) return null;
    const volumeId = await getDefaultVolumeIdForCourse(course.id);
    if (!volumeId) return null;
    const existing = await prisma.module.findFirst({
      where: { volumeId, courseId: course.id, name: 'Unassigned' },
      select: { id: true }
    });
    if (existing?.id) return existing.id;
    const max = await prisma.module.findFirst({
      where: { volumeId, courseId: course.id },
      orderBy: [{ order: 'desc' }, { createdAt: 'desc' }],
      select: { order: true }
    });
    const created = await prisma.module.create({
      data: {
        name: 'Unassigned',
        level: course.level,
        courseId: course.id,
        volumeId,
        order: (max?.order ?? 0) + 1
      },
      select: { id: true }
    });
    return created.id;
  }

  async function deriveQuestionPathIdsFromTopic(topicId) {
    if (!topicId) return { courseId: null, volumeId: null, moduleId: null };
    const topic = await prisma.topic.findUnique({
      where: { id: String(topicId) },
      select: {
        moduleId: true,
        module: {
          select: {
            courseId: true,
            volumeId: true
          }
        }
      }
    });
    const moduleId = topic?.moduleId ?? null;
    const volumeId = topic?.module?.volumeId ?? null;
    const courseId = topic?.module?.courseId ?? null;
    return { courseId, volumeId, moduleId };
  }

  async function assertVolumeLinkedToCourse({ courseId, volumeId }) {
    if (!courseId || !volumeId) return false;
    const link = await prisma.courseVolume.findUnique({
      where: { courseId_volumeId: { courseId: String(courseId), volumeId: String(volumeId) } },
      select: { courseId: true }
    }).catch(() => null);
    return !!link;
  }

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
    const [volLinks, modulesWithTopics, topics] = await Promise.all([
      prisma.courseVolume.findMany({
        where: { courseId: id },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: { volume: true }
      }),
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
    const volumes = (volLinks || []).map(l => ({ ...l.volume, order: l.order ?? null }));
    volumes.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
    return res.json({
      course: {
        ...course,
        products,
        enrollments: uniqueEnrollments
      },
      volumes,
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

	// Volumes
	router.get('/volumes', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const courseId = (req.query.courseId ?? '').toString().trim();
		if (courseId) {
			const links = await prisma.courseVolume.findMany({
				where: { courseId },
				orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
				include: {
					volume: {
						include: {
							modules: {
								where: { courseId },
								orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
								select: { id: true }
							}
						}
					}
				}
			});
			const volumes = links.map(l => ({ ...l.volume, order: l.order ?? null }));
			volumes.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
			return res.json({ volumes });
		}
		const volumes = await prisma.volume.findMany({
			orderBy: [{ name: 'asc' }],
			include: {
				courseLinks: {
					orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
					include: { course: { select: { id: true, name: true, level: true } } }
				}
			}
		});
		return res.json({ volumes });
	});
	router.post('/volumes', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			name: z.string().min(2),
			description: z.string().optional(),
			courseId: z.string().optional(),
			courseIds: z.array(z.string()).optional(),
			order: z.number().int().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const volume = await prisma.volume.create({ data: { name: parse.data.name, description: parse.data.description } });
		// Handle multiple course links
		const courseIds = parse.data.courseIds || (parse.data.courseId ? [parse.data.courseId] : []);
		if (courseIds.length > 0) {
			for (const courseId of courseIds) {
				const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
				if (!course) continue; // Skip invalid course IDs
				const max = await prisma.courseVolume.findFirst({ where: { courseId }, orderBy: { order: 'desc' }, select: { order: true } });
				const order = parse.data.order ?? ((max?.order ?? 0) + 1);
				await prisma.courseVolume.upsert({
					where: { courseId_volumeId: { courseId, volumeId: volume.id } },
					update: { order },
					create: { courseId, volumeId: volume.id, order }
				});
			}
		}
		return res.status(201).json({ volume });
	});
	router.get('/volumes/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		const volume = await prisma.volume.findUnique({
			where: { id },
			include: {
				courseLinks: {
					orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
					include: { course: { select: { id: true, name: true, level: true } } }
				}
			}
		});
		if (!volume) return res.status(404).json({ error: 'Volume not found' });
		return res.json({ volume });
	});

	router.put('/volumes/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		const schema = z.object({
			name: z.string().min(2).optional(),
			description: z.string().optional(),
			// course linkage is managed via /courses/:courseId/volumes endpoints
			order: z.number().int().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const volume = await prisma.volume.update({ 
		where: { id }, 
		data: { 
			...(parse.data.name ? { name: parse.data.name } : {}),
			...(parse.data.description ? { description: parse.data.description } : {})
		} 
	});
		return res.json({ volume });
	});
	router.delete('/volumes/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		await prisma.volume.delete({ where: { id } });
		return res.json({ ok: true });
	});

	// Course ↔ Volume links
	router.get('/courses/:courseId/volumes', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const courseId = req.params.courseId;
		const links = await prisma.courseVolume.findMany({
			where: { courseId },
			orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
			include: { volume: true }
		});
		const volumes = links.map(l => ({ ...l.volume, order: l.order ?? null }));
		volumes.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
		return res.json({ volumes });
	});
	router.post('/courses/:courseId/volumes', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const courseId = req.params.courseId;
		const schema = z.object({ volumeId: z.string().min(1), order: z.number().int().optional() });
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
		if (!course) return res.status(400).json({ error: 'Invalid courseId' });
		const volume = await prisma.volume.findUnique({ where: { id: parse.data.volumeId }, select: { id: true } });
		if (!volume) return res.status(400).json({ error: 'Invalid volumeId' });
		const max = await prisma.courseVolume.findFirst({ where: { courseId }, orderBy: { order: 'desc' }, select: { order: true } });
		const order = parse.data.order ?? ((max?.order ?? 0) + 1);
		const link = await prisma.courseVolume.upsert({
			where: { courseId_volumeId: { courseId, volumeId: parse.data.volumeId } },
			update: { order },
			create: { courseId, volumeId: parse.data.volumeId, order }
		});
		return res.status(201).json({ link });
	});
	router.delete('/courses/:courseId/volumes/:volumeId', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const { courseId, volumeId } = req.params;
		// ensure no modules under this course use this volume
		const used = await prisma.module.count({ where: { courseId, volumeId } });
		if (used > 0) return res.status(400).json({ error: 'Cannot detach: modules exist under this course+volume' });
		await prisma.courseVolume.delete({ where: { courseId_volumeId: { courseId, volumeId } } });
		return res.json({ ok: true });
	});

  	// Modules (containers for topics; a module has many topics)
	router.get('/modules', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const level = req.query.level;
		const courseId = (req.query.courseId ?? '').toString().trim();
		const volumeId = (req.query.volumeId ?? '').toString().trim();
		const where = courseId
			? { courseId }
			: (volumeId ? { volumeId } : (level ? { level } : {}));
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
			volumeId: z.string().min(1),
			order: z.number().int().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const volumeId = String(parse.data.volumeId);
		const courseId = String(parse.data.courseId);
		const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, level: true } });
		if (!course) return res.status(400).json({ error: 'Invalid courseId' });
		const volume = await prisma.volume.findUnique({ where: { id: volumeId }, select: { id: true } });
		if (!volume) return res.status(400).json({ error: 'Invalid volumeId' });
		const linked = await assertVolumeLinkedToCourse({ courseId, volumeId });
		if (!linked) return res.status(400).json({ error: 'Volume is not linked to this course' });
		const level = course.level;
		const max = await prisma.module.findFirst({ where: { volumeId }, orderBy: { order: 'desc' }, select: { order: true } });
		const order = parse.data.order ?? (max?.order ?? 0) + 1;
		const module_ = await prisma.module.create({ data: { name: parse.data.name, level, courseId, volumeId, order } });
		return res.status(201).json({ module: module_ });
	});
	router.put('/modules/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		const schema = z.object({
			name: z.string().min(2).optional(),
			courseId: z.string().optional(),
			volumeId: z.string().optional(),
			order: z.number().int().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const existing = await prisma.module.findUnique({ where: { id }, select: { id: true, courseId: true, volumeId: true } });
		if (!existing) return res.status(404).json({ error: 'Not found' });
		const nextCourseId = parse.data.courseId ? String(parse.data.courseId) : existing.courseId;
		const nextVolumeId = parse.data.volumeId ? String(parse.data.volumeId) : existing.volumeId;
		const course = await prisma.course.findUnique({ where: { id: nextCourseId }, select: { id: true, level: true } });
		if (!course) return res.status(400).json({ error: 'Invalid courseId' });
		const volume = await prisma.volume.findUnique({ where: { id: nextVolumeId }, select: { id: true } });
		if (!volume) return res.status(400).json({ error: 'Invalid volumeId' });
		const linked = await assertVolumeLinkedToCourse({ courseId: nextCourseId, volumeId: nextVolumeId });
		if (!linked) return res.status(400).json({ error: 'Volume is not linked to this course' });
		const level = course.level;
		const module_ = await prisma.module.update({
			where: { id },
			data: {
				...(typeof parse.data.name !== 'undefined' ? { name: parse.data.name } : {}),
				level,
				courseId: nextCourseId,
				volumeId: nextVolumeId,
				...(typeof parse.data.order !== 'undefined' ? { order: parse.data.order } : {})
			}
		});
		return res.json({ module: module_ });
	});
	router.delete('/modules/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		const mod = await prisma.module.findUnique({ where: { id }, select: { id: true, courseId: true } });
		if (!mod) return res.status(404).json({ error: 'Not found' });
		const unassignedId = mod.courseId ? await getOrCreateUnassignedModuleForCourse(mod.courseId) : null;
		if (!unassignedId) return res.status(400).json({ error: 'Unable to find course/unassigned module for this module. Fix module.courseId first.' });
		await prisma.topic.updateMany({ where: { moduleId: id }, data: { moduleId: unassignedId } });
		await prisma.module.delete({ where: { id } });
		return res.json({ ok: true });
	});

	// Topics
	router.get('/topics', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const level = req.query.level;
		const courseId = (req.query.courseId ?? '').toString().trim();
		const moduleId = req.query.moduleId;
		const volumeId = req.query.volumeId?.toString();
		const q = (req.query.q ?? '').toString().trim();
		const where = {
			AND: [
				courseId ? { courseId } : {},
				(!courseId && level) ? { level } : {},
				moduleId ? { moduleId } : {},
				volumeId ? { module: { volumeId } } : {},
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
			moduleId: z.string().min(1),
			moduleNumber: z.number().int().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const courseId = parse.data.courseId;
		const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, level: true } });
		if (!course) return res.status(400).json({ error: 'Invalid courseId' });
		const level = course.level;
		const m = await prisma.module.findUnique({ where: { id: parse.data.moduleId }, select: { id: true, courseId: true, volumeId: true } });
		if (!m) return res.status(400).json({ error: 'Invalid moduleId' });
		if (m.courseId && m.courseId !== courseId) return res.status(400).json({ error: 'Module does not belong to this course' });
		if (!m.volumeId) return res.status(400).json({ error: 'Module is missing volumeId. Run backfill or fix module.' });
		const data = { ...parse.data, courseId, level, moduleId: parse.data.moduleId };
		const max = await prisma.topic.findFirst({
			where: { moduleId: data.moduleId, courseId },
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
		if (nextModuleId === null) {
			return res.status(400).json({ error: 'moduleId is required' });
		}
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
	function escapeCsvCell(v) {
		const s = String(v ?? '');
		if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
		return s;
	}
	function parseCsv(content) {
		const rows = [];
		let i = 0;
		let cell = '';
		let row = [];
		let inQuotes = false;
		while (i < content.length) {
			const ch = content[i];
			const next = content[i + 1];
			if (inQuotes) {
				if (ch === '"' && next === '"') {
					cell += '"';
					i += 2;
					continue;
				}
				if (ch === '"') {
					inQuotes = false;
					i += 1;
					continue;
				}
				cell += ch;
				i += 1;
				continue;
			}
			if (ch === '"') {
				inQuotes = true;
				i += 1;
				continue;
			}
			if (ch === ',') {
				row.push(cell);
				cell = '';
				i += 1;
				continue;
			}
			if (ch === '\n') {
				row.push(cell);
				rows.push(row);
				row = [];
				cell = '';
				i += 1;
				continue;
			}
			if (ch === '\r' && next === '\n') {
				row.push(cell);
				rows.push(row);
				row = [];
				cell = '';
				i += 2;
				continue;
			}
			cell += ch;
			i += 1;
		}
		if (cell.length > 0 || row.length > 0) {
			row.push(cell);
			rows.push(row);
		}
		return rows;
	}

	router.get('/questions/template.csv', requireAuth(), requireRole('ADMIN'), async (_req, res) => {
		const headers = [
			'topic_id',
			'question_text',
			'question_type',
			'answers',
			'correct_answer',
			'difficulty',
			'marks'
		];
		const sample = [
			'',
			'What is 2+2?',
			'MCQ',
			'1|2|3|4',
			'4',
			'EASY',
			'1'
		];
		const csv = `${headers.join(',')}\n${sample.map(escapeCsvCell).join(',')}\n`;
		res.setHeader('Content-Type', 'text/csv; charset=utf-8');
		res.setHeader('Content-Disposition', 'attachment; filename="question_template.csv"');
		return res.send(csv);
	});

	router.post('/questions/bulk-upload', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({ csv: z.string().min(1) });
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const csv = parse.data.csv;
		const rows = parseCsv(csv);
		if (rows.length < 2) return res.status(400).json({ error: 'CSV must include header and at least one row' });
		const header = rows[0].map(h => (h ?? '').toString().trim().toLowerCase());
		const idx = (name) => header.indexOf(name);
		const required = ['topic_id','question_text','question_type','difficulty','marks'];
		for (const r of required) {
			if (idx(r) < 0) return res.status(400).json({ error: `Missing column: ${r}` });
		}
		const errors = [];
		let createdCount = 0;

		for (let r = 1; r < rows.length; r++) {
			const row = rows[r];
			if (!row || row.every(c => !String(c ?? '').trim())) continue;
			const get = (col) => (row[idx(col)] ?? '').toString().trim();
			const topicId = get('topic_id');
			const questionText = get('question_text');
			const questionType = get('question_type');
			const answersRaw = (idx('answers') >= 0) ? get('answers') : '';
			const correctAnswerRaw = (idx('correct_answer') >= 0) ? get('correct_answer') : '';
			const difficulty = get('difficulty');
			const marksRaw = get('marks');

			const rowNum = r + 1;
			if (!topicId) {
				errors.push({ row: rowNum, error: 'Missing required topic_id' });
				continue;
			}
			if (!questionText) {
				errors.push({ row: rowNum, error: 'question_text required' });
				continue;
			}
			if (!['MCQ','VIGNETTE_MCQ','CONSTRUCTED_RESPONSE','TRUE_FALSE','SHORT_ANSWER'].includes(questionType)) {
				errors.push({ row: rowNum, error: `Unsupported question_type: ${questionType}` });
				continue;
			}
			if (!['EASY','MEDIUM','HARD'].includes(difficulty)) {
				errors.push({ row: rowNum, error: `Invalid difficulty: ${difficulty}` });
				continue;
			}
			const marks = Number(marksRaw || 1);
			if (!Number.isFinite(marks) || marks <= 0) {
				errors.push({ row: rowNum, error: 'marks must be a positive number' });
				continue;
			}

			try {
				// Derive hierarchy from topic
				const pathIds = await deriveQuestionPathIdsFromTopic(topicId);
				if (!pathIds.courseId || !pathIds.volumeId || !pathIds.moduleId) {
					throw new Error('Topic path is incomplete. Ensure topic has module and module has volume.');
				}

				const { courseId, volumeId, moduleId } = pathIds;
				const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, level: true } });
				if (!course) throw new Error('Derived course not found');

				const type = questionType === 'TRUE_FALSE'
					? 'MCQ'
					: (questionType === 'SHORT_ANSWER' ? 'CONSTRUCTED_RESPONSE' : questionType);

				const options = (type !== 'CONSTRUCTED_RESPONSE')
					? (answersRaw ? answersRaw.split('|').map(s => s.trim()).filter(Boolean) : [])
					: [];
				if (type !== 'CONSTRUCTED_RESPONSE') {
					if (options.length < 2) throw new Error('answers must include at least 2 options separated by |');
					if (!correctAnswerRaw) throw new Error('correct_answer required for MCQ');
					if (!options.includes(correctAnswerRaw)) throw new Error('correct_answer must match one of answers options exactly');
				}

				await prisma.$transaction(async (tx) => {
					const created = await tx.question.create({
						data: {
							stem: questionText,
							type,
							level: course.level,
							difficulty,
							marks,
							topicId,
							courseId,
							volumeId,
							moduleId
						}
					});
					if (type !== 'CONSTRUCTED_RESPONSE') {
						await tx.mcqOption.createMany({
							data: options.map(opt => ({
								questionId: created.id,
								text: opt,
								isCorrect: opt === correctAnswerRaw
							}))
						});
					}
				});

				createdCount += 1;
			} catch (e) {
				errors.push({ row: rowNum, error: e?.message ?? String(e) });
			}
		}

		return res.json({ created: createdCount, errors });
	});

	router.get('/questions', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const q = (req.query.q ?? '').toString().trim();
		const topicId = req.query.topicId?.toString();
		const topicIds = req.query.topicIds?.toString();
		const level = req.query.level?.toString();
		const courseId = req.query.courseId?.toString();
		const volumeId = req.query.volumeId?.toString();
		const moduleId = req.query.moduleId?.toString();
		const difficulty = req.query.difficulty?.toString();
		const difficulties = req.query.difficulties?.toString();
		const topicIdList = topicIds ? topicIds.split(',').filter(Boolean) : (topicId ? [topicId] : []);
		const difficultyList = difficulties ? difficulties.split(',').filter(Boolean) : (difficulty ? [difficulty] : []);
		const where = {
			AND: [
				q ? { stem: { contains: q, mode: 'insensitive' } } : {},
				topicIdList.length > 0 ? { topicId: { in: topicIdList } } : {},
				level ? { level } : {},
				courseId ? { courseId } : {},
				volumeId ? { volumeId } : {},
				moduleId ? { moduleId } : {},
				difficultyList.length > 0 ? { difficulty: { in: difficultyList } } : {}
			]
		};
		const questions = await prisma.question.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			select: { id: true, stem: true, type: true, level: true, difficulty: true, marks: true, topicId: true, courseId: true, volumeId: true, moduleId: true, createdAt: true }
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
			marks: z.number().int().positive().optional(),
			vignetteText: z.string().optional(),
			imageUrl: z.string().url().optional().nullable(),
			options: z.array(z.object({ text: z.string(), isCorrect: z.boolean() })).optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const { vignetteText, options, ...q } = parse.data;
		const pathIds = await deriveQuestionPathIdsFromTopic(q.topicId);
		if (!pathIds.courseId || !pathIds.volumeId || !pathIds.moduleId) {
			return res.status(400).json({ error: 'Topic path is incomplete. Ensure topic has module and module has volume.' });
		}
		let vignette = null;
		if (q.type === 'VIGNETTE_MCQ' && vignetteText) {
			vignette = await prisma.vignette.create({ data: { text: vignetteText } });
		}
		const question = await prisma.question.create({
			data: { ...q, ...pathIds, vignetteId: vignette?.id ?? null, imageUrl: parse.data.imageUrl || null }
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
      marks: z.number().int().positive().optional(),
      vignetteText: z.string().optional(),
      imageUrl: z.string().url().optional().nullable(),
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
		let pathIds = null;
		if (typeof payload.topicId !== 'undefined') {
			pathIds = await deriveQuestionPathIdsFromTopic(payload.topicId);
			if (!pathIds.courseId || !pathIds.volumeId || !pathIds.moduleId) {
				return res.status(400).json({ error: 'Topic path is incomplete. Ensure topic has module and module has volume.' });
			}
		}
    const updated = await prisma.question.update({
      where: { id },
      data: {
        ...(typeof payload.stem !== 'undefined' ? { stem: payload.stem } : {}),
        ...(typeof payload.type !== 'undefined' ? { type: payload.type } : {}),
        ...(typeof payload.level !== 'undefined' ? { level: payload.level } : {}),
        ...(typeof payload.difficulty !== 'undefined' ? { difficulty: payload.difficulty } : {}),
        ...(typeof payload.topicId !== 'undefined' ? { topicId: payload.topicId } : {}),
			...(typeof payload.marks !== 'undefined' ? { marks: payload.marks } : {}),
			...(typeof payload.imageUrl !== 'undefined' ? { imageUrl: payload.imageUrl } : {}),
			...(pathIds ? pathIds : {}),
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


