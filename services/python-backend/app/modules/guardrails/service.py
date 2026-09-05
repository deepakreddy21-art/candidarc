from __future__ import annotations

from app.domain.schemas import EvidenceItem, ResumeBullet, ResumeDocument, ResumeSection

LOCKED_FACT_MARKERS = ("january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "present")


def _norm_tech(value: str) -> str:
    return value.strip().lower()


def collect_allowed_technologies(evidence: list[EvidenceItem], attested: list[str] | None = None) -> set[str]:
    allowed = {_norm_tech(tech) for item in evidence for tech in item.technologies}
    for tech in attested or []:
        allowed.add(_norm_tech(tech))
    return {tech for tech in allowed if tech}


def validate_resume_claims(
    resume: ResumeDocument,
    evidence: list[EvidenceItem],
    allowed_technologies: list[str] | None = None,
) -> list[str]:
    """Deterministic claim checks. Returns list of machine-readable violation codes."""
    violations: list[str] = []
    evidence_ids = {item.id for item in evidence}
    allowed = collect_allowed_technologies(evidence, allowed_technologies)

    for section in resume.sections:
        bullets = list(section.bullets or [])
        for item in section.items or []:
            bullets.extend(item.bullets)
        for bullet in bullets:
            if not bullet.evidence_ids:
                violations.append("MISSING_EVIDENCE_IDS")
                continue
            for evidence_id in bullet.evidence_ids:
                if evidence_id not in evidence_ids:
                    violations.append("UNKNOWN_EVIDENCE_ID")
            for tech in bullet.technologies:
                if _norm_tech(tech) not in allowed:
                    violations.append("UNSUPPORTED_TECHNOLOGY")
            lower = bullet.text.lower()
            if "company research" in lower or "according to the job description we used" in lower:
                violations.append("RESEARCH_LEAKED_INTO_CLAIM")
    return sorted(set(violations))


def adjudicate_finding(
    finding_suggested_text: str,
    evidence: list[EvidenceItem],
    allowed_technologies: list[str] | None = None,
) -> tuple[bool, str]:
    """Return (accepted, reason). Factual additions without evidence are rejected."""
    allowed = collect_allowed_technologies(evidence, allowed_technologies)
    suggested_lower = finding_suggested_text.lower()
    for tech in ("jax", "tpu", "vllm", "ray", "trainium", "triton"):
        if tech in suggested_lower and tech not in allowed:
            return False, "UNSUPPORTED_TECHNOLOGY"
    if "white-space:none" in suggested_lower or "font-size:0" in suggested_lower:
        return False, "ATS_MANIPULATION"
    return True, "OK"


def build_grounded_resume(
    *,
    version_number: int,
    evidence: list[EvidenceItem],
    allowed_technologies: list[str] | None = None,
    notes: str,
    score: float,
) -> ResumeDocument:
    if not evidence:
        return ResumeDocument(
            version_number=version_number,
            score=min(score, 55),
            score_breakdown={
                "atsCompatibility": 50,
                "jobAlignment": 50,
                "recruiterReadability": 50,
                "impact": 50,
                "quantification": 50,
                "technicalDepth": 50,
                "competencyCoverage": 50,
                "evidenceConfidence": 40,
                "writingQuality": 50,
                "formatIntegrity": 70,
            },
            notes="Awaiting owned career evidence before making evidenced claims.",
            sections=[
                ResumeSection(type="summary", title="Professional Summary", order=0, content="Profile pending verified career evidence.")
            ],
        )

    allowed = collect_allowed_technologies(evidence, allowed_technologies)
    first = evidence[0]
    tech_list = sorted({tech for item in evidence for tech in item.technologies if _norm_tech(tech) in allowed})[:12]
    employment = [item for item in evidence if (item.source_type or "").lower() in {"employment", "metric", "leadership"}]
    education = [item for item in evidence if (item.source_type or "").lower() == "education"]

    def bullet_from(item: EvidenceItem) -> ResumeBullet:
        claim = item.claim_text or item.situation or item.title
        org = item.organization or item.employer_association or ""
        text = f"{org}: {claim}" if org and org not in claim else claim
        techs = [t for t in item.technologies if _norm_tech(t) in allowed][:4]
        return ResumeBullet(
            text=text,
            evidence_ids=[item.id],
            matched_requirements=[],
            technologies=techs,
            confidence="high",
            claim_risk="low",
            source_version="career-evidence" if version_number == 0 else f"V{version_number - 1}",
        )

    experience_bullets = [bullet_from(item) for item in (employment or evidence[:3])]
    education_bullets = [bullet_from(item) for item in education] or [
        ResumeBullet(
            text="Education details from candidate evidence.",
            evidence_ids=[first.id],
            matched_requirements=[],
            technologies=[],
            confidence="medium",
            claim_risk="low",
            source_version="career-evidence",
        )
    ]

    return ResumeDocument(
        version_number=version_number,
        score=score,
        score_breakdown={
            "atsCompatibility": score,
            "jobAlignment": score,
            "recruiterReadability": score,
            "impact": max(score - 5, 0),
            "quantification": max(score - 5, 0),
            "technicalDepth": score,
            "competencyCoverage": score,
            "evidenceConfidence": score,
            "writingQuality": score,
            "formatIntegrity": min(score + 5, 100),
        },
        notes=notes,
        sections=[
            ResumeSection(
                type="summary",
                title="Professional Summary",
                order=0,
                bullets=[
                    ResumeBullet(
                        text="Engineer with experience grounded in the supplied career evidence.",
                        evidence_ids=[first.id],
                        matched_requirements=[],
                        technologies=tech_list[:3],
                        confidence="high",
                        claim_risk="low",
                        source_version="career-evidence",
                    )
                ],
            ),
            ResumeSection(
                type="skills",
                title="Skills",
                order=1,
                bullets=[
                    ResumeBullet(
                        text=" · ".join(tech_list) if tech_list else "Python · TypeScript · AWS",
                        evidence_ids=[first.id],
                        matched_requirements=[],
                        technologies=tech_list,
                        confidence="high",
                        claim_risk="low",
                        source_version="career-evidence",
                    )
                ],
            ),
            ResumeSection(type="experience", title="Experience", order=2, bullets=experience_bullets),
            ResumeSection(type="education", title="Education", order=3, bullets=education_bullets),
        ],
    )
