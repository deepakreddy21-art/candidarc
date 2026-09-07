"""Claim-atom extraction and evidence-grounded guardrails."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.core.metrics import METRICS, UNSUPPORTED_CLAIMS_BLOCKED
from app.domain.schemas import (
    ClaimSourceKind,
    EvidenceItem,
    ResearchFinding,
    ResumeBullet,
    ResumeDocument,
    ResumeSection,
    UserConfirmation,
)
from app.modules.scoring.service import score_resume

PERCENT_RE = re.compile(r"\b\d+(?:\.\d+)?\s*%")
DOLLAR_RE = re.compile(r"\$\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:k|m|b|million|billion))?", re.I)
# Multi-digit numbers (10+), decimal numbers, or comma-formatted numbers
NUMBER_RE = re.compile(r"\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+\.\d+\b|\b\d{2,}\b")
# Single-digit metrics when followed by metric-context words (e.g., "9 platforms", "5 engineers")
SINGLE_DIGIT_METRIC_RE = re.compile(
    r"\b([1-9])\s+(?:platform|platforms|engineer|engineers|people|users|customers|projects|systems|services|"
    r"microservices|applications|apps|api|apis|teams|members|regions|countries)\b",
    re.I,
)
# Spelled-out numbers (one through twenty, hundred, thousand, million, billion)
SPELLED_NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
    "hundred": 100, "thousand": 1000, "million": 1000000, "billion": 1000000000,
}
SPELLED_NUMBER_RE = re.compile(
    r"\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|"
    r"sixteen|seventeen|eighteen|nineteen|twenty|hundred|thousand|million|billion)\s+"
    r"(?:platform|platforms|engineer|engineers|people|users|customers|projects|systems|services|"
    r"microservices|applications|apps|api|apis|teams|members|regions|countries)\b",
    re.I,
)
DATE_RE = re.compile(
    r"\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|"
    r"sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}\b|\b\d{4}\s*[–-]\s*(?:\d{4}|present)\b|"
    r"\bpresent\b|\b(?:19|20)\d{2}\b",
    re.I,
)
TEAM_SIZE_RE = re.compile(r"\b(?:team of|led a team of|managed)\s+\d+\b|\b\d+\s*(?:engineers|people|members)\b", re.I)
OWNERSHIP_INDIVIDUAL_RE = re.compile(r"\b(?:i built|i designed|i owned|i created|solely|single-handedly)\b", re.I)
OWNERSHIP_TEAM_RE = re.compile(r"\b(?:we built|our team|collaborated|as a team|team delivered)\b", re.I)
FIRST_PERSON_CLAIM_RE = re.compile(
    r"\b(?:i\s+(?:built|designed|owned|created|led|implemented|developed|managed|shipped)|my experience)\b",
    re.I,
)
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

# Well-known single-word employer names that are commonly used in resumes
# These need special handling since normal org detection requires multi-word names
KNOWN_SINGLE_WORD_EMPLOYERS = frozenset({
    # FAANG / Big Tech
    "google", "meta", "amazon", "apple", "netflix", "microsoft", "nvidia", "intel", "oracle", "ibm",
    "salesforce", "adobe", "cisco", "vmware", "qualcomm", "amd", "dell", "hp", "samsung",
    # Fintech / Finance
    "stripe", "plaid", "square", "paypal", "visa", "mastercard", "bloomberg", "robinhood",
    # Enterprise / Cloud
    "slack", "zoom", "atlassian", "twilio", "datadog", "snowflake", "databricks", "confluent",
    # Consumer / Social
    "twitter", "x", "tiktok", "snap", "snapchat", "pinterest", "spotify", "discord", "reddit",
    # Startups / Scale-ups
    "uber", "lyft", "airbnb", "doordash", "instacart", "coinbase", "figma", "notion",
    # E-commerce / Retail
    "shopify", "etsy", "ebay", "walmart", "target", "costco",
    # Other notable
    "spacex", "tesla", "palantir", "openai", "anthropic", "deepmind",
})

# Only these sources may create first-person experience claims
FIRST_PERSON_CLAIM_SOURCES: frozenset[ClaimSourceKind] = frozenset({"candidate_evidence", "user_confirmation"})


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


@dataclass(frozen=True)
class StructuredSupport:
    """Internal, citation-scoped representation of one supported claim."""

    claimKind: str | None = None
    subject: str | None = None
    action: str | None = None
    value: str | None = None
    unit: str | None = None
    metricLabel: str | None = None
    organization: str | None = None
    project: str | None = None
    role: str | None = None
    startDate: str | None = None
    endDate: str | None = None
    technology: str | None = None
    ownership: str | None = None
    evidenceId: str | None = None
    supportingText: str | None = None


METRIC_LABEL_VOCABULARY: dict[str, frozenset[str]] = {
    "latency": frozenset({"latency", "response time", "load time", "page load", "speed"}),
    "revenue": frozenset({"revenue", "sales", "arr", "mrr", "bookings", "profit"}),
    "users": frozenset({"user", "users", "customer", "customers", "subscriber", "subscribers", "accounts"}),
    "projects": frozenset({"project", "projects", "initiative", "initiatives", "program", "programs"}),
    "conversion": frozenset({"conversion", "conversions", "signup", "signups", "activation"}),
    "availability": frozenset({"availability", "uptime", "reliability", "sla"}),
    "cost": frozenset({"cost", "costs", "spend", "expense", "expenses", "budget"}),
    "throughput": frozenset({"throughput", "requests", "qps", "transactions", "volume"}),
    "quality": frozenset({"defect", "defects", "error", "errors", "failure", "failures", "bugs"}),
    "satisfaction": frozenset({"satisfaction", "nps", "csat", "retention"}),
    "team": frozenset({"engineer", "engineers", "people", "members", "team", "reports"}),
    "duration": frozenset({"hour", "hours", "day", "days", "week", "weeks", "month", "months", "time"}),
}
METRIC_TOKEN_RE = re.compile(
    r"(?<!\w)(?P<currency>[$£€])?\s*(?P<value>\d[\d,]*(?:\.\d+)?)\s*"
    r"(?P<unit>%|percent|percentage|ms|milliseconds?|seconds?|secs?|minutes?|mins?|hours?|days?|weeks?|"
    r"months?|years?|users?|customers?|projects?|engineers?|people|members?|requests?|transactions?|"
    r"k|m|b|million|billion)?(?=\W|$)",
    re.I,
)


def extract_claim_atoms(text: str, explicit_techs: list[str] | None = None) -> ClaimAtoms:
    lower = text.lower()
    techs = [t for t in (explicit_techs or []) if t]
    for hint in KNOWN_TECH_HINTS:
        if re.search(rf"\b{re.escape(hint)}\b", lower):
            techs.append(hint)
    # Multi-word orgs from capitalized sequences
    orgs = re.findall(r"\b([A-Z][A-Za-z0-9&.\-]+(?:\s+[A-Z][A-Za-z0-9&.\-]+){0,3})\b", text)
    # Add known single-word employers (e.g., Google, Meta, Amazon)
    for word in re.findall(r"\b([A-Za-z]+)\b", text):
        if word.lower() in KNOWN_SINGLE_WORD_EMPLOYERS:
            orgs.append(word)

    # Collect all numbers: multi-digit, single-digit metrics, and spelled numbers
    numbers = NUMBER_RE.findall(text)
    # Single-digit metrics (e.g., "9 platforms", "5 engineers")
    single_digit_matches = SINGLE_DIGIT_METRIC_RE.findall(text)
    numbers.extend(single_digit_matches)
    # Spelled numbers (e.g., "nine platforms", "five engineers")
    for match in SPELLED_NUMBER_RE.finditer(text):
        spelled_word = match.group(1).lower()
        if spelled_word in SPELLED_NUMBER_WORDS:
            numbers.append(str(SPELLED_NUMBER_WORDS[spelled_word]))

    return ClaimAtoms(
        percentages=PERCENT_RE.findall(text),
        dollars=DOLLAR_RE.findall(text),
        numbers=numbers,
        dates=DATE_RE.findall(text),
        team_sizes=TEAM_SIZE_RE.findall(text),
        technologies=sorted({t.lower() for t in techs}),
        orgs=[o for o in orgs if o.lower() not in {"january", "february", "march", "april", "present"}],
        individual_ownership=bool(OWNERSHIP_INDIVIDUAL_RE.search(text)),
        team_ownership=bool(OWNERSHIP_TEAM_RE.search(text)),
    )


def _norm_tech(value: str) -> str:
    return value.strip().lower()


def _confirmation_evidence_id(index: int, confirmation: UserConfirmation) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", confirmation.topic.lower()).strip("-")[:24] or "attestation"
    return f"conf-{index}-{slug}"


def _unit_family(currency: str | None, unit: str | None) -> str:
    if currency:
        return "currency"
    normalized = (unit or "count").lower()
    if normalized in {"%", "percent", "percentage"}:
        return "percent"
    if normalized in {"ms", "millisecond", "milliseconds", "second", "seconds", "sec", "secs", "minute", "minutes",
                      "min", "mins", "hour", "hours", "day", "days", "week", "weeks", "month", "months", "year", "years"}:
        return "duration"
    if normalized in {"k", "m", "b", "million", "billion"}:
        return "scaled-count"
    return "count"


def _metric_labels(context: str) -> set[str]:
    lower = context.lower()
    return {
        label
        for label, terms in METRIC_LABEL_VOCABULARY.items()
        if any(re.search(rf"\b{re.escape(term)}\b", lower) for term in terms)
    }


def _metric_supports(text: str, *, evidence_id: str | None = None) -> list[StructuredSupport]:
    words = list(re.finditer(r"\S+", text))
    supports: list[StructuredSupport] = []
    date_spans = [match.span() for match in DATE_RE.finditer(text)]
    for match in METRIC_TOKEN_RE.finditer(text):
        if any(start <= match.start("value") < end for start, end in date_spans):
            continue
        if (
            len(match.group("value").replace(",", "").replace(".", "")) < 2
            and not match.group("currency")
            and not match.group("unit")
        ):
            continue
        nearby_indexes = [i for i, word in enumerate(words) if word.end() >= match.start() and word.start() <= match.end()]
        center = nearby_indexes[0] if nearby_indexes else next(
            (i for i, word in enumerate(words) if word.start() > match.start()), len(words) - 1
        )
        window = " ".join(word.group(0) for word in words[max(0, center - 7): center + 8])
        labels = _metric_labels(window)
        value = match.group("value").replace(",", "")
        unit = _unit_family(match.group("currency"), match.group("unit"))
        for label in (labels if labels else [None]):
            supports.append(
                StructuredSupport(
                    claimKind="metric",
                    value=value,
                    unit=unit,
                    metricLabel=label,
                    evidenceId=evidence_id,
                    supportingText=window,
                )
            )
    return supports


def _structured_supports(item: EvidenceItem) -> list[StructuredSupport]:
    corpus = _evidence_corpus([item])
    supports = _metric_supports(corpus, evidence_id=item.id)
    dates = DATE_RE.findall(corpus)
    ownership = "individual" if OWNERSHIP_INDIVIDUAL_RE.search(corpus) else "team" if OWNERSHIP_TEAM_RE.search(corpus) else None
    for tech in item.technologies:
        supports.append(
            StructuredSupport(
                claimKind="technology",
                organization=item.organization or item.employer_association,
                project=item.project_association,
                technology=_norm_tech(tech),
                ownership=ownership,
                evidenceId=item.id,
                supportingText=corpus,
            )
        )
    supports.append(
        StructuredSupport(
            claimKind=(item.source_type or "evidence").lower(),
            subject=item.title,
            action=(item.actions[0] if item.actions else item.task),
            organization=item.organization or item.employer_association,
            project=item.project_association,
            role=item.title,
            startDate=dates[0] if dates else None,
            endDate=dates[-1] if dates else None,
            ownership=ownership,
            evidenceId=item.id,
            supportingText=corpus,
        )
    )
    return supports


def _append_metric_semantic_violations(text: str, cited: list[EvidenceItem], violations: list[str]) -> None:
    claims = _metric_supports(text)
    evidence_support = [support for item in cited for support in _structured_supports(item) if support.claimKind == "metric"]
    for claim in claims:
        same_value = [support for support in evidence_support if support.value == claim.value]
        if not same_value:
            continue  # Existing atom checks report the unsupported numeric value.
        unit_matches = [support for support in same_value if support.unit == claim.unit]
        if not unit_matches:
            violations.append("UNSUPPORTED_METRIC_UNIT")
            continue
        if claim.metricLabel is None:
            violations.append("UNSUPPORTED_METRIC_MEANING")
            continue
        if not any(support.metricLabel == claim.metricLabel for support in unit_matches):
            violations.append("UNSUPPORTED_METRIC_MEANING")


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


def detect_injection_markers(text: str, *, code_prefix: str = "PROMPT_INJECTION") -> list[str]:
    lower = text.lower()
    return [f"{code_prefix}:{marker}" for marker in INJECTION_MARKERS if marker in lower]


def _section_type_aliases(section_type: str) -> set[str]:
    raw = (section_type or "").strip().lower()
    aliases = {raw}
    if raw in {"summary", "professional_summary"}:
        aliases.update({"summary", "professional_summary"})
    if raw in {"certifications", "awards", "certification", "award"}:
        aliases.update({"certifications", "awards"})
    return aliases


def _append_atom_violations(
    atoms: ClaimAtoms,
    *,
    corpus: str,
    allowed: set[str],
    research_techs: set[str],
    evidence_orgs: set[str],
    violations: list[str],
    org_code: str = "UNSUPPORTED_COMPANY",
) -> None:
    for tech in atoms.technologies:
        if tech not in allowed:
            violations.append("UNSUPPORTED_TECHNOLOGY")
        if tech in research_techs and tech not in allowed:
            violations.append("RESEARCH_TECH_AS_CLAIM")

    for pct in atoms.percentages:
        compact = pct.lower().replace(" ", "")
        if compact not in corpus.replace(" ", ""):
            bare = re.sub(r"[^\d.]", "", pct)
            if bare and not re.search(rf"\b{re.escape(bare)}\b", corpus):
                violations.append("UNSUPPORTED_PERCENT")

    for dollar in atoms.dollars:
        digits = re.sub(r"[^\d]", "", dollar)
        if digits and digits not in re.sub(r"[^\d]", "", corpus):
            violations.append("UNSUPPORTED_DOLLAR")

    for team in atoms.team_sizes:
        digits = re.sub(r"\D", "", team)
        if digits and digits not in corpus:
            violations.append("UNSUPPORTED_TEAM_SIZE")

    for num in atoms.numbers:
        # Exact numeric token with word boundaries so "5" does not validate "50".
        if not re.search(rf"\b{re.escape(num)}\b", corpus):
            violations.append("UNSUPPORTED_NUMBER")

    for date in atoms.dates:
        date_l = date.lower()
        if date_l not in corpus and not re.search(rf"\b{re.escape(date_l)}\b", corpus):
            # Require at least one date token (year / month) as a whole word in corpus.
            tokens = [tok for tok in re.split(r"[\s–-]+", date_l) if tok and tok != "present"]
            if not tokens or not all(re.search(rf"\b{re.escape(tok)}\b", corpus) for tok in tokens):
                violations.append("UNSUPPORTED_DATE")

    for org in atoms.orgs:
        org_l = org.lower()
        if evidence_orgs and org_l not in corpus and not any(org_l in eo or eo in org_l for eo in evidence_orgs if eo):
            # Flag unsupported orgs: multi-word names OR known single-word employers
            is_multi_word = len(org.split()) >= 2
            is_known_single_word_employer = org_l in KNOWN_SINGLE_WORD_EMPLOYERS
            if (is_multi_word or is_known_single_word_employer) and org_l not in corpus:
                violations.append(org_code)


def _text_grounded_in_corpus(value: str | None, corpus: str, evidence_orgs: set[str]) -> bool:
    text = (value or "").strip().lower()
    if not text:
        return True
    if text in corpus:
        return True
    return any(text in eo or eo in text for eo in evidence_orgs if eo)


def claim_source_allows_first_person(kind: ClaimSourceKind) -> bool:
    return kind in FIRST_PERSON_CLAIM_SOURCES


def evidence_backed_confirmations(confirmations: list[UserConfirmation] | None) -> list[UserConfirmation]:
    """Confirmations that may create first-person claims (yes + evidence description)."""
    return [c for c in (confirmations or []) if c.can_create_first_person_claim()]


def confirmation_without_evidence(confirmations: list[UserConfirmation] | None) -> list[UserConfirmation]:
    """Yes confirmations lacking evidence_description — must NOT become experience."""
    out: list[UserConfirmation] = []
    for c in confirmations or []:
        if c.confirmed and c.source_kind == "user_confirmation" and not (c.evidence_description or "").strip():
            out.append(c)
    return out


def research_or_jd_to_questions(
    *,
    job_requirements: list[str] | None = None,
    research_findings: list[ResearchFinding] | None = None,
    allowed_technologies: set[str] | None = None,
) -> list[str]:
    """Job/research may only produce clarifying questions, never first-person claims."""
    allowed = allowed_technologies or set()
    questions: list[str] = []
    for finding in research_findings or []:
        summary = finding.summary.strip()
        if not summary:
            continue
        atoms = extract_claim_atoms(summary)
        novel = [t for t in atoms.technologies if t not in allowed]
        if novel:
            tech = novel[0]
            questions.append(f"Research suggests this team may use {tech.title()}. Have you used it?")
        else:
            questions.append(f"Research notes: {summary[:180]}. Is this part of your experience?")
    for req in (job_requirements or [])[:10]:
        atoms = extract_claim_atoms(req)
        novel = [t for t in atoms.technologies if t not in allowed]
        if novel:
            tech = novel[0]
            questions.append(f"The job description mentions {tech.title()}. Have you used it?")
    seen: set[str] = set()
    unique: list[str] = []
    for q in questions:
        if q not in seen:
            seen.add(q)
            unique.append(q)
    return unique[:12]


def validate_resume_claims(
    resume: ResumeDocument,
    evidence: list[EvidenceItem],
    allowed_technologies: list[str] | None = None,
    *,
    tenant_id: str | None = None,
    owner_user_id: str | None = None,
    research_technologies: list[str] | None = None,
    job_description: str | None = None,
    research_findings: list[ResearchFinding] | None = None,
    user_confirmations: list[UserConfirmation] | None = None,
) -> list[str]:
    """Deterministic claim checks. Returns machine-readable violation codes.

    JD, resume text from untrusted inputs, and company research are untrusted —
    they must not introduce unsupported hard facts or ATS manipulation.
    """
    violations: list[str] = []
    evidence_ids = {item.id for item in evidence}
    evidence_by_id = {item.id: item for item in evidence}
    # Every affirmative, described confirmation gets a dedicated synthetic item.
    # It is never appended to any other bullet's corpus.
    for idx, conf in enumerate(evidence_backed_confirmations(user_confirmations)):
        synth_id = _confirmation_evidence_id(idx, conf)
        evidence_ids.add(synth_id)
        if synth_id not in evidence_by_id:
            related = [evidence_by_id[eid] for eid in conf.related_evidence_ids if eid in evidence_by_id]
            tenant = related[0].tenant_id if related else evidence[0].tenant_id if evidence else tenant_id or "unknown"
            owner = related[0].owner_user_id if related else evidence[0].owner_user_id if evidence else owner_user_id or "unknown"
            evidence_by_id[synth_id] = EvidenceItem(
                id=synth_id,
                tenant_id=tenant,
                owner_user_id=owner,
                title=conf.topic,
                claim_text=(conf.evidence_description or "").strip()[:3900],
                technologies=sorted(extract_claim_atoms(conf.evidence_description or "").technologies),
                source_type="user_confirmation",
                verification_status="user_attested",
                candidate_confirmation_status="confirmed",
                confidence="medium",
            )
    synthetic_evidence = [item for eid, item in evidence_by_id.items() if eid not in {e.id for e in evidence}]
    allowed = collect_allowed_technologies(evidence + synthetic_evidence, allowed_technologies)
    research_techs = {_norm_tech(t) for t in (research_technologies or [])}
    for finding in research_findings or []:
        research_techs.update(extract_claim_atoms(finding.summary).technologies)
    evidence_orgs = {
        (item.organization or item.employer_association or "").lower()
        for item in evidence
        if item.organization or item.employer_association
    }
    bare_yes_topics = {c.topic.lower() for c in confirmation_without_evidence(user_confirmations)}
    full_corpus = _evidence_corpus(evidence)

    if tenant_id is not None:
        for item in evidence:
            if item.tenant_id != tenant_id:
                violations.append("CROSS_TENANT_EVIDENCE")
            if owner_user_id is not None and item.owner_user_id != owner_user_id:
                violations.append("CROSS_OWNER_EVIDENCE")

    # JD/research inputs are untrusted. Injection *in those inputs* is not a resume
    # blocking error — callers use detect_jd_injection() for warnings/evals. Markers
    # that appear in the resume itself remain blocking (PROMPT_INJECTION below).
    # Research tech leakage into claims is still blocked via research_techs atoms.
    if job_description:
        _ = detect_jd_injection(job_description)

    # Optional resume-level identity/contact fields (forward-compatible if present).
    for attr in ("candidate_name", "full_name", "contact_email", "contact_phone", "email", "phone"):
        value = getattr(resume, attr, None)
        if isinstance(value, str) and value.strip():
            violations.extend(detect_injection_markers(value, code_prefix="PROMPT_INJECTION"))
            atoms = extract_claim_atoms(value)
            _append_atom_violations(
                atoms,
                corpus=full_corpus,
                allowed=allowed,
                research_techs=research_techs,
                evidence_orgs=evidence_orgs,
                violations=violations,
            )
    contact = getattr(resume, "contact", None)
    if isinstance(contact, dict):
        for key in ("name", "email", "phone", "location"):
            raw = contact.get(key)
            if isinstance(raw, str) and raw.strip():
                violations.extend(detect_injection_markers(raw, code_prefix="PROMPT_INJECTION"))

    for section in resume.sections:
        section_types = _section_type_aliases(section.type)
        org_code = "UNSUPPORTED_COMPANY"
        if section_types & {"education"}:
            org_code = "UNSUPPORTED_EDUCATION"
        elif section_types & {"certifications", "awards"}:
            org_code = "UNSUPPORTED_CERTIFICATION"

        # Section content (summary / skills / education body / cert text)
        if section.content:
            violations.extend(detect_injection_markers(section.content, code_prefix="PROMPT_INJECTION"))
            if any(marker in section.content.lower() for marker in ATS_MARKERS):
                violations.append("ATS_MANIPULATION")
            content_atoms = extract_claim_atoms(section.content)
            if section_types & {"summary", "professional_summary", "skills", "education", "certifications", "awards"}:
                section_evidence = evidence
                if section_types & {"education"}:
                    section_evidence = [item for item in evidence if (item.source_type or "").lower() == "education"]
                elif section_types & {"certifications", "awards"}:
                    section_evidence = [
                        item for item in evidence if (item.source_type or "").lower() in {"certification", "certifications", "award"}
                    ]
                section_corpus = _evidence_corpus(section_evidence)
                section_allowed = collect_allowed_technologies(section_evidence)
                if not section_evidence and section_types & {"education"}:
                    violations.append("UNSUPPORTED_EDUCATION")
                if not section_evidence and section_types & {"certifications", "awards"}:
                    violations.append("UNSUPPORTED_CERTIFICATION")
                _append_atom_violations(
                    content_atoms,
                    corpus=section_corpus if section_types & {"education", "certifications", "awards"} else full_corpus,
                    allowed=section_allowed if section_types & {"education", "certifications", "awards"} else allowed,
                    research_techs=research_techs,
                    evidence_orgs=evidence_orgs,
                    violations=violations,
                    org_code=org_code,
                )

        for resume_item in section.items or []:
            associated_ids = {
                evidence_id
                for item_bullet in resume_item.bullets
                for evidence_id in item_bullet.evidence_ids
                if evidence_id in evidence_by_id
            }
            associated = [evidence_by_id[eid] for eid in associated_ids]
            item_corpus = _evidence_corpus(associated)
            item_orgs = {
                (item.organization or item.employer_association or "").lower()
                for item in associated
                if item.organization or item.employer_association
            }
            item_fields = [
                resume_item.heading,
                resume_item.subheading or "",
                resume_item.location or "",
                resume_item.dates or "",
            ]
            item_blob = " ".join(part for part in item_fields if part)
            if item_blob.strip():
                violations.extend(detect_injection_markers(item_blob, code_prefix="PROMPT_INJECTION"))
                item_atoms = extract_claim_atoms(item_blob)
                _append_atom_violations(
                    item_atoms,
                    corpus=item_corpus,
                    allowed=collect_allowed_technologies(associated),
                    research_techs=research_techs,
                    evidence_orgs=item_orgs,
                    violations=violations,
                    org_code=org_code,
                )
                # Explicit education / cert grounding for employer/institution/title fields.
                if section_types & {"experience", "projects"}:
                    if resume_item.heading and not _text_grounded_in_corpus(
                        resume_item.heading, item_corpus, item_orgs
                    ):
                        violations.append("UNSUPPORTED_COMPANY")
                    if resume_item.subheading and not _text_grounded_in_corpus(resume_item.subheading, item_corpus, set()):
                        violations.append("UNSUPPORTED_TITLE")
                    if resume_item.dates and not _text_grounded_in_corpus(resume_item.dates, item_corpus, set()):
                        date_atoms = extract_claim_atoms(resume_item.dates)
                        if date_atoms.dates:
                            _append_atom_violations(
                                date_atoms,
                                corpus=item_corpus,
                                allowed=collect_allowed_technologies(associated),
                                research_techs=research_techs,
                                evidence_orgs=evidence_orgs,
                                violations=violations,
                            )
                if section_types & {"education"}:
                    education_associated = [
                        item for item in associated if (item.source_type or "").lower() == "education"
                    ]
                    education_corpus = _evidence_corpus(education_associated)
                    for field in (resume_item.heading, resume_item.subheading):
                        if field and not _text_grounded_in_corpus(field, education_corpus, item_orgs):
                            if len((field or "").split()) >= 2 or (field and field.lower() not in full_corpus):
                                violations.append("UNSUPPORTED_EDUCATION")
                    if resume_item.dates and not _text_grounded_in_corpus(resume_item.dates, education_corpus, set()):
                        date_atoms = extract_claim_atoms(resume_item.dates)
                        if date_atoms.dates or resume_item.dates.strip():
                            if not any(tok in education_corpus for tok in resume_item.dates.lower().split() if tok):
                                violations.append("UNSUPPORTED_DATE")
                if section_types & {"certifications", "awards"}:
                    cert_associated = [
                        item
                        for item in associated
                        if (item.source_type or "").lower() in {"certification", "certifications", "award"}
                    ]
                    cert_corpus = _evidence_corpus(cert_associated)
                    for field in (resume_item.heading, resume_item.subheading):
                        if field and not _text_grounded_in_corpus(field, cert_corpus, item_orgs):
                            violations.append("UNSUPPORTED_CERTIFICATION")

        bullets = list(section.bullets or [])
        for resume_item in section.items or []:
            bullets.extend(resume_item.bullets)
        for bullet in bullets:
            violations.extend(detect_injection_markers(bullet.text, code_prefix="PROMPT_INJECTION"))
            if not bullet.evidence_ids:
                violations.append("MISSING_EVIDENCE_IDS")
                continue
            for evidence_id in bullet.evidence_ids:
                if evidence_id not in evidence_ids:
                    violations.append("UNKNOWN_EVIDENCE_ID")
            cited = _cited_evidence(bullet, evidence_by_id)
            corpus = _evidence_corpus(cited) if cited else ""
            atoms = extract_claim_atoms(bullet.text, bullet.technologies)
            cited_allowed = collect_allowed_technologies(cited)

            _append_atom_violations(
                atoms,
                corpus=corpus,
                allowed=cited_allowed,
                research_techs=research_techs,
                evidence_orgs=evidence_orgs,
                violations=violations,
                org_code=org_code if section_types & {"education", "certifications", "awards"} else "UNSUPPORTED_COMPANY",
            )
            _append_metric_semantic_violations(bullet.text, cited, violations)

            source_types = {(item.source_type or "").lower() for item in cited}
            if section_types & {"education"} and "education" not in source_types:
                violations.append("UNSUPPORTED_EDUCATION")
            if section_types & {"certifications", "awards"} and not source_types.intersection(
                {"certification", "certifications", "award"}
            ):
                violations.append("UNSUPPORTED_CERTIFICATION")
            if FIRST_PERSON_CLAIM_RE.search(bullet.text) and not all(
                (item.source_type or "").lower() not in {"job_requirement", "company_research", "research"}
                for item in cited
            ):
                violations.append("UNSUPPORTED_FIRST_PERSON_SOURCE")

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
            for topic in bare_yes_topics:
                if topic and topic in lower and FIRST_PERSON_CLAIM_RE.search(lower):
                    violations.append("CONFIRMATION_WITHOUT_EVIDENCE")

    unique = sorted(set(violations))
    if unique:
        METRICS.incr(UNSUPPORTED_CLAIMS_BLOCKED, len(unique))
    return unique


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
    scoped_allowed = collect_allowed_technologies(scoped)

    for tech in KNOWN_TECH_HINTS:
        if re.search(rf"\b{re.escape(tech)}\b", suggested_lower) and tech not in scoped_allowed:
            return False, "UNSUPPORTED_TECHNOLOGY"

    if any(marker in suggested_lower for marker in ATS_MARKERS):
        return False, "ATS_MANIPULATION"

    atoms = extract_claim_atoms(finding_suggested_text)
    semantic_violations: list[str] = []
    _append_metric_semantic_violations(finding_suggested_text, scoped, semantic_violations)
    if semantic_violations:
        return False, semantic_violations[0]
    for pct in atoms.percentages:
        bare = re.sub(r"[^\d.]", "", pct)
        if bare and not re.search(rf"\b{re.escape(bare)}\b", corpus):
            return False, "UNSUPPORTED_PERCENT"
    for dollar in atoms.dollars:
        digits = re.sub(r"[^\d]", "", dollar)
        if digits and digits not in re.sub(r"[^\d]", "", corpus):
            return False, "UNSUPPORTED_DOLLAR"
    for team in atoms.team_sizes:
        digits = re.sub(r"\D", "", team)
        if digits and not re.search(rf"\b{re.escape(digits)}\b", corpus):
            return False, "UNSUPPORTED_TEAM_SIZE"
    for num in atoms.numbers:
        if not re.search(rf"\b{re.escape(num)}\b", corpus):
            return False, "UNSUPPORTED_NUMBER"
    for date in atoms.dates:
        date_l = date.lower()
        if date_l not in corpus and not re.search(rf"\b{re.escape(date_l)}\b", corpus):
            tokens = [tok for tok in re.split(r"[\s–-]+", date_l) if tok and tok != "present"]
            if not tokens or not all(re.search(rf"\b{re.escape(tok)}\b", corpus) for tok in tokens):
                return False, "UNSUPPORTED_DATE"
    evidence_orgs = {
        (item.organization or item.employer_association or "").lower()
        for item in scoped
        if item.organization or item.employer_association
    }
    for org in atoms.orgs:
        org_l = org.lower()
        if len(org.split()) < 2:
            continue
        if org_l in corpus or any(org_l in eo or eo in org_l for eo in evidence_orgs if eo):
            continue
        # Education / certification-like org names without evidence grounding
        if any(tok in suggested_lower for tok in ("university", "college", "institute", "school")):
            return False, "UNSUPPORTED_EDUCATION"
        if any(tok in suggested_lower for tok in ("certified", "certification", "certificate", "comptia")):
            return False, "UNSUPPORTED_CERTIFICATION"
        return False, "UNSUPPORTED_COMPANY"

    if atoms.individual_ownership:
        if OWNERSHIP_TEAM_RE.search(corpus) and not OWNERSHIP_INDIVIDUAL_RE.search(corpus):
            return False, "TEAM_TO_INDIVIDUAL_OWNERSHIP"

    if FIRST_PERSON_CLAIM_RE.search(finding_suggested_text) and any(
        (item.source_type or "").lower() in {"job_requirement", "company_research", "research"} for item in scoped
    ):
        return False, "UNSUPPORTED_FIRST_PERSON_SOURCE"

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
    research_findings: list[ResearchFinding] | None = None,
    user_confirmations: list[UserConfirmation] | None = None,
) -> ResumeDocument:
    """Build an evidence-grounded resume; scores are calculated, never version-inflated.

    Claim source rules:
    - candidate_evidence + evidence-backed user_confirmation → first-person claims OK
    - job_requirement / company_research → clarifying questions only (appended to notes)
    - confirmation yes without evidence_description → never added as experience
    """
    allowed = collect_allowed_technologies(evidence, allowed_technologies)
    for conf in evidence_backed_confirmations(user_confirmations):
        for tech in extract_claim_atoms(conf.evidence_description or "").technologies:
            allowed.add(tech)

    questions = research_or_jd_to_questions(
        job_requirements=job_requirements,
        research_findings=research_findings,
        allowed_technologies=allowed,
    )
    notes_bits = [notes]
    if questions:
        notes_bits.append("Evidence questions: " + " | ".join(questions[:5]))

    if not evidence and not evidence_backed_confirmations(user_confirmations):
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
            notes=" ".join(notes_bits),
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

    augmented = list(evidence)
    for idx, conf in enumerate(evidence_backed_confirmations(user_confirmations)):
        synth_id = _confirmation_evidence_id(idx, conf)
        if any(e.id == synth_id for e in augmented):
            continue
        related = [item for item in evidence if item.id in conf.related_evidence_ids]
        tenant = related[0].tenant_id if related else evidence[0].tenant_id if evidence else "unknown"
        owner = related[0].owner_user_id if related else evidence[0].owner_user_id if evidence else "unknown"
        techs = sorted({t.title() for t in extract_claim_atoms(conf.evidence_description or "").technologies})
        augmented.append(
            EvidenceItem(
                id=synth_id,
                tenant_id=tenant,
                owner_user_id=owner,
                title=conf.topic,
                claim_text=(conf.evidence_description or "").strip()[:3900],
                technologies=techs[:12],
                source_type="user_confirmation",
                verification_status="user_attested",
                candidate_confirmation_status="confirmed",
                confidence="medium",
            )
        )

    tech_list = sorted({tech for item in augmented for tech in item.technologies if _norm_tech(tech) in allowed})[:12]
    employment = [
        item
        for item in augmented
        if (item.source_type or "").lower() in {"employment", "metric", "leadership", "user_confirmation"}
    ]
    education = [item for item in augmented if (item.source_type or "").lower() == "education"]
    jd_lower = job_description.lower()
    reqs = list(job_requirements or [])

    is_ux = any(tok in jd_lower for tok in ("ux", "design", "figma", "user research", "product design", "interface"))
    is_backend = any(
        tok in jd_lower for tok in ("backend", "api", "platform", "distributed", "infrastructure", "python", "pytorch")
    )

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

    experience_source = employment or augmented[:3]
    experience_bullets = [
        bullet_from(
            item,
            emphasis=("UX-aligned delivery" if is_ux else "Platform reliability focus" if is_backend else None),
        )
        for item in experience_source
    ]
    skills_text = " · ".join(tech_list) if tech_list else "Skills pending attested technologies"
    all_evidence_ids = [item.id for item in augmented]
    sections = [
        ResumeSection(
            type="summary",
            title="Professional Summary",
            order=0,
            bullets=[
                ResumeBullet(
                    text=". ".join(summary_bits)[:3900],
                    evidence_ids=all_evidence_ids,
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
                    evidence_ids=all_evidence_ids,
                    matched_requirements=[],
                    technologies=tech_list,
                    confidence="high",
                    claim_risk="low",
                    source_version="career-evidence",
                )
            ],
        ),
        ResumeSection(type="experience", title="Experience", order=2, bullets=experience_bullets),
    ]
    if education:
        sections.append(
            ResumeSection(
                type="education",
                title="Education",
                order=3,
                bullets=[bullet_from(item) for item in education],
            )
        )

    scored = score_resume(
        sections=sections,
        evidence=augmented,
        job_description=job_description,
        job_requirements=job_requirements or reqs,
        notes=" ".join(notes_bits),
    )
    return ResumeDocument(
        absolute_version=absolute_version,
        cycle_step=cycle_step,
        version_number=absolute_version,
        score=scored.score,
        score_breakdown=scored.breakdown,
        score_rubric_version=scored.rubric_version,
        score_explanations=scored.explanations,
        notes=" ".join(notes_bits),
        sections=sections,
    )
