"""Claim-atom extraction and evidence-grounded guardrails."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.domain.schemas import EvidenceItem, ResumeBullet, ResumeDocument, ResumeSection
from app.modules.scoring.service import score_resume

PERCENT_RE = re.compile(r"\b\d+(?:\.\d+)?\s*%")
DOLLAR_RE = re.compile(r"\$\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:k|m|b|million|billion))?", re.I)
NUMBER_RE = re.compile(r"\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+\.\d+\b|\b\d{2,}\b")
DATE_RE = re.compile(
    r"\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|"
    r"sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}\b|\b\d{4}\s*[–-]\s*(?:\d{4}|present)\b|"
    r"\bpresent\b",
    re.I,
)
TEAM_SIZE_RE = re.compile(r"\b(?:team of|led a team of|managed)\s+\d+\b|\b\d+\s*(?:engineers|people|members)\b", re.I)
OWNERSHIP_INDIVIDUAL_RE = re.compile(r"\b(?:i built|i designed|i owned|i created|solely|single-handedly)\b", re.I)
OWNERSHIP_TEAM_RE = re.compile(r"\b(?:we built|our team|collaborated|as a team|team delivered)\b", re.I)
ATS_MARKERS = (
    "white-space:none",
    "font-size:0",
    "display:none",
    "color:#ffffff",
    "color:white",
    "opacity:0",
)
INJECTION_MARKERS = (
    "ignore previous instructions",
    "ignore all previous",
    "disregard system prompt",
    "you are now",
    "system: ",
    "developer message",
)

KNOWN_TECH_HINTS = (
    "python",
    "pytorch",
    "tensorflow",
    "fastapi",
    "django",
    "flask",
    "aws",
    "gcp",
    "azure",
    "docker",
    "kubernetes",
    "react",
    "typescript",
    "javascript",
    "java",
    "golang",
    "rust",
    "opensearch",
    "elasticsearch",
    "postgres",
    "postgresql",
    "mongodb",
    "redis",
    "kafka",
    "spark",
    "hadoop",
    "jax",
    "tpu",
    "vllm",
    "ray",
    "trainium",
    "triton",
    "langchain",
    "langgraph",
    "huggingface",
    "faiss",
    "rag",
    "figma",
    "sketch",
    "css",
    "html",
    "next.js",
    "node.js",
)


@dataclass
class ClaimAtoms:
    percentages: list[str] = field(default_factory=list)
    dollars: list[str] = field(default_factory=list)
    numbers: list[str] = field(default_factory=list)
    dates: list[str] = field(default_factory=list)
    team_sizes: list[str] = field(default_factory=list)
    technologies: list[str] = field(default_factory=list)
    orgs: list[str] = field(default_factory=list)
    individual_ownership: bool = False
    team_ownership: bool = False


def extract_claim_atoms(text: str, explicit_techs: list[str] | None = None) -> ClaimAtoms:
    lower = text.lower()
    techs = [t for t in (explicit_techs or []) if t]
    for hint in KNOWN_TECH_HINTS:
        if re.search(rf"\b{re.escape(hint)}\b", lower):
            techs.append(hint)
    # Heuristic org tokens: Capitalized multi-word before colon or employment verbs
    orgs = re.findall(r"\b([A-Z][A-Za-z0-9&.\-]+(?:\s+[A-Z][A-Za-z0-9&.\-]+){0,3})\b", text)
    return ClaimAtoms(
        percentages=PERCENT_RE.findall(text),
        dollars=DOLLAR_RE.findall(text),
        numbers=NUMBER_RE.findall(text),
        dates=DATE_RE.findall(text),
        team_sizes=TEAM_SIZE_RE.findall(text),
        technologies=sorted({t.lower() for t in techs}),
        orgs=[o for o in orgs if o.lower() not in {"january", "february", "march", "april", "present"}],
        individual_ownership=bool(OWNERSHIP_INDIVIDUAL_RE.search(text)),
        team_ownership=bool(OWNERSHIP_TEAM_RE.search(text)),
    )


def _norm_tech(value: str) -> str:
    return value.strip().lower()


def collect_allowed_technologies(evidence: list[EvidenceItem], attested: list[str] | None = None) -> set[str]:
    allowed = {_norm_tech(tech) for item in evidence for tech in item.technologies}
    for tech in attested or []:
        allowed.add(_norm_tech(tech))
    return {tech for tech in allowed if tech}


def _evidence_corpus(items: list[EvidenceItem]) -> str:
    parts: list[str] = []
    for item in items:
        parts.extend(
            [
                item.title,
                item.organization or "",
                item.employer_association or "",
                item.claim_text or "",
                item.situation or "",
                item.task or "",
                item.result or "",
                " ".join(item.actions),
                " ".join(item.metrics),
                " ".join(item.technologies),
            ]
        )
    return " ".join(parts).lower()


def _cited_evidence(bullet: ResumeBullet, evidence_by_id: dict[str, EvidenceItem]) -> list[EvidenceItem]:
    return [evidence_by_id[eid] for eid in bullet.evidence_ids if eid in evidence_by_id]


def detect_jd_injection(job_description: str) -> list[str]:
    lower = job_description.lower()
    return [f"JD_INJECTION:{marker}" for marker in INJECTION_MARKERS if marker in lower]


def validate_resume_claims(
    resume: ResumeDocument,
    evidence: list[EvidenceItem],
    allowed_technologies: list[str] | None = None,
    *,
    tenant_id: str | None = None,
    owner_user_id: str | None = None,
    research_technologies: list[str] | None = None,
    job_description: str | None = None,
) -> list[str]:
    """Deterministic claim checks. Returns machine-readable violation codes."""
    violations: list[str] = []
    evidence_ids = {item.id for item in evidence}
    evidence_by_id = {item.id: item for item in evidence}
    allowed = collect_allowed_technologies(evidence, allowed_technologies)
    research_techs = {_norm_tech(t) for t in (research_technologies or [])}
    evidence_orgs = {
        (item.organization or item.employer_association or "").lower()
        for item in evidence
        if item.organization or item.employer_association
    }

    if tenant_id is not None:
        for item in evidence:
            if item.tenant_id != tenant_id:
                violations.append("CROSS_TENANT_EVIDENCE")
            if owner_user_id is not None and item.owner_user_id != owner_user_id:
                violations.append("CROSS_OWNER_EVIDENCE")

    # JD injection markers are untrusted context only — never execute, but do not
    # fail generation solely because the JD contains adversarial instructions.
    _ = job_description

    for section in resume.sections:
        bullets = list(section.bullets or [])
        for resume_item in section.items or []:
            bullets.extend(resume_item.bullets)
        for bullet in bullets:
            if not bullet.evidence_ids:
                violations.append("MISSING_EVIDENCE_IDS")
                continue
            for evidence_id in bullet.evidence_ids:
                if evidence_id not in evidence_ids:
                    violations.append("UNKNOWN_EVIDENCE_ID")
            cited = _cited_evidence(bullet, evidence_by_id)
            corpus = _evidence_corpus(cited) if cited else ""
            atoms = extract_claim_atoms(bullet.text, bullet.technologies)

            for tech in atoms.technologies:
                if tech not in allowed:
                    violations.append("UNSUPPORTED_TECHNOLOGY")
                if tech in research_techs and tech not in allowed:
                    violations.append("RESEARCH_TECH_AS_CLAIM")

            for pct in atoms.percentages:
                if pct.lower().replace(" ", "") not in corpus.replace(" ", ""):
                    # Also accept bare number presence in evidence metrics
                    bare = re.sub(r"[^\d.]", "", pct)
                    if bare and bare not in corpus:
                        violations.append("UNSUPPORTED_PERCENT")

            for dollar in atoms.dollars:
                digits = re.sub(r"[^\d]", "", dollar)
                if digits and digits not in re.sub(r"[^\d]", "", corpus):
                    violations.append("UNSUPPORTED_DOLLAR")

            for team in atoms.team_sizes:
                digits = re.sub(r"\D", "", team)
                if digits and digits not in corpus:
                    violations.append("UNSUPPORTED_TEAM_SIZE")

            for date in atoms.dates:
                if date.lower() not in corpus and not any(tok in corpus for tok in date.lower().split()):
                    violations.append("UNSUPPORTED_DATE")

            for org in atoms.orgs:
                org_l = org.lower()
                if evidence_orgs and org_l not in corpus and not any(org_l in eo or eo in org_l for eo in evidence_orgs if eo):
                    # Only flag when resume introduces a novel employer-like token not in cited evidence
                    if len(org.split()) >= 2 and org_l not in corpus:
                        violations.append("UNSUPPORTED_COMPANY")

            # Team→individual ownership conversion
            if atoms.individual_ownership:
                if any(OWNERSHIP_TEAM_RE.search(_evidence_corpus([e])) for e in cited) and not any(
                    OWNERSHIP_INDIVIDUAL_RE.search(_evidence_corpus([e])) for e in cited
                ):
                    violations.append("TEAM_TO_INDIVIDUAL_OWNERSHIP")

            lower = bullet.text.lower()
            if "company research" in lower or "according to the job description we used" in lower:
                violations.append("RESEARCH_LEAKED_INTO_CLAIM")
            if any(marker in lower for marker in ATS_MARKERS):
                violations.append("ATS_MANIPULATION")

    return sorted(set(violations))


def adjudicate_finding(
    finding_suggested_text: str,
    evidence: list[EvidenceItem],
    allowed_technologies: list[str] | None = None,
    *,
    evidence_ids: list[str] | None = None,
    tenant_id: str | None = None,
    owner_user_id: str | None = None,
) -> tuple[bool, str]:
    """Return (accepted, reason). Factual additions without evidence are rejected."""
    allowed = collect_allowed_technologies(evidence, allowed_technologies)
    suggested_lower = finding_suggested_text.lower()
    evidence_by_id = {item.id: item for item in evidence}

    if tenant_id is not None:
        for item in evidence:
            if item.tenant_id != tenant_id:
                return False, "CROSS_TENANT_EVIDENCE"
            if owner_user_id is not None and item.owner_user_id != owner_user_id:
                return False, "CROSS_OWNER_EVIDENCE"

    if evidence_ids:
        for eid in evidence_ids:
            if eid not in evidence_by_id:
                return False, "UNKNOWN_EVIDENCE_ID"

    scoped = [evidence_by_id[eid] for eid in (evidence_ids or []) if eid in evidence_by_id] or evidence
    corpus = _evidence_corpus(scoped)

    for tech in KNOWN_TECH_HINTS:
        if re.search(rf"\b{re.escape(tech)}\b", suggested_lower) and tech not in allowed:
            return False, "UNSUPPORTED_TECHNOLOGY"

    if any(marker in suggested_lower for marker in ATS_MARKERS):
        return False, "ATS_MANIPULATION"

    atoms = extract_claim_atoms(finding_suggested_text)
    for pct in atoms.percentages:
        bare = re.sub(r"[^\d.]", "", pct)
        if bare and bare not in corpus:
            return False, "UNSUPPORTED_PERCENT"
    for dollar in atoms.dollars:
        digits = re.sub(r"[^\d]", "", dollar)
        if digits and digits not in re.sub(r"[^\d]", "", corpus):
            return False, "UNSUPPORTED_DOLLAR"
    for team in atoms.team_sizes:
        digits = re.sub(r"\D", "", team)
        if digits and digits not in corpus:
            return False, "UNSUPPORTED_TEAM_SIZE"

    if atoms.individual_ownership:
        if OWNERSHIP_TEAM_RE.search(corpus) and not OWNERSHIP_INDIVIDUAL_RE.search(corpus):
            return False, "TEAM_TO_INDIVIDUAL_OWNERSHIP"

    return True, "OK"


def build_grounded_resume(
    *,
    absolute_version: int,
    cycle_step: int,
    evidence: list[EvidenceItem],
    allowed_technologies: list[str] | None = None,
    notes: str,
    job_description: str = "",
    job_requirements: list[str] | None = None,
) -> ResumeDocument:
    """Build an evidence-grounded resume; scores are calculated, never version-inflated."""
    allowed = collect_allowed_technologies(evidence, allowed_technologies)

    if not evidence:
        sections = [
            ResumeSection(
                type="summary",
                title="Professional Summary",
                order=0,
                content="Profile pending verified career evidence.",
            )
        ]
        scored = score_resume(
            sections=sections,
            evidence=[],
            job_description=job_description,
            job_requirements=job_requirements,
            notes=notes,
        )
        return ResumeDocument(
            absolute_version=absolute_version,
            cycle_step=cycle_step,
            version_number=absolute_version,
            score=scored.score,
            score_breakdown=scored.breakdown,
            score_rubric_version=scored.rubric_version,
            score_explanations=scored.explanations,
            notes="Awaiting owned career evidence before making evidenced claims.",
            sections=sections,
        )

    first = evidence[0]
    tech_list = sorted({tech for item in evidence for tech in item.technologies if _norm_tech(tech) in allowed})[:12]
    employment = [item for item in evidence if (item.source_type or "").lower() in {"employment", "metric", "leadership"}]
    education = [item for item in evidence if (item.source_type or "").lower() == "education"]
    jd_lower = job_description.lower()
    reqs = list(job_requirements or [])

    # JD-aware emphasis (still evidence-grounded)
    is_ux = any(tok in jd_lower for tok in ("ux", "design", "figma", "user research", "product design", "interface"))
    is_backend = any(tok in jd_lower for tok in ("backend", "api", "platform", "distributed", "infrastructure", "python", "pytorch"))

    def matched_for(item: EvidenceItem) -> list[str]:
        matched: list[str] = []
        blob = " ".join(
            [
                item.claim_text or "",
                item.title,
                " ".join(item.technologies),
                item.result or "",
            ]
        ).lower()
        for req in reqs[:20]:
            tokens = [t for t in re.findall(r"[A-Za-z]{4,}", req.lower())]
            if tokens and any(tok in blob for tok in tokens):
                matched.append(req[:200])
        if not matched and is_ux and any(t.lower() in {"figma", "css", "html", "react"} for t in item.technologies):
            matched.append("UX / interface craft grounded in evidenced tools")
        if not matched and is_backend and any(t.lower() in {"python", "pytorch", "aws", "fastapi"} for t in item.technologies):
            matched.append("Backend / platform delivery grounded in evidenced stack")
        return matched[:5]

    def bullet_from(item: EvidenceItem, *, emphasis: str | None = None) -> ResumeBullet:
        claim = item.claim_text or item.situation or item.title
        org = item.organization or item.employer_association or ""
        text = f"{org}: {claim}" if org and org not in claim else claim
        if emphasis and emphasis not in text:
            text = f"{text} — {emphasis}"
        techs = [t for t in item.technologies if _norm_tech(t) in allowed][:4]
        return ResumeBullet(
            text=text[:3900],
            evidence_ids=[item.id],
            matched_requirements=matched_for(item),
            technologies=techs,
            confidence=item.confidence,
            claim_risk="low",
            source_version="career-evidence" if absolute_version == 0 else f"V{max(absolute_version - 1, 0)}",
        )

    summary_bits: list[str] = []
    if is_ux:
        summary_bits.append("Product-minded engineer emphasizing evidenced interface and user-facing delivery")
    elif is_backend:
        summary_bits.append("Platform-focused engineer emphasizing evidenced backend systems and reliability")
    else:
        summary_bits.append("Engineer with experience grounded in the supplied career evidence")
    if tech_list:
        summary_bits.append(f"Stack includes {', '.join(tech_list[:4])}")

    experience_source = employment or evidence[:3]
    experience_bullets = [
        bullet_from(
            item,
            emphasis=("UX-aligned delivery" if is_ux else "Platform reliability focus" if is_backend else None),
        )
        for item in experience_source
    ]
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

    skills_text = " · ".join(tech_list) if tech_list else "Skills pending attested technologies"
    sections = [
        ResumeSection(
            type="summary",
            title="Professional Summary",
            order=0,
            bullets=[
                ResumeBullet(
                    text=". ".join(summary_bits)[:3900],
                    evidence_ids=[first.id],
                    matched_requirements=reqs[:3],
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
                    text=skills_text,
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
    ]

    scored = score_resume(
        sections=sections,
        evidence=evidence,
        job_description=job_description,
        job_requirements=job_requirements or reqs,
        notes=notes,
    )
    return ResumeDocument(
        absolute_version=absolute_version,
        cycle_step=cycle_step,
        version_number=absolute_version,
        score=scored.score,
        score_breakdown=scored.breakdown,
        score_rubric_version=scored.rubric_version,
        score_explanations=scored.explanations,
        notes=notes,
        sections=sections,
    )
