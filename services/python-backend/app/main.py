from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.v1.routes import router as v1_router
from app.core.config import get_settings
from app.core.idempotency import MemoryIdempotencyStore, RedisIdempotencyStore
from app.core.logging import configure_logging
from app.domain.schemas import HealthLiveResponse, HealthReadyResponse


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
    yield

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
        if errors:
            return JSONResponse(
                status_code=503,
                content=HealthReadyResponse(status="not_ready", errors=errors).model_dump(),
            )
        return HealthReadyResponse(status="ready", errors=[])

    application.include_router(v1_router)
    return application


app = create_app()
