# Mutingwende – CFA Exam Prep Platform (Foundation)

This repository contains a monorepo with:

- Web app (React + Vite + Ant Design) – `apps/web`
- Mobile app (Expo React Native + React Native Paper) – `apps/mobile`
- Backend API (Node.js + Express + TypeScript + Prisma) – `apps/server`
- PostgreSQL via Docker Compose
- Caddy for HTTPS reverse proxy (production)

The architecture is shared across web and mobile clients, with a single backend and centralized PostgreSQL database, designed to scale for future features (exam engine, video lectures, analytics, payments).

## Tech Overview
- Frontend (Web): React 18, Vite, Ant Design, React Router
- Mobile: Expo (React Native), React Native Paper
- Backend: Express, Prisma ORM, Zod validation, JWT auth, Helmet, CORS
- Database: PostgreSQL 16
- Hosting (Production): Docker Compose on AWS EC2 with Caddy HTTPS

## Monorepo
```
apps/
  server/     # Node/Express API (TypeScript + Prisma)
  web/        # React + Vite web app (Ant Design)
  mobile/     # Expo React Native app
infra/
  Caddyfile   # Caddy HTTPS reverse proxy (production)
docker-compose.dev.yml
docker-compose.prod.yml
```

## Prerequisites
- Node.js 18+ and Yarn (or npm)
- Docker + Docker Compose
- For mobile: Expo CLI (`npm i -g expo`)

## Environment Variables
Set the following before running:

Backend (`apps/server`):
- `PORT=4000`
- `CORS_ORIGIN=http://localhost:5173,http://localhost:3000,exp://127.0.0.1:19000`
- `JWT_SECRET=replace_with_strong_secret`
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mutingwende?schema=public`

Web (`apps/web`):
- `VITE_API_URL=http://localhost:4000`

Mobile (`apps/mobile/app.json`):
- `extra.apiUrl` in `app.json` (defaults to `http://localhost:4000`)

You can export these in your shell or use `.env` files locally (not committed).

## Local Development

1) Start Postgres and API via Docker Compose:
```
docker compose -f docker-compose.dev.yml up --build
```
This boots:
- `db` at port 5432
- `api` at port 4000 (auto-migrates and runs dev server)

2) Install deps and run web:
```
yarn
yarn dev:web
```
Open `http://localhost:5173`.

3) Mobile (optional):
```
yarn dev:mobile
```
Use Expo Go or your emulator. Ensure `API_URL` (in `apps/mobile/app.json`) points to your machine’s reachable IP for device testing.

## API Endpoints (MVP)
- `GET /api/health` – health check
- Auth:
  - `POST /api/auth/register` – `{ email, password, level }`
  - `POST /api/auth/login` – `{ email, password }`
  - `POST /api/auth/verify-email/request` – `{ email }`
  - `POST /api/auth/verify-email/confirm` – `{ token }`
  - `POST /api/auth/password/reset/request` – `{ email }`
  - `POST /api/auth/password/reset/confirm` – `{ token, password }`
- Users:
  - `GET /api/users/me`
- Exams (core scaffolding for engine):
  - `POST /api/exams` (admin) – create exam
  - `POST /api/exams/:examId/attempts` – start timed attempt
  - `POST /api/exams/attempts/:attemptId/answers` – autosave/flag answers
  - `POST /api/exams/attempts/:attemptId/submit` – submit and score
- Content:
  - `GET /api/content/videos`
  - `POST /api/content/videos` (admin)
  - `GET /api/content/videos/:id/progress`
  - `POST /api/content/videos/:id/progress`
- CMS:
  - `POST /api/cms/topics` (admin)
  - `POST /api/cms/questions` (admin) – supports MCQ, vignette-MCQ, CR
  - `POST /api/cms/revision-summaries` (admin)
- Payments (webhooks + status; integrate with gateway dashboards):
  - `POST /api/payments/webhooks/flutterwave`
  - `POST /api/payments/webhooks/payfast`
  - `GET /api/payments/subscriptions/me`

Access control
- Most student features (exam attempts, video listing/progress) require an active subscription.
- Admin-only endpoints are under `/api/cms` and selected `/api/exams` routes (create).

These provide a secure foundation for later features (roles, email verification, payments, exams).

## Database (Prisma)
Schema is in `apps/server/prisma/schema.prisma`. To apply migrations in dev:
```
cd apps/server
npm run migrate:dev
```
To generate client:
```
npm run generate
```

## Production Deployment (AWS EC2)
1) Provision an Ubuntu EC2 instance (t3.small+ recommended) and attach an Elastic IP.
2) Install Docker and Docker Compose.
3) Set DNS (GoDaddy) for your domain to point to the EC2 Elastic IP.
4) Copy the repo to the server.
5) Set environment:
```
export POSTGRES_PASSWORD="strong_password"
export JWT_SECRET="replace_with_strong_secret"
```
6) Update `infra/Caddyfile` with your domain and email.
7) Run:
```
docker compose -f docker-compose.prod.yml up -d --build
```
Caddy will obtain Let’s Encrypt certificates automatically.

Static web can be hosted via a CDN (recommended) or an Nginx/Caddy static site; this repo keeps API behind Caddy and leaves web hosting flexible.

## Security Baseline
- HTTPS via Caddy (production)
- JWT-based authentication
- Helmet, CORS
- Rate limiting on API
- Separate secrets for production

## Milestone coverage
- Milestone 1: Web setup, mobile-ready backend, Dockerized PostgreSQL, Caddy HTTPS, domain guidance.
- Milestone 2: Users with roles (STUDENT/ADMIN), email verification, password reset; profiles store CFA level.
- Milestone 3: Exam engine scaffolding (models + endpoints) for Level I/II/III, custom/timed attempts, autosave.
- Milestone 4: Experience basics (navigation/flagging via answers endpoint), submission workflow with scoring.
- Milestone 5: Video lectures (models + CRUD + progress tracking), topic organization by level.
- Milestone 6: CMS for question bank, revision summaries, topic and difficulty tagging.
- Milestone 7: Results & feedback via attempt scoring; extendable analytics per topic.
- Milestone 8: Payments scaffolding with Flutterwave and PayFast webhooks and subscription status, access control ready.
- Milestone 9: Security baseline (HTTPS, auth, rate limiting). Exam session tokens supported via attempt flows.

## Roadmap Alignment with Milestones
- Milestone 1 (this foundation): Web setup, backend for mobile, secure hosting pattern, PostgreSQL ready.
- Milestones 2–9: Build on this base (roles, email verification, exam engine, video, CMS, analytics, payments).

## Common Commands
Root:
```
yarn            # install workspaces
yarn dev        # api + web concurrently
yarn dev:api
yarn dev:web
yarn dev:mobile
```

Server:
```
cd apps/server
npm run migrate:dev
npm run dev
```

Web:
```
cd apps/web
yarn dev
```

Mobile:
```
cd apps/mobile
yarn start
```


