# CandidArc Backend Architecture

## Processes

| Process | Command | Responsibility |
| --- | --- | --- |
| Web + BFF | `npm run dev` | Phase 1 UI + `/api/v1` route handlers |
| Worker | `npm run worker` | Queue consumers for research/resume/audit/export |
| Full local stack | `npm run dev:stack` | Web + worker together |

## Module map

```
server/
  auth/           sessions, passwords, guards
  ai/             providers, prompt registry, mock fixtures
  config/         validated env
  contracts/      Zod API schemas
  database/       Drizzle schema, migrations, memory store, repos
  domain/         shared business types / errors
  http/           request context + responses
  modules/        application services (no HTTP)
  observability/  structured logging
  storage/        object storage adapters
  workflows/      durable engine, queues, resume pipeline
  worker/         process entrypoint
  bootstrap.ts    wires runtime singleton
```

## Data modes

- `CANDIDARC_DATA_MODE=memory` (default): in-process durable maps, mock AI, local files — no Docker required
- `CANDIDARC_DATA_MODE=postgres`: requires `DATABASE_URL`, optional Redis/MinIO via `docker compose up -d`

## Vertical slice

1. `POST /api/v1/applications` creates tenant-owned application
2. Workflow `RESEARCH_QUEUED` enqueued (not executed in HTTP)
3. Worker/pipeline advances research → evidence → V0 → HR1→V1→EM1→V2→HR2→V3→EM2→V4 → Final QA
4. UI polls or SSE-subscribes to `/workflow/events`
5. Finding decisions via `PATCH .../audits/findings/:id`
6. Export enqueued to `pdf-rendering` queue

## Demo credentials

- Email: `deepak@candidarc.dev`
- Password: `CandidArc!Demo1`

## UI connection

`src/services/api.ts` calls `/api/v1` with credentials. On failure or `NEXT_PUBLIC_USE_MOCK_API=true`, falls back to Phase 1 in-memory demo so the UI never crashes.

## Security controls

- HttpOnly session cookie (jose HS256)
- Tenant membership checks on every resource
- Repository tenant scoping
- RLS stubs in SQL migration
- Redacted structured logs
- Soft delete + object deletion scheduling for files
