import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { usersRouter } from './routes/users.js';
import { examsRouter } from './routes/exams.js';
import { contentRouter } from './routes/content.js';
import { cmsRouter } from './routes/cms.js';
import { paymentsRouter } from './routes/payments.js';
import { billingRouter } from './routes/billing.js';
import { rolesRouter } from './routes/roles.js';
import { learningRouter } from './routes/learning.js';
import { reportsRouter } from './routes/reports.js';
import { settingsRouter } from './routes/settings.js';
import path from 'path';
import fs from 'fs';

// Compose DATABASE_URL from individual DB_* vars if not provided
if (!process.env.DATABASE_URL) {
	const host = process.env.DB_HOST ?? 'localhost';
	const user = process.env.DB_USER ?? 'postgres';
	const pass = encodeURIComponent(process.env.DB_PASSWORD ?? '');
	const name = process.env.DB_NAME ?? 'mutingwende';
	const port = process.env.DB_PORT ?? '5432';
	process.env.DATABASE_URL = `postgresql://${user}:${pass}@${host}:${port}/${name}?schema=public`;
}

const app = express();
const prisma = new PrismaClient();

// Prevent process crashes on unhandled errors; log and continue (nodemon will still restart on file changes)
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

async function ensureDefaultAdmin() {
	try {
		const email = process.env.DEFAULT_ADMIN_EMAIL ?? 'admin@milven.finance';
		const password = process.env.DEFAULT_ADMIN_PASSWORD ?? 'Milven#2026';
		const forceReset = (process.env.DEFAULT_ADMIN_FORCE_RESET ?? '').toString().toLowerCase() === 'true' || process.env.DEFAULT_ADMIN_FORCE_RESET === '1';
		const existing = await prisma.user.findUnique({ where: { email } });
		if (!existing) {
			const passwordHash = await bcrypt.hash(password, 12);
			await prisma.user.create({
				data: { email, passwordHash, role: 'ADMIN', level: 'LEVEL3', emailVerifiedAt: new Date() }
			});
			console.log(`[BOOT] Created default admin: ${email}`);
		} else if (forceReset) {
			const passwordHash = await bcrypt.hash(password, 12);
			await prisma.user.update({
				where: { email },
				data: { passwordHash, role: 'ADMIN', level: 'LEVEL3', emailVerifiedAt: existing.emailVerifiedAt ?? new Date() }
			});
			console.log(`[BOOT] Reset default admin password for: ${email}`);
		}
	} catch (e) {
		console.warn('[BOOT] ensureDefaultAdmin failed:', e?.message ?? e);
	}
}

app.use(
	helmet({
		// Allow media from /uploads to be consumed cross-origin (useful in dev and via CDNs)
		crossOriginResourcePolicy: { policy: 'cross-origin' }
	})
);
app.use(
	cors({
		origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173', 'http://localhost:3000','http://164.90.156.5'],
		credentials: true
	})
);
// Use JSON parser for all routes except Stripe webhook (needs raw body)
app.use((req, res, next) => {
	if (req.originalUrl === '/api/billing/stripe/webhook') {
		return next();
	}
	return express.json()(req, res, next);
});
app.use(morgan('dev'));
// Rate limiting (relaxed for dev; skip uploads and learning heartbeats)
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);
const RATE_LIMIT_MAX = Number(
	(process.env.ALLOW_DEBUG === '1' ? (process.env.RATE_LIMIT_MAX ?? 10000) : (process.env.RATE_LIMIT_MAX ?? 1000))
);
app.use(
	rateLimit({
		windowMs: RATE_LIMIT_WINDOW_MS,
		max: RATE_LIMIT_MAX,
		standardHeaders: true,
		legacyHeaders: false,
		skip: (req) => {
			// Do not rate-limit static uploads, health checks, or learning progress heartbeats
			if (req.path?.startsWith('/uploads')) return true;
			if (req.path === '/api/health') return true;
			if (req.path?.startsWith('/api/learning/progress')) return true;
			return false;
		}
	})
);

app.use('/api/health', healthRouter());
app.use('/api/auth', authRouter(prisma));
app.use('/api/users', usersRouter(prisma));
app.use('/api/exams', examsRouter(prisma));
app.use('/api/content', contentRouter(prisma));
app.use('/api/cms', cmsRouter(prisma));
app.use('/api/roles', rolesRouter(prisma));
app.use('/api/learning', learningRouter(prisma));
app.use('/api/payments', paymentsRouter(prisma));
app.use('/api/billing', billingRouter(prisma));
app.use('/api/reports', reportsRouter(prisma));
app.use('/api/settings', settingsRouter(prisma));

// Static uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch {}
app.use('/uploads', express.static(UPLOAD_DIR));

const PORT = Number(process.env.PORT ?? 4000);
ensureDefaultAdmin().finally(() => {
	app.listen(PORT, '0.0.0.0', () => {
  console.log(`API listening on http://0.0.0.0:${PORT}`);
});
});


