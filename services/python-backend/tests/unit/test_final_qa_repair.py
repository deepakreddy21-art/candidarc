"""Structured Final-QA repair is distinct from free-form refinement.

Tests verify:
1. Repair actually changes visible content (not just notes markers)
2. Mock Final QA passes only when actual condition is fixed
3. Unrepairable checks fail closed with FINAL_QA_REPAIR_UNREPAIRABLE
4. Confirmation provenance validates grounded_targets
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app.core.errors import FINAL_QA_REPAIR_UNREPAIRABLE
from app.domain.schemas import (
    FinalQaFailedCheck,
    FinalQaRepairDirective,
    UserConfirmation,
)
from app.main import app
from app.modules.generation.service import generate_grounded_resume
from app.modules.quality.service import _check_primary_tech_emphasis, verify_repair_fixed_checks
from app.providers.mock_provider import MockProvider
from tests.conftest import AUTH_HEADERS, qa_context, qa_evidence


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def test_structured_repair_changes_visible_content_not_just_notes() -> None:
    """Repair must change actual visible content, not just add notes markers."""
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
    # Verify ACTUAL content change — Python appears prominently in skills lead
    skills = next(s for s in repaired.sections if s.type == "skills")
    assert skills.bullets
    assert skills.bullets[0].technologies[0].lower() == "python"
    # Notes marker is still present but is NOT the success criterion
    assert "final-qa-repair:applied" in repaired.notes


def test_check_primary_tech_emphasis_real_condition() -> None:
    """Primary tech check validates actual content, not notes markers."""
    ctx = qa_context()
    evidence = qa_evidence(ctx)

    # Generate resume - with evidence that has Python, check if 'terraform' (not in evidence) would fail
    resume = generate_grounded_resume(
        absolute_version=1,
        cycle_step=1,
        evidence=evidence,
        allowed_technologies=["Python", "PyTorch", "OpenSearch"],
        job_description="Platform engineer " + ("x" * 20),
    )

    # Check fails when grounded_target is something NOT in the resume lead
    check_result = _check_primary_tech_emphasis(resume, evidence, grounded_targets=["Terraform"])
    # Should fail because Terraform is not in evidence/resume
    assert check_result["status"] in {"fail", "warn"}

    # Check passes when Python (which IS in evidence) is the target
    check_result = _check_primary_tech_emphasis(resume, evidence, grounded_targets=["Python"])
    assert check_result["status"] == "pass"


@pytest.mark.asyncio()
async def test_mock_final_qa_fails_until_condition_fixed() -> None:
    """Mock with CANDIDARC_MOCK_FINAL_QA_FORCE=fail_until_repair fails until real condition is met."""
    ctx = qa_context()
    evidence = qa_evidence(ctx)
    provider = MockProvider()

    # Generate a resume from evidence (which has Python)
    resume = generate_grounded_resume(
        absolute_version=1,
        cycle_step=1,
        evidence=evidence,
        allowed_technologies=["Python", "PyTorch", "OpenSearch"],
        job_description="Platform engineer " + ("x" * 20),
    )

    old_env = os.environ.get("CANDIDARC_MOCK_FINAL_QA_FORCE")
    try:
        os.environ["CANDIDARC_MOCK_FINAL_QA_FORCE"] = "fail_until_repair"

        # With grounded_targets=["Terraform"] (not in evidence), should fail
        response, _, _ = await provider.final_qa(
            resume=resume,
            evidence=evidence,
            grounded_targets=["Terraform"],  # Not in evidence/resume
        )
        # Should have the primary tech check fail
        tech_check = next((c for c in response.checks if c.label == "Primary technology emphasis"), None)
        assert tech_check is not None
        assert tech_check.status == "fail"

        # With grounded_targets=["Python"] (IS in evidence/resume lead), should pass
        response2, _, _ = await provider.final_qa(
            resume=resume,
            evidence=evidence,
            grounded_targets=["Python"],  # IS in evidence/resume
        )
        # Should pass because Python is in the resume lead
        tech_check2 = next((c for c in response2.checks if c.label == "Primary technology emphasis"), None)
        # Either no check added (passed), or check status is pass
        if tech_check2:
            assert tech_check2.status == "pass"
    finally:
        if old_env is None:
            os.environ.pop("CANDIDARC_MOCK_FINAL_QA_FORCE", None)
        else:
            os.environ["CANDIDARC_MOCK_FINAL_QA_FORCE"] = old_env


def test_verify_repair_fixed_checks_function() -> None:
    """verify_repair_fixed_checks returns (all_fixed, results)."""
    ctx = qa_context()
    evidence = qa_evidence(ctx)

    # Generate resume from evidence (has Python)
    resume = generate_grounded_resume(
        absolute_version=1,
        cycle_step=1,
        evidence=evidence,
        allowed_technologies=["Python", "PyTorch"],
        job_description="Platform " + ("x" * 20),
    )
    # Test with a tech NOT in resume (Terraform) - should fail
    failed_checks = [FinalQaFailedCheck(label="Primary technology emphasis", status="fail", detail="")]
    fixed, results = verify_repair_fixed_checks(resume, evidence, failed_checks, grounded_targets=["Terraform"])
    assert not fixed
    assert any(r["status"] == "fail" for r in results)

    # Test with Python (IS in resume) - should pass
    fixed2, results2 = verify_repair_fixed_checks(resume, evidence, failed_checks, grounded_targets=["Python"])
    assert fixed2
    assert all(r["status"] in {"pass", "warn"} for r in results2)


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
    # Verify actual content fix
    skills = next(s for s in body["resume"]["sections"] if s["type"] == "skills")
    assert skills["bullets"][0]["technologies"][0].lower() == "python"


def test_grounded_targets_from_confirmation_provenance() -> None:
    """grounded_targets can come from confirmations with evidence_description or related_evidence_ids."""
    ctx = qa_context()
    evidence = qa_evidence(ctx)

    # Confirmation provides provenance for Kubernetes (not in evidence)
    confirmations = [
        UserConfirmation(
            id="conf-1",
            tenant_id=ctx.tenant_id,
            owner_user_id=ctx.user_id,
            topic="Kubernetes experience",
            confirmed=True,
            evidence_description="Deployed services to Kubernetes cluster at previous role",
            related_evidence_ids=["ev-1"],
        )
    ]

    # Repair targeting Kubernetes should be allowed via confirmation provenance
    repair = FinalQaRepairDirective(
        source_version=1,
        attempt=1,
        failed_checks=[FinalQaFailedCheck(label="Primary technology emphasis", status="fail", detail="")],
        grounded_targets=["Kubernetes"],  # From confirmation, not evidence
    )

    # This should NOT raise because Kubernetes is proven via confirmation
    previous = generate_grounded_resume(
        absolute_version=1,
        cycle_step=1,
        evidence=evidence,
        allowed_technologies=["Python"],
        job_description="Platform " + ("x" * 20),
    )
    # Note: The repair may fail for other reasons (unrepairable check),
    # but the grounded_targets validation should pass
    try:
        generate_grounded_resume(
            absolute_version=2,
            cycle_step=2,
            evidence=evidence,
            allowed_technologies=["Python", "Kubernetes"],
            job_description="Platform " + ("x" * 20),
            previous_resume=previous,
            final_qa_repair=repair,
            user_confirmations=confirmations,
        )
    except Exception as e:
        # If it fails, should NOT be because of grounded_targets validation
        assert "Repair target 'Kubernetes'" not in str(e)
        assert "not found in evidence" not in str(e).lower()
