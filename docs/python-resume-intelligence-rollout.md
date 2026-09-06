# Python resume-intelligence production rollout

**Default remains:** `RESUME_INTELLIGENCE_BACKEND=typescript`.

Do **not** enable Python for customers until every gate below passes. Rollback is an **env flag flip only** — never roll back or delete migrations.

## Actual routing mechanisms (truthful)

These are the mechanisms implemented in `server/config/env.ts`, `server/intelligence/python-client.ts`, and `server/workflows/resume-pipeline.ts`:

| Mechanism | Behavior |
| --- | --- |
| Global kill switch | `RESUME_INTELLIGENCE_BACKEND=typescript` forces TypeScript for **all** tenants. This is the instant rollback. |
| Env mode + allowlist | When env is `python` or `shadow`, only tenants listed in `PYTHON_INTELLIGENCE_TENANT_ALLOWLIST` (comma-separated ids) get that mode. Others stay on TypeScript. |
| No tenant-metadata override | The `tenants` table has **no metadata column**. Routing does **not** read application or tenant metadata for backend selection — allowlist only. |
| Deterministic shadow sampling | `shouldSampleShadow(seed)` uses `sha256(seed)[0] % 100 < SHADOW_SAMPLE_PERCENT` — **not** `Math.random()`. Seed is typically `tenantId:applicationPublicId:workflowRunPublicId`. |
| Authoritative Python stages | When resolved backend is `python`, the pipeline uses FastAPI for **parse**, **research synthesize**, **evidence match**, **generate/regenerate**, **HR/EM audits**, and **final QA**. TypeScript still owns source collection, orchestration, persistence, billing, and PDF/DOCX. |
| Stage metadata | Workflow events record `{ executionBackend, operation }` for each intelligence stage (no prompts/resumes/secrets). |
| Shadow coverage | When backend resolves to `shadow` and the seed is sampled, the pipeline fire-and-forgets Python calls for **generate**, **audit**, and **final QA**. Results are comparison logs only. Customer-facing output stays TypeScript. Shadow is **non-billable**. |
| Unknown cost | Provider usage with missing/unknown cost writes a non-billable `costStatus: "unknown"` marker — never a known zero-dollar charge. Token rows keep `costCents=0`; monetary amount lives only on `provider_cost`. |
| Pricing table | Python estimates use `candidarc-pricing@v2` (`services/python-backend/app/core/pricing.py`). Rates are observability estimates and **require review** before any production billing. |
| Usage isolation | Usage ledger lookups/updates are scoped by `(tenant_id, idempotency_key)` (migration `0010_usage_ledger_tenant_idempotency.sql`). |

## Executable sequence

1. **TypeScript baseline** — Confirm production traffic is healthy on the TypeScript pipeline (`RESUME_INTELLIGENCE_BACKEND=typescript`). Capture baseline truthfulness, error rate, P95 latency, token cost, and quality scores.
2. **Apply forward-compatible migrations** — Ship schema migrations (including evidence embeddings / pgvector) via the TypeScript/Drizzle path. Migrations are additive and forward-compatible; **do not delete or roll them back**.
3. **Deploy Python dark** — Deploy the Python backend with service token, Redis, and `EVIDENCE_STORE=postgres`, but keep customer traffic on TypeScript (`RESUME_INTELLIGENCE_BACKEND=typescript`, `SHADOW_SAMPLE_PERCENT=0`, empty allowlist).
4. **Readiness / schema checks** — Verify `/health/live`, `/health/ready`, pgvector extension, and evidence tables. Confirm embedding dimensions match config (**1536**). Fail closed if the store is unavailable. CI job `python-pgvector` runs the Postgres evidence-store suite with `RUN_PGVECTOR_TESTS=1` (skips are failures).
5. **Shadow for approved tenants** — Set `RESUME_INTELLIGENCE_BACKEND=shadow`, populate `PYTHON_INTELLIGENCE_TENANT_ALLOWLIST`, set `SHADOW_SAMPLE_PERCENT=1` (then 10). Shadow never charges customers and never serves Python output.
6. **Compare gates** — Side-by-side vs TypeScript baseline on unsupported-claim / truthfulness rate, error rate, P95 latency, token cost / cost per resume, audit acceptance, final QA pass rate.
7. **Internal Python canary** — Route allowlisted internal tenants to Python (`RESUME_INTELLIGENCE_BACKEND=python` + `PYTHON_INTELLIGENCE_TENANT_ALLOWLIST`).
8. **Small customer canary** — Single-digit % of eligible customer traffic via allowlist expansion, with stop thresholds armed.
9. **Gradual ramp** — Expand allowlist only while all gates stay green.
10. **Full Python** — Broaden only after sustained green gates. Keep TypeScript deployable for instant rollback via the global kill switch.

## Stop / rollback thresholds

| Signal | Stop / rollback if |
| --- | --- |
| Unsupported-claim rate | > **0.1%** of downloadable resumes, or **any** confirmed hard factual claim reaching download |
| Cross-tenant failures | **Any** confirmed cross-tenant read/write or evidence bleed |
| P95 latency (end-to-end resume job) | **> 1.5×** TypeScript baseline for 15+ minutes, or sustained > SLO |
| Provider error rate | **> 2×** baseline or absolute **> 5%** over a rolling 15-minute window |
| Stuck-job rate | **> 1%** of jobs older than SLA without terminal state |
| PDF/DOCX failure rate | **> 2×** baseline parse/export failures |
| Cost per resume | **> 1.5×** baseline token/$ cost sustained for a cohort |
| Audit / regeneration failure rate | **> 2×** baseline failed audits or regeneration loops |

## Rollback action

1. Set `RESUME_INTELLIGENCE_BACKEND=typescript` (global kill switch).
2. Optionally clear tenant metadata overrides / empty `PYTHON_INTELLIGENCE_TENANT_ALLOWLIST`.
3. Redeploy / refresh config — traffic returns to TypeScript immediately.
4. Leave Python dark or scaled down for forensics.
5. **Do not** roll back, delete, or reverse schema migrations.
6. Keep `SHADOW_SAMPLE_PERCENT=0` until the incident is understood.

## Evidence store

- Production / docker smoke: `EVIDENCE_STORE=postgres` with pgvector (fail closed; never silent memory).
- Unit/demo tests: `EVIDENCE_STORE=memory` allowed.
- Migration owner: TypeScript/Drizzle (`0009_evidence_embeddings.sql`), embedding vector **1536**.
- Embedding default: `EMBEDDING_DIMENSIONS=1536`.
- Mandatory CI: `.github/workflows/ci.yml` job `python-pgvector` (migrate + `pytest` with `RUN_PGVECTOR_TESTS=1`; unexpected skips fail the job).

## Dependency vulnerability audit

### Python (`pip-audit`)

CI runs after install:

```bash
pip install pip-audit
pip-audit -r requirements.txt --strict
```

Prefer failing on high/critical. If a transitive CVE cannot be fixed immediately, use `--ignore-vuln <id>` with an inline CI comment and document here with **expiry 2026-12-01**. Re-check before expiry; remove ignores when upstream patches land.

**Current ignores:** none (as of 2026-09-06).

**Hardening bumps (2026-09-06):** `fastapi==0.141.1` (pulls `starlette==1.6.0`), `pypdf==6.17.0`, `python-multipart==0.0.32` — regenerate hashed locks via `pip-compile` after further pin changes.

### npm

CI lint job runs `npm audit --audit-level=high` (fails on high + critical). Current surface has moderate-only transitive `esbuild` via `drizzle-kit`; see `docs/npm-audit-exceptions.md` (expiry **2026-12-01**). Do not force-fix to clear moderates.

## Docker smoke

`npm run smoke:docker` requires the full compose stack: postgres, redis, minio, migrate, python-backend, web, worker. It waits for Python readiness and web `/api/v1/health`, runs an in-container mock V0–V4 lifecycle (`scripts/smoke_lifecycle.py` with service token), restarts the worker and checks it recovers, then tears down. Compose smoke sets `RESUME_INTELLIGENCE_BACKEND=python` for web/worker; `.env.example` default remains `typescript`.

Authenticated PDF download remains covered by `test:production` / e2e (not smoke).

## Related defaults

- `RESUME_INTELLIGENCE_BACKEND=typescript`
- `PYTHON_INTELLIGENCE_TENANT_ALLOWLIST=` (empty)
- `SHADOW_SAMPLE_PERCENT=0`
- `AI_MODE=mock` locally / CI; live keys only in staging+ with secrets
- Docker compose smoke: full stack with `EVIDENCE_STORE=postgres` and Python intelligence for web/worker
