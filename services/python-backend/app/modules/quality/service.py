"""Deterministic QA checks for final resume review."""

from __future__ import annotations

import os
import re
from typing import Any, Literal, TypedDict

from app.core.errors import PROVIDER_OUTPUT_INVALID, ProviderError
from app.domain.schemas import (
    DeterministicQaCheck,
    EvidenceItem,
    FinalQaCheck,
    FinalQaCheckCode,
    FinalQaFailedCheck,
    FinalQaResponse,
    ResumeDocument,
)
from app.modules.guardrails.service import validate_resume_claims
from app.modules.quality.registry import (
    FINAL_QA_CHECK_REGISTRY,
    REQUIRED_FINAL_QA_CODES,
)

__all__ = [
    "FINAL_QA_CHECK_REGISTRY",
    "REQUIRED_FINAL_QA_CODES",
    "REPAIRABLE_CHECK_CODES",
    "authorize_final_qa_response",
    "qa_check",
    "run_deterministic_checks",
    "verify_repair_fixed_checks",
    "unsupported_blocking_repairs",
]

CheckStatus = Literal["pass", "warn", "fail"]


class QaCheckDict(TypedDict):
    code: FinalQaCheckCode
    label: str
    status: CheckStatus
    blocking: bool
    detail: str


REPAIRABLE_CHECK_CODES = frozenset(
    code for code, definition in FINAL_QA_CHECK_REGISTRY.items() if definition.repairable
)


def qa_check(
    code: FinalQaCheckCode,
    status: CheckStatus,
    detail: str,
    *,
    blocking: bool | None = None,
) -> QaCheckDict:
    definition = FINAL_QA_CHECK_REGISTRY[code]
    return {
        "code": code,
        "label": definition.label,
        "status": status,
        "blocking": definition.blocking,
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
        return qa_check(
            FinalQaCheckCode.DUPLICATE_BULLETS,
            "fail",
            f"Found {len(duplicates)} duplicates: {duplicates[0]}",
        )
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
    known_evidence_ids = {item.id for item in evidence}
    referenced_evidence_ids = {
        evidence_id
        for section in resume.sections
        for bullet in [
            *(section.bullets or []),
            *(bullet for item in (section.items or []) for bullet in item.bullets),
        ]
        for evidence_id in bullet.evidence_ids
    }
    unknown_evidence_ids = sorted(referenced_evidence_ids - known_evidence_ids)

    checks: list[QaCheckDict] = [
        qa_check(FinalQaCheckCode.HAS_SUMMARY, "pass" if has_summary else "fail", "summary"),
        qa_check(FinalQaCheckCode.HAS_EXPERIENCE, "pass" if has_experience else "fail", "experience"),
        qa_check(FinalQaCheckCode.HAS_SKILLS, "pass" if has_skills else "warn", "skills"),
        qa_check(
            FinalQaCheckCode.REQUIRED_SECTIONS,
            "pass" if has_experience else "fail",
            "experience section present" if has_experience else "experience section required",
        ),
        _check_duplicate_bullets(resume),
        qa_check(
            FinalQaCheckCode.EVIDENCE_LINKED,
            "pass" if not violations else "fail",
            ",".join(violations) or "ok",
        ),
        qa_check(
            FinalQaCheckCode.EVIDENCE_REFERENCES,
            "pass" if not unknown_evidence_ids else "fail",
            "valid" if not unknown_evidence_ids else f"Unknown evidence: {', '.join(unknown_evidence_ids)}",
        ),
        qa_check(
            FinalQaCheckCode.TECHNOLOGY_CLAIMS,
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
        _check_primary_tech_emphasis(resume, evidence, grounded_targets),
        qa_check(
            FinalQaCheckCode.CRITICAL_FINDINGS,
            "pass",
            "no unresolved critical findings supplied",
        ),
    ]
    return checks


def _invalid_provider_output(message: str) -> None:
    raise ProviderError(PROVIDER_OUTPUT_INVALID, message)


def authorize_final_qa_response(
    provider_response: FinalQaResponse | dict[str, Any],
    *,
    resume: ResumeDocument,
    evidence: list[EvidenceItem],
    allowed_technologies: list[str] | None = None,
    deterministic_checks: list[DeterministicQaCheck] | None = None,
) -> FinalQaResponse:
    """Validate provider QA and return a server-authoritative merged response."""
    try:
        typed = (
            provider_response
            if isinstance(provider_response, FinalQaResponse)
            else FinalQaResponse.model_validate(provider_response)
        )
    except Exception as exc:
        raise ProviderError(PROVIDER_OUTPUT_INVALID, f"Malformed Final-QA response: {exc}") from exc

    if not typed.checks:
        _invalid_provider_output("Final-QA provider returned no checks")

    provider_codes = [check.code for check in typed.checks]
    if len(provider_codes) != len(set(provider_codes)):
        _invalid_provider_output("Final-QA provider returned duplicate check codes")

    for check in typed.checks:
        definition = FINAL_QA_CHECK_REGISTRY.get(check.code)
        if definition is None:
            if check.blocking and check.status == "fail":
                _invalid_provider_output(f"Unknown blocking Final-QA failure: {check.code}")
            continue
        if check.blocking != definition.blocking:
            _invalid_provider_output(
                f"Provider changed blocking status for {check.code.value}"
            )

    missing = REQUIRED_FINAL_QA_CODES - set(provider_codes)
    if missing:
        _invalid_provider_output(
            f"Final-QA provider omitted required checks: {', '.join(sorted(code.value for code in missing))}"
        )

    authoritative = {
        check["code"]: check
        for check in run_deterministic_checks(
            resume,
            evidence,
            allowed_technologies,
        )
    }
    for item in deterministic_checks or []:
        status: CheckStatus = "fail"
        if item.status == "pass":
            status = "pass"
        elif item.status in {"warn", "warning"}:
            status = "warn"
        definition = FINAL_QA_CHECK_REGISTRY[item.code]
        authoritative[item.code] = qa_check(
            item.code,
            status,
            item.detail or definition.label,
            blocking=definition.blocking,
        )

    # Test-only mock hook: keep V4 failing Primary technology emphasis until repair
    # rewrites the lead. Applied here so authority cannot wipe the forced failure.
    force = os.environ.get("CANDIDARC_MOCK_FINAL_QA_FORCE", "").strip().lower()
    if force == "fail_until_repair":
        primary_tech: str | None = None
        evidence_techs = [t.lower() for item in evidence for t in item.technologies]
        if evidence_techs:
            primary_tech = evidence_techs[0]
        version = getattr(resume, "version_number", None)
        if version is None:
            version = getattr(resume, "absolute_version", None)
        condition_fixed = False
        if primary_tech:
            for section in resume.sections:
                if section.type in {"summary", "skills"} and section.bullets:
                    lead_text = section.bullets[0].text.lower()[:80]
                    lead_techs = [t.lower() for t in section.bullets[0].technologies]
                    if primary_tech in lead_text or primary_tech in lead_techs:
                        condition_fixed = True
                        break
        force_fail = version == 4 or (version is not None and version > 4 and not condition_fixed)
        if force_fail:
            authoritative[FinalQaCheckCode.PRIMARY_TECHNOLOGY_EMPHASIS] = qa_check(
                FinalQaCheckCode.PRIMARY_TECHNOLOGY_EMPHASIS,
                "fail",
                f"Lead with grounded primary technology from evidence ({primary_tech or 'none'})",
            )

    provider_by_code = {item.code: item for item in typed.checks}
    merged: list[FinalQaCheck] = []
    for _code, auth_check in authoritative.items():
        provider_check = provider_by_code.get(_code)
        detail = auth_check["detail"]
        if provider_check is not None and provider_check.detail and provider_check.detail != detail:
            detail = f"{detail} | provider: {provider_check.detail}"[:2_000]
        merged.append(
            FinalQaCheck(
                code=auth_check["code"],
                label=auth_check["label"],
                status=auth_check["status"],
                blocking=auth_check["blocking"],
                detail=detail,
            )
        )

    for provider_item in typed.checks:
        if provider_item.code in authoritative:
            continue
        definition = FINAL_QA_CHECK_REGISTRY[provider_item.code]
        merged.append(
            provider_item.model_copy(
                update={
                    "label": definition.label,
                    "blocking": definition.blocking,
                }
            )
        )

    passed = not any(check.blocking and check.status == "fail" for check in merged)
    if typed.passed and not passed:
        _invalid_provider_output("Provider reported passed=true while an authoritative blocking check failed")

    return typed.model_copy(update={"passed": passed, "checks": merged})


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
