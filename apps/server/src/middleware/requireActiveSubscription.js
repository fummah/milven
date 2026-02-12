export function requireActiveSubscription(prisma) {
	return async (req, res, next) => {
		if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
		const sub = await prisma.subscription.findFirst({
			where: { userId: req.user.id, status: { in: ['ACTIVE', 'PAST_DUE'] } }
		});
		if (!sub) return res.status(402).json({ error: 'Subscription required' });
		return next();
	};
}


