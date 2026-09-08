# CandidArc

Candidate-owned career intelligence — Radar freshness, Career Evidence, sequential audits, and Application Copilot.

Primary areas: **Today · Radar · Opportunities · Career Evidence**. Settings live in the user menu.

## Quick start (Phase 1 UI + Phase 2 memory backend)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Default data mode is **memory** (no Docker). Demo login:

- Email: `deepak@candidarc.dev`
- Password: `CandidArc!Demo1`

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js web + `/api/v1` (auto queue drain in memory mode) |
| `npm run dev:stack` | Web + dedicated worker process |
| `npm run worker` | Background worker only |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run build` | Production build |
| `npm run db:migrate` | Apply SQL migrations (postgres mode) |
| `npm run db:seed` | Seed demo data |

## Postgres / Redis / MinIO (optional)

```bash
docker compose up -d
cp .env.example .env
# set CANDIDARC_DATA_MODE=postgres and DATABASE_URL
npm run db:migrate
npm run db:seed
npm run dev:stack
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

5. Restart `npm run dev` / `npm run dev:stack`.

When credentials are absent, the app still boots; Google buttons redirect with `GOOGLE_AUTH_NOT_CONFIGURED`.
Never put `GOOGLE_CLIENT_SECRET` in `NEXT_PUBLIC_*` variables.


- [UI architecture](./docs/UI_ARCHITECTURE.md)
- [Backend architecture](./docs/architecture/BACKEND.md)
- [CandidArc Radar](./docs/architecture/RADAR.md)
- [ADRs](./docs/architecture/ADR.md)
- [Phase 2 plan](./docs/architecture/PHASE2_PLAN.md)
