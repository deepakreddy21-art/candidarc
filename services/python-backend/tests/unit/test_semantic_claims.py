"""Semantic claim-to-evidence matching tests."""

from __future__ import annotations

from app.domain.schemas import EvidenceItem, ResumeBullet, ResumeDocument, ResumeSection, ScoreBreakdown
from app.modules.guardrails.service import validate_resume_claims


def _evidence(claim: str, metrics: list[str]) -> EvidenceItem:
    return EvidenceItem(
        id="ev-semantic",
        tenant_id="ten-semantic",
        owner_user_id="user-semantic",
        title="Engineer at Acme Labs",
        organization="Acme Labs",
        claim_text=claim,
        metrics=metrics,
        technologies=["Python"],
        source_type="employment",
        verification_status="user_attested",
        candidate_confirmation_status="confirmed",
        confidence="high",
    )


def _resume(text: str) -> ResumeDocument:
    breakdown = ScoreBreakdown(
        atsCompatibility=50,
        jobAlignment=50,
        recruiterReadability=50,
        impact=50,
        quantification=50,
        technicalDepth=50,
        competencyCoverage=50,
        evidenceConfidence=50,
        writingQuality=50,
        formatIntegrity=50,
    )
    return ResumeDocument(
        absolute_version=0,
        cycle_step=0,
        version_number=0,
        score=50,
        score_breakdown=breakdown,
        notes="semantic test",
        sections=[
            ResumeSection(
                type="experience",
                title="Experience",
                order=0,
                bullets=[
                    ResumeBullet(
                        text=text,
                        evidence_ids=["ev-semantic"],
                        technologies=["Python"],
                    )
                ],
            )
        ],
    )


def test_same_number_different_meaning_is_rejected() -> None:
    evidence = [_evidence("Supported 75 users at Acme Labs using Python", ["75 users"])]
    violations = validate_resume_claims(_resume("Delivered 75 projects at Acme Labs using Python"), evidence)
    assert "UNSUPPORTED_METRIC_MEANING" in violations


def test_same_percent_different_metric_meaning_is_rejected() -> None:
    evidence = [_evidence("Reduced search latency by 35% at Acme Labs using Python", ["35% latency reduction"])]
    violations = validate_resume_claims(_resume("Increased revenue by 35% at Acme Labs using Python"), evidence)
    assert "UNSUPPORTED_METRIC_MEANING" in violations


def test_supported_metric_paraphrase_is_accepted() -> None:
    evidence = [_evidence("Reduced search latency by 35% at Acme Labs using Python", ["35% latency reduction"])]
    violations = validate_resume_claims(_resume("Cut latency 35% at Acme Labs using Python"), evidence)
    assert "UNSUPPORTED_METRIC_MEANING" not in violations
    assert "UNSUPPORTED_METRIC_UNIT" not in violations
