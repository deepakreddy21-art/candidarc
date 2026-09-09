# CandidArc

Candidate-owned career intelligence — Radar freshness, Career Evidence, sequential audits, and Application Copilot.

Primary areas: **Today · Radar · Opportunities · Career Evidence**. Settings live in the user menu.

## Quick start (complete local demo)

The **canonical** local command starts Next.js, FastAPI (resume parse), and the queue worker together. PDF/DOCX import does **not** require OpenAI or Anthropic keys in demo/mock mode.

```bash
npm install
# one-time Python backend setup (if needed):
#   cd services/python-backend && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt && .venv/Scripts/pip install -e .
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). FastAPI listens on [http://127.0.0.1:8090/docs](http://127.0.0.1:8090/docs).

Default data mode is **memory** (no Docker). Demo login:

- Email: `deepak@candidarc.dev`
- Password: `CandidArc!Demo1`

> **Important:** `npm run dev` is the full stack. Use `npm run dev:web` only when you intentionally want Next.js without FastAPI/worker (resume upload will fail with `RESUME_PARSE_PIPELINE_UNAVAILABLE`).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | **Complete demo:** FastAPI + Next.js + worker |
| `npm run dev:web` | Next.js web only (no parse pipeline) |
| `npm run dev:stack` | Alias of `npm run dev` |
| `npm run dev:python` | FastAPI alone |
| `npm run worker` | Background worker alone |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run build` | Production build |
| `npm run db:migrate` | Apply SQL migrations (postgres mode) |
| `npm run db:seed` | Seed demo data |

## Postgres / Redis / MinIO (optional)

PostgreSQL mode **requires** `QUEUE_BACKEND=redis` and a running worker. An in-process queue cannot be shared across Next.js and a separate worker.

```bash
docker compose up -d
cp .env.example .env
# set:
#   CANDIDARC_DATA_MODE=postgres
#   DATABASE_URL=postgres://...
#   QUEUE_BACKEND=redis
#   REDIS_URL=redis://127.0.0.1:6379
npm run db:migrate
npm run db:seed
npm run dev
```

## Authentication

### Email / password

Use `/sign-in` and `/sign-up`. Sessions use the HttpOnly `candidarc_session` cookie.

### Google sign-in (optional)

1. Create an OAuth 2.0 Client ID in Google Cloud Console (Web application).
2. Add authorized JavaScript origins:
   - Local: `http://localhost:3000`
   - Production: your public `APP_URL` origin
3. Add authorized redirect URIs (exact match required):
   - Local: `http://localhost:3000/api/v1/auth/google/callback`
   - Production: `https://<your-domain>/api/v1/auth/google/callback`
4. Copy the client ID and secret into `.env`:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/auth/google/callback
APP_URL=http://localhost:3000
```

5. Restart `npm run dev`.

When credentials are absent, the app still boots; Google buttons redirect with `GOOGLE_AUTH_NOT_CONFIGURED`.
Never put `GOOGLE_CLIENT_SECRET` in `NEXT_PUBLIC_*` variables.


- [UI architecture](./docs/UI_ARCHITECTURE.md)
- [Backend architecture](./docs/architecture/BACKEND.md)
- [CandidArc Radar](./docs/architecture/RADAR.md)
- [ADRs](./docs/architecture/ADR.md)
- [Phase 2 plan](./docs/architecture/PHASE2_PLAN.md)
