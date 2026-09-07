"""Server-owned metadata for every Final-QA check code."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType

from app.domain.schemas import FINAL_QA_LABEL_BY_CODE, FinalQaCheckCode


@dataclass(frozen=True)
class FinalQaCheckDefinition:
    label: str
    blocking: bool
    repairable: bool
    required: bool


def _definition(
    code: FinalQaCheckCode,
    *,
    blocking: bool,
    repairable: bool = False,
    required: bool = False,
) -> FinalQaCheckDefinition:
    return FinalQaCheckDefinition(
        label=FINAL_QA_LABEL_BY_CODE[code],
        blocking=blocking,
        repairable=repairable,
        required=required,
    )


FINAL_QA_CHECK_REGISTRY: Mapping[FinalQaCheckCode, FinalQaCheckDefinition] = MappingProxyType({
    FinalQaCheckCode.PRIMARY_TECHNOLOGY_EMPHASIS: _definition(
        FinalQaCheckCode.PRIMARY_TECHNOLOGY_EMPHASIS, blocking=True, repairable=True, required=True
    ),
    FinalQaCheckCode.HAS_SUMMARY: _definition(
        FinalQaCheckCode.HAS_SUMMARY, blocking=True, repairable=True, required=True
    ),
    FinalQaCheckCode.HAS_SKILLS: _definition(
        FinalQaCheckCode.HAS_SKILLS, blocking=False, repairable=True
    ),
    FinalQaCheckCode.HAS_EXPERIENCE: _definition(
        FinalQaCheckCode.HAS_EXPERIENCE, blocking=True, required=True
    ),
    FinalQaCheckCode.DUPLICATE_BULLETS: _definition(
        FinalQaCheckCode.DUPLICATE_BULLETS, blocking=True, repairable=True, required=True
    ),
    FinalQaCheckCode.REQUIRED_SECTIONS: _definition(
        FinalQaCheckCode.REQUIRED_SECTIONS, blocking=True, required=True
    ),
    FinalQaCheckCode.ATS_FORMAT: _definition(FinalQaCheckCode.ATS_FORMAT, blocking=True, repairable=True),
    FinalQaCheckCode.LENGTH_REDUCE: _definition(
        FinalQaCheckCode.LENGTH_REDUCE, blocking=True, repairable=True
    ),
    FinalQaCheckCode.UNSUPPORTED_CLAIM: _definition(
        FinalQaCheckCode.UNSUPPORTED_CLAIM, blocking=True, repairable=True
    ),
    FinalQaCheckCode.EVIDENCE_LINKED: _definition(
        FinalQaCheckCode.EVIDENCE_LINKED, blocking=True, required=True
    ),
    FinalQaCheckCode.TECHNOLOGY_CLAIMS: _definition(
        FinalQaCheckCode.TECHNOLOGY_CLAIMS, blocking=True, repairable=True, required=True
    ),
    FinalQaCheckCode.SCORE_RUBRIC_PRESENT: _definition(
        FinalQaCheckCode.SCORE_RUBRIC_PRESENT, blocking=True, required=True
    ),
    FinalQaCheckCode.SECTION_COUNT: _definition(FinalQaCheckCode.SECTION_COUNT, blocking=False),
    FinalQaCheckCode.CRITICAL_FINDINGS: _definition(
        FinalQaCheckCode.CRITICAL_FINDINGS, blocking=True, required=True
    ),
    FinalQaCheckCode.EVIDENCE_REFERENCES: _definition(
        FinalQaCheckCode.EVIDENCE_REFERENCES, blocking=True, required=True
    ),
    FinalQaCheckCode.EDUCATION: _definition(FinalQaCheckCode.EDUCATION, blocking=False),
    FinalQaCheckCode.CONTACT_INFORMATION: _definition(
        FinalQaCheckCode.CONTACT_INFORMATION, blocking=False
    ),
    FinalQaCheckCode.CHRONOLOGY: _definition(FinalQaCheckCode.CHRONOLOGY, blocking=False),
    FinalQaCheckCode.PAGE_LENGTH: _definition(FinalQaCheckCode.PAGE_LENGTH, blocking=False),
    FinalQaCheckCode.UNKNOWN: _definition(FinalQaCheckCode.UNKNOWN, blocking=False),
})

REQUIRED_FINAL_QA_CODES = frozenset(
    code for code, definition in FINAL_QA_CHECK_REGISTRY.items() if definition.required
)
