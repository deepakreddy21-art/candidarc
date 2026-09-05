from __future__ import annotations

from typing import cast

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.core.security import require_service_token
from app.domain.schemas import (
    AuditRequest,
    AuditResponse,
    EvidenceIndexRequest,
    EvidenceIndexResponse,
    EvidenceMatchRequest,
    EvidenceMatchResponse,
    EvidenceSearchRequest,
    EvidenceSearchResponse,
    FinalQaRequest,
    FinalQaResponse,
    JobParseRequest,
    JobParseResponse,
    ResearchSynthesizeRequest,
    ResearchSynthesizeResponse,
    ResumeGenerateRequest,
    ResumeGenerateResponse,
    ResumeParseRequest,
    ResumeParseResponse,
)
from app.modules.audits import service as audits
from app.modules.guardrails.service import validate_resume_claims
from app.modules.parsing.service import parse_job_text, parse_resume_bytes
from app.modules.research import service as research_svc
from app.modules.retrieval import service as retrieval
from app.providers.factory import get_provider

router = APIRouter(prefix="/v1", dependencies=[Depends(require_service_token)])


def _accept_idempotency(_idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> None:
    """Accept Idempotency-Key when present; routing is currently request-scoped."""
    return None


@router.post("/resumes/parse", response_model=ResumeParseResponse)
async def resumes_parse(body: ResumeParseRequest) -> ResumeParseResponse:
    try:
        return parse_resume_bytes(body.filename, body.content_type, body.content_base64)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": str(exc), "message": "Unsupported document"},
        ) from exc


@router.post("/jobs/parse", response_model=JobParseResponse)
async def jobs_parse(body: JobParseRequest) -> JobParseResponse:
    parsed = parse_job_text(body.job_text, body.company, body.role)
    return JobParseResponse(**parsed)


@router.post("/research/synthesize", response_model=ResearchSynthesizeResponse)
async def research_synthesize(body: ResearchSynthesizeRequest) -> ResearchSynthesizeResponse:
    provider = get_provider("generation")
    result, _ = await provider.synthesize_research(company=body.company, role=body.role, sources=body.sources)
    # Ensure research never invents candidate-experience language.
    typed = cast(ResearchSynthesizeResponse, result)
    claim_leaks = research_svc.research_must_not_become_claims(typed.findings)
    if claim_leaks:
        raise HTTPException(
            status_code=422,
            detail={"code": "RESEARCH_AS_CANDIDATE_CLAIM", "message": "Research must not become candidate claims"},
        )
    return typed


@router.post("/evidence/index", response_model=EvidenceIndexResponse)
async def evidence_index(body: EvidenceIndexRequest) -> EvidenceIndexResponse:
    if any(item.tenant_id != body.context.tenant_id for item in body.evidence):
        raise HTTPException(status_code=403, detail={"code": "CROSS_TENANT_EVIDENCE", "message": "Evidence tenant mismatch"})
    if any(item.owner_user_id != body.context.user_id for item in body.evidence):
        raise HTTPException(status_code=403, detail={"code": "CROSS_OWNER_EVIDENCE", "message": "Evidence owner mismatch"})
    indexed = retrieval.index_evidence(body.context.tenant_id, body.context.user_id, body.evidence)
    return EvidenceIndexResponse(indexed=indexed, tenant_id=body.context.tenant_id, owner_user_id=body.context.user_id)


@router.post("/evidence/search", response_model=EvidenceSearchResponse)
async def evidence_search(body: EvidenceSearchRequest) -> EvidenceSearchResponse:
    if body.owner_user_id != body.context.user_id:
        raise HTTPException(status_code=403, detail={"code": "CROSS_OWNER_SEARCH", "message": "Cannot search another candidate"})
    hits = retrieval.search_evidence(body.context.tenant_id, body.owner_user_id, body.query, body.limit)
    return EvidenceSearchResponse(hits=hits)


@router.post("/evidence/match", response_model=EvidenceMatchResponse)
async def evidence_match(body: EvidenceMatchRequest) -> EvidenceMatchResponse:
    if any(item.tenant_id != body.context.tenant_id or item.owner_user_id != body.context.user_id for item in body.evidence):
        raise HTTPException(status_code=403, detail={"code": "CROSS_TENANT_EVIDENCE", "message": "Evidence scope mismatch"})
    # Research must never become candidate evidence; only requirements+evidence used.
    _ = body.research_findings  # intentionally ignored for claim formation
    provider = get_provider("generation")
    result, _ = await provider.match_evidence(requirements=body.requirements, evidence=body.evidence)
    return cast(EvidenceMatchResponse, result)


@router.post("/resumes/generate", response_model=ResumeGenerateResponse, dependencies=[Depends(_accept_idempotency)])
async def resumes_generate(body: ResumeGenerateRequest) -> ResumeGenerateResponse:
    if any(item.tenant_id != body.context.tenant_id or item.owner_user_id != body.context.user_id for item in body.evidence):
        raise HTTPException(status_code=403, detail={"code": "CROSS_TENANT_EVIDENCE", "message": "Evidence scope mismatch"})
    # Research findings must not become candidate claims.
    _ = body.research_findings
    try:
        provider = get_provider("generation")
        resume, latency = await provider.generate_resume(
            version_number=body.version_number,
            evidence=body.evidence,
            allowed_technologies=body.allowed_technologies,
            job_description=body.job_description,
            accepted_findings=body.accepted_findings,
        )
    except RuntimeError as exc:
        code = str(exc)
        status_code = 503 if "MISSING_CREDENTIALS" in code or "MOCK_FORBIDDEN" in code else 500
        raise HTTPException(status_code=status_code, detail={"code": code, "message": code}) from exc
    violations = validate_resume_claims(resume, body.evidence, body.allowed_technologies)
    if violations:
        raise HTTPException(
            status_code=422,
            detail={"code": "GUARDRAIL_VIOLATION", "message": "Resume failed claim checks", "details": {"violations": violations}},
        )
    return ResumeGenerateResponse(
        resume=resume,
        provider=provider.name,
        model=provider.model,
        prompt_version="resume-generation@python-v1",
        latency_ms=latency,
    )


@router.post("/resumes/audit", response_model=AuditResponse, dependencies=[Depends(_accept_idempotency)])
async def resumes_audit(body: AuditRequest) -> AuditResponse:
    try:
        provider = get_provider(audits.lens_to_role(body.lens))
        result, _ = await provider.audit(
            lens=body.lens,
            reviews_version=body.reviews_version,
            produces_version=body.produces_version,
            resume=body.resume,
            evidence=body.evidence,
            job_description=body.job_description,
        )
    except RuntimeError as exc:
        code = str(exc)
        status_code = 503 if "MISSING_CREDENTIALS" in code or "MOCK_FORBIDDEN" in code else 500
        raise HTTPException(status_code=status_code, detail={"code": code, "message": code}) from exc
    typed = cast(AuditResponse, result)
    safe_findings = audits.filter_adjudicated_findings(typed.findings, body.evidence)
    return typed.model_copy(update={"findings": safe_findings})


@router.post("/resumes/regenerate", response_model=ResumeGenerateResponse, dependencies=[Depends(_accept_idempotency)])
async def resumes_regenerate(body: ResumeGenerateRequest) -> ResumeGenerateResponse:
    return await resumes_generate(body)


@router.post("/resumes/final-qa", response_model=FinalQaResponse)
async def resumes_final_qa(body: FinalQaRequest) -> FinalQaResponse:
    try:
        provider = get_provider("final-review")
        result, _ = await provider.final_qa(
            resume=body.resume,
            evidence=body.evidence,
            deterministic_checks=body.deterministic_checks,
        )
    except RuntimeError as exc:
        code = str(exc)
        status_code = 503 if "MISSING_CREDENTIALS" in code or "MOCK_FORBIDDEN" in code else 500
        raise HTTPException(status_code=status_code, detail={"code": code, "message": code}) from exc
    return cast(FinalQaResponse, result)
