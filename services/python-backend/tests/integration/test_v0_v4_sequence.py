"""Integration proof of the HR/EM learning lifecycle."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import AUTH_HEADERS, qa_context, qa_evidence

AUDIT_SEQUENCE = [
    ("hr-1", 0, 1),
    ("em-1", 1, 2),
    ("hr-2", 2, 3),
    ("em-2", 3, 4),
]


def _context(base: dict[str, object], request_id: str) -> dict[str, object]:
    return {**base, "request_id": request_id}


def _finding(
    *,
    title: str,
    suggested_text: str,
    status: str,
    rejection_reason: str | None = None,
) -> dict[str, object]:
    return {
        "severity": "major",
        "section": "experience",
        "title": title,
        "explanation": title,
        "before_text": "",
        "suggested_text": suggested_text,
        "expected_score_impact": 0,
        "evidence_ids": ["ev-1"],
        "status": status,
        "rejection_reason": rejection_reason,
    }


def test_full_v0_to_v4_mock_sequence() -> None:
    with TestClient(app) as client:
        ctx = qa_context()
        base_context = ctx.model_dump()
        evidence = [item.model_dump() for item in qa_evidence(ctx)]
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
            _finding(
                title="unsupported rejected finding",
                suggested_text="Unsupported rejected Kubernetes claim",
                status="rejected",
                rejection_reason="UNSUPPORTED_TECHNOLOGY",
            )
        ]
        lenses_seen: list[str] = []
        gen = client.post(
            "/v1/resumes/generate",
            headers={**AUTH_HEADERS, "Idempotency-Key": "lifecycle-generate-v0"},
            json={
                "context": _context(base_context, "lifecycle-generate-v0"),
                "absolute_version": 0,
                "cycle_step": 0,
                "job_description": jd,
                "evidence": evidence,
                "allowed_technologies": allowed,
            },
        )
        assert gen.status_code == 200, gen.text
        resume = gen.json()["resume"]
        assert resume["absolute_version"] == 0

        for version, (lens, reviews, produces) in enumerate(AUDIT_SEQUENCE, start=1):
            previous_resume = resume
            audit = client.post(
                "/v1/resumes/audit",
                headers={**AUTH_HEADERS, "Idempotency-Key": f"lifecycle-audit-{lens}"},
                json={
                    "context": _context(base_context, f"lifecycle-audit-{lens}"),
                    "lens": lens,
                    "reviews_version": reviews,
                    "produces_version": produces,
                    "resume": previous_resume,
                    "evidence": evidence,
                    "job_description": jd,
                    "allowed_technologies": allowed,
                },
            )
            assert audit.status_code == 200, audit.text
            body = audit.json()
            assert body["lens"] == lens
            assert body["findings"], f"{lens} produced no accepted findings"
            accepted_text = body["findings"][0]["edited_text"] or body["findings"][0]["suggested_text"]
            lenses_seen.append(body["lens"])

            regen = client.post(
                "/v1/resumes/regenerate",
                headers={**AUTH_HEADERS, "Idempotency-Key": f"lifecycle-regenerate-v{version}"},
                json={
                    "context": _context(base_context, f"lifecycle-regenerate-v{version}"),
                    "absolute_version": version,
                    "cycle_step": version,
                    "job_description": jd,
                    "evidence": evidence,
                    "allowed_technologies": allowed,
                    "previous_resume": previous_resume,
                    "accepted_findings": body["findings"],
                    "rejected_findings": rejected + body["rejected_findings"],
                    "mistake_memory": mistake_memory,
                },
            )
            assert regen.status_code == 200, regen.text
            resume = regen.json()["resume"]
            blob = " ".join(
                bullet["text"]
                for section in resume["sections"]
                for bullet in section.get("bullets") or []
            )
            assert accepted_text in blob
            assert "Unsupported rejected Kubernetes claim" not in blob
            assert "unsupported memory phrase" not in blob.lower()
            assert resume["absolute_version"] == version
            assert resume["version_number"] == version

        assert lenses_seen == ["hr-1", "em-1", "hr-2", "em-2"]
        assert lenses_seen.count("hr-1") + lenses_seen.count("hr-2") == 2
        assert lenses_seen.count("em-1") + lenses_seen.count("em-2") == 2

        final_qa = client.post(
            "/v1/resumes/final-qa",
            headers={**AUTH_HEADERS, "Idempotency-Key": "lifecycle-final-qa-v4"},
            json={
                "context": _context(base_context, "lifecycle-final-qa-v4"),
                "resume": resume,
                "evidence": evidence,
                "allowed_technologies": allowed,
            },
        )
        assert final_qa.status_code == 200, final_qa.text
        assert final_qa.json()["passed"] is True

        score_v4 = resume["score"]
        regen = client.post(
            "/v1/resumes/regenerate",
            headers={**AUTH_HEADERS, "Idempotency-Key": "lifecycle-enhancement-v9"},
            json={
                "context": _context(base_context, "lifecycle-enhancement-v9"),
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
        )
        assert regen.status_code == 200, regen.text
        enhancement = regen.json()["resume"]
        assert enhancement["absolute_version"] == 9
        assert enhancement["cycle_step"] == 0
        assert enhancement["score"] == score_v4
