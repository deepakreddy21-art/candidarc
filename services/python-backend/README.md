# CandidArc Python resume-intelligence service

Internal FastAPI service used by the TypeScript BFF. The browser never calls this service directly.

## Local (Windows / Cursor)

```powershell
cd services/python-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
$env:AI_MODE="mock"
$env:PYTHON_BACKEND_TOKEN="dev-python-backend-token-change-me"
uvicorn app.main:app --reload --port 8090
```

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

## Lockfile / licenses

Pinned runtime+dev deps are recorded in `requirements.txt` (generated via `pip freeze` from the project venv; editable local installs excluded).

**License audit note:** Do not add copyleft (GPL/AGPL/SSPL) dependencies without explicit legal approval. Current primary stack (FastAPI, Pydantic, Uvicorn, httpx, OpenAI/Anthropic SDKs, SQLAlchemy, asyncpg, pgvector, pypdf, python-docx) is generally permissive (MIT/Apache-2.0/BSD). Re-check licenses when upgrading. The optional `[ranker]` extra pulls `torch` / `sentence-transformers` and must stay disabled by default — it does not download models on import/startup/tests.

## Ownership

Python owns intelligence operations only. TypeScript remains authoritative for auth, workflow orchestration, Radar, storage, and PDF/DOCX rendering. `RESUME_INTELLIGENCE_BACKEND` defaults to TypeScript; Python and shadow modes are opt-in.
