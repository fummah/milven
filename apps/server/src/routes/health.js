import { Router } from 'express';

export function healthRouter() {
	const router = Router();
	router.get('/', (_req, res) => {
		res.json({ status: 'ok', service: 'mutingwende-api', timestamp: new Date().toISOString() });
	});
	return router;
}


