# CandidArc Python resume-intelligence service

Internal FastAPI service used by the TypeScript BFF. The browser never calls this service directly.

## Honesty matrix

| Capability | Status | Notes |
|---|---|---|
| Mock grounded generation / audit / final-qa | **Implemented** | Default local path (`AI_MODE=mock`, `APP_MODE=demo`) |
| Explainable scoring rubric (`candidarc-score-rubric@v1`) | **Implemented** | Content-derived; version number does not inflate scores |
| Claim-atom guardrails + adjudication with rejection reasons | **Implemented** | Percent/$$/dates/tech/team/ownership/ATS/cross-tenant |
| JD-aware mock generation + finding application on regenerate | **Implemented** | Rejected findings ignored; mistake_memory respected |
| Job/resume parsing with safety limits | **Implemented** | No invented employment/seniority; PDF/DOCX protections |
| OpenAI structured generation / final-qa | **Implemented** (live) | Real SDK calls via lifespan client; fail-closed, no silent mock fallback |
| Anthropic structured audits (hr-1/em-1/hr-2/em-2) | **Implemented** (live) | Tool/schema findings + adjudication |
| Redis idempotency (generate/audit/regenerate/final-qa) | **Implemented** | Memory TTL store in demo when `REDIS_URL` absent; required for live/production readiness |
| Request-scoped evidence match (lexical hybrid) | **Implemented** | Authoritative path; documented ranking method |
| Process-local evidence index/search | **Experimental** | Disabled (403) when `APP_MODE=production` |
| Cross-encoder re-ranker | **Feature-flagged / experimental** | Local artifact + checksum only; never downloads; disabled by default |
| Shadow sampling (`SHADOW_SAMPLE_PERCENT`) | **Feature-flagged** | Config present; TS BFF owns shadow routing |
| Persistent vector RAG / pgvector | **Removed / planned** | SQLAlchemy/asyncpg/pgvector deps removed; not on authoritative path |
| Production default Python intelligence | **Not enabled** | `RESUME_INTELLIGENCE_BACKEND` stays TypeScript unless explicitly opted in |

## Local (Windows / Cursor)

```powershell
cd services/python-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
$env:AI_MODE="mock"
$env:APP_MODE="demo"
$env:PYTHON_BACKEND_TOKEN="dev-python-backend-token-change-me"
uvicorn app.main:app --reload --port 8090
```

Safe local defaults: `AI_MODE=mock` + `APP_MODE=demo`. Do **not** set Python as the production resume-intelligence default from this service.

Health:

* `GET http://127.0.0.1:8090/health/live`
* `GET http://127.0.0.1:8090/health/ready`
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

## Tests

```powershell
cd services/python-backend
pytest -q
ruff check app tests
mypy app
```

## Docker Compose

From repo root:

```powershell
docker compose up -d python-backend
```

Image installs from pinned `requirements.txt` (hash-pinned when available).

## Lockfile / licenses

Pinned runtime+dev deps are recorded in `requirements.txt` (generated via `pip freeze` / `pip-compile` from the project venv; editable local installs excluded).

**License audit note:** Do not add copyleft (GPL/AGPL/SSPL) dependencies without explicit legal approval. Current primary stack (FastAPI, Pydantic, Uvicorn, httpx, OpenAI/Anthropic SDKs, redis, pypdf, python-docx) is generally permissive (MIT/Apache-2.0/BSD). Re-check licenses when upgrading. The optional `[ranker]` extra pulls `torch` / `sentence-transformers` and must stay disabled by default — it does not download models on import/startup/tests.

## Ownership

Python owns intelligence operations only. TypeScript remains authoritative for auth, workflow orchestration, Radar, storage, and PDF/DOCX rendering. `RESUME_INTELLIGENCE_BACKEND` defaults to TypeScript; Python and shadow modes are opt-in.
