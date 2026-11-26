import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { grantManualCourseAccess } from '../src/lib/billing/manualAccess.js';

const enabled = Boolean(process.env.DATABASE_URL);

test('manual access grants one-time product course entitlements without Stripe', { skip: !enabled }, async () => {
	const prisma = new PrismaClient();
	let userId;
	let productId;
	try {
		const course = await prisma.course.findFirst({ where: { active: true }, orderBy: { name: 'asc' } });
		if (!course) return;
		const stamp = Date.now();
		const user = await prisma.user.create({
			data: {
				email: `manual-access-${stamp}@example.test`,
				passwordHash: 'not-a-real-password',
				firstName: 'Manual',
				lastName: 'Access',
				role: 'STUDENT',
				level: course.level
			}
		});
		userId = user.id;
		const product = await prisma.product.create({
			data: {
				name: `Manual Access Test ${stamp}`,
				priceCents: 1000,
				interval: 'ONE_TIME',
				active: true,
				courseLinks: { create: [{ courseId: course.id }] }
			}
		});
		productId = product.id;
		const result = await grantManualCourseAccess(prisma, { userId, productId });
		assert.equal(result.ok, true, JSON.stringify(result));
		assert.equal(result.subscription.status, 'ACTIVE');
		assert.equal(result.subscription.provider, 'MANUAL');
		assert.equal(result.subscription.plan, product.name);
		assert.equal(result.enrollments.length, 1);
		assert.equal(result.enrollments[0].courseId, course.id);
		const subscription = await prisma.subscription.findUnique({ where: { userId_provider: { userId, provider: 'MANUAL' } } });
		assert.equal(subscription.status, 'ACTIVE');
		const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId: course.id } } });
		assert.ok(enrollment);
		const repeat = await grantManualCourseAccess(prisma, { userId, productId });
		assert.equal(repeat.ok, true);
		assert.equal(await prisma.enrollment.count({ where: { userId, courseId: course.id } }), 1);
	} finally {
		if (userId) {
			await prisma.subscription.deleteMany({ where: { userId } }).catch(() => {});
			await prisma.enrollment.deleteMany({ where: { userId } }).catch(() => {});
			await prisma.user.delete({ where: { id: userId } }).catch(() => {});
		}
		if (productId) await prisma.product.delete({ where: { id: productId } }).catch(() => {});
		await prisma.$disconnect();
	}
});
test('manual access can use an existing active one-time product and linked course', { skip: !enabled }, async () => {
	const prisma = new PrismaClient();
	let userId;
	try {
		const product = await prisma.product.findFirst({
			where: { active: true, interval: 'ONE_TIME', courseLinks: { some: {} } },
			include: { courseLinks: { select: { courseId: true } } },
			orderBy: { createdAt: 'asc' }
		});
		if (!product) return;
		const stamp = Date.now();
		const user = await prisma.user.create({
			data: {
				email: `existing-product-access-${stamp}@example.test`,
				passwordHash: 'not-a-real-password',
				role: 'STUDENT',
				level: 'LEVEL3'
			}
		});
		userId = user.id;
		const result = await grantManualCourseAccess(prisma, { userId, productId: product.id });
		assert.equal(result.ok, true, JSON.stringify(result));
		assert.equal(result.subscription.plan, product.name);
		assert.equal(result.enrollments.length, product.courseLinks.length);
	} finally {
		if (userId) {
			await prisma.subscription.deleteMany({ where: { userId } }).catch(() => {});
			await prisma.enrollment.deleteMany({ where: { userId } }).catch(() => {});
			await prisma.user.delete({ where: { id: userId } }).catch(() => {});
		}
		await prisma.$disconnect();
	}
});