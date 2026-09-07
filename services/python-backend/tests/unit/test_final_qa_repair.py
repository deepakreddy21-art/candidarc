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
    FinalQaCheck,
    FinalQaCheckCode,
    FinalQaFailedCheck,
    FinalQaRepairDirective,
    FinalQaResponse,
    ProviderUsage,
)
from app.main import app
from app.modules.generation.service import apply_final_qa_repair, generate_grounded_resume
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
        absolute_version=4,
        cycle_step=4,
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
async def test_mock_final_qa_force_fails_v4_once_then_requires_real_fix() -> None:
    """fail_until_repair forces V4 fail once; later revisions need real content postcondition."""
    ctx = qa_context()
    evidence = qa_evidence(ctx)
    provider = MockProvider()

    v4 = generate_grounded_resume(
        absolute_version=4,
        cycle_step=4,
        evidence=evidence,
        allowed_technologies=["Python", "PyTorch", "OpenSearch"],
        job_description="Platform engineer " + ("x" * 20),
    )
    # Ensure V4 already leads with Python so a content-only hook would wrongly pass.
    assert _check_primary_tech_emphasis(v4, evidence, grounded_targets=["Python"])["status"] == "pass"

    repaired = generate_grounded_resume(
        absolute_version=5,
        cycle_step=0,
        evidence=evidence,
        allowed_technologies=["Python", "PyTorch", "OpenSearch"],
        job_description="Platform engineer " + ("x" * 20),
        previous_resume=v4,
        final_qa_repair=FinalQaRepairDirective(
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
        ),
    )

    old_env = os.environ.get("CANDIDARC_MOCK_FINAL_QA_FORCE")
    try:
        os.environ["CANDIDARC_MOCK_FINAL_QA_FORCE"] = "fail_until_repair"

        response_v4, _, _ = await provider.final_qa(
            resume=v4,
            evidence=evidence,
            grounded_targets=["Python"],
        )
        tech_v4 = next(c for c in response_v4.checks if c.label == "Primary technology emphasis")
        assert tech_v4.status == "fail"
        assert response_v4.passed is False

        response_ok, _, _ = await provider.final_qa(
            resume=repaired,
            evidence=evidence,
            grounded_targets=["Python"],
        )
        tech_ok = next((c for c in response_ok.checks if c.label == "Primary technology emphasis"), None)
        if tech_ok:
            assert tech_ok.status == "pass"

        broken = repaired.model_copy(
            update={
                "sections": [
                    (
                        section.model_copy(
                            update={
                                "bullets": [
                                    section.bullets[0].model_copy(
                                        update={"text": "Platform leadership without primary tech lead", "technologies": ["Go"]}
                                    ),
                                    *section.bullets[1:],
                                ]
                            }
                        )
                        if section.type in {"summary", "skills"} and section.bullets
                        else section
                    )
                    for section in repaired.sections
                ]
            }
        )
        response_bad, _, _ = await provider.final_qa(
            resume=broken,
            evidence=evidence,
            grounded_targets=["Python"],
        )
        tech_bad = next(c for c in response_bad.checks if c.label == "Primary technology emphasis")
        assert tech_bad.status == "fail"
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
    assert all(r["status"] == "pass" for r in results2)


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
    assert body["provider"] == body["usage"]["provider"] == "deterministic"
    assert body["model"] == body["usage"]["model"] == "internal"
    assert body["usage"]["input_tokens"] == body["usage"]["output_tokens"] == 0
    assert body["usage"]["estimated_cost_cents"] == 0
    assert body["usage"]["provider_request_id"] is None
    # Verify actual content fix
    skills = next(s for s in body["resume"]["sections"] if s["type"] == "skills")
    assert skills["bullets"][0]["technologies"][0].lower() == "python"


def test_repair_target_requires_persisted_evidence_not_confirmation_text() -> None:
    """Ephemeral confirmation text cannot become repair evidence."""
    ctx = qa_context()
    evidence = qa_evidence(ctx)
    repair = FinalQaRepairDirective(
        source_version=1,
        attempt=1,
        failed_checks=[FinalQaFailedCheck(label="Primary technology emphasis", status="fail", detail="")],
        grounded_targets=["Kubernetes"],
    )
    previous = generate_grounded_resume(
        absolute_version=1,
        cycle_step=1,
        evidence=evidence,
        allowed_technologies=["Python"],
        job_description="Platform " + ("x" * 20),
    )
    with pytest.raises(ValueError, match="not found in persisted evidence"):
        generate_grounded_resume(
            absolute_version=2,
            cycle_step=2,
            evidence=evidence,
            allowed_technologies=["Python", "Kubernetes"],
            job_description="Platform " + ("x" * 20),
            previous_resume=previous,
            final_qa_repair=repair,
        )


def test_unsupported_blocking_check_raises_machine_code(client: TestClient) -> None:
    ctx = qa_context()
    evidence = qa_evidence(ctx)
    previous = generate_grounded_resume(
        absolute_version=4,
        cycle_step=4,
        evidence=evidence,
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
            "previous_resume": previous.model_dump(),
            "final_qa_repair": {
                "source_version": 4,
                "failed_checks": [{
                    "code": "HAS_EXPERIENCE",
                    "label": "Has experience",
                    "status": "fail",
                    "blocking": True,
                    "detail": "missing",
                }],
            },
        },
    )
    assert response.status_code == 422
    body = response.json()
    assert (body.get("detail") or body)["code"] == FINAL_QA_REPAIR_UNREPAIRABLE, body


def test_final_qa_derives_passed_from_blocking_statuses(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class InconsistentProvider:
        name = "stub"
        model = "stub-model"

        async def final_qa(self, **_kwargs: object):
            usage = ProviderUsage(
                provider="stub",
                model="stub-model",
                prompt_version="test",
                input_tokens=1,
                output_tokens=1,
                latency_ms=0,
            )
            result = FinalQaResponse(
                passed=True,
                checks=[FinalQaCheck(
                    code=FinalQaCheckCode.HAS_EXPERIENCE,
                    label="Has experience",
                    status="fail",
                    blocking=True,
                    detail="missing",
                )],
                provider="stub",
                model="stub-model",
                usage=usage,
            )
            return result, 0, usage

    monkeypatch.setattr("app.api.v1.routes.get_provider", lambda *_args: InconsistentProvider())
    ctx = qa_context()
    evidence = qa_evidence(ctx)
    resume = generate_grounded_resume(
        absolute_version=4,
        cycle_step=4,
        evidence=evidence,
        job_description="Platform engineer " + ("x" * 20),
    )
    response = client.post(
        "/v1/resumes/final-qa",
        headers=AUTH_HEADERS,
        json={
            "context": ctx.model_dump(),
            "resume": resume.model_dump(),
            "evidence": [item.model_dump() for item in evidence],
        },
    )
    assert response.status_code == 200
    assert response.json()["passed"] is False


@pytest.mark.parametrize(
    "code",
    [
        FinalQaCheckCode.PRIMARY_TECHNOLOGY_EMPHASIS,
        FinalQaCheckCode.HAS_SUMMARY,
        FinalQaCheckCode.HAS_SKILLS,
        FinalQaCheckCode.DUPLICATE_BULLETS,
        FinalQaCheckCode.ATS_FORMAT,
        FinalQaCheckCode.LENGTH_REDUCE,
        FinalQaCheckCode.UNSUPPORTED_CLAIM,
        FinalQaCheckCode.TECHNOLOGY_CLAIMS,
    ],
)
def test_supported_repair_code_has_transform_and_exact_postcondition(code: FinalQaCheckCode) -> None:
    ctx = qa_context()
    evidence = qa_evidence(ctx)
    resume = generate_grounded_resume(
        absolute_version=4,
        cycle_step=4,
        evidence=evidence,
        job_description="Platform engineer " + ("x" * 20),
    )
    sections = list(resume.sections)
    if code == FinalQaCheckCode.HAS_SUMMARY:
        sections = [s for s in sections if s.type != "summary"]
    elif code == FinalQaCheckCode.HAS_SKILLS:
        sections = [s for s in sections if s.type != "skills"]
    else:
        target = next(s for s in sections if s.bullets)
        bullets = list(target.bullets or [])
        if code == FinalQaCheckCode.PRIMARY_TECHNOLOGY_EMPHASIS:
            bullets[0] = bullets[0].model_copy(
                update={"text": "Experienced platform engineer", "technologies": []}
            )
        elif code == FinalQaCheckCode.DUPLICATE_BULLETS:
            bullets.append(bullets[0])
        elif code == FinalQaCheckCode.ATS_FORMAT:
            bullets[0] = bullets[0].model_copy(update={"text": bullets[0].text + "\t| table"})
        elif code == FinalQaCheckCode.LENGTH_REDUCE:
            bullets[0] = bullets[0].model_copy(update={"text": ("supported platform delivery " * 180)[:3900]})
        else:
            bullets[0] = bullets[0].model_copy(
                update={"evidence_ids": ["missing"], "technologies": ["Terraform"]}
            )
        sections[sections.index(target)] = target.model_copy(update={"bullets": bullets})
    broken = resume.model_copy(update={"sections": sections})
    check = FinalQaFailedCheck(
        code=code,
        label=code.value,
        status="fail",
        blocking=True,
        detail="test",
    )
    directive = FinalQaRepairDirective(
        source_version=4,
        failed_checks=[check],
        approved_evidence_ids=[evidence[0].id],
        grounded_targets=["Python"],
    )
    repaired = apply_final_qa_repair(broken, directive, evidence)
    fixed, results = verify_repair_fixed_checks(
        repaired, evidence, [check], grounded_targets=["Python"]
    )
    assert fixed, results
    assert results[0]["status"] == "pass"


def test_repair_noop_is_rejected() -> None:
    ctx = qa_context()
    evidence = qa_evidence(ctx)
    resume = generate_grounded_resume(
        absolute_version=4,
        cycle_step=4,
        evidence=evidence,
        job_description="Platform engineer " + ("x" * 20),
    )
    repair = FinalQaRepairDirective(
        source_version=4,
        failed_checks=[FinalQaFailedCheck(
            code=FinalQaCheckCode.HAS_SUMMARY,
            label="Has summary",
            status="fail",
            blocking=True,
        )],
        approved_evidence_ids=[evidence[0].id],
    )
    with pytest.raises(ValueError, match="REFINEMENT_NOT_APPLICABLE"):
        generate_grounded_resume(
            absolute_version=5,
            cycle_step=0,
            evidence=evidence,
            previous_resume=resume,
            job_description="Platform engineer " + ("x" * 20),
            final_qa_repair=repair,
        )


def test_nonblocking_warning_does_not_require_repair() -> None:
    ctx = qa_context()
    evidence = qa_evidence(ctx)
    resume = generate_grounded_resume(
        absolute_version=4,
        cycle_step=4,
        evidence=evidence,
        job_description="Platform engineer " + ("x" * 20),
    )
    warning = FinalQaFailedCheck(
        code=FinalQaCheckCode.PAGE_LENGTH,
        label="Page estimate",
        status="warn",
        blocking=False,
    )
    fixed, results = verify_repair_fixed_checks(resume, evidence, [warning])
    assert fixed
    assert results == []
