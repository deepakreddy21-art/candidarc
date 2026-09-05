"""Deterministic QA checks for final resume review."""

from __future__ import annotations

from typing import Literal, TypedDict

from app.domain.schemas import EvidenceItem, ResumeDocument
from app.modules.guardrails.service import validate_resume_claims

CheckStatus = Literal["pass", "warn", "fail"]


class QaCheckDict(TypedDict):
    label: str
    status: CheckStatus
    detail: str


def run_deterministic_checks(
    resume: ResumeDocument,
    evidence: list[EvidenceItem],
    allowed_technologies: list[str] | None = None,
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
    ]
    return checks


def all_passed(checks: list[QaCheckDict]) -> bool:
    return all(c["status"] == "pass" for c in checks)
