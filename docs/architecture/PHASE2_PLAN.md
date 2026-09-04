# CandidArc Phase 2 — Architecture Implementation Plan

## Decision: keep Next.js at repo root

Moving the Phase 1 app into `apps/web` would risk breaking the working build. Module boundaries live under `server/` and are imported by Next.js route handlers and a separate worker process.

## Deployment units

| Unit | Entry | Role |
| --- | --- | --- |
| Web | `npm run dev` / Next.js | UI + BFF route handlers `/api/v1/*` |
| API modules | `server/modules/*` | Business logic (no HTTP) |
| Worker | `npm run worker` | Background workflow steps |

## Local mode

- `CANDIDARC_DATA_MODE=memory` (default): durable in-process store, mock AI — no Docker required
- `CANDIDARC_DATA_MODE=postgres`: real Postgres + Redis + filesystem/MinIO storage

## Vertical slice

Create application → research workflow → evidence match → V0 → HR1→V1→EM1→V2→HR2→V3→EM2→V4 → Final QA → export
