"""Grounded resume generation — JD-aware, finding-aware, score-calculated."""

from __future__ import annotations

from app.domain.schemas import (
    AuditFinding,
    EvidenceItem,
    MistakeMemoryRule,
    ResearchFinding,
    ResumeBullet,
    ResumeDocument,
    UserConfirmation,
)
from app.modules.evidence.service import normalize_evidence
from app.modules.guardrails.service import build_grounded_resume, validate_resume_claims
from app.modules.scoring.service import score_resume


def _apply_finding_text(text: str, finding: AuditFinding) -> str:
    replacement = finding.edited_text or finding.suggested_text
    if finding.before_text and finding.before_text in text:
        return text.replace(finding.before_text, replacement, 1)
    return replacement


def _iter_bullets(resume: ResumeDocument) -> list[ResumeBullet]:
    bullets: list[ResumeBullet] = []
    for section in resume.sections:
        bullets.extend(section.bullets or [])
        for item in section.items or []:
            bullets.extend(item.bullets)
    return bullets


def apply_accepted_findings(
    previous: ResumeDocument,
    accepted: list[AuditFinding],
    *,
    mistake_memory: list[MistakeMemoryRule] | None = None,
) -> ResumeDocument:
    """Apply accepted/edited findings onto previous resume; skip rejected/mistake-memory conflicts."""
    banned_phrases = [rule.rule.lower() for rule in (mistake_memory or [])]
    actionable = [
        f
        for f in accepted
        if (f.status in {None, "accepted", "edited", "open"})
        and not any(banned in (f.edited_text or f.suggested_text).lower() for banned in banned_phrases)
    ]
    if not actionable:
        return previous

    sections = []
    for section in previous.sections:
        new_bullets = None
        if section.bullets is not None:
            new_bullets = []
            for bullet in section.bullets:
                text = bullet.text
                for finding in actionable:
                    if finding.section == section.type or finding.before_text in text:
                        text = _apply_finding_text(text, finding)
                # Respect mistake memory: do not reintroduce banned phrases
                if any(banned in text.lower() for banned in banned_phrases):
                    text = bullet.text
                new_bullets.append(bullet.model_copy(update={"text": text[:3900]}))
        new_items = None
        if section.items is not None:
            new_items = []
            for item in section.items:
                item_bullets = []
                for bullet in item.bullets:
                    text = bullet.text
                    for finding in actionable:
                        if finding.section == section.type or finding.before_text in text:
                            text = _apply_finding_text(text, finding)
                    if any(banned in text.lower() for banned in banned_phrases):
                        text = bullet.text
                    item_bullets.append(bullet.model_copy(update={"text": text[:3900]}))
                new_items.append(item.model_copy(update={"bullets": item_bullets}))
        content = section.content
        if content:
            for finding in actionable:
                if finding.section == section.type or finding.before_text in content:
                    content = _apply_finding_text(content, finding)
            if any(banned in content.lower() for banned in banned_phrases):
                content = section.content
        sections.append(section.model_copy(update={"bullets": new_bullets, "items": new_items, "content": content}))

    return previous.model_copy(update={"sections": sections})


def generate_grounded_resume(
    *,
    absolute_version: int,
    cycle_step: int,
    evidence: list[EvidenceItem],
    allowed_technologies: list[str] | None = None,
    notes: str | None = None,
    job_description: str = "",
    job_requirements: list[str] | None = None,
    previous_resume: ResumeDocument | None = None,
    accepted_findings: list[AuditFinding] | None = None,
    rejected_findings: list[AuditFinding] | None = None,
    mistake_memory: list[MistakeMemoryRule] | None = None,
    research_findings: list[ResearchFinding] | None = None,
    user_confirmations: list[UserConfirmation] | None = None,
) -> ResumeDocument:
    """Generate or regenerate a resume.

    - Rejected findings are ignored.
    - Accepted/edited findings are applied onto previous_resume when present.
    - If no actionable findings on regenerate, content is kept and score recalculated.
    - Scores are always calculated from content (never SCORE_BY_VERSION).
    - Job/research never become first-person claims; bare confirmations never become experience.
    """
    _ = rejected_findings  # explicitly ignored
    normalized = normalize_evidence(evidence)
    actionable = [f for f in (accepted_findings or []) if f.status in {None, "accepted", "edited", "open"}]

    if previous_resume is not None:
        if actionable:
            updated = apply_accepted_findings(previous_resume, actionable, mistake_memory=mistake_memory)
        else:
            updated = previous_resume
        scored = score_resume(
            sections=updated.sections,
            evidence=normalized,
            job_description=job_description,
            job_requirements=job_requirements,
            notes=notes or updated.notes,
        )
        return updated.model_copy(
            update={
                "absolute_version": absolute_version,
                "cycle_step": cycle_step,
                "version_number": absolute_version,
                "score": scored.score,
                "score_breakdown": scored.breakdown,
                "score_rubric_version": scored.rubric_version,
                "score_explanations": scored.explanations,
                "notes": notes or updated.notes,
            }
        )

    return build_grounded_resume(
        absolute_version=absolute_version,
        cycle_step=cycle_step,
        evidence=normalized,
        allowed_technologies=allowed_technologies,
        notes=notes or f"Grounded resume V{absolute_version}",
        job_description=job_description,
        job_requirements=job_requirements,
        research_findings=research_findings,
        user_confirmations=user_confirmations,
    )


def generate_and_validate(
    *,
    absolute_version: int,
    cycle_step: int,
    evidence: list[EvidenceItem],
    allowed_technologies: list[str] | None = None,
    notes: str | None = None,
    job_description: str = "",
    job_requirements: list[str] | None = None,
    previous_resume: ResumeDocument | None = None,
    accepted_findings: list[AuditFinding] | None = None,
    rejected_findings: list[AuditFinding] | None = None,
    mistake_memory: list[MistakeMemoryRule] | None = None,
    research_findings: list[ResearchFinding] | None = None,
    user_confirmations: list[UserConfirmation] | None = None,
    tenant_id: str | None = None,
    owner_user_id: str | None = None,
) -> tuple[ResumeDocument, list[str]]:
    resume = generate_grounded_resume(
        absolute_version=absolute_version,
        cycle_step=cycle_step,
        evidence=evidence,
        allowed_technologies=allowed_technologies,
        notes=notes,
        job_description=job_description,
        job_requirements=job_requirements,
        previous_resume=previous_resume,
        accepted_findings=accepted_findings,
        rejected_findings=rejected_findings,
        mistake_memory=mistake_memory,
        research_findings=research_findings,
        user_confirmations=user_confirmations,
    )
    violations = validate_resume_claims(
        resume,
        evidence,
        allowed_technologies,
        tenant_id=tenant_id,
        owner_user_id=owner_user_id,
        job_description=job_description,
        research_findings=research_findings,
        user_confirmations=user_confirmations,
    )
    return resume, violations
