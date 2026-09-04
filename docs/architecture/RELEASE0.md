# RELEASE 0 — Production foundation and honest vertical slice

## Modes

| | Demo (`APP_MODE=demo`) | Production (`APP_MODE=production`) |
|---|---|---|
| Data | Memory repositories OK | PostgreSQL required |
| Queue | In-process OK | BullMQ + Redis required |
| AI | Mock OK | OpenAI required (no silent mock fallback) |
| Storage | Local OK | S3-compatible required |
| Session | Dev default secret OK | Unique 32+ char secret required |
| Client | Seed fallback OK when `NEXT_PUBLIC_APP_MODE=demo` | API failures throw; empty seed stubs in browser bundles |

Demo is opt-in via `APP_MODE=demo` (default for local). Production fails at startup when configuration is unsafe.

## Environment variables

See `.env.example`. Critical production keys:

- `APP_MODE=production`
- `NEXT_PUBLIC_APP_MODE=production`
- `CANDIDARC_DATA_MODE=postgres`
- `DATABASE_URL`
- `QUEUE_BACKEND=redis`
- `REDIS_URL`
- `SESSION_SECRET` (≥32 chars, not the demo default)
- `CSRF_SECRET` (optional; defaults to session secret)
- `AI_PROVIDER=openai`
- `OPENAI_API_KEY`
- `STORAGE_DRIVER=s3` + S3 credentials
- `WORKER_KIND=all|general|ingestion|document`

## Migration instructions

1. `docker compose up -d` (Postgres, Redis, MinIO) or use managed services.
2. Copy `.env.example` → `.env` and set production values.
3. `npm run db:migrate` — applies `server/database/migrations/*.sql` including RLS (`0002_rls.sql`).
4. `npm run build`
5. Run web: `npm run start` (or Docker target `web`)
6. Run worker: `npm run worker` (or Docker target `worker`)

Web processes only enqueue. Workers consume via BullMQ.

## Vertical slice

Opportunity create → research → evidence matching → V0 → HR1 review gate → V1 → EM1 → V2 → HR2 → V3 → EM2 → V4 → deterministic Final QA.

Advance audit gates: `POST /api/v1/applications/:id/audits/advance` (CSRF + auth; all findings must be decided).

## Commands used for verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev
# Production fail-fast
npx tsx -e "import {getEnv,resetEnvCache} from './server/config/env.ts'; resetEnvCache(); getEnv({APP_MODE:'production',CANDIDARC_DATA_MODE:'memory',...})"
# Bundle scan with NEXT_PUBLIC_APP_MODE=production
```

## Known limitations

- Evidence/resume/audit Postgres repos still share a memory facade for some secondary catalog methods; identity, sessions, applications, and workflows are PostgreSQL-backed.
- Final QA checks persist on the workflow payload; dedicated QA tables are schema-ready but not the primary write path yet.
- Mistake-memory extraction from audits is heuristic; full rule-mining UI is deferred.
- Redis-backed multi-process enqueue/consume requires a live Redis (not asserted in CI without services).
- Licensed LinkedIn/Indeed connectors remain disabled.
- Interview Lab product surfaces removed; `interviewing` remains a hiring-pipeline status only.
