function errorResult(statusCode, error, details = undefined) {
	return { ok: false, statusCode, error, ...(details ? { details } : {}) };
}

export async function grantManualCourseAccess(prisma, { userId, productId, currentPeriodEnd = null } = {}) {
	if (!userId || !productId) return errorResult(400, 'userId and productId are required.');
	const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
	if (!user) return errorResult(404, 'User not found.');
	const product = await prisma.product.findUnique({
		where: { id: productId },
		include: { courseLinks: { select: { courseId: true } } }
	});
	if (!product) return errorResult(404, 'Product not found.');
	if (!product.active) return errorResult(400, 'Product is inactive.');
	if (!product.courseLinks.length) return errorResult(400, 'Product has no linked courses, so manual access would grant no entitlements.');
	let periodEnd = null;
	if (currentPeriodEnd) {
		const parsed = new Date(currentPeriodEnd);
		if (Number.isNaN(parsed.getTime())) return errorResult(400, 'currentPeriodEnd must be a valid date.');
		if (parsed.getTime() <= Date.now()) return errorResult(400, 'currentPeriodEnd must be in the future.');
		periodEnd = parsed;
	}
	const reference = `manual:${product.id}`;
	const existing = await prisma.subscription.findUnique({
		where: { userId_provider: { userId, provider: 'MANUAL' } }
	});
	if (existing?.status === 'ACTIVE' && existing.providerReference && existing.providerReference !== reference) {
		return errorResult(409, 'This user already has a different active manual access subscription.');
	}
	const result = await prisma.$transaction(async tx => {
		const subscription = await tx.subscription.upsert({
			where: { userId_provider: { userId, provider: 'MANUAL' } },
			update: {
				status: 'ACTIVE',
				plan: product.name,
				currency: 'usd',
				providerReference: reference,
				currentPeriodEnd: periodEnd
			},
			create: {
				userId,
				provider: 'MANUAL',
				status: 'ACTIVE',
				plan: product.name,
				currency: 'usd',
				providerReference: reference,
				currentPeriodEnd: periodEnd
			}
		});
		const enrollments = [];
		for (const link of product.courseLinks) {
			const enrollment = await tx.enrollment.upsert({
				where: { userId_courseId: { userId, courseId: link.courseId } },
				update: {},
				create: { userId, courseId: link.courseId }
			});
			enrollments.push(enrollment);
		}
		return { subscription, enrollments };
	});
	return { ok: true, ...result, product: { id: product.id, name: product.name }, user };
}
