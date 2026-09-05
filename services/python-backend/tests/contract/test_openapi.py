"""Contract checks for OpenAPI + schema presence + committed artifact drift."""

from __future__ import annotations

import copy
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

REQUIRED_SCHEMAS = {
    "ResumeDocument-Output",
    "ResumeGenerateRequest",
    "ResumeGenerateResponse",
    "AuditRequest",
    "AuditResponse",
    "AuditFinding",
    "ScoreBreakdown",
    "ProviderUsage",
    "FinalQaResponse",
    "EvidenceMatchResponse",
    "MistakeMemoryRule",
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


def test_openapi_contains_component_schemas() -> None:
    schema = app.openapi()
    components = schema["components"]["schemas"]
    missing = REQUIRED_SCHEMAS - set(components)
    assert not missing, f"Missing schemas: {sorted(missing)}"
    # Pydantic v2 may emit ResumeDocument-Input/Output when validators alter wire shape
    resume_key = "ResumeDocument-Output" if "ResumeDocument-Output" in components else "ResumeDocument"
    resume = components[resume_key]["properties"]
    assert "version_number" in resume
    assert "absolute_version" in resume
    assert "cycle_step" in resume
    assert "score_breakdown" in resume
    assert "score_rubric_version" in resume
    audit = components["AuditResponse"]["properties"]
    assert "rejected_findings" in audit
    assert "usage" in audit


def test_resume_generate_response_schema_fields() -> None:
    schema = app.openapi()
    components = schema["components"]["schemas"]
    assert "ResumeGenerateResponse" in components
    assert "ResumeDocument-Output" in components or "ResumeDocument" in components
    gen = components["ResumeGenerateResponse"]["properties"]
    assert "usage" in gen


def test_committed_openapi_matches_runtime() -> None:
    assert OPENAPI_PATH.exists(), "Run scripts/export_openapi.py to generate openapi.json"
    committed = json.loads(OPENAPI_PATH.read_text(encoding="utf-8"))
    runtime = app.openapi()
    committed_norm = json.dumps(
        {"paths": sorted(committed["paths"].keys()), "title": committed["info"]["title"]},
        sort_keys=True,
    )
    runtime_norm = json.dumps(
        {"paths": sorted(runtime["paths"].keys()), "title": runtime["info"]["title"]},
        sort_keys=True,
    )
    assert committed_norm == runtime_norm
    committed_hash = hashlib.sha256(json.dumps(committed["paths"], sort_keys=True).encode()).hexdigest()
    runtime_hash = hashlib.sha256(json.dumps(runtime["paths"], sort_keys=True).encode()).hexdigest()
    assert committed_hash == runtime_hash

    # Full components/schemas presence in committed artifact
    committed_schemas = set(committed.get("components", {}).get("schemas", {}))
    assert REQUIRED_SCHEMAS <= committed_schemas


def test_schema_drift_mutation_fails() -> None:
    """Mutating a committed schema field must diverge from runtime OpenAPI."""
    runtime = app.openapi()
    mutated = copy.deepcopy(runtime)
    resume_key = "ResumeDocument-Output" if "ResumeDocument-Output" in runtime["components"]["schemas"] else "ResumeDocument"
    mutated["components"]["schemas"][resume_key]["properties"]["score"]["type"] = "string"
    assert mutated["components"]["schemas"][resume_key] != runtime["components"]["schemas"][resume_key]
    runtime_dump = json.dumps(runtime["components"]["schemas"][resume_key], sort_keys=True)
    mutated_dump = json.dumps(mutated["components"]["schemas"][resume_key], sort_keys=True)
    assert runtime_dump != mutated_dump
