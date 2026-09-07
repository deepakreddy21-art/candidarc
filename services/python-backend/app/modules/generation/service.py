"""Grounded resume generation — JD-aware, finding-aware, score-calculated."""

from __future__ import annotations

import re

from app.core.errors import FINAL_QA_REPAIR_UNREPAIRABLE, ProviderError
from app.domain.schemas import (
    AuditFinding,
    EvidenceItem,
    EvidenceMatchRow,
    FinalQaCheckCode,
    FinalQaRepairDirective,
    MistakeMemoryRule,
    ResearchFinding,
    ResumeBullet,
    ResumeDocument,
    ResumeSection,
    UserConfirmation,
)
from app.modules.evidence.service import normalize_evidence
from app.modules.guardrails.service import build_grounded_resume, validate_resume_claims
from app.modules.quality.service import unsupported_blocking_repairs, verify_repair_fixed_checks
from app.modules.scoring.service import score_resume

# Disallowed free-form refinement patterns — fabrication / unsupported claims.
# "without inventing" is handled by requiring word-boundary invent as a verb of fabrication,
# but Final-QA repair must use structured final_qa_repair (never this free-form path).
DISALLOWED_REFINEMENT_PATTERNS = (
    r"\badd\s+\d+\s*%",
    r"\badd\s+metric",
    r"\binvent(?:ing|ed|s)?\b(?!\s+facts\b)",  # invent / inventing claims — not "without inventing facts" alone
    r"(?<!without\s)\binventing\b",
    r"\bfabricate",
    r"\bcreate\s+(?:new\s+)?(?:experience|job|employer|role)",
    r"\badd\s+(?:new\s+)?(?:experience|job|employer|role)",
    r"\bmake\s+up",
    r"\blie\b",
    r"\bexaggerate",
    r"\binflate",
)

# Safe synonym swaps that preserve semantic scope (no ownership inflation).
_SAFE_WORDING_MAP = (
    (re.compile(r"\bhelped\s+with\b", re.I), "supported"),
    (re.compile(r"\bassisted\s+with\b", re.I), "supported"),
    (re.compile(r"\butilized\b", re.I), "used"),
    (re.compile(r"\bleveraged\b", re.I), "used"),
)


def _sanitize_refinement_summary(instruction: str) -> str:
    """Return a safe, truncated summary of the refinement instruction for notes."""
    clean = re.sub(r"[\n\r]+", " ", instruction).strip()[:100]
    return re.sub(r"[^a-zA-Z0-9\s.,\-]", "", clean).strip()


def _is_refinement_allowed(
    instruction: str,
    evidence: list[EvidenceItem],
) -> tuple[bool, str]:
    """Check if a free-form refinement instruction is allowed."""
    lower = instruction.lower()

    for pattern in DISALLOWED_REFINEMENT_PATTERNS:
        if re.search(pattern, lower, re.IGNORECASE):
            return False, f"Refinement requests unsupported operation: {pattern}"

    # Explicit fabrication phrasing still blocked even when "inventing facts" appears negatively
    if re.search(r"\b(?:please\s+)?invent\b", lower) and "without invent" not in lower:
        return False, "Refinement requests unsupported operation: invent"

    evidence_techs = {tech.lower() for item in evidence for tech in item.technologies}

    emphasize_match = re.search(r"\bemphasiz(?:e|ing)\s+([a-z0-9][\w+#.]*)", lower)
    if emphasize_match:
        tech = emphasize_match.group(1).lower()
        # Skip generic filler words that are not technologies
        if tech in {
            "skills",
            "experience",
            "impact",
            "results",
            "achievements",
            "reliability",
            "grounded",
            "existing",
            "supported",
            "relevant",
            "proven",
            "the",
            "a",
            "an",
        }:
            return True, "OK"
        if tech not in evidence_techs and not any(tech in et or et in tech for et in evidence_techs):
            return False, f"Cannot emphasize technology '{tech}' not found in evidence"

    return True, "OK"


def _order_evidence_by_matches(
    evidence: list[EvidenceItem],
    evidence_matches: list[EvidenceMatchRow] | None,
) -> list[EvidenceItem]:
    """Reorder evidence to prioritize higher-relevance matched evidence IDs."""
    if not evidence_matches:
        return evidence

    score_map: dict[str, float] = {}
    for row in evidence_matches:
        strength_score = {"strong": 3.0, "partial": 1.5, "none": 0.0}.get(row.evidence_strength, 0.0)
        usage_score = {"use": 2.0, "consider": 1.0, "skip": 0.0}.get(row.resume_usage, 0.0)
        importance_score = {"required": 2.0, "preferred": 1.0, "responsibility": 0.5}.get(row.importance, 0.5)
        row_score = strength_score * usage_score * importance_score
        for eid in row.evidence_ids:
            score_map[eid] = max(score_map.get(eid, 0.0), row_score)

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


def _visible_sections_fingerprint(resume: ResumeDocument) -> str:
    """Normalize visible section text for material-change detection (excludes notes)."""
    parts: list[str] = []
    for section in resume.sections:
        parts.append(section.type.lower())
        for bullet in section.bullets or []:
            parts.append(re.sub(r"\s+", " ", bullet.text).strip().lower())
            parts.append("|".join(t.lower() for t in bullet.technologies))
        for item in section.items or []:
            parts.append((item.heading or "").lower())
            for bullet in item.bullets:
                parts.append(re.sub(r"\s+", " ", bullet.text).strip().lower())
                parts.append("|".join(t.lower() for t in bullet.technologies))
        if section.content:
            parts.append(re.sub(r"\s+", " ", section.content).strip().lower())
    return "\n".join(parts)


def _extract_emphasis_token(instruction: str, evidence_techs: set[str]) -> str | None:
    lower = instruction.lower()
    match = re.search(
        r"\bemphasiz(?:e|ing)\s+((?:[a-z0-9][\w+#.]*)(?:\s+[a-z0-9][\w+#.]*){0,3})",
        lower,
    )
    if not match:
        match = re.search(r"\bfocus(?:\s+on)?\s+([a-z0-9][\w+#.]*)", lower)
    if not match:
        return None
    raw = match.group(1).strip()
    for tech in sorted(evidence_techs, key=len, reverse=True):
        if tech and tech in raw:
            return tech
    token = re.sub(r"\b(platform|ownership|reliability|skills?|experience|focus|grounded)\b", " ", raw)
    token = re.sub(r"\s+", " ", token).strip()
    if not token:
        return None
    first = token.split()[0]
    if first in {"grounded", "existing", "supported", "relevant", "proven"}:
        return None
    return first


def _dedupe_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _shorten_verbose(text: str) -> str:
    updated = _dedupe_whitespace(text)
    if len(updated) <= 160:
        return updated
    # Drop parenthetical asides and redundant "in order to"
    updated = re.sub(r"\s*\([^)]*\)", "", updated)
    updated = re.sub(r"\bin order to\b", "to", updated, flags=re.I)
    updated = _dedupe_whitespace(updated)
    parts = re.split(r"(?<=[.!;])\s+", updated)
    if len(parts) > 1 and len(parts[0]) >= 40:
        return parts[0][:220]
    return updated[:220]


def _safe_wording(text: str) -> str:
    updated = text
    for pattern, replacement in _SAFE_WORDING_MAP:
        updated = pattern.sub(replacement, updated)
    return updated


def apply_visible_refinement(
    resume: ResumeDocument,
    instruction: str,
    evidence: list[EvidenceItem],
) -> ResumeDocument:
    """Apply a safe refinement that must change visible professional resume content.

    No customer-facing test markers. No ownership inflation without evidence.
    """
    lower = instruction.lower()
    evidence_techs = {t.lower() for item in evidence for t in item.technologies}
    emphasis = _extract_emphasis_token(instruction, evidence_techs)
    want_concise = bool(re.search(r"\b(concise|tighten|shorten|brief|remove\s+repetition)\b", lower))
    want_wording = bool(re.search(r"\b(paraphrase|reword|clearer|wording)\b", lower)) or want_concise

    if emphasis and emphasis not in evidence_techs and not any(emphasis in t or t in emphasis for t in evidence_techs):
        if emphasis not in {"skills", "experience", "impact", "results", "achievements", "reliability"}:
            raise ValueError(f"GUARDRAIL_VIOLATION:Cannot emphasize '{emphasis}' not found in evidence")

    def rewrite_text(text: str) -> str:
        updated = text
        if want_wording or want_concise:
            updated = _safe_wording(updated)
        if want_concise:
            updated = _shorten_verbose(updated)
        # Remove duplicated consecutive phrases
        updated = re.sub(r"\b(\w+(?:\s+\w+){0,3})\s+\1\b", r"\1", updated, flags=re.I)
        return updated[:3900]

    def bullet_score(bullet: ResumeBullet) -> float:
        if not emphasis:
            return 0.0
        blob = f"{bullet.text} {' '.join(bullet.technologies)}".lower()
        return 10.0 if emphasis in blob else 0.0

    sections = []
    for section in resume.sections:
        new_bullets = None
        if section.bullets is not None:
            rewritten = [b.model_copy(update={"text": rewrite_text(b.text)}) for b in section.bullets]
            if emphasis and section.type in {"summary", "skills", "experience"}:
                rewritten = sorted(rewritten, key=lambda b: (-bullet_score(b), rewritten.index(b)))
                if section.type == "skills" and rewritten:
                    skill_bullet = rewritten[0]
                    techs = list(skill_bullet.technologies) or list(evidence_techs)
                    prioritized = sorted(
                        techs,
                        key=lambda t: (0 if emphasis in str(t).lower() else 1, str(t).lower()),
                    )
                    if prioritized:
                        skill_bullet = skill_bullet.model_copy(
                            update={
                                "technologies": [str(t) for t in prioritized],
                                "text": " · ".join(str(t) for t in prioritized),
                            }
                        )
                        rewritten[0] = skill_bullet
            new_bullets = rewritten

        new_items = None
        if section.items is not None:
            new_items = []
            for item in section.items:
                item_bullets = [b.model_copy(update={"text": rewrite_text(b.text)}) for b in item.bullets]
                if emphasis:
                    item_bullets = sorted(item_bullets, key=lambda b: (-bullet_score(b), item_bullets.index(b)))
                new_items.append(item.model_copy(update={"bullets": item_bullets}))

        content = section.content
        if content:
            content = rewrite_text(content)
        sections.append(section.model_copy(update={"bullets": new_bullets, "items": new_items, "content": content}))

    return resume.model_copy(update={"sections": sections})


def apply_final_qa_repair(
    resume: ResumeDocument,
    repair: FinalQaRepairDirective,
    evidence: list[EvidenceItem],
) -> ResumeDocument:
    """Apply a structured Final-QA repair without free-form refinement parsing.

    Prioritizes approved evidence and grounded technology targets already in evidence.
    """
    unsupported = unsupported_blocking_repairs(repair.failed_checks)
    if unsupported:
        codes = ", ".join(check.code.value for check in unsupported)
        raise ProviderError(
            FINAL_QA_REPAIR_UNREPAIRABLE,
            f"Blocking checks have no evidence-safe repair: {codes}",
        )

    evidence_by_id = {item.id: item for item in evidence}
    approved = [evidence_by_id[eid] for eid in repair.approved_evidence_ids if eid in evidence_by_id]
    evidence_techs = {t.lower() for item in evidence for t in item.technologies}
    targets = [t.lower() for t in repair.grounded_targets if t.lower() in evidence_techs]
    if not targets:
        # Derive from approved evidence technologies
        for item in approved or evidence:
            for tech in item.technologies:
                if tech.lower() not in targets:
                    targets.append(tech.lower())
                if len(targets) >= 3:
                    break
            if len(targets) >= 3:
                break

    primary = targets[0] if targets else None
    approved_ids = set(repair.approved_evidence_ids)

    def score_bullet(bullet: ResumeBullet) -> float:
        score = 0.0
        blob = f"{bullet.text} {' '.join(bullet.technologies)}".lower()
        if primary and primary in blob:
            score += 10.0
        if approved_ids and approved_ids.intersection(bullet.evidence_ids):
            score += 5.0
        for idx, tech in enumerate(targets):
            if tech in blob:
                score += max(0.0, 3.0 - idx)
        return score

    requested_codes = {
        check.code for check in repair.failed_checks
        if check.blocking and check.status != "pass"
    }
    if requested_codes.intersection({
        FinalQaCheckCode.HAS_SUMMARY,
        FinalQaCheckCode.UNSUPPORTED_CLAIM,
        FinalQaCheckCode.TECHNOLOGY_CLAIMS,
    }) and not approved:
        raise ProviderError(
            FINAL_QA_REPAIR_UNREPAIRABLE,
            "Repair requires at least one approved evidence item",
        )

    def approved_text(item: EvidenceItem) -> str:
        candidates = [item.claim_text, item.result, *(item.actions or []), item.task, item.situation]
        return next((_dedupe_whitespace(text) for text in candidates if text and text.strip()), item.title)

    seen_bullets: set[str] = set()

    def dedupe_bullets(bullets: list[ResumeBullet]) -> list[ResumeBullet]:
        unique: list[ResumeBullet] = []
        for bullet in bullets:
            fingerprint = _dedupe_whitespace(bullet.text).casefold()
            if fingerprint in seen_bullets:
                continue
            seen_bullets.add(fingerprint)
            unique.append(bullet)
        return unique

    sections = []
    for section in resume.sections:
        new_bullets = None
        if section.bullets is not None:
            rewritten = list(section.bullets)
            if (
                FinalQaCheckCode.PRIMARY_TECHNOLOGY_EMPHASIS in requested_codes
                and section.type in {"summary", "skills", "experience"}
            ):
                rewritten = sorted(rewritten, key=lambda b: (-score_bullet(b), rewritten.index(b)))
                if section.type == "skills" and rewritten and primary:
                    skill = rewritten[0]
                    techs = list(skill.technologies) or [t for t in evidence_techs]
                    prioritized = sorted(
                        techs,
                        key=lambda t: (0 if primary in str(t).lower() else 1, str(t).lower()),
                    )
                    if prioritized:
                        rewritten[0] = skill.model_copy(
                            update={
                                "technologies": [str(t) for t in prioritized],
                                "text": " · ".join(str(t) for t in prioritized),
                            }
                        )
                if section.type == "summary" and rewritten and primary:
                    lead = rewritten[0]
                    # Professional lead: put the grounded tech in natural wording without markers
                    if primary not in lead.text.lower()[:80] and score_bullet(lead) > 0:
                        lead = lead.model_copy(
                            update={"text": f"{primary.title()} platform work: {lead.text}"[:3900]}
                        )
                        rewritten[0] = lead
            if FinalQaCheckCode.DUPLICATE_BULLETS in requested_codes:
                rewritten = dedupe_bullets(rewritten)
            if FinalQaCheckCode.ATS_FORMAT in requested_codes:
                rewritten = [
                    bullet.model_copy(update={"text": re.sub(r"[\t|]+", " ", bullet.text)})
                    for bullet in rewritten
                ]
            if FinalQaCheckCode.LENGTH_REDUCE in requested_codes:
                rewritten = [
                    bullet.model_copy(update={"text": _shorten_verbose(bullet.text)})
                    for bullet in rewritten
                ]
            if requested_codes.intersection({
                FinalQaCheckCode.UNSUPPORTED_CLAIM,
                FinalQaCheckCode.TECHNOLOGY_CLAIMS,
            }):
                approved_item = approved[0]
                approved_techs = {tech.casefold() for item in approved for tech in item.technologies}
                rewritten = [
                    bullet.model_copy(
                        update={
                            "text": approved_text(approved_item),
                            "evidence_ids": [approved_item.id],
                            "technologies": [
                                tech for tech in bullet.technologies if tech.casefold() in approved_techs
                            ] or list(approved_item.technologies),
                        }
                    )
                    if (
                        not set(bullet.evidence_ids).issubset(set(evidence_by_id))
                        or any(tech.casefold() not in approved_techs for tech in bullet.technologies)
                    )
                    else bullet
                    for bullet in rewritten
                ]
            new_bullets = rewritten

        new_items = None
        if section.items is not None:
            new_items = []
            for resume_item in section.items:
                item_bullets = list(resume_item.bullets)
                if FinalQaCheckCode.PRIMARY_TECHNOLOGY_EMPHASIS in requested_codes:
                    item_bullets = sorted(
                        item_bullets,
                        key=lambda b: (-score_bullet(b), item_bullets.index(b)),
                    )
                if FinalQaCheckCode.DUPLICATE_BULLETS in requested_codes:
                    item_bullets = dedupe_bullets(item_bullets)
                if FinalQaCheckCode.ATS_FORMAT in requested_codes:
                    item_bullets = [
                        bullet.model_copy(update={"text": re.sub(r"[\t|]+", " ", bullet.text)})
                        for bullet in item_bullets
                    ]
                if FinalQaCheckCode.LENGTH_REDUCE in requested_codes:
                    item_bullets = [
                        bullet.model_copy(update={"text": _shorten_verbose(bullet.text)})
                        for bullet in item_bullets
                    ]
                if requested_codes.intersection({
                    FinalQaCheckCode.UNSUPPORTED_CLAIM,
                    FinalQaCheckCode.TECHNOLOGY_CLAIMS,
                }):
                    approved_item = approved[0]
                    approved_techs = {tech.casefold() for item in approved for tech in item.technologies}
                    item_bullets = [
                        bullet.model_copy(
                            update={
                                "text": approved_text(approved_item),
                                "evidence_ids": [approved_item.id],
                                "technologies": [
                                    tech for tech in bullet.technologies if tech.casefold() in approved_techs
                                ] or list(approved_item.technologies),
                            }
                        )
                        if (
                            not set(bullet.evidence_ids).issubset(set(evidence_by_id))
                            or any(tech.casefold() not in approved_techs for tech in bullet.technologies)
                        )
                        else bullet
                        for bullet in item_bullets
                    ]
                new_items.append(resume_item.model_copy(update={"bullets": item_bullets}))

        content = section.content
        if content and FinalQaCheckCode.ATS_FORMAT in requested_codes:
            content = re.sub(r"[\t|]+", " ", content)
        sections.append(section.model_copy(update={"bullets": new_bullets, "items": new_items, "content": content}))

    if FinalQaCheckCode.HAS_SUMMARY in requested_codes and not any(s.type == "summary" for s in sections):
        source = approved[0] if approved else (evidence[0] if evidence else None)
        if source is None:
            raise ProviderError(FINAL_QA_REPAIR_UNREPAIRABLE, "No approved evidence is available for summary repair")
        sections.insert(0, ResumeSection(
            type="summary",
            title="Summary",
            order=0,
            bullets=[ResumeBullet(
                text=approved_text(source),
                evidence_ids=[source.id],
                technologies=list(source.technologies),
                confidence=source.confidence,
            )],
        ))

    if FinalQaCheckCode.HAS_SKILLS in requested_codes and not any(s.type == "skills" for s in sections):
        source = approved[0] if approved else (evidence[0] if evidence else None)
        if source is None or not source.technologies:
            raise ProviderError(FINAL_QA_REPAIR_UNREPAIRABLE, "No evidence-backed skills are available")
        sections.insert(1, ResumeSection(
            type="skills",
            title="Skills",
            order=1,
            bullets=[ResumeBullet(
                text=" · ".join(source.technologies),
                evidence_ids=[source.id],
                technologies=list(source.technologies),
                confidence=source.confidence,
            )],
        ))

    notes = resume.notes or ""
    if "final-qa-repair:applied" not in notes:
        notes = f"{notes} | final-qa-repair:applied:a{repair.attempt}".strip(" |")
    return resume.model_copy(update={"sections": sections, "notes": notes})


def _apply_finding_text(text: str, finding: AuditFinding) -> str:
    replacement = finding.edited_text or finding.suggested_text
    if finding.before_text and finding.before_text in text:
        return text.replace(finding.before_text, replacement, 1)
    return replacement


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
    final_qa_repair: FinalQaRepairDirective | None = None,
    evidence_matches: list[EvidenceMatchRow] | None = None,
) -> ResumeDocument:
    """Generate or regenerate a resume."""
    _ = rejected_findings

    if final_qa_repair is not None and refinement_instruction:
        raise ValueError("GUARDRAIL_VIOLATION:final_qa_repair and refinement_instruction are mutually exclusive")

    refinement_applied = False
    if refinement_instruction:
        allowed, reason = _is_refinement_allowed(refinement_instruction, evidence)
        if not allowed:
            raise ValueError(f"GUARDRAIL_VIOLATION:{reason}")
        refinement_applied = True

    if final_qa_repair is not None:
        # Persisted, scoped evidence is the only repair provenance.
        evidence_techs = {t.lower() for item in evidence for t in item.technologies}

        for target in final_qa_repair.grounded_targets:
            target_lower = target.lower()
            if target_lower not in evidence_techs and not any(
                target_lower in et or et in target_lower for et in evidence_techs
            ):
                raise ValueError(
                    f"GUARDRAIL_VIOLATION:Repair target '{target}' not found in persisted evidence"
                )
        approved = set(final_qa_repair.approved_evidence_ids)
        known_ids = {item.id for item in evidence}
        unknown = approved - known_ids
        if unknown:
            raise ValueError(
                f"GUARDRAIL_VIOLATION:Repair approved_evidence_ids not in evidence: {sorted(unknown)[:5]}"
            )

    ordered_evidence = _order_evidence_by_matches(evidence, evidence_matches)
    normalized = normalize_evidence(ordered_evidence)
    actionable = [f for f in (accepted_findings or []) if f.status in {None, "accepted", "edited", "open"}]

    base_notes = notes or f"Grounded resume V{absolute_version}"

    if previous_resume is not None:
        if actionable:
            updated = apply_accepted_findings(previous_resume, actionable, mistake_memory=mistake_memory)
        elif refinement_instruction or final_qa_repair is not None:
            updated = build_grounded_resume(
                absolute_version=absolute_version,
                cycle_step=cycle_step,
                evidence=normalized,
                allowed_technologies=allowed_technologies,
                notes=base_notes,
                job_description=job_description,
                job_requirements=job_requirements,
                research_findings=research_findings,
                user_confirmations=user_confirmations,
            )
        else:
            updated = previous_resume

        if final_qa_repair is not None:
            before = updated
            # Prefer repairing from the failed previous resume when present
            source = previous_resume if previous_resume is not None else updated
            updated = apply_final_qa_repair(source, final_qa_repair, evidence)
            if _visible_sections_fingerprint(updated) == _visible_sections_fingerprint(before) and (
                _visible_sections_fingerprint(updated) == _visible_sections_fingerprint(source)
            ):
                # Still try from rebuilt content
                rebuilt = build_grounded_resume(
                    absolute_version=absolute_version,
                    cycle_step=cycle_step,
                    evidence=normalized,
                    allowed_technologies=allowed_technologies,
                    notes=base_notes,
                    job_description=job_description,
                    job_requirements=job_requirements,
                    research_findings=research_findings,
                    user_confirmations=user_confirmations,
                )
                updated = apply_final_qa_repair(rebuilt, final_qa_repair, evidence)
            if _visible_sections_fingerprint(updated) == _visible_sections_fingerprint(source):
                raise ValueError(
                    "REFINEMENT_NOT_APPLICABLE:Safe Final-QA repair produced no material visible change"
                )
            # Verify repair actually fixed the failed checks — fail closed if unrepairable
            repair_fixed, check_results = verify_repair_fixed_checks(
                updated,
                evidence,
                final_qa_repair.failed_checks,
                grounded_targets=final_qa_repair.grounded_targets,
            )
            if not repair_fixed:
                failed_labels = [c["label"] for c in check_results if c["status"] == "fail"]
                raise ProviderError(
                    FINAL_QA_REPAIR_UNREPAIRABLE,
                    f"Repair could not fix checks: {', '.join(failed_labels)}",
                )
            final_notes = updated.notes or base_notes
        elif refinement_instruction:
            before_refine = updated
            updated = apply_visible_refinement(updated, refinement_instruction, evidence)
            if _visible_sections_fingerprint(updated) == _visible_sections_fingerprint(before_refine):
                raise ValueError(
                    "REFINEMENT_NOT_APPLICABLE:Safe refinement produced no material visible change"
                )
            final_notes = _apply_refinement_to_notes(
                updated.notes or notes or base_notes,
                refinement_instruction,
                refinement_applied,
            )
        else:
            final_notes = updated.notes or notes or base_notes

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

    resume = build_grounded_resume(
        absolute_version=absolute_version,
        cycle_step=cycle_step,
        evidence=normalized,
        allowed_technologies=allowed_technologies,
        notes=base_notes,
        job_description=job_description,
        job_requirements=job_requirements,
        research_findings=research_findings,
        user_confirmations=user_confirmations,
    )
    if final_qa_repair is not None:
        before = resume
        resume = apply_final_qa_repair(resume, final_qa_repair, evidence)
        if _visible_sections_fingerprint(resume) == _visible_sections_fingerprint(before):
            raise ValueError(
                "REFINEMENT_NOT_APPLICABLE:Safe Final-QA repair produced no material visible change"
            )
        # Verify repair actually fixed the failed checks — fail closed if unrepairable
        repair_fixed, check_results = verify_repair_fixed_checks(
            resume,
            evidence,
            final_qa_repair.failed_checks,
            grounded_targets=final_qa_repair.grounded_targets,
        )
        if not repair_fixed:
            failed_labels = [c["label"] for c in check_results if c["status"] == "fail"]
            raise ProviderError(
                FINAL_QA_REPAIR_UNREPAIRABLE,
                f"Repair could not fix checks: {', '.join(failed_labels)}",
            )
        final_notes = resume.notes or base_notes
    elif refinement_instruction:
        before = resume
        resume = apply_visible_refinement(resume, refinement_instruction, evidence)
        if _visible_sections_fingerprint(resume) == _visible_sections_fingerprint(before):
            raise ValueError(
                "REFINEMENT_NOT_APPLICABLE:Safe refinement produced no material visible change"
            )
        final_notes = _apply_refinement_to_notes(
            resume.notes or base_notes,
            refinement_instruction,
            refinement_applied,
        )
    else:
        final_notes = resume.notes or base_notes

    scored = score_resume(
        sections=resume.sections,
        evidence=normalized,
        job_description=job_description,
        job_requirements=job_requirements,
        notes=final_notes,
    )
    return resume.model_copy(
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
    refinement_instruction: str | None = None,
    final_qa_repair: FinalQaRepairDirective | None = None,
    evidence_matches: list[EvidenceMatchRow] | None = None,
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
        refinement_instruction=refinement_instruction,
        final_qa_repair=final_qa_repair,
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
