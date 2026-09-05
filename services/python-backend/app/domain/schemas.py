from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    field_validator,
    model_validator,
)

# --- shared constraints -------------------------------------------------------

StrShort = Annotated[str, Field(min_length=1, max_length=512)]
StrMed = Annotated[str, Field(min_length=1, max_length=4_000)]
StrLong = Annotated[str, Field(min_length=1, max_length=100_000)]
StrId = Annotated[str, Field(min_length=1, max_length=128)]
Score100 = Annotated[float, Field(ge=0, le=100)]
ScoreInt100 = Annotated[int, Field(ge=0, le=100)]

Confidence = Literal["high", "medium", "low"]
ClaimRisk = Literal["low", "medium", "high"]
ClaimSourceKind = Literal["candidate_evidence", "user_confirmation", "job_requirement", "company_research"]
AuditLens = Literal["hr-1", "em-1", "hr-2", "em-2"]
FindingSeverity = Literal["critical", "major", "minor", "suggestion"]
FindingStatus = Literal["open", "accepted", "rejected", "edited"]
SectionType = Literal["summary", "skills", "experience", "projects", "education", "certifications"]
QaStatus = Literal["pass", "warn", "fail", "warning", "pending"]

SCORE_RUBRIC_VERSION = "candidarc-score-rubric@v1"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, validate_assignment=True)


class RequestContext(StrictModel):
    tenant_id: StrId
    user_id: StrId
    application_id: str | None = Field(default=None, max_length=128)
    workflow_run_id: str | None = Field(default=None, max_length=128)
    request_id: StrId
    schema_version: str = Field(default="2026-09-resume-intelligence.v1", max_length=128)


class EvidenceItem(StrictModel):
    id: StrId
    tenant_id: StrId
    owner_user_id: StrId
    title: StrShort
    organization: str | None = Field(default=None, max_length=512)
    situation: str | None = Field(default=None, max_length=4_000)
    task: str | None = Field(default=None, max_length=4_000)
    actions: list[Annotated[str, Field(max_length=2_000)]] = Field(default_factory=list, max_length=50)
    result: str | None = Field(default=None, max_length=4_000)
    metrics: list[Annotated[str, Field(max_length=512)]] = Field(default_factory=list, max_length=50)
    technologies: list[Annotated[str, Field(max_length=128)]] = Field(default_factory=list, max_length=50)
    source_type: str | None = Field(default=None, max_length=128)
    verification_status: StrShort
    candidate_confirmation_status: StrShort
    confidence: Confidence
    privacy_classification: str = Field(default="share-safe", max_length=64)
    claim_text: str | None = Field(default=None, max_length=4_000)
    employer_association: str | None = Field(default=None, max_length=512)
    project_association: str | None = Field(default=None, max_length=512)


class ResumeBullet(StrictModel):
    text: StrMed
    evidence_ids: list[StrId] = Field(min_length=1, max_length=32)
    matched_requirements: list[Annotated[str, Field(max_length=512)]] = Field(default_factory=list, max_length=50)
    technologies: list[Annotated[str, Field(max_length=128)]] = Field(default_factory=list, max_length=50)
    confidence: Confidence = "high"
    claim_risk: ClaimRisk = "low"
    source_version: str = Field(default="career-evidence", max_length=64)


class ResumeItem(StrictModel):
    heading: StrShort
    subheading: str | None = Field(default=None, max_length=512)
    location: str | None = Field(default=None, max_length=256)
    dates: str | None = Field(default=None, max_length=128)
    bullets: list[ResumeBullet] = Field(default_factory=list, max_length=50)


class ResumeSection(StrictModel):
    type: SectionType
    title: StrShort
    order: int = Field(default=0, ge=0, le=100)
    content: str | None = Field(default=None, max_length=8_000)
    bullets: list[ResumeBullet] | None = Field(default=None, max_length=50)
    items: list[ResumeItem] | None = Field(default=None, max_length=50)

    @model_validator(mode="after")
    def _require_payload(self) -> ResumeSection:
        if not (self.content or self.bullets or self.items):
            raise ValueError("A resume section must contain content, bullets, or items")
        return self


class ScoreBreakdown(StrictModel):
    atsCompatibility: Score100
    jobAlignment: Score100
    recruiterReadability: Score100
    impact: Score100
    quantification: Score100
    technicalDepth: Score100
    competencyCoverage: Score100
    evidenceConfidence: Score100
    writingQuality: Score100
    formatIntegrity: Score100


class ResumeDocument(StrictModel):
    """Resume document with dual version fields for TS mapping.

    `absolute_version` is unbounded (>=0). `cycle_step` is 0..4 for the refinement cycle.
    `version_number` mirrors `absolute_version` for TypeScript compatibility.
    """

    absolute_version: int = Field(ge=0)
    cycle_step: int = Field(ge=0, le=4)
    version_number: int = Field(ge=0)
    score: Score100
    score_breakdown: ScoreBreakdown
    score_rubric_version: str = Field(default=SCORE_RUBRIC_VERSION, max_length=128)
    score_explanations: dict[str, str] | list[str] = Field(default_factory=lambda: {})
    notes: str = Field(max_length=8_000)
    sections: list[ResumeSection] = Field(min_length=1, max_length=20)

    @model_validator(mode="before")
    @classmethod
    def _sync_version_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        absolute = data.get("absolute_version")
        version_number = data.get("version_number")
        cycle = data.get("cycle_step")
        if absolute is None and version_number is not None:
            data["absolute_version"] = version_number
            absolute = version_number
        if version_number is None and absolute is not None:
            data["version_number"] = absolute
        if cycle is None and absolute is not None:
            try:
                data["cycle_step"] = int(absolute) % 5
            except (TypeError, ValueError):
                data["cycle_step"] = 0
        return data

    @model_validator(mode="after")
    def _version_number_matches_absolute(self) -> ResumeDocument:
        if self.version_number != self.absolute_version:
            raise ValueError("version_number must equal absolute_version")
        return self


class JobParseRequest(StrictModel):
    context: RequestContext
    job_text: str = Field(min_length=20, max_length=100_000)
    company: str | None = Field(default=None, max_length=512)
    role: str | None = Field(default=None, max_length=512)


class JobParseResponse(StrictModel):
    title: str | None = Field(default=None, max_length=512)
    company: str | None = Field(default=None, max_length=512)
    role: str | None = Field(default=None, max_length=512)
    location: str | None = Field(default=None, max_length=512)
    employment_type: str | None = Field(default=None, max_length=128)
    seniority: str | None = Field(default=None, max_length=128)
    required_qualifications: list[Annotated[str, Field(max_length=2_000)]] = Field(default_factory=list, max_length=100)
    preferred_qualifications: list[Annotated[str, Field(max_length=2_000)]] = Field(default_factory=list, max_length=100)
    responsibilities: list[Annotated[str, Field(max_length=2_000)]] = Field(default_factory=list, max_length=100)
    target_technologies: list[Annotated[str, Field(max_length=128)]] = Field(default_factory=list, max_length=100)
    warnings: list[Annotated[str, Field(max_length=256)]] = Field(default_factory=list, max_length=50)


class ResumeParseRequest(StrictModel):
    context: RequestContext
    filename: str = Field(min_length=1, max_length=512)
    content_type: str = Field(min_length=1, max_length=256)
    content_base64: str = Field(min_length=1, max_length=20_000_000)


class ResumeParseResponse(StrictModel):
    text: str = Field(max_length=500_000)
    page_count: int | None = Field(default=None, ge=0, le=10_000)
    warnings: list[Annotated[str, Field(max_length=256)]] = Field(default_factory=list, max_length=50)


class ResearchSource(StrictModel):
    id: StrId
    url: HttpUrl
    title: StrShort
    accessed_at: StrShort
    supporting_text: StrMed
    confidence: Confidence = "medium"
    classification: Literal["explicit", "inferred", "uncertain"] = "explicit"
    relevance: float = Field(ge=0, le=1, default=0.5)


class ResearchSynthesizeRequest(StrictModel):
    context: RequestContext
    company: StrShort
    role: StrShort
    job_description: StrLong
    sources: list[ResearchSource] = Field(default_factory=list, max_length=50)


class ResearchFinding(StrictModel):
    category: StrShort
    title: StrShort
    summary: StrMed
    confidence: Confidence
    status: Literal["supported", "uncertain", "unavailable", "verified", "inferred", "unverified", "disputed"] = "supported"
    source_ids: list[StrId] = Field(default_factory=list, max_length=50)


class ResearchSynthesizeResponse(StrictModel):
    findings: list[ResearchFinding] = Field(max_length=100)
    sources: list[ResearchSource] = Field(max_length=50)
    overall_confidence: float = Field(ge=0, le=1)
    company_research_status: str | None = Field(default=None, max_length=64)


class EvidenceIndexRequest(StrictModel):
    context: RequestContext
    evidence: list[EvidenceItem] = Field(max_length=500)


class EvidenceIndexResponse(StrictModel):
    indexed: int = Field(ge=0)
    tenant_id: StrId
    owner_user_id: StrId
    experimental: bool = False
    store_backend: Literal["memory", "postgres"] = "memory"


class EvidenceSearchRequest(StrictModel):
    context: RequestContext
    query: str = Field(min_length=1, max_length=2_000)
    owner_user_id: StrId
    limit: int = Field(default=8, ge=1, le=50)


class EvidenceSearchHit(StrictModel):
    evidence_id: StrId
    score: float
    snippet: str = Field(max_length=512)


class EvidenceSearchResponse(StrictModel):
    hits: list[EvidenceSearchHit]
    experimental: bool = False
    store_backend: Literal["memory", "postgres"] = "memory"


class EvidenceMatchRequest(StrictModel):
    context: RequestContext
    requirements: list[Annotated[str, Field(max_length=2_000)]] = Field(max_length=200)
    evidence: list[EvidenceItem] = Field(max_length=500)
    research_findings: list[ResearchFinding] = Field(default_factory=list, max_length=100)


class EvidenceMatchRow(StrictModel):
    requirement: str = Field(max_length=2_000)
    importance: Literal["required", "preferred", "responsibility"] = "required"
    evidence_ids: list[StrId] = Field(max_length=32)
    evidence_strength: Literal["strong", "partial", "none"]
    resume_usage: Literal["use", "consider", "skip"] = "use"
    coverage_gap: str | None = Field(default=None, max_length=1_000)


class EvidenceMatchResponse(StrictModel):
    rows: list[EvidenceMatchRow] = Field(max_length=200)
    evidence_coverage: float = Field(ge=0, le=1)
    ranking_method: str = Field(
        default="lexical_hybrid_request_scoped",
        description="Request-scoped lexical hybrid (keyword overlap + deterministic hash vectors). Not RAG index.",
        max_length=128,
    )


class MistakeMemoryRule(StrictModel):
    category: StrShort
    rule: StrMed
    severity: FindingSeverity
    originating_audit: AuditLens
    affected_version: StrShort


class UserConfirmation(StrictModel):
    """Typed user confirmation for generate/regenerate.

    Only confirmations with a non-empty evidence_description may create first-person
    experience claims. Bare yes without evidence is ignored (never added as experience).
    """

    topic: StrShort
    confirmed: bool
    evidence_description: str | None = Field(default=None, max_length=4_000)
    source_kind: ClaimSourceKind = "user_confirmation"
    related_evidence_ids: list[StrId] = Field(default_factory=list, max_length=32)

    def can_create_first_person_claim(self) -> bool:
        if not self.confirmed:
            return False
        if self.source_kind not in {"candidate_evidence", "user_confirmation"}:
            return False
        desc = (self.evidence_description or "").strip()
        return bool(desc)


class ClaimSourcePolicy(StrictModel):
    """Declares how a piece of context may be used for claim formation."""

    kind: ClaimSourceKind
    may_create_first_person_claim: bool
    may_create_user_question: bool = False


class AuditFinding(StrictModel):
    severity: FindingSeverity
    section: StrShort
    title: StrShort
    explanation: StrMed
    before_text: str = Field(max_length=4_000)
    suggested_text: str = Field(max_length=4_000)
    expected_score_impact: float = Field(ge=-100, le=100)
    evidence_source: str | None = Field(default=None, max_length=128)
    evidence_ids: list[StrId] = Field(default_factory=list, max_length=32)
    status: FindingStatus | None = None
    rejection_reason: str | None = Field(default=None, max_length=512)
    edited_text: str | None = Field(default=None, max_length=4_000)

    @field_validator("severity", mode="before")
    @classmethod
    def _map_nit_to_suggestion(cls, value: Any) -> Any:
        if value == "nit":
            return "suggestion"
        return value


class ProviderUsage(StrictModel):
    provider: StrShort
    model: StrShort
    prompt_version: str = Field(max_length=128)
    rubric_version: str | None = Field(default=None, max_length=128)
    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    cached_tokens: int | None = Field(default=None, ge=0)
    latency_ms: int = Field(ge=0)
    provider_request_id: str | None = Field(default=None, max_length=256)
    estimated_cost_cents: float | None = Field(default=None, ge=0)
    retry_count: int = Field(default=0, ge=0, le=20)


class ResumeGenerateRequest(StrictModel):
    context: RequestContext
    absolute_version: int | None = Field(default=None, ge=0)
    cycle_step: int | None = Field(default=None, ge=0, le=4)
    version_number: int | None = Field(default=None, ge=0)
    job_description: StrLong
    evidence: list[EvidenceItem] = Field(max_length=500)
    allowed_technologies: list[Annotated[str, Field(max_length=128)]] = Field(default_factory=list, max_length=100)
    previous_resume: ResumeDocument | None = None
    accepted_findings: list[AuditFinding] = Field(default_factory=list, max_length=100)
    rejected_findings: list[AuditFinding] = Field(default_factory=list, max_length=100)
    research_findings: list[ResearchFinding] = Field(default_factory=list, max_length=100)
    mistake_memory: list[MistakeMemoryRule] = Field(default_factory=list, max_length=100)
    refinement_instruction: str | None = Field(default=None, max_length=4_000)
    job_requirements: list[Annotated[str, Field(max_length=2_000)]] = Field(default_factory=list, max_length=200)
    evidence_matches: list[EvidenceMatchRow] = Field(default_factory=list, max_length=200)
    user_confirmations: list[UserConfirmation] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def _resolve_versions(self) -> ResumeGenerateRequest:
        absolute = self.absolute_version
        if absolute is None:
            absolute = self.version_number if self.version_number is not None else 0
        if self.version_number is not None and self.absolute_version is not None:
            if self.version_number != self.absolute_version:
                raise ValueError("version_number must equal absolute_version when both provided")
        object.__setattr__(self, "absolute_version", absolute)
        object.__setattr__(self, "version_number", absolute)
        if self.cycle_step is None:
            object.__setattr__(self, "cycle_step", absolute % 5)
        return self


class ResumeGenerateResponse(StrictModel):
    resume: ResumeDocument
    provider: StrShort
    model: StrShort
    prompt_version: StrShort
    latency_ms: int = Field(ge=0)
    usage: ProviderUsage | None = None


class AuditRequest(StrictModel):
    context: RequestContext
    lens: AuditLens
    reviews_version: int = Field(ge=0)
    produces_version: int = Field(ge=0)
    resume: ResumeDocument
    evidence: list[EvidenceItem] = Field(max_length=500)
    job_description: StrLong
    allowed_technologies: list[Annotated[str, Field(max_length=128)]] = Field(default_factory=list, max_length=100)


class AuditResponse(StrictModel):
    lens: AuditLens
    reviews_version: int = Field(ge=0)
    produces_version: int = Field(ge=0)
    score_before: Score100
    score_after: Score100
    summary: StrMed
    findings: list[AuditFinding] = Field(max_length=100)
    rejected_findings: list[AuditFinding] = Field(default_factory=list, max_length=100)
    provider: StrShort
    model: StrShort
    usage: ProviderUsage | None = None


class DeterministicQaCheck(StrictModel):
    label: StrShort
    status: QaStatus
    detail: str = Field(max_length=2_000)


class FinalQaRequest(StrictModel):
    context: RequestContext
    resume: ResumeDocument
    evidence: list[EvidenceItem] = Field(max_length=500)
    deterministic_checks: list[DeterministicQaCheck] = Field(default_factory=list, max_length=100)
    allowed_technologies: list[Annotated[str, Field(max_length=128)]] = Field(default_factory=list, max_length=100)


class FinalQaCheck(StrictModel):
    label: StrShort
    status: QaStatus
    detail: str = Field(max_length=2_000)


class FinalQaResponse(StrictModel):
    passed: bool
    checks: list[FinalQaCheck] = Field(max_length=100)
    provider: StrShort
    model: StrShort
    usage: ProviderUsage | None = None


class ApiError(StrictModel):
    code: StrShort
    message: StrMed
    request_id: str | None = Field(default=None, max_length=128)
    details: dict[str, str] | None = None


class HealthLiveResponse(StrictModel):
    status: Literal["ok"] = "ok"


class HealthReadyResponse(StrictModel):
    status: Literal["ready", "not_ready"]
    errors: list[Annotated[str, Field(max_length=512)]] = Field(default_factory=list, max_length=50)
