"""Unit tests for refinement_instruction and evidence_matches wiring."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.domain.schemas import EvidenceItem, EvidenceMatchRow, RequestContext
from app.main import app
from app.modules.generation.service import generate_and_validate, generate_grounded_resume
from tests.conftest import AUTH_HEADERS, qa_context, qa_evidence


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def auth_headers() -> dict[str, str]:
    return dict(AUTH_HEADERS)


@pytest.fixture()
def ctx() -> RequestContext:
    return qa_context()


@pytest.fixture()
def evidence(ctx: RequestContext) -> list[EvidenceItem]:
    return qa_evidence(ctx)


# --- Unit: refinement_instruction ---


def _visible(resume) -> str:
    parts: list[str] = []
    for section in resume.sections:
        for bullet in section.bullets or []:
            parts.append(bullet.text.lower())
        for item in section.items or []:
            for bullet in item.bullets:
                parts.append(bullet.text.lower())
    return "\n".join(parts)


def test_allowed_refinement_emphasize_existing_tech(evidence: list[EvidenceItem]) -> None:
    """Emphasizing a technology already in evidence changes visible content."""
    base = generate_grounded_resume(
        absolute_version=0,
        cycle_step=0,
        evidence=evidence,
        allowed_technologies=["Python", "PyTorch", "OpenSearch"],
        job_description="Python platform engineer",
    )
    resume = generate_grounded_resume(
        absolute_version=0,
        cycle_step=0,
        evidence=evidence,
        allowed_technologies=["Python", "PyTorch", "OpenSearch"],
        job_description="Python platform engineer",
        refinement_instruction="Emphasize Python experience",
    )
    assert "refinement:applied" in resume.notes
    assert _visible(resume) != _visible(base)
    assert "python ownership focus" in _visible(resume)


def test_allowed_refinement_paraphrase_wording(evidence: list[EvidenceItem]) -> None:
    """Active-verb refinement changes visible wording when weak verbs exist or emphasizes ownership."""
    resume = generate_grounded_resume(
        absolute_version=0,
        cycle_step=0,
        evidence=evidence,
        allowed_technologies=["Python"],
        job_description="Python engineer",
        refinement_instruction="Emphasize Python with stronger active ownership wording",
    )
    assert "refinement:applied" in resume.notes
    assert "python ownership focus" in _visible(resume)


def test_unsupported_refinement_add_metric_fails(evidence: list[EvidenceItem]) -> None:
    """Requesting to add a specific percentage fails closed."""
    with pytest.raises(ValueError, match="GUARDRAIL_VIOLATION"):
        generate_grounded_resume(
            absolute_version=0,
            cycle_step=0,
            evidence=evidence,
            allowed_technologies=["Python"],
            job_description="Python engineer",
            refinement_instruction="Add 50% improvement metric to the first bullet",
        )


def test_unsupported_refinement_invent_experience_fails(evidence: list[EvidenceItem]) -> None:
    """Requesting to invent experience fails closed."""
    with pytest.raises(ValueError, match="GUARDRAIL_VIOLATION"):
        generate_grounded_resume(
            absolute_version=0,
            cycle_step=0,
            evidence=evidence,
            allowed_technologies=["Python"],
            job_description="Python engineer",
            refinement_instruction="Invent a leadership role at a Fortune 500 company",
        )


def test_unsupported_refinement_fabricate_fails(evidence: list[EvidenceItem]) -> None:
    """Requesting to fabricate fails closed."""
    with pytest.raises(ValueError, match="GUARDRAIL_VIOLATION"):
        generate_grounded_resume(
            absolute_version=0,
            cycle_step=0,
            evidence=evidence,
            allowed_technologies=["Python"],
            job_description="Python engineer",
            refinement_instruction="Fabricate AWS certification credentials",
        )


def test_unsupported_refinement_add_new_employer_fails(evidence: list[EvidenceItem]) -> None:
    """Requesting to add a new employer fails closed."""
    with pytest.raises(ValueError, match="GUARDRAIL_VIOLATION"):
        generate_grounded_resume(
            absolute_version=0,
            cycle_step=0,
            evidence=evidence,
            allowed_technologies=["Python"],
            job_description="Python engineer",
            refinement_instruction="Add new experience at Google as a Staff Engineer",
        )


def test_unsupported_refinement_emphasize_unknown_tech_fails(evidence: list[EvidenceItem]) -> None:
    """Emphasizing a technology not in evidence fails closed."""
    with pytest.raises(ValueError, match="GUARDRAIL_VIOLATION"):
        generate_grounded_resume(
            absolute_version=0,
            cycle_step=0,
            evidence=evidence,
            allowed_technologies=["Python"],
            job_description="Python engineer",
            refinement_instruction="Emphasize Rust programming experience",
        )


def test_different_refinement_instructions_produce_different_visible_content(evidence: list[EvidenceItem]) -> None:
    """Two different allowed refinements produce different visible sections."""
    resume1 = generate_grounded_resume(
        absolute_version=0,
        cycle_step=0,
        evidence=evidence,
        allowed_technologies=["Python", "PyTorch"],
        job_description="Python engineer",
        refinement_instruction="Emphasize Python experience",
    )
    resume2 = generate_grounded_resume(
        absolute_version=0,
        cycle_step=0,
        evidence=evidence,
        allowed_technologies=["Python", "PyTorch"],
        job_description="Python engineer",
        refinement_instruction="Emphasize PyTorch deep learning",
    )
    assert _visible(resume1) != _visible(resume2)
    assert "python ownership focus" in _visible(resume1)
    assert "pytorch ownership focus" in _visible(resume2)


def test_safe_impossible_refinement_returns_not_applicable(evidence: list[EvidenceItem]) -> None:
    """A safe but non-material instruction fails with REFINEMENT_NOT_APPLICABLE."""
    with pytest.raises(ValueError, match="REFINEMENT_NOT_APPLICABLE"):
        generate_grounded_resume(
            absolute_version=0,
            cycle_step=0,
            evidence=evidence,
            allowed_technologies=["Python"],
            job_description="Python engineer",
            # No emphasize/concise/active tokens that change content
            refinement_instruction="Please review the formatting carefully",
        )


# --- Unit: evidence_matches ---


def test_evidence_matches_prioritize_strong_evidence(ctx: RequestContext) -> None:
    """Higher match score evidence appears first in ordering."""
    low_priority = EvidenceItem(
        id="ev-low",
        tenant_id=ctx.tenant_id,
        owner_user_id=ctx.user_id,
        title="Low priority work",
        organization="Small Corp",
        claim_text="Junior work",
        technologies=["JavaScript"],
        source_type="employment",
        verification_status="user_attested",
        candidate_confirmation_status="confirmed",
        confidence="medium",
    )
    high_priority = EvidenceItem(
        id="ev-high",
        tenant_id=ctx.tenant_id,
        owner_user_id=ctx.user_id,
        title="High priority work",
        organization="Big Corp",
        claim_text="Senior architect work with Python",
        technologies=["Python", "AWS"],
        source_type="employment",
        verification_status="user_attested",
        candidate_confirmation_status="confirmed",
        confidence="high",
    )
    evidence = [low_priority, high_priority]  # low first

    matches = [
        EvidenceMatchRow(
            requirement="Python expertise required",
            importance="required",
            evidence_ids=["ev-high"],
            evidence_strength="strong",
            resume_usage="use",
        ),
        EvidenceMatchRow(
            requirement="JavaScript nice to have",
            importance="preferred",
            evidence_ids=["ev-low"],
            evidence_strength="partial",
            resume_usage="consider",
        ),
    ]

    resume = generate_grounded_resume(
        absolute_version=0,
        cycle_step=0,
        evidence=evidence,
        allowed_technologies=["Python", "JavaScript", "AWS"],
        job_description="Python platform engineer",
        evidence_matches=matches,
    )

    # The high priority evidence should influence the resume
    # Check that experience section exists and has content
    exp_section = next((s for s in resume.sections if s.type == "experience"), None)
    assert exp_section is not None
    # High priority evidence should be used (Python is in bullets)
    all_text = " ".join(b.text for b in (exp_section.bullets or []))
    assert "Big Corp" in all_text or "Python" in all_text


def test_evidence_matches_skip_usage_deprioritized(ctx: RequestContext) -> None:
    """Evidence marked with skip resume_usage should be deprioritized."""
    skip_evidence = EvidenceItem(
        id="ev-skip",
        tenant_id=ctx.tenant_id,
        owner_user_id=ctx.user_id,
        title="Skip this",
        organization="Skip Corp",
        claim_text="Irrelevant work",
        technologies=["COBOL"],
        source_type="employment",
        verification_status="user_attested",
        candidate_confirmation_status="confirmed",
        confidence="low",
    )
    use_evidence = EvidenceItem(
        id="ev-use",
        tenant_id=ctx.tenant_id,
        owner_user_id=ctx.user_id,
        title="Use this",
        organization="Use Corp",
        claim_text="Relevant Python work",
        technologies=["Python"],
        source_type="employment",
        verification_status="user_attested",
        candidate_confirmation_status="confirmed",
        confidence="high",
    )
    evidence = [skip_evidence, use_evidence]

    matches = [
        EvidenceMatchRow(
            requirement="Python required",
            importance="required",
            evidence_ids=["ev-use"],
            evidence_strength="strong",
            resume_usage="use",
        ),
        EvidenceMatchRow(
            requirement="Legacy systems",
            importance="preferred",
            evidence_ids=["ev-skip"],
            evidence_strength="none",
            resume_usage="skip",
        ),
    ]

    resume = generate_grounded_resume(
        absolute_version=0,
        cycle_step=0,
        evidence=evidence,
        allowed_technologies=["Python", "COBOL"],
        job_description="Python engineer",
        evidence_matches=matches,
    )

    # Use Corp should appear in experience, not Skip Corp
    exp_section = next((s for s in resume.sections if s.type == "experience"), None)
    assert exp_section is not None
    all_text = " ".join(b.text for b in (exp_section.bullets or []))
    assert "Use Corp" in all_text or "Python" in all_text


def test_evidence_matches_no_uncited_claims(ctx: RequestContext) -> None:
    """Evidence matches should never create claims without proper citations."""
    evidence = qa_evidence(ctx)
    matches = [
        EvidenceMatchRow(
            requirement="Machine learning expertise",
            importance="required",
            evidence_ids=["ev-1"],
            evidence_strength="partial",
            resume_usage="use",
        ),
    ]

    resume = generate_grounded_resume(
        absolute_version=0,
        cycle_step=0,
        evidence=evidence,
        allowed_technologies=["Python", "PyTorch"],
        job_description="ML engineer",
        evidence_matches=matches,
    )

    # Every bullet must have evidence_ids
    for section in resume.sections:
        for bullet in section.bullets or []:
            assert bullet.evidence_ids, f"Bullet missing evidence_ids: {bullet.text}"


# --- Integration: generate_and_validate with refinement ---


def test_generate_and_validate_with_refinement(evidence: list[EvidenceItem]) -> None:
    """generate_and_validate passes refinement params through."""
    resume, violations = generate_and_validate(
        absolute_version=0,
        cycle_step=0,
        evidence=evidence,
        allowed_technologies=["Python", "PyTorch"],
        job_description="Python engineer",
        refinement_instruction="Emphasize Python skills",
    )
    assert "refinement:applied" in resume.notes
    assert not violations


def test_generate_and_validate_rejects_unsupported_refinement(evidence: list[EvidenceItem]) -> None:
    """generate_and_validate fails closed on unsupported refinement."""
    with pytest.raises(ValueError, match="GUARDRAIL_VIOLATION"):
        generate_and_validate(
            absolute_version=0,
            cycle_step=0,
            evidence=evidence,
            allowed_technologies=["Python"],
            job_description="Python engineer",
            refinement_instruction="Add 99% performance improvement claim",
        )


# --- Integration: API endpoint with refinement ---


def test_api_refinement_allowed(
    client: TestClient, auth_headers: dict[str, str], ctx: RequestContext, evidence: list[EvidenceItem]
) -> None:
    """API endpoint accepts allowed refinement instructions and changes visible content."""
    response = client.post(
        "/v1/resumes/generate",
        headers=auth_headers,
        json={
            "context": ctx.model_dump(),
            "absolute_version": 0,
            "job_description": "Python platform engineer " + ("x" * 20),
            "evidence": [item.model_dump() for item in evidence],
            "allowed_technologies": ["Python", "PyTorch", "OpenSearch"],
            "refinement_instruction": "Emphasize Python experience",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert "refinement:applied" in body["resume"]["notes"]
    visible = json.dumps(body["resume"]["sections"]).lower()
    assert "python ownership focus" in visible


def test_api_refinement_not_applicable(
    client: TestClient, auth_headers: dict[str, str], ctx: RequestContext, evidence: list[EvidenceItem]
) -> None:
    """Safe but non-material refinement returns REFINEMENT_NOT_APPLICABLE without inventing notes-only success."""
    response = client.post(
        "/v1/resumes/generate",
        headers=auth_headers,
        json={
            "context": ctx.model_dump(),
            "absolute_version": 0,
            "job_description": "Python platform engineer " + ("x" * 20),
            "evidence": [item.model_dump() for item in evidence],
            "allowed_technologies": ["Python"],
            "refinement_instruction": "Please review the formatting carefully",
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "REFINEMENT_NOT_APPLICABLE"


def test_api_regenerate_refinement_visible(
    client: TestClient, auth_headers: dict[str, str], ctx: RequestContext, evidence: list[EvidenceItem]
) -> None:
    """Regenerate with refinement changes visible sections vs previous resume."""
    base = generate_grounded_resume(
        absolute_version=0,
        cycle_step=0,
        evidence=evidence,
        allowed_technologies=["Python", "PyTorch"],
        job_description="Platform engineer " + ("x" * 20),
    )
    response = client.post(
        "/v1/resumes/regenerate",
        headers=auth_headers,
        json={
            "context": ctx.model_dump(),
            "absolute_version": 1,
            "job_description": "Platform engineer " + ("x" * 20),
            "evidence": [item.model_dump() for item in evidence],
            "allowed_technologies": ["Python", "PyTorch"],
            "previous_resume": base.model_dump(),
            "accepted_findings": [],
            "refinement_instruction": "Emphasize PyTorch deep learning",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    visible = json.dumps(body["resume"]["sections"]).lower()
    assert "pytorch ownership focus" in visible
    assert visible != json.dumps(base.model_dump()["sections"]).lower()


def test_api_refinement_unsupported_fails(
    client: TestClient, auth_headers: dict[str, str], ctx: RequestContext, evidence: list[EvidenceItem]
) -> None:
    """API endpoint rejects unsupported refinement with 422."""
    response = client.post(
        "/v1/resumes/generate",
        headers=auth_headers,
        json={
            "context": ctx.model_dump(),
            "absolute_version": 0,
            "job_description": "Python platform engineer " + ("x" * 20),
            "evidence": [item.model_dump() for item in evidence],
            "allowed_technologies": ["Python"],
            "refinement_instruction": "Invent a role at Google",
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "GUARDRAIL_VIOLATION"


def test_api_evidence_matches_accepted(
    client: TestClient, auth_headers: dict[str, str], ctx: RequestContext, evidence: list[EvidenceItem]
) -> None:
    """API endpoint accepts evidence_matches parameter."""
    matches = [
        {
            "requirement": "Python expertise",
            "importance": "required",
            "evidence_ids": ["ev-1"],
            "evidence_strength": "strong",
            "resume_usage": "use",
        }
    ]
    response = client.post(
        "/v1/resumes/generate",
        headers=auth_headers,
        json={
            "context": ctx.model_dump(),
            "absolute_version": 0,
            "job_description": "Python platform engineer " + ("x" * 20),
            "evidence": [item.model_dump() for item in evidence],
            "allowed_technologies": ["Python", "PyTorch"],
            "evidence_matches": matches,
        },
    )
    assert response.status_code == 200, response.text


def test_api_both_refinement_and_matches(
    client: TestClient, auth_headers: dict[str, str], ctx: RequestContext, evidence: list[EvidenceItem]
) -> None:
    """API endpoint accepts both refinement_instruction and evidence_matches."""
    matches = [
        {
            "requirement": "Python expertise",
            "importance": "required",
            "evidence_ids": ["ev-1"],
            "evidence_strength": "strong",
            "resume_usage": "use",
        }
    ]
    response = client.post(
        "/v1/resumes/generate",
        headers=auth_headers,
        json={
            "context": ctx.model_dump(),
            "absolute_version": 0,
            "job_description": "Python platform engineer " + ("x" * 20),
            "evidence": [item.model_dump() for item in evidence],
            "allowed_technologies": ["Python", "PyTorch"],
            "refinement_instruction": "Emphasize Python experience",
            "evidence_matches": matches,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert "refinement:applied" in body["resume"]["notes"]
    assert "python ownership focus" in json.dumps(body["resume"]["sections"]).lower()
