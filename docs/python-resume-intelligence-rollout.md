# Python resume-intelligence production rollout

**Status:** Python is the ONLY supported backend. `RESUME_INTELLIGENCE_BACKEND=python` is the only valid value.

TypeScript and shadow modes have been removed from the resume pipeline. There is no fallback — if Python fails, the resume generation fails.

## Current routing (Python-only)

These are the mechanisms implemented in `server/config/env.ts`, `server/intelligence/python-client.ts`, and `server/workflows/resume-pipeline.ts`:

| Mechanism | Behavior |
| --- | --- |
| Python-only backend | `RESUME_INTELLIGENCE_BACKEND` only accepts `"python"`. Setting `"typescript"` or `"shadow"` causes a Zod validation error at startup. |
| No allowlist needed | `PYTHON_INTELLIGENCE_TENANT_ALLOWLIST` is deprecated and ignored. All tenants use Python. |
| No shadow mode | Shadow comparison code has been removed. `SHADOW_SAMPLE_PERCENT` is deprecated and ignored. |
| Authoritative Python stages | The pipeline uses FastAPI for **parse**, **research synthesize**, **evidence match**, **generate/regenerate**, **HR/EM audits**, and **final QA**. TypeScript still owns source collection, orchestration, persistence, billing, and PDF/DOCX. |
| Stage metadata | Workflow events record `{ executionBackend: "python", operation }` for each intelligence stage. |
| Execution backend persisted | On workflow start, `executionBackend: "python"` and `intelligenceContractVersion` are persisted in run payload to ensure consistency across stages. |
| Final QA authority | If AI final QA fails, the pipeline attempts ONE bounded repair: regenerate with refinement instruction summarizing failed checks, then re-run Final QA. If still fails, transition to `FINAL_QA_FAILED`. No FINAL_READY without passing QA. |
| Unknown cost | Provider usage with missing/unknown cost writes a non-billable `costStatus: "unknown"` marker. |
| Pricing table | Python estimates use `candidarc-pricing@v2` (`services/python-backend/app/core/pricing.py`). |
| Usage isolation | Usage ledger lookups/updates are scoped by `(tenant_id, idempotency_key)`. |

## Breaking changes from cutover

1. **No TypeScript fallback** — If Python backend is unavailable, resume generation fails with `PYTHON_BACKEND_UNAVAILABLE`.
2. **No kill switch** — `RESUME_INTELLIGENCE_BACKEND=typescript` is no longer valid. To roll back, deploy a previous version of the application.
3. **No shadow comparison** — Shadow mode code has been removed. Comparison metrics are no longer collected.
4. **Final QA is authoritative** — Resumes that fail AI Final QA (after deterministic checks pass) get ONE repair attempt. If still failing, they go to `FINAL_QA_FAILED` and cannot be downloaded.

## Deprecated environment variables

These environment variables are still accepted for backward compatibility but are ignored:

- `PYTHON_INTELLIGENCE_TENANT_ALLOWLIST` — All tenants use Python
- `SHADOW_SAMPLE_PERCENT` — Shadow mode removed

## Operational requirements

1. **Python backend must be available** — The FastAPI backend at `PYTHON_BACKEND_URL` must be healthy for resume generation to work.
2. **Production token required** — `PYTHON_BACKEND_TOKEN` must be a non-dev secret (at least 24 characters, not starting with "dev-") in production.
3. **Evidence store** — Production requires `EVIDENCE_STORE=postgres` with pgvector extension.

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

## Migration compatibility and rollback safety

### Usage ledger idempotency key strategy (migration 0011)

The usage ledger uses **tenant-prefixed idempotency keys** (`${tenantId}:...`) to ensure global uniqueness. This enables two indexing strategies:

| Index | Purpose | Safe to drop? |
| --- | --- | --- |
| `(tenant_id, idempotency_key)` composite | Tenant-scoped queries | No — required for RLS and tenant isolation |
| `(idempotency_key)` global | Efficient lookups when key is already scoped | Only if all code uses composite lookups |

**Rollback rules:**
- ✅ Rolling back **application code** to pre-cutover that queries only by idempotency_key is safe — keys are tenant-prefixed, so global uniqueness is maintained.
- ⚠️ Rolling back **schema** by dropping the global unique index requires verifying all code uses composite lookups.
- ❌ Never roll back migrations that enforce tenant isolation without understanding the prefixing strategy.
- 📌 Git tag is NOT a DB rollback — migrations are forward-only.

### Transactional usage commit (commitReservedWithCost)

The `commitReservedWithCost` method ensures atomicity:
1. SELECT reservation FOR UPDATE (row-level lock)
2. UPDATE status to committed
3. INSERT cost observation row ON CONFLICT DO NOTHING
4. COMMIT or ROLLBACK atomically

**Crash safety:** If the process crashes mid-transaction, Postgres rolls back the entire transaction. We never leave a committed reservation without a corresponding cost observation row.

**Idempotency:** If already committed, returns existing reservation + existing cost row without modification.

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

`npm run smoke:docker` requires the full compose stack: postgres, redis, minio, migrate, python-backend, web, worker. It waits for Python readiness and web `/api/v1/health`, runs an in-container mock V0–V4 lifecycle (`scripts/smoke_lifecycle.py` with service token), restarts the worker and checks it recovers, then tears down. Compose smoke sets `RESUME_INTELLIGENCE_BACKEND=python` for web/worker.

Authenticated PDF download remains covered by `test:production` / e2e (not smoke).

## Related defaults

- `RESUME_INTELLIGENCE_BACKEND=python` (only valid value)
- `PYTHON_INTELLIGENCE_TENANT_ALLOWLIST=` (deprecated, ignored)
- `SHADOW_SAMPLE_PERCENT=0` (deprecated, ignored)
- `AI_MODE=mock` locally / CI; live keys only in staging+ with secrets
- Docker compose smoke: full stack with `EVIDENCE_STORE=postgres` and Python intelligence for web/worker
