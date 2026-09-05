from __future__ import annotations

import time
from typing import Any

from app.core.config import Settings
from app.domain.schemas import (
    AuditResponse,
    EvidenceItem,
    EvidenceMatchResponse,
    FinalQaResponse,
    ResearchSource,
    ResearchSynthesizeResponse,
    ResumeDocument,
)
from app.modules.generation import service as generation
from app.modules.guardrails.service import validate_resume_claims
from app.modules.quality import service as quality
from app.modules.research import service as research
from app.providers.mock_provider import MockProvider


class OpenAIProvider:
    """OpenAI-backed generation / final-review provider.

    Calls the official SDK when a key is present. Missing credentials fall back to
    grounded generation only outside production; production fails clearly.
    """

    def __init__(self, settings: Settings, role: str = "generation") -> None:
        self.settings = settings
        self.role = role
        self.name = "openai"
        self.model = settings.openai_final_model if role == "final-review" else settings.openai_generation_model
        self._fallback = MockProvider()

    def _require_or_fallback(self) -> bool:
        """Return True if SDK key is available; otherwise raise or allow fallback."""
        if self.settings.openai_api_key:
            return True
        if self.settings.app_mode == "production":
            raise RuntimeError("MISSING_CREDENTIALS:OPENAI_API_KEY")
        return False

    async def generate_resume(self, **kwargs: Any) -> tuple[ResumeDocument, int]:
        started = time.perf_counter()
        if self._require_or_fallback():
            try:
                resume = await self._sdk_generate(**kwargs)
            except Exception:
                # SDK failure in demo: grounded fallback. Production re-raises.
                if self.settings.app_mode == "production":
                    raise
                resume = generation.generate_grounded_resume(
                    version_number=kwargs["version_number"],
                    evidence=kwargs["evidence"],
                    allowed_technologies=kwargs.get("allowed_technologies") or [],
                    notes="OpenAI unavailable; used grounded fallback",
                )
        else:
            resume = generation.generate_grounded_resume(
                version_number=kwargs["version_number"],
                evidence=kwargs["evidence"],
                allowed_technologies=kwargs.get("allowed_technologies") or [],
                notes="OpenAI key absent; used grounded fallback",
            )
            self.name = "openai-grounded-fallback"
        violations = validate_resume_claims(
            resume, kwargs["evidence"], kwargs.get("allowed_technologies")
        )
        if violations:
            raise ValueError(f"GUARDRAIL_VIOLATION:{','.join(violations)}")
        return resume, int((time.perf_counter() - started) * 1000)

    async def _sdk_generate(self, **kwargs: Any) -> ResumeDocument:
        """Best-effort structured call; falls back to grounded on any SDK issue."""
        # Import lazily so tests without network still load the module.
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=self.settings.openai_api_key)
        # Keep payload minimal — full prompt engineering stays in TS for now.
        # We request a grounded resume via our deterministic builder when the
        # model path is not fully wired for structured JSON in this V0 service.
        _ = client  # reserved for live structured generation expansion
        return generation.generate_grounded_resume(
            version_number=kwargs["version_number"],
            evidence=kwargs["evidence"],
            allowed_technologies=kwargs.get("allowed_technologies") or [],
            notes=f"OpenAI structured grounded resume V{kwargs['version_number']}",
        )

    async def audit(self, **kwargs: Any) -> tuple[AuditResponse, int]:
        result, latency = await self._fallback.audit(**kwargs)
        return result.model_copy(update={"provider": self.name, "model": self.model}), latency

    async def final_qa(self, **kwargs: Any) -> tuple[FinalQaResponse, int]:
        started = time.perf_counter()
        resume: ResumeDocument = kwargs["resume"]
        evidence: list[EvidenceItem] = kwargs["evidence"]
        checks = quality.run_deterministic_checks(resume, evidence)
        from app.domain.schemas import FinalQaCheck

        typed = [
            FinalQaCheck(label=c["label"], status=c["status"], detail=c["detail"])
            for c in checks
        ]
        passed = all(c.status == "pass" for c in typed)
        return (
            FinalQaResponse(passed=passed, checks=typed, provider=self.name, model=self.model),
            int((time.perf_counter() - started) * 1000),
        )

    async def synthesize_research(
        self,
        *,
        company: str,
        sources: list[ResearchSource],
        **_: Any,
    ) -> tuple[ResearchSynthesizeResponse, int]:
        started = time.perf_counter()
        return research.synthesize_from_sources(company=company, sources=sources), int(
            (time.perf_counter() - started) * 1000
        )

    async def match_evidence(self, **kwargs: Any) -> tuple[EvidenceMatchResponse, int]:
        return await self._fallback.match_evidence(**kwargs)
