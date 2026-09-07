"""Structured Final-QA repair is distinct from free-form refinement."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.domain.schemas import FinalQaFailedCheck, FinalQaRepairDirective
from app.main import app
from app.modules.generation.service import generate_grounded_resume
from tests.conftest import AUTH_HEADERS, qa_context, qa_evidence


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def test_structured_repair_changes_visible_content_without_refinement_string() -> None:
    ctx = qa_context()
    evidence = qa_evidence(ctx)
    previous = generate_grounded_resume(
        absolute_version=4,
        cycle_step=4,
        evidence=evidence,
        allowed_technologies=["Python", "PyTorch", "OpenSearch"],
        job_description="Platform engineer " + ("x" * 20),
    )
    repair = FinalQaRepairDirective(
        source_version=4,
        source_version_label="V4",
        attempt=1,
        failed_checks=[
            FinalQaFailedCheck(
                label="Primary technology emphasis",
                status="fail",
                detail="Lead with grounded primary technology from evidence",
            )
        ],
        approved_evidence_ids=["ev-1"],
        grounded_targets=["Python"],
    )
    repaired = generate_grounded_resume(
        absolute_version=5,
        cycle_step=0,
        evidence=evidence,
        allowed_technologies=["Python", "PyTorch", "OpenSearch"],
        job_description="Platform engineer " + ("x" * 20),
        previous_resume=previous,
        final_qa_repair=repair,
    )
    assert "final-qa-repair:applied" in repaired.notes
    assert "ownership focus" not in str(repaired.sections).lower()
    skills = next(s for s in repaired.sections if s.type == "skills")
    assert skills.bullets
    assert skills.bullets[0].technologies[0].lower() == "python"


def test_api_rejects_repair_smuggled_as_inventing_refinement(
    client: TestClient,
) -> None:
    """Free-form inventing string still fails; structured repair is the supported path."""
    ctx = qa_context()
    evidence = qa_evidence(ctx)
    response = client.post(
        "/v1/resumes/regenerate",
        headers=AUTH_HEADERS,
        json={
            "context": ctx.model_dump(),
            "absolute_version": 5,
            "job_description": "Platform engineer " + ("x" * 20),
            "evidence": [item.model_dump() for item in evidence],
            "allowed_technologies": ["Python"],
            "previous_resume": generate_grounded_resume(
                absolute_version=4,
                cycle_step=4,
                evidence=evidence,
                allowed_technologies=["Python"],
                job_description="Platform engineer " + ("x" * 20),
            ).model_dump(),
            "refinement_instruction": (
                "Final-QA repair without inventing facts. Emphasize grounded technologies."
            ),
        },
    )
    # May be GUARDRAIL (inventing) or REFINEMENT_NOT_APPLICABLE — must not 200 via notes-only.
    assert response.status_code == 422


def test_api_structured_final_qa_repair_succeeds(client: TestClient) -> None:
    ctx = qa_context()
    evidence = qa_evidence(ctx)
    previous = generate_grounded_resume(
        absolute_version=4,
        cycle_step=4,
        evidence=evidence,
        allowed_technologies=["Python", "OpenSearch"],
        job_description="Platform engineer " + ("x" * 20),
    )
    response = client.post(
        "/v1/resumes/regenerate",
        headers=AUTH_HEADERS,
        json={
            "context": ctx.model_dump(),
            "absolute_version": 5,
            "job_description": "Platform engineer " + ("x" * 20),
            "evidence": [item.model_dump() for item in evidence],
            "allowed_technologies": ["Python", "OpenSearch"],
            "previous_resume": previous.model_dump(),
            "final_qa_repair": {
                "repair_type": "final_qa_repair",
                "source_version": 4,
                "source_version_label": "V4",
                "attempt": 1,
                "failed_checks": [
                    {
                        "label": "Primary technology emphasis",
                        "status": "fail",
                        "detail": "Lead with grounded primary technology from evidence",
                    }
                ],
                "approved_evidence_ids": ["ev-1"],
                "grounded_targets": ["Python"],
            },
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert "final-qa-repair:applied" in body["resume"]["notes"]
    skills = next(s for s in body["resume"]["sections"] if s["type"] == "skills")
    assert skills["bullets"][0]["technologies"][0].lower() == "python"
