# CandidArc Python resume-intelligence service

Internal FastAPI service used by the TypeScript BFF. The browser never calls this service directly.

## Honesty matrix

| Capability | Status | Notes |
|---|---|---|
| Mock grounded generation / audit / final-qa | **Implemented** | Default local path (`AI_MODE=mock`, `APP_MODE=demo`) |
| Explainable scoring rubric (`candidarc-score-rubric@v1`) | **Implemented** | Content-derived; version number does not inflate scores |
| Claim-atom guardrails + adjudication with rejection reasons | **Implemented** | Percent/$$/dates/tech/team/ownership/ATS/cross-tenant |
| Claim source kinds + user confirmations | **Implemented** | Only `candidate_evidence` / evidence-backed `user_confirmation` may create first-person claims; JD/research → questions only |
| JD-aware mock generation + finding application on regenerate | **Implemented** | Rejected findings ignored; mistake_memory respected |
| Job/resume parsing with safety limits | **Implemented** | No invented employment/seniority; PDF/DOCX protections |
| OpenAI structured generation / final-qa | **Implemented** (live) | Real SDK calls via lifespan client; fail-closed, no silent mock fallback |
| Anthropic structured audits (hr-1/em-1/hr-2/em-2) | **Implemented** (live) | Tool/schema findings + adjudication |
| Redis idempotency (generate/audit/regenerate/final-qa) | **Implemented** | Memory TTL store in demo when `REDIS_URL` absent; required for live/production readiness |
| Request-scoped evidence match (lexical hybrid) | **Implemented** | Authoritative generation path; documented ranking method |
| Evidence store (memory) | **Implemented** (demo/tests) | `EVIDENCE_STORE=memory` default in demo; deterministic mock embeddings |
| Evidence store (postgres + pgvector) | **Implemented** | Required in production (`DATABASE_URL` + `EVIDENCE_STORE=postgres`); fail closed — never silent memory fallback |
| Process-local `_INDEX` cache | **Non-authoritative** | Demo helper only; production uses postgres EvidenceStore |
| Cross-encoder re-ranker | **Feature-flagged / experimental** | Local artifact + checksum only; never downloads; disabled by default |
| Shadow sampling (`SHADOW_SAMPLE_PERCENT`) | **Feature-flagged** | Config present; TS BFF owns shadow routing |
| Eval suite (`evals/` + `npm run eval:resume`) | **Implemented** | 8 fictional personas; mock AI; hard factual precision + tenant isolation |
| In-process metrics (`GET /metrics`) | **Implemented** | Service-token protected JSON counters/histograms; no PII |
| Production default Python intelligence | **Not enabled** | `RESUME_INTELLIGENCE_BACKEND` stays TypeScript unless explicitly opted in |

## Rollout sequence (brief)

1. Keep `RESUME_INTELLIGENCE_BACKEND=typescript` (default).
2. Run Python in demo/mock locally; exercise `npm run eval:resume`.
3. Stand up postgres+pgvector; set `EVIDENCE_STORE=postgres` + `DATABASE_URL`.
4. Shadow sample via TS BFF when ready; promote Python only after evals + readiness are green.
5. Production readiness fails closed if evidence store is memory or postgres/pgvector is unavailable.

## Local (Windows / Cursor)

```powershell
cd services/python-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
$env:AI_MODE="mock"
$env:APP_MODE="demo"
$env:EVIDENCE_STORE="memory"
$env:PYTHON_BACKEND_TOKEN="dev-python-backend-token-change-me"
uvicorn app.main:app --reload --port 8090
```

Safe local defaults: `AI_MODE=mock` + `APP_MODE=demo` + `EVIDENCE_STORE=memory`. Do **not** set Python as the production resume-intelligence default from this service.

Health:

* `GET http://127.0.0.1:8090/health/live`
* `GET http://127.0.0.1:8090/health/ready`
* `GET http://127.0.0.1:8090/metrics` (Bearer service token)
* OpenAPI: `GET http://127.0.0.1:8090/openapi.json`

## Contracts

```powershell
# From repo root
npm run contract:python
```

Writes:

* `services/python-backend/openapi.json`
* `server/intelligence/generated/python-paths.ts` (GENERATED — DO NOT EDIT)
* `server/intelligence/generated/python-contract.ts` (GENERATED — DO NOT EDIT)

## Tests & evals

```powershell
cd services/python-backend
pytest -q
ruff check app tests evals
mypy app
python -m evals.run_eval
# From repo root:
npm run eval:resume
```

Postgres evidence-store integration tests run only when `DATABASE_URL` is set **and** `RUN_PGVECTOR_TESTS=1`.
Live provider smoke tests run only when `RUN_LIVE_PROVIDER_TESTS=1` (not CI default; may incur cost).

## Docker Compose

From repo root:

```powershell
docker compose up -d python-backend
```

Image installs from pinned `requirements.txt` (hash-pinned when available).

## Lockfile / licenses

Pinned runtime+dev deps are recorded in `requirements.txt` (generated via `pip freeze` / `pip-compile` from the project venv; editable local installs excluded).

**License audit note:** Do not add copyleft (GPL/AGPL/SSPL) dependencies without explicit legal approval. Current primary stack (FastAPI, Pydantic, Uvicorn, httpx, OpenAI/Anthropic SDKs, redis, pypdf, python-docx, asyncpg, pgvector) is generally permissive (MIT/Apache-2.0/BSD). Re-check licenses when upgrading. The optional `[ranker]` extra pulls `torch` / `sentence-transformers` and must stay disabled by default — it does not download models on import/startup/tests.

## Ownership

Python owns intelligence operations only. TypeScript remains authoritative for auth, workflow orchestration, Radar, storage, and PDF/DOCX rendering. `RESUME_INTELLIGENCE_BACKEND` defaults to TypeScript; Python and shadow modes are opt-in.
