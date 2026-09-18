"""Adversarial evidence-policy matrix enforced in Python guardrails / Final-QA path."""

from __future__ import annotations

import pytest

from app.domain.schemas import EvidenceItem, ResumeBullet, ResumeItem, ResumeSection
from app.modules.guardrails.service import build_grounded_resume, validate_resume_claims
from tests.conftest import qa_context, qa_evidence


@pytest.fixture()
def evidence() -> list[EvidenceItem]:
    return qa_evidence(qa_context())


def test_same_number_different_meaning(evidence: list[EvidenceItem]) -> None:
    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=evidence, notes="matrix")
    # Evidence metric is "latency improved 35%" — "350" must not pass via substring.
    resume.sections[2].bullets[0].text = "Scaled to 350 users at Northwind Labs with Python"  # type: ignore[index]
    violations = validate_resume_claims(resume, evidence, ["Python", "PyTorch", "OpenSearch"])
    assert "UNSUPPORTED_NUMBER" in violations


def test_technology_only_in_job_description(evidence: list[EvidenceItem]) -> None:
    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=evidence, notes="matrix")
    resume.sections[1].bullets[0].technologies.append("Rust")  # type: ignore[index]
    resume.sections[1].bullets[0].text = "Shipped production services with Rust"  # type: ignore[index]
    violations = validate_resume_claims(
        resume,
        evidence,
        ["Rust", "Python"],
        job_description="Must know Rust and Python.",
    )
    assert "UNSUPPORTED_TECHNOLOGY" in violations


def test_public_technology_without_candidate_evidence(evidence: list[EvidenceItem]) -> None:
    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=evidence, notes="matrix")
    resume.sections[1].bullets[0].technologies.append("OpenTelemetry")  # type: ignore[index]
    violations = validate_resume_claims(resume, evidence, ["OpenTelemetry"])
    assert "UNSUPPORTED_TECHNOLOGY" in violations


def test_proprietary_internal_technology(evidence: list[EvidenceItem]) -> None:
    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=evidence, notes="matrix")
    resume.sections[1].bullets[0].technologies.append("AcmeInternalMesh")  # type: ignore[index]
    resume.sections[1].bullets[0].text = "Owned AcmeInternalMesh in production"  # type: ignore[index]
    violations = validate_resume_claims(resume, evidence, ["AcmeInternalMesh"])
    assert "UNSUPPORTED_TECHNOLOGY" in violations


def test_wrong_employer(evidence: list[EvidenceItem]) -> None:
    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=evidence, notes="matrix")
    for section in resume.sections:
        if section.type == "experience":
            section.items = [
                ResumeItem(
                    heading="Software Engineer",
                    subheading="Phantom Corp",
                    dates="January 2024 – Present",
                    bullets=[
                        ResumeBullet(
                            text="Built Python services at Phantom Corp.",
                            evidence_ids=["ev-1"],
                            technologies=["Python"],
                        )
                    ],
                )
            ]
    violations = validate_resume_claims(resume, evidence, ["Python"])
    assert "UNSUPPORTED_COMPANY" in violations


def test_wrong_date(evidence: list[EvidenceItem]) -> None:
    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=evidence, notes="matrix")
    for section in resume.sections:
        if section.type == "experience":
            section.items = [
                ResumeItem(
                    heading="Software Engineer",
                    subheading="Northwind Labs",
                    dates="January 2010 – December 2012",
                    bullets=[
                        ResumeBullet(
                            text="Software Engineer at Northwind Labs with Python.",
                            evidence_ids=["ev-1"],
                            technologies=["Python"],
                        )
                    ],
                )
            ]
            section.bullets = None
    violations = validate_resume_claims(resume, evidence, ["Python"])
    assert "UNSUPPORTED_DATE" in violations


def test_wrong_title(evidence: list[EvidenceItem]) -> None:
    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=evidence, notes="matrix")
    for section in resume.sections:
        if section.type == "experience":
            section.items = [
                ResumeItem(
                    heading="Chief Astronaut",
                    subheading="Northwind Labs",
                    dates="January 2024 – Present",
                    bullets=[
                        ResumeBullet(
                            text="Software Engineer at Northwind Labs with Python.",
                            evidence_ids=["ev-1"],
                            technologies=["Python"],
                        )
                    ],
                )
            ]
            section.bullets = None
    violations = validate_resume_claims(resume, evidence, ["Python"])
    # Guardrails map ungrounded experience headings to UNSUPPORTED_COMPANY and
    # ungrounded subheadings to UNSUPPORTED_TITLE — either proves title grounding.
    assert "UNSUPPORTED_TITLE" in violations or "UNSUPPORTED_COMPANY" in violations


def test_unsupported_ownership(evidence: list[EvidenceItem]) -> None:
    team_evidence = [
        evidence[0].model_copy(
            update={"claim_text": "Our team built the platform together", "result": "we built APIs"}
        )
    ]
    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=team_evidence, notes="matrix")
    resume.sections[0].bullets[0].text = "I built the entire platform single-handedly"  # type: ignore[index]
    resume.sections[0].bullets[0].evidence_ids = ["ev-1"]  # type: ignore[index]
    violations = validate_resume_claims(resume, team_evidence, ["Python"])
    assert "TEAM_TO_INDIVIDUAL_OWNERSHIP" in violations


def test_unsupported_certification_or_education(evidence: list[EvidenceItem]) -> None:
    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=evidence, notes="matrix")
    resume.sections.append(
        ResumeSection(
            type="education",
            title="Education",
            order=10,
            items=[ResumeItem(heading="Phantom University", subheading="PhD", dates="2099", bullets=[])],
        )
    )
    resume.sections.append(
        ResumeSection(
            type="certifications",
            title="Certifications",
            order=11,
            items=[ResumeItem(heading="Made-Up Cloud Badge", bullets=[])],
        )
    )
    violations = validate_resume_claims(resume, evidence, ["Python"])
    assert "UNSUPPORTED_EDUCATION" in violations
    assert "UNSUPPORTED_CERTIFICATION" in violations


def test_valid_candidate_attestation(evidence: list[EvidenceItem]) -> None:
    """User-attested evidence technologies remain allowable candidate claims."""
    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=evidence, notes="matrix")
    violations = validate_resume_claims(resume, evidence, ["Python", "PyTorch", "OpenSearch"])
    assert "UNSUPPORTED_TECHNOLOGY" not in violations
    assert "UNSUPPORTED_COMPANY" not in violations


def test_valid_paraphrase_of_supported_evidence(evidence: list[EvidenceItem]) -> None:
    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=evidence, notes="matrix")
    resume.sections[2].bullets[0].text = (  # type: ignore[index]
        "Improved service latency by 35% while working as a Software Engineer at Northwind Labs with Python."
    )
    resume.sections[2].bullets[0].evidence_ids = ["ev-1"]  # type: ignore[index]
    resume.sections[2].bullets[0].technologies = ["Python"]  # type: ignore[index]
    violations = validate_resume_claims(resume, evidence, ["Python", "PyTorch", "OpenSearch"])
    assert not any(v.startswith("UNSUPPORTED_") for v in violations)
