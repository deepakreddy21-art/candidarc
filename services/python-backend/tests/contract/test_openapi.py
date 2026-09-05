"""Contract checks for OpenAPI + schema presence + committed artifact drift."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from app.main import app

REQUIRED_PATHS = {
    "/health/live",
    "/health/ready",
    "/v1/resumes/parse",
    "/v1/jobs/parse",
    "/v1/research/synthesize",
    "/v1/evidence/index",
    "/v1/evidence/search",
    "/v1/evidence/match",
    "/v1/resumes/generate",
    "/v1/resumes/audit",
    "/v1/resumes/regenerate",
    "/v1/resumes/final-qa",
}

ROOT = Path(__file__).resolve().parents[2]
OPENAPI_PATH = ROOT / "openapi.json"


def test_openapi_contains_required_paths() -> None:
    schema = app.openapi()
    paths = set(schema["paths"].keys())
    missing = REQUIRED_PATHS - paths
    assert not missing, f"Missing OpenAPI paths: {sorted(missing)}"
    assert schema["info"]["title"]
    assert "openapi" in schema


def test_resume_generate_response_schema_fields() -> None:
    schema = app.openapi()
    components = schema["components"]["schemas"]
    assert "ResumeGenerateResponse" in components
    assert "ResumeDocument" in components
    resume = components["ResumeDocument"]["properties"]
    assert "version_number" in resume
    assert "sections" in resume


def test_committed_openapi_matches_runtime() -> None:
    assert OPENAPI_PATH.exists(), "Run scripts/export_openapi.py to generate openapi.json"
    committed = json.loads(OPENAPI_PATH.read_text(encoding="utf-8"))
    runtime = app.openapi()
    # Stable compare on paths + info version (ignore volatile ordering via dumps sort)
    committed_norm = json.dumps({"paths": sorted(committed["paths"].keys()), "title": committed["info"]["title"]}, sort_keys=True)
    runtime_norm = json.dumps({"paths": sorted(runtime["paths"].keys()), "title": runtime["info"]["title"]}, sort_keys=True)
    assert committed_norm == runtime_norm
    committed_hash = hashlib.sha256(json.dumps(committed["paths"], sort_keys=True).encode()).hexdigest()
    runtime_hash = hashlib.sha256(json.dumps(runtime["paths"], sort_keys=True).encode()).hexdigest()
    assert committed_hash == runtime_hash
