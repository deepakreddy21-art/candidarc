"""Explainable resume scoring — content-derived, never version-inflated."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.domain.schemas import (
    SCORE_RUBRIC_VERSION,
    EvidenceItem,
    ResumeDocument,
    ResumeSection,
    ScoreBreakdown,
)

METRIC_RE = re.compile(
    r"(\d+(?:\.\d+)?\s*%|\$\s?\d[\d,]*(?:\.\d+)?|\b\d{2,}\b|\b(?:increased|reduced|improved|cut|grew)\b)",
    re.I,
)
WORD_RE = re.compile(r"[A-Za-z]{3,}")


@dataclass(frozen=True)
class ScoredResume:
    score: float
    breakdown: ScoreBreakdown
    explanations: dict[str, str]
    rubric_version: str = SCORE_RUBRIC_VERSION


def _clamp(value: float) -> float:
    return float(max(0, min(100, round(value, 1))))


def _all_bullets(sections: list[ResumeSection]) -> list[str]:
    texts: list[str] = []
    for section in sections:
        if section.content:
            texts.append(section.content)
        for bullet in section.bullets or []:
            texts.append(bullet.text)
        for item in section.items or []:
            for bullet in item.bullets:
                texts.append(bullet.text)
    return texts


def _collect_techs(sections: list[ResumeSection]) -> set[str]:
    techs: set[str] = set()
    for section in sections:
        for bullet in section.bullets or []:
            techs.update(t.lower() for t in bullet.technologies)
        for item in section.items or []:
            for bullet in item.bullets:
                techs.update(t.lower() for t in bullet.technologies)
    return techs


def _evidence_blob(evidence: list[EvidenceItem]) -> str:
    parts: list[str] = []
    for item in evidence:
        parts.extend(
            [
                item.title,
                item.organization or "",
                item.claim_text or "",
                item.situation or "",
                item.result or "",
                " ".join(item.metrics),
                " ".join(item.technologies),
            ]
        )
    return " ".join(parts).lower()


def score_resume(
    *,
    sections: list[ResumeSection],
    evidence: list[EvidenceItem],
    job_description: str = "",
    job_requirements: list[str] | None = None,
    notes: str = "",
) -> ScoredResume:
    """Compute bounded 0-100 scores from content only.

    Absolute version / cycle_step are intentionally unused — changing only those
    fields must not change the score for identical resume content.
    """
    _ = notes  # notes may describe generation path; not a score input
    bullets = _all_bullets(sections)
    blob = " ".join(bullets).lower()
    evidence_blob = _evidence_blob(evidence)
    evidence_ids = {item.id for item in evidence}
    reqs = [r.lower() for r in (job_requirements or []) if r.strip()]
    if not reqs and job_description:
        reqs = [tok for tok in WORD_RE.findall(job_description.lower()) if len(tok) > 4][:40]

    # --- dimension calculations ------------------------------------------------
    section_types = {s.type for s in sections}
    format_integrity = 40.0
    format_integrity += 15 if "summary" in section_types else 0
    format_integrity += 20 if "experience" in section_types else 0
    format_integrity += 15 if "skills" in section_types else 0
    format_integrity += 10 if "education" in section_types else 0
    format_explanations = (
        f"Sections present: {', '.join(sorted(section_types)) or 'none'}; "
        f"formatIntegrity reflects structural completeness only."
    )

    linked = 0
    total_bullets = 0
    for section in sections:
        for bullet in list(section.bullets or []) + [b for item in section.items or [] for b in item.bullets]:
            total_bullets += 1
            if bullet.evidence_ids and all(eid in evidence_ids for eid in bullet.evidence_ids):
                linked += 1
    evidence_confidence = 35.0 if not evidence else 45.0 + 55.0 * (linked / max(total_bullets, 1))
    evidence_expl = f"{linked}/{max(total_bullets, 1)} bullets cite in-scope evidence IDs."

    techs = _collect_techs(sections)
    evidence_techs = {t.lower() for item in evidence for t in item.technologies}
    tech_overlap = len(techs & evidence_techs) / max(len(techs) or 1, 1)
    technical_depth = 40.0 + 50.0 * tech_overlap + min(10.0, 2.0 * len(techs))
    technical_expl = f"{len(techs)} listed technologies; {tech_overlap:.0%} overlap with evidence."

    metric_hits = len(METRIC_RE.findall(blob))
    quantification = 35.0 + min(55.0, metric_hits * 12.0)
    quantification_expl = f"Detected {metric_hits} quantification markers in bullet text."

    impact_markers = len(re.findall(r"\b(led|owned|shipped|delivered|launched|reduced|increased|improved)\b", blob))
    impact = 40.0 + min(50.0, impact_markers * 8.0)
    impact_expl = f"Detected {impact_markers} impact/ownership verbs."

    matched_reqs = 0
    for req in reqs[:30]:
        tokens = [t for t in WORD_RE.findall(req) if len(t) > 3]
        if tokens and any(tok in blob or tok in evidence_blob for tok in tokens):
            matched_reqs += 1
    job_alignment = 30.0 if not reqs else 35.0 + 65.0 * (matched_reqs / max(len(reqs[:30]), 1))
    job_expl = f"Aligned to {matched_reqs}/{min(len(reqs), 30)} job requirement tokens from JD/requirements."

    avg_len = (sum(len(b.split()) for b in bullets) / max(len(bullets), 1)) if bullets else 0
    readability = 45.0
    if 8 <= avg_len <= 32:
        readability += 35.0
    elif avg_len > 0:
        readability += 15.0
    readability += 10 if len(bullets) >= 3 else 0
    readability_expl = f"Average bullet length {avg_len:.1f} words across {len(bullets)} bullets."

    competency_coverage = 35.0 + min(40.0, len(techs) * 5.0) + min(20.0, matched_reqs * 4.0)
    competency_expl = "Coverage blends evidenced technologies and matched requirements."

    writing_quality = 50.0
    if bullets and not any(len(b) > 400 for b in bullets):
        writing_quality += 20.0
    if "  " not in blob:
        writing_quality += 10.0
    writing_quality += min(15.0, len(bullets) * 2.0)
    writing_expl = "Writing quality from length discipline and bullet density (no LLM style scoring)."

    ats = 50.0
    ats += 15 if "skills" in section_types else 0
    ats += 15 if "experience" in section_types else 0
    ats -= 20 if re.search(r"white-space\s*:\s*none|font-size\s*:\s*0|display\s*:\s*none", blob) else 0
    ats_expl = "ATS compatibility from standard section presence and absence of hidden-text markers."

    breakdown = ScoreBreakdown(
        atsCompatibility=_clamp(ats),
        jobAlignment=_clamp(job_alignment),
        recruiterReadability=_clamp(readability),
        impact=_clamp(impact),
        quantification=_clamp(quantification),
        technicalDepth=_clamp(technical_depth),
        competencyCoverage=_clamp(competency_coverage),
        evidenceConfidence=_clamp(evidence_confidence),
        writingQuality=_clamp(writing_quality),
        formatIntegrity=_clamp(format_integrity),
    )
    values = list(breakdown.model_dump().values())
    overall = _clamp(sum(values) / len(values))
    explanations = {
        "atsCompatibility": ats_expl,
        "jobAlignment": job_expl,
        "recruiterReadability": readability_expl,
        "impact": impact_expl,
        "quantification": quantification_expl,
        "technicalDepth": technical_expl,
        "competencyCoverage": competency_expl,
        "evidenceConfidence": evidence_expl,
        "writingQuality": writing_expl,
        "formatIntegrity": format_explanations,
        "overall": f"Mean of ten rubric dimensions; rubric {SCORE_RUBRIC_VERSION}.",
    }
    return ScoredResume(score=overall, breakdown=breakdown, explanations=explanations)


def score_document(
    resume: ResumeDocument,
    *,
    evidence: list[EvidenceItem],
    job_description: str = "",
    job_requirements: list[str] | None = None,
) -> ScoredResume:
    return score_resume(
        sections=resume.sections,
        evidence=evidence,
        job_description=job_description,
        job_requirements=job_requirements,
        notes=resume.notes,
    )
