from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class RequestContext(StrictModel):
    tenant_id: str
    user_id: str
    application_id: str | None = None
    workflow_run_id: str | None = None
    request_id: str
    schema_version: str = "2026-09-resume-intelligence.v1"


class EvidenceItem(StrictModel):
    id: str
    tenant_id: str
    owner_user_id: str
    title: str
    organization: str | None = None
    situation: str | None = None
    task: str | None = None
    actions: list[str] = Field(default_factory=list)
    result: str | None = None
    metrics: list[str] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    source_type: str | None = None
    verification_status: str = "user_attested"
    candidate_confirmation_status: str = "confirmed"
    confidence: Literal["high", "medium", "low"] = "high"
    privacy_classification: str = "share-safe"
    claim_text: str | None = None
    employer_association: str | None = None
    project_association: str | None = None


class ResumeBullet(StrictModel):
    text: str
    evidence_ids: list[str] = Field(default_factory=list)
    matched_requirements: list[str] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "high"
    claim_risk: Literal["low", "medium", "high"] = "low"
    source_version: str = "career-evidence"


class ResumeItem(StrictModel):
    heading: str
    subheading: str | None = None
    location: str | None = None
    dates: str | None = None
    bullets: list[ResumeBullet] = Field(default_factory=list)


class ResumeSection(StrictModel):
    type: Literal["summary", "skills", "experience", "projects", "education", "certifications", "other"]
    title: str
    order: int = 0
    content: str | None = None
    bullets: list[ResumeBullet] | None = None
    items: list[ResumeItem] | None = None


class ResumeDocument(StrictModel):
    version_number: int = Field(ge=0, le=4)
    score: float = Field(ge=0, le=100)
    score_breakdown: dict[str, float]
    notes: str
    sections: list[ResumeSection]


class JobParseRequest(StrictModel):
    context: RequestContext
    job_text: str = Field(min_length=20, max_length=100_000)
    company: str | None = None
    role: str | None = None


class JobParseResponse(StrictModel):
    title: str | None = None
    company: str | None = None
    role: str | None = None
    location: str | None = None
    employment_type: str | None = None
    seniority: str | None = None
    required_qualifications: list[str] = Field(default_factory=list)
    preferred_qualifications: list[str] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)
    target_technologies: list[str] = Field(default_factory=list)


class ResumeParseRequest(StrictModel):
    context: RequestContext
    filename: str
    content_type: str
    content_base64: str


class ResumeParseResponse(StrictModel):
    text: str
    page_count: int | None = None
    warnings: list[str] = Field(default_factory=list)


class ResearchSource(StrictModel):
    id: str
    url: str
    title: str
    accessed_at: str
    supporting_text: str
    confidence: Literal["high", "medium", "low"] = "medium"
    classification: Literal["explicit", "inferred", "uncertain"] = "explicit"
    relevance: float = Field(ge=0, le=1, default=0.5)


class ResearchSynthesizeRequest(StrictModel):
    context: RequestContext
    company: str
    role: str
    job_description: str
    sources: list[ResearchSource] = Field(default_factory=list)


class ResearchFinding(StrictModel):
    category: str
    title: str
    summary: str
    confidence: Literal["high", "medium", "low"]
    status: Literal["supported", "uncertain", "unavailable"] = "supported"
    source_ids: list[str] = Field(default_factory=list)


class ResearchSynthesizeResponse(StrictModel):
    findings: list[ResearchFinding]
    sources: list[ResearchSource]
    overall_confidence: float
    company_research_status: str | None = None


class EvidenceIndexRequest(StrictModel):
    context: RequestContext
    evidence: list[EvidenceItem]


class EvidenceIndexResponse(StrictModel):
    indexed: int
    tenant_id: str
    owner_user_id: str


class EvidenceSearchRequest(StrictModel):
    context: RequestContext
    query: str
    owner_user_id: str
    limit: int = Field(default=8, ge=1, le=50)


class EvidenceSearchHit(StrictModel):
    evidence_id: str
    score: float
    snippet: str


class EvidenceSearchResponse(StrictModel):
    hits: list[EvidenceSearchHit]


class EvidenceMatchRequest(StrictModel):
    context: RequestContext
    requirements: list[str]
    evidence: list[EvidenceItem]
    research_findings: list[ResearchFinding] = Field(default_factory=list)


class EvidenceMatchRow(StrictModel):
    requirement: str
    importance: Literal["required", "preferred", "responsibility"] = "required"
    evidence_ids: list[str]
    evidence_strength: Literal["strong", "partial", "none"]
    resume_usage: Literal["use", "consider", "skip"] = "use"
    coverage_gap: str | None = None


class EvidenceMatchResponse(StrictModel):
    rows: list[EvidenceMatchRow]
    evidence_coverage: float


class ResumeGenerateRequest(StrictModel):
    context: RequestContext
    version_number: int = Field(ge=0, le=4)
    job_description: str
    evidence: list[EvidenceItem]
    allowed_technologies: list[str] = Field(default_factory=list)
    previous_resume: dict[str, Any] | None = None
    accepted_findings: list[dict[str, Any]] = Field(default_factory=list)
    research_findings: list[ResearchFinding] = Field(default_factory=list)
    refinement_instruction: str | None = None


class ResumeGenerateResponse(StrictModel):
    resume: ResumeDocument
    provider: str
    model: str
    prompt_version: str
    latency_ms: int


class AuditRequest(StrictModel):
    context: RequestContext
    lens: Literal["hr-1", "em-1", "hr-2", "em-2"]
    reviews_version: int
    produces_version: int
    resume: ResumeDocument
    evidence: list[EvidenceItem]
    job_description: str


class AuditFinding(StrictModel):
    severity: Literal["critical", "major", "minor", "nit"]
    section: str
    title: str
    explanation: str
    before_text: str
    suggested_text: str
    expected_score_impact: float
    evidence_source: str | None = None


class AuditResponse(StrictModel):
    lens: Literal["hr-1", "em-1", "hr-2", "em-2"]
    reviews_version: int
    produces_version: int
    score_before: float
    score_after: float
    summary: str
    findings: list[AuditFinding]
    provider: str
    model: str


class FinalQaRequest(StrictModel):
    context: RequestContext
    resume: ResumeDocument
    evidence: list[EvidenceItem]
    deterministic_checks: list[dict[str, Any]] = Field(default_factory=list)


class FinalQaCheck(StrictModel):
    label: str
    status: Literal["pass", "warn", "fail"]
    detail: str


class FinalQaResponse(StrictModel):
    passed: bool
    checks: list[FinalQaCheck]
    provider: str
    model: str


class ApiError(StrictModel):
    code: str
    message: str
    request_id: str | None = None
    details: dict[str, Any] | None = None


class HealthLiveResponse(StrictModel):
    status: Literal["ok"] = "ok"


class HealthReadyResponse(StrictModel):
    status: Literal["ready", "not_ready"]
    errors: list[str] = Field(default_factory=list)
