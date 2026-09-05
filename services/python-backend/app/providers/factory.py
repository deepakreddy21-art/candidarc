from __future__ import annotations

from typing import Any, Protocol

from app.core.config import Settings, get_settings
from app.domain.schemas import (
    AuditResponse,
    EvidenceMatchResponse,
    FinalQaResponse,
    ResearchSynthesizeResponse,
    ResumeDocument,
)
from app.providers.anthropic_provider import AnthropicProvider
from app.providers.mock_provider import MockProvider
from app.providers.openai_provider import OpenAIProvider


class IntelligenceProvider(Protocol):
    name: str
    model: str

    async def generate_resume(self, **kwargs: Any) -> tuple[ResumeDocument, int]: ...
    async def audit(self, **kwargs: Any) -> tuple[AuditResponse, int]: ...
    async def final_qa(self, **kwargs: Any) -> tuple[FinalQaResponse, int]: ...
    async def synthesize_research(self, **kwargs: Any) -> tuple[ResearchSynthesizeResponse, int]: ...
    async def match_evidence(self, **kwargs: Any) -> tuple[EvidenceMatchResponse, int]: ...


def get_provider(role: str = "generation") -> Any:
    settings: Settings = get_settings()
    if settings.ai_mode == "mock":
        if settings.app_mode == "production":
            raise RuntimeError("MOCK_FORBIDDEN_IN_PRODUCTION")
        return MockProvider()

    if role in {"generation", "final-review"}:
        return OpenAIProvider(settings, role=role)
    return AnthropicProvider(settings, role=role)
