from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.v1.routes import router as v1_router
from app.core.config import get_settings
from app.core.idempotency import MemoryIdempotencyStore, RedisIdempotencyStore
from app.core.logging import configure_logging
from app.core.metrics import METRICS
from app.core.security import require_service_token
from app.domain.schemas import HealthLiveResponse, HealthReadyResponse
from app.modules.evidence.store.factory import close_evidence_store, init_evidence_store
from app.modules.evidence.store.protocol import EvidenceStoreError


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    openai_client: Any | None = None
    anthropic_client: Any | None = None
    redis_client: Any | None = None

    if settings.ai_mode == "live":
        if settings.generation_api_key() or settings.final_review_api_key():
            from openai import AsyncOpenAI

            # Prefer generation key for shared client; final-review may share same org key.
            key = settings.generation_api_key() or settings.final_review_api_key()
            openai_client = AsyncOpenAI(api_key=key, timeout=settings.http_timeout_seconds)
            app.state.openai_client = openai_client
        else:
            app.state.openai_client = None

        if settings.audit_api_key():
            from anthropic import AsyncAnthropic

            anthropic_client = AsyncAnthropic(api_key=settings.audit_api_key(), timeout=settings.http_timeout_seconds)
            app.state.anthropic_client = anthropic_client
        else:
            app.state.anthropic_client = None
    else:
        # Mock mode never constructs live clients
        app.state.openai_client = None
        app.state.anthropic_client = None

    if settings.redis_url:
        from redis.asyncio import Redis

        redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
        app.state.redis = redis_client
        app.state.idempotency = RedisIdempotencyStore(redis_client)
    else:
        app.state.redis = None
        app.state.idempotency = MemoryIdempotencyStore()

    app.state.settings = settings
    app.state.metrics = METRICS

    # Evidence store: production requires postgres; demo may use memory. Never silent fallback.
    try:
        store = await init_evidence_store(settings, openai_client=getattr(app.state, "openai_client", None))
        app.state.evidence_store = store
        app.state.evidence_store_error = None
    except EvidenceStoreError as exc:
        app.state.evidence_store = None
        app.state.evidence_store_error = exc
        if settings.app_mode == "production":
            # Fail closed in production — readiness will report not_ready
            pass

    yield

    await close_evidence_store()
    if openai_client is not None:
        await openai_client.close()
    if anthropic_client is not None:
        await anthropic_client.close()
    if redis_client is not None:
        await redis_client.aclose()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    application = FastAPI(
        title="CandidArc Python Resume Intelligence",
        version=settings.schema_version,
        docs_url="/docs" if settings.app_mode != "production" else None,
        redoc_url=None,
        lifespan=lifespan,
    )

    @application.get("/health/live", response_model=HealthLiveResponse)
    async def health_live() -> HealthLiveResponse:
        return HealthLiveResponse()

    @application.get("/health/ready", response_model=HealthReadyResponse)
    async def health_ready(request: Request) -> HealthReadyResponse | JSONResponse:
        runtime_settings = getattr(request.app.state, "settings", None) or get_settings()
        errors = runtime_settings.ready_errors()
        store_err = getattr(request.app.state, "evidence_store_error", None)
        store = getattr(request.app.state, "evidence_store", None)
        if runtime_settings.app_mode == "production":
            if store_err is not None:
                errors.append(f"Evidence store unavailable: {store_err.message}")
            elif store is None:
                errors.append("Evidence store not initialized")
            else:
                healthy = await store.health_check()
                if not healthy:
                    errors.append("Evidence store health check failed (postgres/pgvector)")
        if errors:
            return JSONResponse(
                status_code=503,
                content=HealthReadyResponse(status="not_ready", errors=errors).model_dump(),
            )
        return HealthReadyResponse(status="ready", errors=[])

    @application.get("/metrics")
    async def metrics_endpoint(
        request: Request,
        _: None = Depends(require_service_token),
    ) -> dict[str, Any]:
        """Service-token protected JSON metrics. Never includes PII."""
        registry = getattr(request.app.state, "metrics", None) or METRICS
        snap = registry.snapshot()
        return {
            "service": "candidarc-python-backend",
            "counters": snap["counters"],
            "histograms": snap["histograms"],
        }

    application.include_router(v1_router)
    return application


app = create_app()
