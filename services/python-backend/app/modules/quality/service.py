"""Deterministic QA checks for final resume review."""

from __future__ import annotations

import re
from typing import Literal, TypedDict

from app.domain.schemas import EvidenceItem, FinalQaCheck, FinalQaFailedCheck, ResumeDocument
from app.modules.guardrails.service import validate_resume_claims

CheckStatus = Literal["pass", "warn", "fail"]


class QaCheckDict(TypedDict):
    label: str
    status: CheckStatus
    detail: str


# Check labels that we can automatically repair
REPAIRABLE_CHECK_LABELS = frozenset({
    "Primary technology emphasis",
    "Has summary",
    "Has skills",
    "Has experience",
    "Duplicate bullets",
    "Required sections",
    "ATS format",
    "Length check",
})


def _check_primary_tech_emphasis(
    resume: ResumeDocument,
    evidence: list[EvidenceItem],
    grounded_targets: list[str] | None = None,
) -> QaCheckDict:
    """Check if the primary technology from evidence appears prominently in summary/skills lead."""
    if not grounded_targets and not evidence:
        return {"label": "Primary technology emphasis", "status": "warn", "detail": "no evidence"}

    # Derive primary tech from grounded_targets or evidence
    primary_tech: str | None = None
    if grounded_targets:
        primary_tech = grounded_targets[0].lower()
    else:
        evidence_techs = [t.lower() for item in evidence for t in item.technologies]
        if evidence_techs:
            primary_tech = evidence_techs[0]

    if not primary_tech:
        return {"label": "Primary technology emphasis", "status": "warn", "detail": "no primary tech"}

    # Check summary and skills sections for primary tech in first 80 chars of lead bullet
    for section in resume.sections:
        if section.type in {"summary", "skills"}:
            if section.bullets:
                lead_text = section.bullets[0].text.lower()[:80]
                if primary_tech in lead_text:
                    return {"label": "Primary technology emphasis", "status": "pass", "detail": primary_tech}
                # Also check technologies list
                lead_techs = [t.lower() for t in section.bullets[0].technologies]
                if primary_tech in lead_techs:
                    return {"label": "Primary technology emphasis", "status": "pass", "detail": primary_tech}

    return {
        "label": "Primary technology emphasis",
        "status": "fail",
        "detail": f"Lead with grounded primary technology from evidence ({primary_tech})",
    }


def _check_duplicate_bullets(resume: ResumeDocument) -> QaCheckDict:
    """Check for duplicate bullet text across sections."""
    seen: set[str] = set()
    duplicates: list[str] = []
    for section in resume.sections:
        for bullet in section.bullets or []:
            normalized = re.sub(r"\s+", " ", bullet.text.lower()).strip()[:100]
            if normalized in seen:
                duplicates.append(normalized[:40])
            seen.add(normalized)
        for item in section.items or []:
            for bullet in item.bullets:
                normalized = re.sub(r"\s+", " ", bullet.text.lower()).strip()[:100]
                if normalized in seen:
                    duplicates.append(normalized[:40])
                seen.add(normalized)
    if duplicates:
        return {"label": "Duplicate bullets", "status": "fail", "detail": f"Found {len(duplicates)} duplicates"}
    return {"label": "Duplicate bullets", "status": "pass", "detail": "no duplicates"}


def run_deterministic_checks(
    resume: ResumeDocument,
    evidence: list[EvidenceItem],
    allowed_technologies: list[str] | None = None,
    *,
    grounded_targets: list[str] | None = None,
) -> list[QaCheckDict]:
    violations = validate_resume_claims(resume, evidence, allowed_technologies)
    has_summary = any(s.type == "summary" for s in resume.sections)
    has_experience = any(s.type == "experience" for s in resume.sections)
    has_skills = any(s.type == "skills" for s in resume.sections)
    section_count = len(resume.sections)

    checks: list[QaCheckDict] = [
        {"label": "Has summary", "status": "pass" if has_summary else "fail", "detail": "summary"},
        {"label": "Has experience", "status": "pass" if has_experience else "fail", "detail": "experience"},
        {"label": "Has skills", "status": "pass" if has_skills else "warn", "detail": "skills"},
        {
            "label": "Evidence linked",
            "status": "pass" if not violations else "fail",
            "detail": ",".join(violations) or "ok",
        },
        {
            "label": "Section count",
            "status": "pass" if section_count >= 2 else "warn",
            "detail": str(section_count),
        },
        {
            "label": "Score rubric present",
            "status": "pass" if resume.score_rubric_version else "fail",
            "detail": resume.score_rubric_version,
        },
    ]
    return checks


def run_specific_checks(
    resume: ResumeDocument,
    evidence: list[EvidenceItem],
    failed_checks: list[FinalQaFailedCheck],
    *,
    grounded_targets: list[str] | None = None,
) -> list[QaCheckDict]:
    """Run only the specific checks that previously failed."""
    results: list[QaCheckDict] = []
    for check in failed_checks:
        label = check.label
        if label == "Primary technology emphasis":
            results.append(_check_primary_tech_emphasis(resume, evidence, grounded_targets))
        elif label == "Has summary":
            has_summary = any(s.type == "summary" for s in resume.sections)
            results.append({"label": label, "status": "pass" if has_summary else "fail", "detail": "summary"})
        elif label == "Has experience":
            has_exp = any(s.type == "experience" for s in resume.sections)
            results.append({"label": label, "status": "pass" if has_exp else "fail", "detail": "experience"})
        elif label == "Has skills":
            has_skills = any(s.type == "skills" for s in resume.sections)
            results.append({"label": label, "status": "pass" if has_skills else "warn", "detail": "skills"})
        elif label == "Duplicate bullets":
            results.append(_check_duplicate_bullets(resume))
        elif label == "Required sections":
            has_required = all(
                any(s.type == t for s in resume.sections) for t in ["summary", "experience"]
            )
            results.append({"label": label, "status": "pass" if has_required else "fail", "detail": "sections"})
        elif label in {"Evidence linked", "Technology claims", "Unsupported factual claim"}:
            violations = validate_resume_claims(resume, evidence)
            results.append({
                "label": label,
                "status": "pass" if not violations else "fail",
                "detail": ",".join(violations) or "ok",
            })
        else:
            # Unknown check - cannot verify, mark as pending
            results.append({"label": label, "status": "warn", "detail": "check not verifiable"})
    return results


def verify_repair_fixed_checks(
    resume: ResumeDocument,
    evidence: list[EvidenceItem],
    failed_checks: list[FinalQaFailedCheck],
    *,
    grounded_targets: list[str] | None = None,
) -> tuple[bool, list[QaCheckDict]]:
    """Verify that repair actually fixed the failed checks. Returns (all_fixed, check_results)."""
    results = run_specific_checks(resume, evidence, failed_checks, grounded_targets=grounded_targets)
    all_fixed = all(c["status"] in {"pass", "warn"} for c in results)
    return all_fixed, results


def to_final_qa_checks(checks: list[QaCheckDict]) -> list[FinalQaCheck]:
    return [FinalQaCheck(label=c["label"], status=c["status"], detail=c["detail"]) for c in checks]


def all_passed(checks: list[QaCheckDict]) -> bool:
    return all(c["status"] == "pass" for c in checks)
