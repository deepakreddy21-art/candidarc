"""Deterministic QA checks for final resume review."""

from __future__ import annotations

import re
from typing import Literal, TypedDict

from app.domain.schemas import (
    FINAL_QA_LABEL_BY_CODE,
    EvidenceItem,
    FinalQaCheck,
    FinalQaCheckCode,
    FinalQaFailedCheck,
    ResumeDocument,
)
from app.modules.guardrails.service import validate_resume_claims

CheckStatus = Literal["pass", "warn", "fail"]


class QaCheckDict(TypedDict):
    code: FinalQaCheckCode
    label: str
    status: CheckStatus
    blocking: bool
    detail: str


REPAIRABLE_CHECK_CODES = frozenset({
    FinalQaCheckCode.PRIMARY_TECHNOLOGY_EMPHASIS,
    FinalQaCheckCode.HAS_SUMMARY,
    FinalQaCheckCode.HAS_SKILLS,
    FinalQaCheckCode.DUPLICATE_BULLETS,
    FinalQaCheckCode.ATS_FORMAT,
    FinalQaCheckCode.LENGTH_REDUCE,
    FinalQaCheckCode.UNSUPPORTED_CLAIM,
    FinalQaCheckCode.TECHNOLOGY_CLAIMS,
})


def qa_check(
    code: FinalQaCheckCode,
    status: CheckStatus,
    detail: str,
    *,
    blocking: bool = True,
) -> QaCheckDict:
    return {
        "code": code,
        "label": FINAL_QA_LABEL_BY_CODE[code],
        "status": status,
        "blocking": blocking,
        "detail": detail,
    }


def unsupported_blocking_repairs(checks: list[FinalQaFailedCheck]) -> list[FinalQaFailedCheck]:
    return [
        check for check in checks
        if check.blocking and check.status != "pass" and check.code not in REPAIRABLE_CHECK_CODES
    ]


def _check_primary_tech_emphasis(
    resume: ResumeDocument,
    evidence: list[EvidenceItem],
    grounded_targets: list[str] | None = None,
) -> QaCheckDict:
    """Check if the primary technology from evidence appears prominently in summary/skills lead."""
    if not grounded_targets and not evidence:
        return qa_check(FinalQaCheckCode.PRIMARY_TECHNOLOGY_EMPHASIS, "warn", "no evidence")

    # Derive primary tech from grounded_targets or evidence
    primary_tech: str | None = None
    if grounded_targets:
        primary_tech = grounded_targets[0].lower()
    else:
        evidence_techs = [t.lower() for item in evidence for t in item.technologies]
        if evidence_techs:
            primary_tech = evidence_techs[0]

    if not primary_tech:
        return qa_check(FinalQaCheckCode.PRIMARY_TECHNOLOGY_EMPHASIS, "warn", "no primary tech")

    # Check summary and skills sections for primary tech in first 80 chars of lead bullet
    for section in resume.sections:
        if section.type in {"summary", "skills"}:
            if section.bullets:
                lead_text = section.bullets[0].text.lower()[:80]
                if primary_tech in lead_text:
                    return qa_check(FinalQaCheckCode.PRIMARY_TECHNOLOGY_EMPHASIS, "pass", primary_tech)
                # Also check technologies list
                lead_techs = [t.lower() for t in section.bullets[0].technologies]
                if primary_tech in lead_techs:
                    return qa_check(FinalQaCheckCode.PRIMARY_TECHNOLOGY_EMPHASIS, "pass", primary_tech)

    return qa_check(
        FinalQaCheckCode.PRIMARY_TECHNOLOGY_EMPHASIS,
        "fail",
        f"Lead with grounded primary technology from evidence ({primary_tech})",
    )


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
        return qa_check(FinalQaCheckCode.DUPLICATE_BULLETS, "fail", f"Found {len(duplicates)} duplicates")
    return qa_check(FinalQaCheckCode.DUPLICATE_BULLETS, "pass", "no duplicates")


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
        qa_check(FinalQaCheckCode.HAS_SUMMARY, "pass" if has_summary else "fail", "summary"),
        qa_check(FinalQaCheckCode.HAS_EXPERIENCE, "pass" if has_experience else "fail", "experience"),
        qa_check(FinalQaCheckCode.HAS_SKILLS, "pass" if has_skills else "warn", "skills"),
        qa_check(
            FinalQaCheckCode.EVIDENCE_LINKED,
            "pass" if not violations else "fail",
            ",".join(violations) or "ok",
        ),
        qa_check(
            FinalQaCheckCode.SECTION_COUNT,
            "pass" if section_count >= 2 else "warn",
            str(section_count),
            blocking=False,
        ),
        qa_check(
            FinalQaCheckCode.SCORE_RUBRIC_PRESENT,
            "pass" if resume.score_rubric_version else "fail",
            resume.score_rubric_version,
        ),
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
        if not check.blocking or check.status == "pass":
            continue
        code = check.code
        if code == FinalQaCheckCode.PRIMARY_TECHNOLOGY_EMPHASIS:
            results.append(_check_primary_tech_emphasis(resume, evidence, grounded_targets))
        elif code == FinalQaCheckCode.HAS_SUMMARY:
            has_summary = any(s.type == "summary" for s in resume.sections)
            results.append(qa_check(code, "pass" if has_summary else "fail", "summary", blocking=check.blocking))
        elif code == FinalQaCheckCode.HAS_EXPERIENCE:
            has_exp = any(s.type == "experience" for s in resume.sections)
            results.append(qa_check(code, "pass" if has_exp else "fail", "experience", blocking=check.blocking))
        elif code == FinalQaCheckCode.HAS_SKILLS:
            has_skills = any(s.type == "skills" for s in resume.sections)
            results.append(qa_check(code, "pass" if has_skills else "fail", "skills", blocking=check.blocking))
        elif code == FinalQaCheckCode.DUPLICATE_BULLETS:
            results.append(_check_duplicate_bullets(resume))
        elif code in {
            FinalQaCheckCode.EVIDENCE_LINKED,
            FinalQaCheckCode.TECHNOLOGY_CLAIMS,
            FinalQaCheckCode.UNSUPPORTED_CLAIM,
        }:
            violations = validate_resume_claims(resume, evidence)
            results.append(qa_check(
                code, "pass" if not violations else "fail", ",".join(violations) or "ok", blocking=check.blocking
            ))
        elif code == FinalQaCheckCode.ATS_FORMAT:
            visible = " ".join(
                [
                    *(s.content or "" for s in resume.sections),
                    *(b.text for s in resume.sections for b in (s.bullets or [])),
                    *(b.text for s in resume.sections for i in (s.items or []) for b in i.bullets),
                ]
            )
            invalid = "\t" in visible or "|" in visible
            results.append(qa_check(code, "fail" if invalid else "pass", "plain ATS-safe text", blocking=check.blocking))
        elif code == FinalQaCheckCode.LENGTH_REDUCE:
            words = sum(len(re.findall(r"\S+", b.text)) for s in resume.sections for b in (s.bullets or []))
            words += sum(len(re.findall(r"\S+", b.text)) for s in resume.sections for i in (s.items or []) for b in i.bullets)
            results.append(qa_check(code, "pass" if words <= 900 else "fail", f"{words} words", blocking=check.blocking))
        else:
            results.append(qa_check(code, "fail", "check not safely repairable/verifiable", blocking=check.blocking))
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
    all_fixed = all(c["status"] == "pass" for c in results)
    return all_fixed, results


def to_final_qa_checks(checks: list[QaCheckDict]) -> list[FinalQaCheck]:
    return [FinalQaCheck(**c) for c in checks]


def all_passed(checks: list[QaCheckDict]) -> bool:
    return not any(c["blocking"] and c["status"] != "pass" for c in checks)
