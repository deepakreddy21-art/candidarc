#!/usr/bin/env python3
"""In-container mock AI lifecycle: generate → audit×4 → regenerate → final-qa.

Uses PYTHON_BACKEND_TOKEN and hits local /v1. Fictional data only.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any

BASE = os.getenv("SMOKE_PYTHON_BASE", "http://127.0.0.1:8090").rstrip("/")
TOKEN = os.getenv("PYTHON_BACKEND_TOKEN", "").strip()
AUDIT_SEQUENCE = [
    ("hr-1", 0, 1),
    ("em-1", 1, 2),
    ("hr-2", 2, 3),
    ("em-2", 3, 4),
]


def _post(path: str, body: dict[str, Any], *, idempotency_key: str | None = None) -> dict[str, Any]:
    if not TOKEN:
        raise SystemExit("PYTHON_BACKEND_TOKEN is required for smoke lifecycle")
    data = json.dumps(body).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            if resp.status >= 400:
                raise SystemExit(f"{path} failed status={resp.status} body={raw[:500]}")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise SystemExit(f"{path} HTTP {exc.code}: {detail}") from exc


def main() -> int:
    ctx = {
        "tenant_id": "ten_smoke",
        "user_id": "user_smoke",
        "application_id": "app_smoke",
        "workflow_run_id": "wf_smoke",
        "request_id": "req_smoke",
    }
    evidence = [
        {
            "id": "ev-smoke-1",
            "tenant_id": "ten_smoke",
            "owner_user_id": "user_smoke",
            "title": "Northwind Labs employment",
            "organization": "Northwind Labs",
            "claim_text": "Software Engineer at Northwind Labs, January 2024 – Present. Improved search latency by 35% using Python, PyTorch, and OpenSearch.",
            "technologies": ["Python", "PyTorch", "OpenSearch"],
            "source_type": "employment",
            "verification_status": "user_attested",
            "candidate_confirmation_status": "confirmed",
            "confidence": "high",
            "metrics": ["35%"],
        },
        {
            "id": "ev-smoke-2",
            "tenant_id": "ten_smoke",
            "owner_user_id": "user_smoke",
            "title": "Rivertown Institute education",
            "organization": "Rivertown Institute of Technology",
            "claim_text": "MS Information Systems, January 2023 – May 2024",
            "technologies": [],
            "source_type": "education",
            "verification_status": "user_attested",
            "candidate_confirmation_status": "confirmed",
            "confidence": "high",
        },
    ]
    allowed = ["Python", "PyTorch", "OpenSearch"]
    jd = "Northwind Labs fictional role seeking Python platform engineer " + ("detail " * 8)

    mistake_memory = [
        {
            "category": "truthfulness",
            "rule": "unsupported memory phrase",
            "severity": "major",
            "originating_audit": "hr-1",
            "affected_version": "V0",
        }
    ]
    rejected = [
        {
            "severity": "major",
            "section": "experience",
            "title": "unsupported rejected finding",
            "explanation": "Must remain rejected",
            "before_text": "",
            "suggested_text": "Unsupported rejected Kubernetes claim",
            "expected_score_impact": 0,
            "evidence_ids": ["ev-smoke-1"],
            "status": "rejected",
            "rejection_reason": "UNSUPPORTED_TECHNOLOGY",
        }
    ]
    generated = _post(
        "/v1/resumes/generate",
        {
            "context": {**ctx, "request_id": "req_smoke_generate_v0"},
            "absolute_version": 0,
            "cycle_step": 0,
            "job_description": jd,
            "evidence": evidence,
            "allowed_technologies": allowed,
        },
        idempotency_key="smoke-lifecycle-generate-v0",
    )
    resume = generated["resume"]
    print(f"generate v0 ok score={resume.get('score')}")

    for version, (lens, reviews, produces) in enumerate(AUDIT_SEQUENCE, start=1):
        previous_resume = resume
        audit = _post(
            "/v1/resumes/audit",
            {
                "context": {**ctx, "request_id": f"req_smoke_audit_{lens}"},
                "lens": lens,
                "reviews_version": reviews,
                "produces_version": produces,
                "resume": previous_resume,
                "evidence": evidence,
                "job_description": jd,
                "allowed_technologies": allowed,
            },
            idempotency_key=f"smoke-lifecycle-audit-{lens}",
        )
        assert audit["lens"] == lens, audit
        assert audit.get("findings"), audit
        accepted_text = audit["findings"][0].get("edited_text") or audit["findings"][0]["suggested_text"]
        resume = _post(
            "/v1/resumes/regenerate",
            {
                "context": {**ctx, "request_id": f"req_smoke_regenerate_v{version}"},
                "absolute_version": version,
                "cycle_step": version,
                "job_description": jd,
                "evidence": evidence,
                "allowed_technologies": allowed,
                "previous_resume": previous_resume,
                "accepted_findings": audit["findings"],
                "rejected_findings": rejected + (audit.get("rejected_findings") or []),
                "mistake_memory": mistake_memory,
            },
            idempotency_key=f"smoke-lifecycle-regenerate-v{version}",
        )["resume"]
        blob = " ".join(
            bullet["text"]
            for section in resume["sections"]
            for bullet in section.get("bullets") or []
        )
        assert accepted_text in blob, (lens, accepted_text)
        assert "Unsupported rejected Kubernetes claim" not in blob
        assert "unsupported memory phrase" not in blob.lower()
        print(f"audit {lens} → regenerate v{version} ok score={resume.get('score')}")

    final_qa = _post(
        "/v1/resumes/final-qa",
        {
            "context": {**ctx, "request_id": "req_smoke_final", "schema_version": "2026-09-resume-intelligence.v1"},
            "resume": resume,
            "evidence": evidence,
            "allowed_technologies": allowed,
        },
        idempotency_key="smoke-final-qa",
    )
    if not final_qa.get("passed"):
        raise SystemExit(f"final-qa did not pass: {final_qa}")
    print("final-qa passed")

    score_v4 = resume["score"]
    enhancement = _post(
        "/v1/resumes/regenerate",
        {
            "context": {**ctx, "request_id": "req_smoke_enhancement_v9"},
            "absolute_version": 9,
            "cycle_step": 0,
            "job_description": jd,
            "evidence": evidence,
            "allowed_technologies": allowed,
            "previous_resume": resume,
            "accepted_findings": [],
            "rejected_findings": rejected,
            "mistake_memory": mistake_memory,
        },
        idempotency_key="smoke-lifecycle-enhancement-v9",
    )["resume"]
    assert enhancement["absolute_version"] == 9
    assert enhancement["score"] == score_v4, "score increased from version number alone"
    print("enhancement cycle v9 preserved content-derived score")
    print("smoke_lifecycle PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
