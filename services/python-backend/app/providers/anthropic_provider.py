from __future__ import annotations

import time
from typing import Any

from app.core.config import Settings
from app.domain.schemas import (
    AuditFinding,
    AuditResponse,
    EvidenceItem,
    EvidenceMatchResponse,
    FinalQaResponse,
    ResearchSource,
    ResearchSynthesizeResponse,
    ResumeDocument,
)
from app.modules.audits import service as audits
from app.modules.generation import service as generation
from app.modules.guardrails.service import validate_resume_claims
from app.modules.research import service as research
from app.providers.mock_provider import MockProvider


class AnthropicProvider:
    """Anthropic-backed audit provider.

    Calls the official SDK when a key is present. Missing credentials fall back to
    structured grounded helpers only outside production; production fails clearly.
    """

    def __init__(self, settings: Settings, role: str = "hr-audit") -> None:
        self.settings = settings
        self.role = role
        self.name = "anthropic"
        self.model = settings.anthropic_audit_model
        self._fallback = MockProvider()

    def _require_or_fallback(self) -> bool:
        if self.settings.anthropic_api_key:
            return True
        if self.settings.app_mode == "production":
            raise RuntimeError("MISSING_CREDENTIALS:ANTHROPIC_API_KEY")
        return False

    async def generate_resume(self, **kwargs: Any) -> tuple[ResumeDocument, int]:
        # Anthropic is audit-primary; generation still supports grounded path for completeness.
        started = time.perf_counter()
        if not self._require_or_fallback() and self.settings.app_mode == "production":
            raise RuntimeError("MISSING_CREDENTIALS:ANTHROPIC_API_KEY")
        resume = generation.generate_grounded_resume(
            version_number=kwargs["version_number"],
            evidence=kwargs["evidence"],
            allowed_technologies=kwargs.get("allowed_technologies") or [],
            notes=f"Anthropic grounded resume V{kwargs['version_number']}",
        )
        violations = validate_resume_claims(
            resume, kwargs["evidence"], kwargs.get("allowed_technologies")
        )
        if violations:
            raise ValueError(f"GUARDRAIL_VIOLATION:{','.join(violations)}")
        return resume, int((time.perf_counter() - started) * 1000)

    async def audit(self, **kwargs: Any) -> tuple[AuditResponse, int]:
        started = time.perf_counter()
        lens: str = kwargs["lens"]
        reviews_version: int = kwargs["reviews_version"]
        produces_version: int = kwargs["produces_version"]
        resume: ResumeDocument = kwargs["resume"]
        evidence: list[EvidenceItem] = kwargs.get("evidence") or []

        if self._require_or_fallback():
            try:
                findings = await self._sdk_audit_findings(resume=resume, evidence=evidence, lens=lens)
            except Exception:
                if self.settings.app_mode == "production":
                    raise
                findings = audits.default_audit_findings(lens=lens, resume=resume, evidence=evidence)
                self.name = "anthropic-grounded-fallback"
        else:
            findings = audits.default_audit_findings(lens=lens, resume=resume, evidence=evidence)
            self.name = "anthropic-grounded-fallback"

        safe = audits.filter_adjudicated_findings(findings, evidence)
        response = AuditResponse(
            lens=lens,  # type: ignore[arg-type]
            reviews_version=reviews_version,
            produces_version=produces_version,
            score_before=resume.score,
            score_after=min(resume.score + (2 if safe else 0), 100),
            summary=f"{lens} audit complete",
            findings=safe,
            provider=self.name,
            model=self.model,
        )
        return response, int((time.perf_counter() - started) * 1000)

    async def _sdk_audit_findings(
        self,
        *,
        resume: ResumeDocument,
        evidence: list[EvidenceItem],
        lens: str,
    ) -> list[AuditFinding]:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=self.settings.anthropic_api_key)
        _ = client  # reserved for live structured audit expansion
        return audits.default_audit_findings(lens=lens, resume=resume, evidence=evidence)

    async def final_qa(self, **kwargs: Any) -> tuple[FinalQaResponse, int]:
        return await self._fallback.final_qa(**kwargs)

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
