"""Grounded resume generation wrappers."""

from __future__ import annotations

from app.domain.schemas import EvidenceItem, ResumeDocument
from app.modules.evidence.service import normalize_evidence
from app.modules.guardrails.service import build_grounded_resume, validate_resume_claims

SCORE_BY_VERSION = {0: 68.0, 1: 76.0, 2: 83.0, 3: 88.0, 4: 92.0}


def generate_grounded_resume(
    *,
    version_number: int,
    evidence: list[EvidenceItem],
    allowed_technologies: list[str] | None = None,
    notes: str | None = None,
    score: float | None = None,
) -> ResumeDocument:
    normalized = normalize_evidence(evidence)
    resume = build_grounded_resume(
        version_number=version_number,
        evidence=normalized,
        allowed_technologies=allowed_technologies,
        notes=notes or f"Grounded resume V{version_number}",
        score=score if score is not None else SCORE_BY_VERSION.get(version_number, 70.0),
    )
    return resume


def generate_and_validate(
    *,
    version_number: int,
    evidence: list[EvidenceItem],
    allowed_technologies: list[str] | None = None,
    notes: str | None = None,
) -> tuple[ResumeDocument, list[str]]:
    resume = generate_grounded_resume(
        version_number=version_number,
        evidence=evidence,
        allowed_technologies=allowed_technologies,
        notes=notes,
    )
    violations = validate_resume_claims(resume, evidence, allowed_technologies)
    return resume, violations
