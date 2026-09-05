from __future__ import annotations

from typing import Any, Protocol

from fastapi import Request

from app.core.config import Settings, get_settings
from app.core.errors import MOCK_FORBIDDEN_IN_PRODUCTION, ProviderError
from app.domain.schemas import (
    AuditResponse,
    EvidenceMatchResponse,
    FinalQaResponse,
    ProviderUsage,
    ResearchSynthesizeResponse,
    ResumeDocument,
)
from app.providers.anthropic_provider import AnthropicProvider
from app.providers.mock_provider import MockProvider
from app.providers.openai_provider import OpenAIProvider


class IntelligenceProvider(Protocol):
    name: str
    model: str

    async def generate_resume(self, **kwargs: Any) -> tuple[ResumeDocument, int, ProviderUsage]: ...
    async def audit(self, **kwargs: Any) -> tuple[AuditResponse, int, ProviderUsage]: ...
    async def final_qa(self, **kwargs: Any) -> tuple[FinalQaResponse, int, ProviderUsage]: ...
    async def synthesize_research(self, **kwargs: Any) -> tuple[ResearchSynthesizeResponse, int, ProviderUsage]: ...
    async def match_evidence(self, **kwargs: Any) -> tuple[EvidenceMatchResponse, int, ProviderUsage]: ...


def get_provider(role: str = "generation", request: Request | None = None) -> Any:
    settings: Settings = get_settings()
    openai_client = None
    anthropic_client = None
    if request is not None:
        openai_client = getattr(request.app.state, "openai_client", None)
        anthropic_client = getattr(request.app.state, "anthropic_client", None)

    if settings.ai_mode == "mock":
        if settings.app_mode == "production":
            raise ProviderError(MOCK_FORBIDDEN_IN_PRODUCTION, MOCK_FORBIDDEN_IN_PRODUCTION)
        return MockProvider()

    # Live mode: never construct MockProvider
    if role in {"generation", "final-review"}:
        return OpenAIProvider(settings, role=role, client=openai_client)
    return AnthropicProvider(settings, role=role, client=anthropic_client)
