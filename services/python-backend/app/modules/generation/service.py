"""Grounded resume generation — JD-aware, finding-aware, score-calculated."""

from __future__ import annotations

import re

from app.domain.schemas import (
    AuditFinding,
    EvidenceItem,
    EvidenceMatchRow,
    MistakeMemoryRule,
    ResearchFinding,
    ResumeBullet,
    ResumeDocument,
    UserConfirmation,
)
from app.modules.evidence.service import normalize_evidence
from app.modules.guardrails.service import build_grounded_resume, validate_resume_claims
from app.modules.scoring.service import score_resume

# Disallowed refinement patterns — requests for fabrication or unsupported claims
DISALLOWED_REFINEMENT_PATTERNS = (
    r"\badd\s+\d+\s*%",  # add a percentage
    r"\badd\s+metric",  # add a metric
    r"\binvent",  # invent anything
    r"\bfabricate",  # fabricate
    r"\bcreate\s+(?:new\s+)?(?:experience|job|employer|role)",  # create new experience
    r"\badd\s+(?:new\s+)?(?:experience|job|employer|role)",  # add new experience
    r"\bmake\s+up",  # make up
    r"\blie\b",  # lie
    r"\bexaggerate",  # exaggerate
    r"\binflate",  # inflate metrics
)


def _sanitize_refinement_summary(instruction: str) -> str:
    """Return a safe, truncated summary of the refinement instruction for notes."""
    clean = re.sub(r"[\n\r]+", " ", instruction).strip()[:100]
    return re.sub(r"[^a-zA-Z0-9\s.,\-]", "", clean).strip()


def _is_refinement_allowed(
    instruction: str,
    evidence: list[EvidenceItem],
) -> tuple[bool, str]:
    """Check if a refinement instruction is allowed based on guardrails.

    Allowed refinements:
    - Emphasize a technology already in cited evidence
    - Paraphrase existing grounded content
    - Adjust wording while keeping evidence citations

    Disallowed refinements:
    - Add new metrics/percentages not in evidence
    - Create new employers/experiences
    - Fabricate claims
    """
    lower = instruction.lower()

    # Check for explicitly disallowed patterns
    for pattern in DISALLOWED_REFINEMENT_PATTERNS:
        if re.search(pattern, lower, re.IGNORECASE):
            return False, f"Refinement requests unsupported operation: {pattern}"

    # Collect all technologies from evidence
    evidence_techs = {tech.lower() for item in evidence for tech in item.technologies}

    # If instruction asks to emphasize a technology, ensure it's in evidence
    emphasize_match = re.search(r"\bemphasiz(?:e|ing)\s+(\w+)", lower)
    if emphasize_match:
        tech = emphasize_match.group(1).lower()
        # Allow if tech is in evidence or is a generic term
        if tech not in evidence_techs and tech not in {"skills", "experience", "impact", "results", "achievements"}:
            # Check if it's a partial match
            if not any(tech in et or et in tech for et in evidence_techs):
                return False, f"Cannot emphasize technology '{tech}' not found in evidence"

    return True, "OK"


def _order_evidence_by_matches(
    evidence: list[EvidenceItem],
    evidence_matches: list[EvidenceMatchRow] | None,
) -> list[EvidenceItem]:
    """Reorder evidence to prioritize higher-relevance matched evidence IDs.

    Evidence with strong matches and "use" resume_usage comes first.
    """
    if not evidence_matches:
        return evidence

    # Build a score map: evidence_id -> priority score
    # Higher score = higher priority
    score_map: dict[str, float] = {}
    for row in evidence_matches:
        strength_score = {"strong": 3.0, "partial": 1.5, "none": 0.0}.get(row.evidence_strength, 0.0)
        usage_score = {"use": 2.0, "consider": 1.0, "skip": 0.0}.get(row.resume_usage, 0.0)
        importance_score = {"required": 2.0, "preferred": 1.0, "responsibility": 0.5}.get(row.importance, 0.5)
        row_score = strength_score * usage_score * importance_score
        for eid in row.evidence_ids:
            score_map[eid] = max(score_map.get(eid, 0.0), row_score)

    # Sort evidence by score (descending), then by original order
    evidence_with_idx = [(item, idx) for idx, item in enumerate(evidence)]
    evidence_with_idx.sort(key=lambda x: (-score_map.get(x[0].id, 0.0), x[1]))
    return [item for item, _ in evidence_with_idx]


def _apply_refinement_to_notes(
    base_notes: str,
    refinement_instruction: str | None,
    applied: bool,
) -> str:
    """Append refinement info to notes if an instruction was provided."""
    if not refinement_instruction:
        return base_notes
    summary = _sanitize_refinement_summary(refinement_instruction)
    status = "applied" if applied else "rejected"
    return f"{base_notes} | refinement:{status}:{summary}"


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

    def applies(finding: AuditFinding, bullet: ResumeBullet, section_type: str) -> bool:
        if finding.before_text and finding.before_text in bullet.text:
            return True
        cited = set(bullet.evidence_ids)
        finding_evidence = set(finding.evidence_ids)
        if finding.evidence_source:
            finding_evidence.add(finding.evidence_source)
        return finding.section == section_type and bool(cited.intersection(finding_evidence))

    sections = []
    for section in previous.sections:
        new_bullets = None
        if section.bullets is not None:
            new_bullets = []
            for bullet in section.bullets:
                text = bullet.text
                for finding in actionable:
                    if applies(finding, bullet, section.type):
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
                        if applies(finding, bullet, section.type):
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
    refinement_instruction: str | None = None,
    evidence_matches: list[EvidenceMatchRow] | None = None,
) -> ResumeDocument:
    """Generate or regenerate a resume.

    - Rejected findings are ignored.
    - Accepted/edited findings are applied onto previous_resume when present.
    - If no actionable findings on regenerate, content is kept and score recalculated.
    - Scores are always calculated from content (never SCORE_BY_VERSION).
    - Job/research never become first-person claims; bare confirmations never become experience.
    - refinement_instruction: Optional user instruction for emphasis/paraphrase (guardrail-checked).
    - evidence_matches: Optional pre-computed match rows to prioritize evidence ordering.
    """
    _ = rejected_findings  # explicitly ignored

    # Validate refinement instruction if provided — fail closed on unsupported requests
    refinement_applied = False
    if refinement_instruction:
        allowed, reason = _is_refinement_allowed(refinement_instruction, evidence)
        if not allowed:
            raise ValueError(f"GUARDRAIL_VIOLATION:{reason}")
        refinement_applied = True

    # Reorder evidence based on match relevance (higher scores first)
    ordered_evidence = _order_evidence_by_matches(evidence, evidence_matches)
    normalized = normalize_evidence(ordered_evidence)
    actionable = [f for f in (accepted_findings or []) if f.status in {None, "accepted", "edited", "open"}]

    base_notes = notes or f"Grounded resume V{absolute_version}"

    if previous_resume is not None:
        if actionable:
            updated = apply_accepted_findings(previous_resume, actionable, mistake_memory=mistake_memory)
        else:
            updated = previous_resume

        final_notes = _apply_refinement_to_notes(
            notes or updated.notes,
            refinement_instruction,
            refinement_applied,
        )
        scored = score_resume(
            sections=updated.sections,
            evidence=normalized,
            job_description=job_description,
            job_requirements=job_requirements,
            notes=final_notes,
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
                "notes": final_notes,
            }
        )

    final_notes = _apply_refinement_to_notes(
        base_notes,
        refinement_instruction,
        refinement_applied,
    )
    return build_grounded_resume(
        absolute_version=absolute_version,
        cycle_step=cycle_step,
        evidence=normalized,
        allowed_technologies=allowed_technologies,
        notes=final_notes,
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
    refinement_instruction: str | None = None,
    evidence_matches: list[EvidenceMatchRow] | None = None,
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
        refinement_instruction=refinement_instruction,
        evidence_matches=evidence_matches,
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
