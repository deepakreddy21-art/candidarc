"""Integration: full V0→V4 mock sequence with exactly 2 HR + 2 EM audits."""

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


def test_full_v0_to_v4_mock_sequence() -> None:
    client = TestClient(app)
    ctx = qa_context()
    evidence = [item.model_dump() for item in qa_evidence(ctx)]
    allowed = ["Python", "PyTorch", "OpenSearch"]
    jd = "Northwind Labs fictional role seeking Python platform engineer " + ("detail " * 8)

    resume = None
    lenses_seen: list[str] = []

    for version in range(0, 5):
        gen = client.post(
            "/v1/resumes/generate",
            headers={**AUTH_HEADERS, "Idempotency-Key": f"qa-v{version}"},
            json={
                "context": ctx.model_dump(),
                "version_number": version,
                "job_description": jd,
                "evidence": evidence,
                "allowed_technologies": allowed,
                "previous_resume": resume,
            },
        )
        assert gen.status_code == 200, gen.text
        resume = gen.json()["resume"]
        assert resume["version_number"] == version

        if version < 4:
            lens, reviews, produces = AUDIT_SEQUENCE[version]
            audit = client.post(
                "/v1/resumes/audit",
                headers=AUTH_HEADERS,
                json={
                    "context": ctx.model_dump(),
                    "lens": lens,
                    "reviews_version": reviews,
                    "produces_version": produces,
                    "resume": resume,
                    "evidence": evidence,
                    "job_description": jd,
                },
            )
            assert audit.status_code == 200, audit.text
            body = audit.json()
            assert body["lens"] == lens
            lenses_seen.append(body["lens"])

    assert lenses_seen == ["hr-1", "em-1", "hr-2", "em-2"]
    assert lenses_seen.count("hr-1") + lenses_seen.count("hr-2") == 2
    assert lenses_seen.count("em-1") + lenses_seen.count("em-2") == 2

    final_qa = client.post(
        "/v1/resumes/final-qa",
        headers=AUTH_HEADERS,
        json={"context": ctx.model_dump(), "resume": resume, "evidence": evidence},
    )
    assert final_qa.status_code == 200
    assert final_qa.json()["passed"] is True

    regen = client.post(
        "/v1/resumes/regenerate",
        headers=AUTH_HEADERS,
        json={
            "context": ctx.model_dump(),
            "version_number": 4,
            "job_description": jd,
            "evidence": evidence,
            "allowed_technologies": allowed,
        },
    )
    assert regen.status_code == 200
