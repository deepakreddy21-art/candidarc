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

## Docs

- [UI architecture](./docs/UI_ARCHITECTURE.md)
- [Backend architecture](./docs/architecture/BACKEND.md)
- [CandidArc Radar](./docs/architecture/RADAR.md)
- [ADRs](./docs/architecture/ADR.md)
- [Phase 2 plan](./docs/architecture/PHASE2_PLAN.md)
