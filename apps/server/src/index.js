import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import http from 'http';

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
import { testRouter } from './routes/test.js';

/* ===========================
   DATABASE URL COMPOSITION
=========================== */

if (!process.env.DATABASE_URL) {
  const host = process.env.DB_HOST ?? 'localhost';
  const user = process.env.DB_USER ?? 'postgres';
  const pass = encodeURIComponent(process.env.DB_PASSWORD ?? '');
  const name = process.env.DB_NAME ?? 'mutingwende';
  const port = process.env.DB_PORT ?? '5432';

  process.env.DATABASE_URL =
    `postgresql://${user}:${pass}@${host}:${port}/${name}?schema=public`;
}

/* ===========================
   INIT
=========================== */

const app = express();
app.set('trust proxy', 1); // required behind reverse proxy

const prisma = new PrismaClient({
  log: ['warn', 'error']
});

const server = http.createServer(app);

/* ===========================
   GLOBAL CRASH PROTECTION
=========================== */

// Prevent process crash from async errors
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

// Graceful shutdown
async function shutdown(signal) {
  console.log(`[SHUTDOWN] ${signal} received`);

  try {
    await prisma.$disconnect();
    console.log('[SHUTDOWN] Prisma disconnected');
  } catch (e) {
    console.error('[SHUTDOWN ERROR]', e);
  }

  server.close(() => {
    console.log('[SHUTDOWN] Server closed');
    process.exit(0);
  });

  // Force exit after 10s if hanging
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/* ===========================
   DEFAULT ADMIN BOOTSTRAP
=========================== */

async function ensureDefaultAdmin() {
  try {
    const email = process.env.DEFAULT_ADMIN_EMAIL ?? 'admin@milven.finance';
    const password = process.env.DEFAULT_ADMIN_PASSWORD ?? 'Milven#2026';

    const existing = await prisma.user.findUnique({ where: { email } });

    if (!existing) {
      const passwordHash = await bcrypt.hash(password, 12);

      await prisma.user.create({
        data: {
          email,
          passwordHash,
          role: 'ADMIN',
          level: 'LEVEL3',
          emailVerifiedAt: new Date()
        }
      });

      console.log(`[BOOT] Created default admin: ${email}`);
    }
  } catch (e) {
    console.warn('[BOOT ERROR]', e?.message ?? e);
  }
}

/* ===========================
   SECURITY MIDDLEWARE
=========================== */

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? [
      'http://localhost:5173',
      'http://localhost:3000'
    ],
    credentials: true
  })
);

// Body limit protection (prevents large payload crash)
app.use(
  express.json({
    limit: '1mb'
  })
);

app.use(morgan('dev'));

/* ===========================
   RATE LIMITING
=========================== */

const RATE_LIMIT_WINDOW_MS =
  Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);

const RATE_LIMIT_MAX =
  Number(process.env.RATE_LIMIT_MAX ?? 1000);

app.use(
  rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      req.path?.startsWith('/uploads') ||
      req.path === '/api/health'
  })
);

/* ===========================
   ROUTES (WRAPPED SAFELY)
=========================== */

// Wrapper to catch async errors automatically
const safe = (routerFactory) => {
  try {
    return routerFactory(prisma);
  } catch (e) {
    console.error('[ROUTER INIT ERROR]', e);
    return (req, res) =>
      res.status(500).json({ error: 'Router failed to initialize' });
  }
};

app.use('/api/health', healthRouter());
app.use('/api/auth', safe(authRouter));
app.use('/api/users', safe(usersRouter));
app.use('/api/exams', safe(examsRouter));
app.use('/api/content', safe(contentRouter));
app.use('/api/cms', safe(cmsRouter));
app.use('/api/roles', safe(rolesRouter));
app.use('/api/learning', safe(learningRouter));
app.use('/api/payments', safe(paymentsRouter));
app.use('/api/billing', safe(billingRouter));
app.use('/api/reports', safe(reportsRouter));
app.use('/api/settings', safe(settingsRouter));
app.use('/api', safe(testRouter));

/* ===========================
   STATIC UPLOADS
=========================== */

const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');

try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch {}

app.use('/uploads', express.static(UPLOAD_DIR));

/* ===========================
   GLOBAL ERROR HANDLER
=========================== */

app.use((err, req, res, next) => {
  console.error('[GLOBAL ERROR]', err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: 'Internal server error'
  });
});

/* ===========================
   START SERVER
=========================== */

const PORT = Number(process.env.PORT ?? 4000);

ensureDefaultAdmin().finally(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`API listening on http://0.0.0.0:${PORT}`);
  });
});
