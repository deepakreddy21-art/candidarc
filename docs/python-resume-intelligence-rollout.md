# Python resume-intelligence production rollout

**Default remains:** `RESUME_INTELLIGENCE_BACKEND=typescript`.

Do **not** enable Python for customers until every gate below passes. Rollback is an **env flag flip only** — never roll back or delete migrations.

## Executable sequence

1. **TypeScript baseline** — Confirm production traffic is healthy on the TypeScript pipeline (`RESUME_INTELLIGENCE_BACKEND=typescript`). Capture baseline truthfulness, error rate, P95 latency, token cost, and quality scores.
2. **Apply forward-compatible migrations** — Ship schema migrations (including evidence embeddings / pgvector) via the TypeScript/Drizzle path. Migrations are additive and forward-compatible; **do not delete or roll them back**.
3. **Deploy Python dark** — Deploy the Python backend with service token, Redis, and `EVIDENCE_STORE=postgres`, but keep customer traffic on TypeScript (`RESUME_INTELLIGENCE_BACKEND=typescript`, `SHADOW_SAMPLE_PERCENT=0`).
4. **Readiness / schema checks** — Verify `/health/live`, `/health/ready`, pgvector extension, and evidence tables. Confirm embedding dimensions match config (**1536**). Fail closed if the store is unavailable.
5. **Shadow 1%** — Enable shadow for approved internal tenants only (`SHADOW_SAMPLE_PERCENT=1`). Shadow never charges customers and never serves Python output.
6. **Shadow 10%** — Raise shadow sampling for the same approved cohort after 1% looks clean.
7. **Compare gates** — Side-by-side vs TypeScript baseline on:
   - unsupported-claim / truthfulness rate
   - error rate
   - P95 latency
   - token cost / cost per resume
   - quality (audit acceptance, final QA pass rate)
8. **Internal Python canary** — Route approved internal tenants to Python (`RESUME_INTELLIGENCE_BACKEND=python` for those tenants only).
9. **Small customer canary** — Single-digit % of eligible customer traffic (feature-flagged), with stop thresholds armed.
10. **Gradual ramp** — 10% → 25% → 50% → 75% only while all gates stay green.
11. **Full Python** — 100% only after sustained green gates at 75%+. Keep TypeScript deployable for instant rollback.

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

1. Set `RESUME_INTELLIGENCE_BACKEND=typescript` (global or per-tenant flag).
2. Redeploy / refresh config — traffic returns to TypeScript immediately.
3. Leave Python dark or scaled down for forensics.
4. **Do not** roll back, delete, or reverse schema migrations.
5. Keep `SHADOW_SAMPLE_PERCENT=0` until the incident is understood.

## Evidence store

- Production / docker smoke: `EVIDENCE_STORE=postgres` with pgvector (fail closed; never silent memory).
- Unit/demo tests: `EVIDENCE_STORE=memory` allowed.
- Migration owner: TypeScript/Drizzle (`0009_evidence_embeddings.sql`), embedding vector **1536**.
- Embedding default: `EMBEDDING_DIMENSIONS=1536`.

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

`npm audit --audit-level=critical` is optional/non-blocking for now (noisy transitive surface). Prefer Python `pip-audit` as the blocking supply-chain gate until npm critical noise is manageable.

## Related defaults

- `RESUME_INTELLIGENCE_BACKEND=typescript`
- `SHADOW_SAMPLE_PERCENT=0`
- `AI_MODE=mock` locally / CI; live keys only in staging+ with secrets
- Docker compose smoke: postgres + redis + migrate + python (`EVIDENCE_STORE=postgres`) + web health when images exist
