import jwt from 'jsonwebtoken';

export function requireAuth() {
	return (req, res, next) => {
		const auth = req.headers.authorization || '';
		const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
		if (!token) return res.status(401).json({ error: 'Unauthorized' });
		try {
			const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'dev_secret');
			req.user = { id: payload.sub, role: payload.role, level: payload.level };
			return next();
		} catch {
			return res.status(401).json({ error: 'Unauthorized' });
		}
	};
}


