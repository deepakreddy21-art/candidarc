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
            "claim_text": "Software Engineer at Northwind Labs, January 2024 – Present",
            "technologies": ["Python", "PyTorch", "OpenSearch"],
            "source_type": "employment",
            "verification_status": "user_attested",
            "candidate_confirmation_status": "confirmed",
            "confidence": "high",
            "metrics": ["latency improved 35%"],
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

    resume = None
    for version in range(0, 5):
        gen = _post(
            "/v1/resumes/generate",
            {
                "context": {**ctx, "request_id": f"req_smoke_gen_{version}"},
                "absolute_version": version,
                "cycle_step": version,
                "job_description": jd,
                "evidence": evidence,
                "allowed_technologies": allowed,
                "previous_resume": resume,
            },
            idempotency_key=f"smoke-gen-v{version}",
        )
        resume = gen["resume"]
        print(f"generate v{version} ok score={resume.get('score')}")

        if version < 4:
            lens, reviews, produces = AUDIT_SEQUENCE[version]
            audit = _post(
                "/v1/resumes/audit",
                {
                    "context": {**ctx, "request_id": f"req_smoke_audit_{lens}"},
                    "lens": lens,
                    "reviews_version": reviews,
                    "produces_version": produces,
                    "resume": resume,
                    "evidence": evidence,
                    "job_description": jd,
                    "allowed_technologies": allowed,
                },
                idempotency_key=f"smoke-audit-{lens}",
            )
            assert audit["lens"] == lens, audit
            print(f"audit {lens} ok findings={len(audit.get('findings') or [])}")

    regen = _post(
        "/v1/resumes/regenerate",
        {
            "context": {**ctx, "request_id": "req_smoke_regen"},
            "absolute_version": 4,
            "cycle_step": 4,
            "job_description": jd,
            "evidence": evidence,
            "allowed_technologies": allowed,
            "previous_resume": resume,
        },
        idempotency_key="smoke-regen-v4",
    )
    resume = regen["resume"]
    print("regenerate ok")

    final_qa = _post(
        "/v1/resumes/final-qa",
        {
            "context": {**ctx, "request_id": "req_smoke_final"},
            "resume": resume,
            "evidence": evidence,
            "allowed_technologies": allowed,
        },
        idempotency_key="smoke-final-qa",
    )
    if not final_qa.get("passed"):
        raise SystemExit(f"final-qa did not pass: {final_qa}")
    print("final-qa passed")
    print("smoke_lifecycle PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
