import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import jwt from 'jsonwebtoken';

export function usersRouter(prisma) {
	const router = Router();
	// Public: list users (paginated) - NOTE: exposed for development use only
	router.get('/', async (req, res) => {
		const take = Math.min(Math.max(parseInt(req.query.take ?? '25', 10), 1), 100);
		const skip = Math.max(parseInt(req.query.skip ?? '0', 10), 0);
		const role = req.query.role;
		const level = req.query.level;
		const q = (req.query.q ?? '').toString().trim();
		const where = {
			AND: [
				role ? { role } : {},
				level ? { level } : {},
				q ? { email: { contains: q, mode: 'insensitive' } } : {}
			]
		};
		const [total, rawUsers] = await Promise.all([
			prisma.user.count({ where }),
			prisma.user.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				take,
				skip,
				select: {
					id: true,
					email: true,
					role: true,
					level: true,
					firstName: true,
					lastName: true,
					phone: true,
					country: true,
					emailVerifiedAt: true,
					createdAt: true,
					subscriptions: {
						orderBy: { updatedAt: 'desc' },
						take: 1,
						select: { status: true, provider: true }
					},
					enrollments: {
						orderBy: { createdAt: 'desc' },
						take: 1,
						select: {
							course: { select: { id: true, name: true, level: true } }
						}
					}
				}
			})
		]);
		const users = rawUsers.map(u => ({
			id: u.id,
			email: u.email,
			role: u.role,
			level: u.level,
			firstName: u.firstName,
			lastName: u.lastName,
			phone: u.phone,
			country: u.country,
			customRole: u.customRoleId ? u.customRole : null,
			emailVerifiedAt: u.emailVerifiedAt,
			createdAt: u.createdAt,
			subscription: u.subscriptions?.[0]?.status ?? 'INCOMPLETE',
			subscriptionProvider: u.subscriptions?.[0]?.provider ?? null,
			course: u.enrollments?.[0]?.course ?? null
		}));
		return res.json({ users, total, take, skip });
	});
	// Current user (public-friendly: returns { user: null } when no/invalid token)
	router.get('/me', async (req, res) => {
		try {
			const auth = req.headers.authorization || '';
			const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
			if (!token) return res.json({ user: null });
			const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'dev_secret');
			const user = await prisma.user.findUnique({
				where: { id: payload.sub },
				select: { id: true, email: true, role: true, level: true, emailVerifiedAt: true, firstName: true, lastName: true, phone: true, country: true }
			});
			return res.json({ user });
		} catch {
			// On invalid token, do not throw 401 for this endpoint; return null to avoid noisy errors
			return res.json({ user: null });
		}
	});
	// Authenticated user: update own profile (must be before PUT /:id so /me is not matched as id)
	router.put('/me', requireAuth(), async (req, res) => {
		const schema = z.object({
			firstName: z.string().max(200).optional(),
			lastName: z.string().max(200).optional(),
			phone: z.string().max(50).optional(),
			country: z.string().max(120).optional(),
			level: z.enum(['NONE','LEVEL1','LEVEL2','LEVEL3']).optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const data = { ...parse.data };
		try {
			const updated = await prisma.user.update({
				where: { id: req.user.id },
				data,
				select: { id: true, email: true, role: true, level: true, firstName: true, lastName: true, phone: true, country: true }
			});
			return res.json({ user: updated });
		} catch (e) {
			return res.status(500).json({ error: 'Failed to update profile' });
		}
	});
	// Admin: get single user with details
	router.get('/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		const user = await prisma.user.findUnique({
			where: { id },
			select: {
				id: true, email: true, role: true, level: true,
				firstName: true, lastName: true, phone: true, country: true,
				emailVerifiedAt: true, createdAt: true, updatedAt: true,
				enrollments: {
					orderBy: { createdAt: 'desc' },
					select: {
						id: true, createdAt: true, status: true,
						course: { select: { id: true, name: true, level: true, active: true } }
					}
				},
				subscriptions: {
					orderBy: { updatedAt: 'desc' },
					select: {
						id: true, provider: true, status: true, currency: true, plan: true, currentPeriodEnd: true, createdAt: true, updatedAt: true
					}
				},
				payments: {
					orderBy: { createdAt: 'desc' },
					select: { id: true, provider: true, reference: true, amount: true, currency: true, status: true, createdAt: true }
				}
			}
		});
		if (!user) return res.status(404).json({ error: 'Not found' });
		return res.json({ user });
	});
	// Admin: get student progress per enrolled course (progress %, exams taken, overall exam status)
	router.get('/:id/progress', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const userId = req.params.id;
		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (!user) return res.status(404).json({ error: 'User not found' });
		const enrollments = await prisma.enrollment.findMany({
			where: { userId },
			orderBy: { createdAt: 'desc' },
			include: { course: { select: { id: true, name: true, level: true } } }
		});
		const courseIds = enrollments.map(e => e.courseId);
		const [courseProgresses, attempts] = await Promise.all([
			prisma.courseProgress.findMany({
				where: { userId, courseId: { in: courseIds } },
				select: { courseId: true, percent: true, timeSpentSec: true, completedAt: true }
			}),
			prisma.examAttempt.findMany({
				where: { userId, exam: { courseId: { in: courseIds } } },
				orderBy: { startedAt: 'desc' },
				include: {
					exam: { select: { id: true, name: true, type: true, courseId: true, topicId: true } }
				}
			})
		]);
		const progressByCourse = Object.fromEntries(courseProgresses.map(p => [p.courseId, p]));
		const attemptsByCourse = new Map();
		for (const a of attempts) {
			const cid = a.exam?.courseId;
			if (!cid) continue;
			if (!attemptsByCourse.has(cid)) attemptsByCourse.set(cid, []);
			attemptsByCourse.get(cid).push({
				id: a.id,
				examName: a.exam?.name,
				examType: a.exam?.type || (a.exam?.topicId ? 'QUIZ' : 'COURSE'),
				status: a.status,
				scorePercent: a.scorePercent,
				startedAt: a.startedAt,
				submittedAt: a.submittedAt
			});
		}
		const PASSING_PERCENT = 70;
		const courses = enrollments.map(e => {
			const prog = progressByCourse[e.courseId];
			const courseAttempts = attemptsByCourse.get(e.courseId) || [];
			const submittedCourseAttempts = courseAttempts.filter(a => a.examType === 'COURSE' && a.status === 'SUBMITTED');
			const latestCourseAttempt = submittedCourseAttempts[0];
			let overallExamStatus = 'Not taken';
			if (latestCourseAttempt) {
				overallExamStatus = (latestCourseAttempt.scorePercent != null && latestCourseAttempt.scorePercent >= PASSING_PERCENT) ? 'Passed' : 'Failed';
			}
			return {
				courseId: e.courseId,
				courseName: e.course?.name,
				courseLevel: e.course?.level,
				enrollmentStatus: e.status,
				progressPercent: Math.round(prog?.percent ?? 0),
				timeSpentSec: prog?.timeSpentSec ?? 0,
				completedAt: prog?.completedAt ?? null,
				attempts: courseAttempts,
				overallExamStatus
			};
		});
		return res.json({ courses });
	});
	// Admin: create user
	router.post('/', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			email: z.string().email(),
			password: z.string().min(8),
			role: z.enum(['STUDENT', 'ADMIN']),
			level: z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3']),
			firstName: z.string().optional(),
			lastName: z.string().optional(),
			phone: z.string().optional(),
			country: z.string().optional(),
			courseId: z.string().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const { email, password, role, level, firstName, lastName, phone, country, courseId } = parse.data;
		const exists = await prisma.user.findUnique({ where: { email } });
		if (exists) return res.status(409).json({ error: 'Email already in use' });
		let effectiveLevel = level;
		if (courseId) {
			const course = await prisma.course.findUnique({ where: { id: courseId } });
			if (course) effectiveLevel = course.level;
		}
		const passwordHash = await bcrypt.hash(password, 12);
		const user = await prisma.user.create({
			data: { email, passwordHash, role, level: effectiveLevel, firstName, lastName, phone, country },
			select: {
				id: true, email: true, role: true, level: true,
				firstName: true, lastName: true, phone: true, country: true,
				createdAt: true, emailVerifiedAt: true
			}
		});
		if (courseId) {
			const existsEnroll = await prisma.enrollment.findFirst({ where: { userId: user.id, courseId } });
			if (!existsEnroll) {
				await prisma.enrollment.create({ data: { userId: user.id, courseId } });
			}
		}
		return res.status(201).json({ user });
	});
	// Admin: update user
	router.put('/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		const schema = z.object({
			role: z.enum(['STUDENT', 'ADMIN']).optional(),
			level: z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3']).optional(),
			password: z.string().min(8).optional(),
			firstName: z.string().optional(),
			lastName: z.string().optional(),
			phone: z.string().optional(),
			country: z.string().optional(),
			courseId: z.string().optional(),
			verified: z.boolean().optional()
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const data = { ...parse.data };
		if (typeof data.verified === 'boolean') {
			data.emailVerifiedAt = data.verified ? new Date() : null;
		}
		delete data.verified;
		// set level from course if provided
		if (data.courseId) {
			const course = await prisma.course.findUnique({ where: { id: data.courseId } });
			if (course) {
				// @ts-ignore
				data.level = course.level;
			}
		}
		if (data.password) {
			const passwordHash = await bcrypt.hash(data.password, 12);
			// @ts-ignore
			data.passwordHash = passwordHash;
			// @ts-ignore
			delete data.password;
		}
		// Avoid persisting courseId in User record
		// @ts-ignore
		const selectedCourseId = data.courseId;
		// @ts-ignore
		delete data.courseId;
		const user = await prisma.user.update({
			where: { id },
			data,
			select: {
				id: true, email: true, role: true, level: true,
				firstName: true, lastName: true, phone: true, country: true,
				createdAt: true, emailVerifiedAt: true
			}
		});
		if (selectedCourseId) {
			const existsEnroll = await prisma.enrollment.findFirst({ where: { userId: id, courseId: selectedCourseId } });
			if (!existsEnroll) {
				await prisma.enrollment.create({ data: { userId: id, courseId: selectedCourseId } });
			}
		}
		return res.json({ user });
	});
	// Admin: delete user
	router.delete('/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const id = req.params.id;
		const result = await prisma.user.deleteMany({ where: { id } });
		if (result.count === 0) {
			return res.status(404).json({ error: 'Not found' });
		}
		return res.json({ ok: true, deleted: result.count });
	});
	// Admin: enroll user in one or more courses
	router.post('/:id/enrollments', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const userId = req.params.id;
		const schema = z.object({
			courseIds: z.array(z.string().min(1)).min(1, 'Select at least one course')
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		const { courseIds } = parse.data;
		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (!user) return res.status(404).json({ error: 'User not found' });
		const existing = await prisma.enrollment.findMany({
			where: { userId, courseId: { in: courseIds } },
			select: { courseId: true }
		});
		const existingIds = new Set(existing.map(e => e.courseId));
		const toEnroll = courseIds.filter(cid => !existingIds.has(cid));
		if (toEnroll.length === 0) {
			return res.status(400).json({ error: 'User is already enrolled in all selected courses' });
		}
		await prisma.enrollment.createMany({
			data: toEnroll.map(courseId => ({ userId, courseId }))
		});
		const enrolled = await prisma.enrollment.findMany({
			where: { userId, courseId: { in: toEnroll } },
			orderBy: { createdAt: 'desc' },
			select: { id: true, courseId: true, status: true, createdAt: true, course: { select: { id: true, name: true, level: true, active: true } } }
		});
		return res.status(201).json({ enrolled, count: enrolled.length });
	});

	// Admin: update enrollment status (In Progress, Completed, Cancelled)
	router.put('/:id/enrollments/:courseId', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const userId = req.params.id;
		const courseId = req.params.courseId;
		const schema = z.object({
			status: z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
		try {
			const enrollment = await prisma.enrollment.findFirst({ where: { userId, courseId } });
			if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' });
			const updated = await prisma.enrollment.update({
				where: { id: enrollment.id },
				data: { status: parse.data.status },
				select: { id: true, status: true, courseId: true, createdAt: true, course: { select: { id: true, name: true, level: true, active: true } } }
			});
			return res.json({ enrollment: updated });
		} catch (e) {
			return res.status(500).json({ error: 'Failed to update status' });
		}
	});

	// Admin: unenroll user from a course
	router.delete('/:id/enrollments/:courseId', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const userId = req.params.id;
		const courseId = req.params.courseId;
		try {
			const result = await prisma.enrollment.deleteMany({ where: { userId, courseId } });
			if (result.count === 0) {
				return res.status(404).json({ error: 'Enrollment not found' });
			}
			return res.json({ ok: true, removed: result.count });
		} catch (e) {
			return res.status(500).json({ error: 'Failed to unenroll' });
		}
	});
	// Dev-only: quick check that users table exists and has rows
	router.get('/debug-count', async (req, res) => {
		if (process.env.ALLOW_DEBUG !== '1') {
			return res.status(404).json({ error: 'Not found' });
		}
		try {
			const count = await prisma.user.count();
			const sample = await prisma.user.findFirst({
				select: { id: true, email: true, role: true, level: true, createdAt: true }
			});
			return res.json({ count, sample });
		} catch (e) {
			return res.status(500).json({ error: 'DB error', details: e?.message ?? String(e) });
		}
	});
	return router;
}


