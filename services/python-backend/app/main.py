from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.api.v1.routes import router as v1_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.domain.schemas import HealthLiveResponse, HealthReadyResponse

settings = get_settings()
configure_logging(settings.log_level)

app = FastAPI(
    title="CandidArc Python Resume Intelligence",
    version=settings.schema_version,
    docs_url="/docs" if settings.app_mode != "production" else None,
    redoc_url=None,
)


@app.get("/health/live", response_model=HealthLiveResponse)
async def health_live() -> HealthLiveResponse:
    return HealthLiveResponse()


@app.get("/health/ready", response_model=HealthReadyResponse)
async def health_ready() -> HealthReadyResponse | JSONResponse:
    errors = settings.ready_errors()
    if errors:
        return JSONResponse(
            status_code=503,
            content=HealthReadyResponse(status="not_ready", errors=errors).model_dump(),
        )
    return HealthReadyResponse(status="ready", errors=[])


app.include_router(v1_router)
