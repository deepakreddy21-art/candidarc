from __future__ import annotations

from typing import Any, Literal, cast

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status

from app.core.errors import (
    CROSS_OWNER_EVIDENCE,
    CROSS_TENANT_EVIDENCE,
    EVIDENCE_STORE_UNAVAILABLE,
    IDEMPOTENCY_KEY_REUSED,
    ProviderError,
    http_status_for,
)
from app.core.idempotency import idempotency_redis_key, request_hash
from app.core.metrics import IDEMPOTENCY_HITS, METRICS, PROVIDER_FAILURES, STAGE_LATENCY, TOKENS_IN, TOKENS_OUT
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
from app.modules.evidence.service import index_evidence_items, search_evidence_store
from app.modules.evidence.store.factory import get_embedding_provider, get_evidence_store
from app.modules.evidence.store.protocol import EvidenceStoreError
from app.modules.guardrails.service import validate_resume_claims
from app.modules.parsing.service import parse_job_text, parse_resume_bytes
from app.modules.research import service as research_svc
from app.modules.retrieval import service as retrieval
from app.providers.factory import get_provider

router = APIRouter(prefix="/v1", dependencies=[Depends(require_service_token)])


def _raise_provider(exc: Exception) -> None:
    if isinstance(exc, ProviderError):
        raise HTTPException(status_code=http_status_for(exc.code), detail={"code": exc.code, "message": exc.message}) from exc
    if isinstance(exc, RuntimeError):
        code = str(exc).split(":", 1)[0]
        raise HTTPException(status_code=http_status_for(code), detail={"code": code, "message": str(exc)}) from exc
    if isinstance(exc, ValueError) and str(exc).startswith("GUARDRAIL_VIOLATION"):
        raise HTTPException(
            status_code=422,
            detail={"code": "GUARDRAIL_VIOLATION", "message": str(exc)},
        ) from exc
    raise exc


def _assert_evidence_scope(tenant_id: str, user_id: str, evidence: list[Any]) -> None:
    for item in evidence:
        if item.tenant_id != tenant_id:
            raise HTTPException(
                status_code=403,
                detail={"code": CROSS_TENANT_EVIDENCE, "message": "Evidence tenant mismatch"},
            )
        if item.owner_user_id != user_id:
            raise HTTPException(
                status_code=403,
                detail={"code": CROSS_OWNER_EVIDENCE, "message": "Evidence owner mismatch"},
            )


async def _with_idempotency(
    request: Request,
    *,
    operation: str,
    tenant_id: str,
    user_id: str,
    idempotency_key: str | None,
    body_dict: dict[str, Any],
    handler: Any,
) -> Any:
    if not idempotency_key:
        return await handler()

    store = request.app.state.idempotency
    settings = request.app.state.settings
    key = idempotency_redis_key(tenant_id, user_id, operation, idempotency_key)
    digest = request_hash(body_dict)
    try:
        cached = await store.begin(key, digest, settings.idempotency_ttl_seconds)
    except ProviderError as exc:
        if exc.code == IDEMPOTENCY_KEY_REUSED:
            raise HTTPException(
                status_code=409,
                detail={"code": IDEMPOTENCY_KEY_REUSED, "message": exc.message},
            ) from exc
        raise HTTPException(status_code=http_status_for(exc.code), detail={"code": exc.code, "message": exc.message}) from exc

    if cached is not None:
        METRICS.incr(IDEMPOTENCY_HITS)
        return cached

    try:
        with METRICS.time_block(f"{STAGE_LATENCY}.{operation}"):
            result = await handler()
        payload = result.model_dump(mode="json") if hasattr(result, "model_dump") else result
        usage = getattr(result, "usage", None)
        if usage is not None:
            if getattr(usage, "input_tokens", None):
                METRICS.incr(TOKENS_IN, int(usage.input_tokens or 0))
            if getattr(usage, "output_tokens", None):
                METRICS.incr(TOKENS_OUT, int(usage.output_tokens or 0))
        await store.complete(key, digest, payload, settings.idempotency_ttl_seconds)
        return result
    except Exception:
        METRICS.incr(PROVIDER_FAILURES)
        await store.release(key)
        raise


@router.post("/resumes/parse", response_model=ResumeParseResponse)
async def resumes_parse(body: ResumeParseRequest) -> ResumeParseResponse:
    try:
        return await parse_resume_bytes(body.filename, body.content_type, body.content_base64)
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
async def research_synthesize(request: Request, body: ResearchSynthesizeRequest) -> ResearchSynthesizeResponse:
    try:
        provider = get_provider("generation", request)
        result, _, _ = await provider.synthesize_research(company=body.company, role=body.role, sources=body.sources)
    except Exception as exc:
        _raise_provider(exc)
        raise
    typed = result if isinstance(result, ResearchSynthesizeResponse) else ResearchSynthesizeResponse.model_validate(result)
    claim_leaks = research_svc.research_must_not_become_claims(typed.findings)
    if claim_leaks:
        raise HTTPException(
            status_code=422,
            detail={"code": "RESEARCH_AS_CANDIDATE_CLAIM", "message": "Research must not become candidate claims"},
        )
    return typed


def _store_backend(request: Request) -> Literal["memory", "postgres"]:
    settings = request.app.state.settings
    return cast(Literal["memory", "postgres"], settings.evidence_store_backend())


@router.post("/evidence/index", response_model=EvidenceIndexResponse)
async def evidence_index(request: Request, body: EvidenceIndexRequest) -> EvidenceIndexResponse:
    """Index evidence via EvidenceStore. Production uses postgres; demo may use memory.

    Process-global `_INDEX` is never authoritative in production (no silent memory fallback).
    """
    settings = request.app.state.settings
    backend = settings.evidence_store_backend()
    if settings.app_mode == "production" and backend != "postgres":
        raise HTTPException(
            status_code=503,
            detail={
                "code": EVIDENCE_STORE_UNAVAILABLE,
                "message": "Production requires postgres evidence store",
            },
        )
    _assert_evidence_scope(body.context.tenant_id, body.context.user_id, body.evidence)
    try:
        store = get_evidence_store()
        embedder = get_embedding_provider()
        indexed = await index_evidence_items(
            store,
            embedder,
            tenant_id=body.context.tenant_id,
            owner_user_id=body.context.user_id,
            evidence=body.evidence,
        )
    except EvidenceStoreError as exc:
        raise HTTPException(
            status_code=http_status_for(exc.code),
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    # Keep demo process-local cache in sync for legacy unit tests only (never in production)
    if settings.app_mode != "production" and backend == "memory":
        retrieval.index_evidence(body.context.tenant_id, body.context.user_id, body.evidence)
    return EvidenceIndexResponse(
        indexed=indexed,
        tenant_id=body.context.tenant_id,
        owner_user_id=body.context.user_id,
        experimental=backend == "memory",
        store_backend=backend,
    )


@router.post("/evidence/search", response_model=EvidenceSearchResponse)
async def evidence_search(request: Request, body: EvidenceSearchRequest) -> EvidenceSearchResponse:
    settings = request.app.state.settings
    backend = settings.evidence_store_backend()
    if settings.app_mode == "production" and backend != "postgres":
        raise HTTPException(
            status_code=503,
            detail={
                "code": EVIDENCE_STORE_UNAVAILABLE,
                "message": "Production requires postgres evidence store",
            },
        )
    if body.owner_user_id != body.context.user_id:
        raise HTTPException(status_code=403, detail={"code": "CROSS_OWNER_SEARCH", "message": "Cannot search another candidate"})
    try:
        store = get_evidence_store()
        embedder = get_embedding_provider()
        hits = await search_evidence_store(
            store,
            embedder,
            tenant_id=body.context.tenant_id,
            owner_user_id=body.owner_user_id,
            query=body.query,
            limit=body.limit,
        )
    except EvidenceStoreError as exc:
        raise HTTPException(
            status_code=http_status_for(exc.code),
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    return EvidenceSearchResponse(
        hits=hits,
        experimental=backend == "memory",
        store_backend=backend,
    )


@router.post("/evidence/match", response_model=EvidenceMatchResponse)
async def evidence_match(request: Request, body: EvidenceMatchRequest) -> EvidenceMatchResponse:
    """Authoritative request-scoped match. Optionally enrich notes via store search (non-authoritative)."""
    _assert_evidence_scope(body.context.tenant_id, body.context.user_id, body.evidence)
    _ = body.research_findings  # intentionally ignored for claim formation
    try:
        provider = get_provider("generation", request)
        result, _, _ = await provider.match_evidence(requirements=body.requirements, evidence=body.evidence)
    except Exception as exc:
        _raise_provider(exc)
        raise
    return result if isinstance(result, EvidenceMatchResponse) else EvidenceMatchResponse.model_validate(result)


async def _generate_handler(request: Request, body: ResumeGenerateRequest) -> ResumeGenerateResponse:
    _assert_evidence_scope(body.context.tenant_id, body.context.user_id, body.evidence)
    _ = body.research_findings  # untrusted — questions only via generation path
    absolute = body.absolute_version if body.absolute_version is not None else 0
    cycle = body.cycle_step if body.cycle_step is not None else absolute % 5
    try:
        provider = get_provider("generation", request)
        resume, latency, usage = await provider.generate_resume(
            absolute_version=absolute,
            cycle_step=cycle,
            version_number=absolute,
            evidence=body.evidence,
            allowed_technologies=body.allowed_technologies,
            job_description=body.job_description,
            job_requirements=body.job_requirements,
            previous_resume=body.previous_resume,
            accepted_findings=body.accepted_findings,
            rejected_findings=body.rejected_findings,
            mistake_memory=body.mistake_memory,
            research_findings=body.research_findings,
            user_confirmations=body.user_confirmations,
        )
    except Exception as exc:
        _raise_provider(exc)
        raise
    violations = validate_resume_claims(
        resume,
        body.evidence,
        body.allowed_technologies,
        tenant_id=body.context.tenant_id,
        owner_user_id=body.context.user_id,
        job_description=body.job_description,
        research_findings=body.research_findings,
        user_confirmations=body.user_confirmations,
    )
    if violations:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "GUARDRAIL_VIOLATION",
                "message": "Resume failed claim checks",
                "details": {"violations": violations},
            },
        )
    return ResumeGenerateResponse(
        resume=resume,
        provider=provider.name,
        model=provider.model,
        prompt_version=usage.prompt_version if usage else "resume-generation@python-v2",
        latency_ms=latency,
        usage=usage,
    )


@router.post("/resumes/generate", response_model=ResumeGenerateResponse)
async def resumes_generate(
    request: Request,
    body: ResumeGenerateRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> ResumeGenerateResponse | dict[str, Any]:
    return cast(
        ResumeGenerateResponse | dict[str, Any],
        await _with_idempotency(
            request,
            operation="generate",
            tenant_id=body.context.tenant_id,
            user_id=body.context.user_id,
            idempotency_key=idempotency_key,
            body_dict=body.model_dump(mode="json"),
            handler=lambda: _generate_handler(request, body),
        ),
    )


@router.post("/resumes/audit", response_model=AuditResponse)
async def resumes_audit(
    request: Request,
    body: AuditRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> AuditResponse | dict[str, Any]:
    _assert_evidence_scope(body.context.tenant_id, body.context.user_id, body.evidence)

    async def _handler() -> AuditResponse:
        try:
            provider = get_provider(audits.lens_to_role(body.lens), request)
            result, _, usage = await provider.audit(
                lens=body.lens,
                reviews_version=body.reviews_version,
                produces_version=body.produces_version,
                resume=body.resume,
                evidence=body.evidence,
                job_description=body.job_description,
                allowed_technologies=body.allowed_technologies,
                tenant_id=body.context.tenant_id,
                owner_user_id=body.context.user_id,
            )
        except Exception as exc:
            _raise_provider(exc)
            raise
        typed = result if isinstance(result, AuditResponse) else AuditResponse.model_validate(result)
        if typed.usage is None:
            typed = typed.model_copy(update={"usage": usage})
        if not typed.rejected_findings and typed.findings:
            accepted, rejected = audits.adjudicate_findings(
                typed.findings,
                body.evidence,
                body.allowed_technologies,
                tenant_id=body.context.tenant_id,
                owner_user_id=body.context.user_id,
            )
            typed = typed.model_copy(update={"findings": accepted, "rejected_findings": rejected})
        return typed

    return cast(
        AuditResponse | dict[str, Any],
        await _with_idempotency(
            request,
            operation="audit",
            tenant_id=body.context.tenant_id,
            user_id=body.context.user_id,
            idempotency_key=idempotency_key,
            body_dict=body.model_dump(mode="json"),
            handler=_handler,
        ),
    )


@router.post("/resumes/regenerate", response_model=ResumeGenerateResponse)
async def resumes_regenerate(
    request: Request,
    body: ResumeGenerateRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> ResumeGenerateResponse | dict[str, Any]:
    return cast(
        ResumeGenerateResponse | dict[str, Any],
        await _with_idempotency(
            request,
            operation="regenerate",
            tenant_id=body.context.tenant_id,
            user_id=body.context.user_id,
            idempotency_key=idempotency_key,
            body_dict=body.model_dump(mode="json"),
            handler=lambda: _generate_handler(request, body),
        ),
    )


@router.post("/resumes/final-qa", response_model=FinalQaResponse)
async def resumes_final_qa(
    request: Request,
    body: FinalQaRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> FinalQaResponse | dict[str, Any]:
    _assert_evidence_scope(body.context.tenant_id, body.context.user_id, body.evidence)

    async def _handler() -> FinalQaResponse:
        try:
            provider = get_provider("final-review", request)
            result, _, usage = await provider.final_qa(
                resume=body.resume,
                evidence=body.evidence,
                deterministic_checks=body.deterministic_checks,
                allowed_technologies=body.allowed_technologies,
            )
        except Exception as exc:
            _raise_provider(exc)
            raise
        typed = result if isinstance(result, FinalQaResponse) else FinalQaResponse.model_validate(result)
        if typed.usage is None:
            typed = typed.model_copy(update={"usage": usage})
        return typed

    return cast(
        FinalQaResponse | dict[str, Any],
        await _with_idempotency(
            request,
            operation="final-qa",
            tenant_id=body.context.tenant_id,
            user_id=body.context.user_id,
            idempotency_key=idempotency_key,
            body_dict=body.model_dump(mode="json"),
            handler=_handler,
        ),
    )
