"""Provider SDK interaction tests — mocked transport, fail-closed behavior."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.config import Settings
from app.core.errors import MISSING_CREDENTIALS, PROVIDER_OUTPUT_INVALID, ProviderError
from app.domain.schemas import ResumeDocument
from app.main import create_app
from app.providers.anthropic_provider import AnthropicProvider
from app.providers.openai_provider import OpenAIProvider
from tests.conftest import qa_evidence


def _settings(**overrides: Any) -> Settings:
    base = {
        "app_mode": "demo",
        "ai_mode": "live",
        "openai_api_key": "sk-test-key",
        "anthropic_api_key": "ant-test-key",
        "service_token": "dev-python-backend-token-change-me",
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_openai_parse_called_and_usage_returned() -> None:
    evidence = qa_evidence()
    resume_payload = {
        "absolute_version": 0,
        "cycle_step": 0,
        "version_number": 0,
        "score": 70,
        "score_breakdown": {
            "atsCompatibility": 70,
            "jobAlignment": 70,
            "recruiterReadability": 70,
            "impact": 70,
            "quantification": 70,
            "technicalDepth": 70,
            "competencyCoverage": 70,
            "evidenceConfidence": 70,
            "writingQuality": 70,
            "formatIntegrity": 70,
        },
        "score_rubric_version": "candidarc-score-rubric@v1",
        "score_explanations": {"overall": "test"},
        "notes": "sdk",
        "sections": [
            {
                "type": "summary",
                "title": "Professional Summary",
                "order": 0,
                "bullets": [
                    {
                        "text": "Software Engineer at Northwind Labs, January 2024 – Present",
                        "evidence_ids": ["ev-1"],
                        "matched_requirements": [],
                        "technologies": ["Python"],
                        "confidence": "high",
                        "claim_risk": "low",
                        "source_version": "career-evidence",
                    }
                ],
            },
            {
                "type": "experience",
                "title": "Experience",
                "order": 1,
                "bullets": [
                    {
                        "text": "Software Engineer at Northwind Labs, January 2024 – Present",
                        "evidence_ids": ["ev-1"],
                        "matched_requirements": [],
                        "technologies": ["Python"],
                        "confidence": "high",
                        "claim_risk": "low",
                        "source_version": "career-evidence",
                    }
                ],
            },
            {
                "type": "skills",
                "title": "Skills",
                "order": 2,
                "bullets": [
                    {
                        "text": "Python",
                        "evidence_ids": ["ev-1"],
                        "matched_requirements": [],
                        "technologies": ["Python"],
                        "confidence": "high",
                        "claim_risk": "low",
                        "source_version": "career-evidence",
                    }
                ],
            },
        ],
    }
    parsed = ResumeDocument.model_validate(resume_payload)
    mock_response = SimpleNamespace(
        id="resp-1",
        choices=[SimpleNamespace(message=SimpleNamespace(parsed=parsed, content=None))],
        usage=SimpleNamespace(prompt_tokens=11, completion_tokens=22, prompt_tokens_details=SimpleNamespace(cached_tokens=1)),
    )
    client = MagicMock()
    client.beta.chat.completions.parse = AsyncMock(return_value=mock_response)

    provider = OpenAIProvider(_settings(), role="generation", client=client)
    resume, _latency, usage = await provider.generate_resume(
        absolute_version=0,
        cycle_step=0,
        evidence=evidence,
        allowed_technologies=["Python", "PyTorch", "OpenSearch"],
        job_description="Python platform engineer",
    )
    assert resume.absolute_version == 0
    client.beta.chat.completions.parse.assert_awaited()
    assert usage.input_tokens == 11
    assert usage.output_tokens == 22
    assert usage.provider_request_id == "resp-1"


@pytest.mark.asyncio
async def test_openai_invalid_structured_output_fails_closed() -> None:
    client = MagicMock()
    client.beta.chat.completions.parse = AsyncMock(
        return_value=SimpleNamespace(
            id="bad",
            choices=[SimpleNamespace(message=SimpleNamespace(parsed=None, content=None))],
            usage=None,
        )
    )
    provider = OpenAIProvider(_settings(), role="generation", client=client)
    with pytest.raises(ProviderError, match=PROVIDER_OUTPUT_INVALID):
        await provider.generate_resume(
            absolute_version=0,
            cycle_step=0,
            evidence=qa_evidence(),
            allowed_technologies=["Python"],
            job_description="Python engineer",
        )


@pytest.mark.asyncio
async def test_openai_no_silent_fallback_without_key() -> None:
    provider = OpenAIProvider(_settings(openai_api_key=None), role="generation", client=None)
    with pytest.raises(ProviderError, match=MISSING_CREDENTIALS):
        await provider.generate_resume(
            absolute_version=0,
            cycle_step=0,
            evidence=qa_evidence(),
            allowed_technologies=["Python"],
        )


@pytest.mark.asyncio
async def test_anthropic_messages_create_called() -> None:
    from app.modules.guardrails.service import build_grounded_resume

    evidence = qa_evidence()
    resume = build_grounded_resume(
        absolute_version=0,
        cycle_step=0,
        evidence=evidence,
        notes="t",
        allowed_technologies=["Python"],
        job_description="Python",
    )
    tool_input = {
        "summary": "hr-1 clarity audit",
        "findings": [
            {
                "severity": "minor",
                "section": "summary",
                "title": "Clarify",
                "explanation": "Tighten wording",
                "before_text": resume.sections[0].bullets[0].text,  # type: ignore[index]
                "suggested_text": resume.sections[0].bullets[0].text,  # type: ignore[index]
                "expected_score_impact": 1.0,
                "evidence_ids": ["ev-1"],
            }
        ],
    }
    mock_response = SimpleNamespace(
        id="msg-1",
        content=[SimpleNamespace(type="tool_use", name="emit_audit_findings", input=tool_input)],
        usage=SimpleNamespace(input_tokens=15, output_tokens=25),
    )
    client = MagicMock()
    client.messages.create = AsyncMock(return_value=mock_response)
    provider = AnthropicProvider(_settings(), role="hr-audit", client=client)
    result, _latency, usage = await provider.audit(
        lens="hr-1",
        reviews_version=0,
        produces_version=1,
        resume=resume,
        evidence=evidence,
        job_description="Python engineer",
    )
    client.messages.create.assert_awaited()
    assert result.lens == "hr-1"
    assert usage.input_tokens == 15
    assert "rejected_findings" in result.model_dump()


@pytest.mark.asyncio
async def test_anthropic_invalid_tool_payload_fails_closed() -> None:
    from app.modules.guardrails.service import build_grounded_resume

    evidence = qa_evidence()
    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=evidence, notes="t")
    client = MagicMock()
    client.messages.create = AsyncMock(
        return_value=SimpleNamespace(id="bad", content=[], usage=None)
    )
    provider = AnthropicProvider(_settings(), role="hr-audit", client=client)
    with pytest.raises(ProviderError, match=PROVIDER_OUTPUT_INVALID):
        await provider.audit(
            lens="em-1",
            reviews_version=1,
            produces_version=2,
            resume=resume,
            evidence=evidence,
            job_description="Python",
        )


@pytest.mark.asyncio
async def test_lifespan_closes_clients(monkeypatch: pytest.MonkeyPatch) -> None:
    closed: dict[str, bool] = {"openai": False, "anthropic": False}

    class FakeOpenAI:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        async def close(self) -> None:
            closed["openai"] = True

    class FakeAnthropic:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        async def close(self) -> None:
            closed["anthropic"] = True

    monkeypatch.setenv("AI_MODE", "live")
    monkeypatch.setenv("APP_MODE", "demo")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "ant-test")
    get_settings = __import__("app.core.config", fromlist=["get_settings"]).get_settings
    get_settings.cache_clear()

    monkeypatch.setattr("openai.AsyncOpenAI", FakeOpenAI)
    monkeypatch.setattr("anthropic.AsyncAnthropic", FakeAnthropic)

    application = create_app()
    from fastapi.testclient import TestClient

    with TestClient(application) as client:
        assert client.app.state.openai_client is not None
        assert client.app.state.anthropic_client is not None
    assert closed["openai"] is True
    assert closed["anthropic"] is True
    get_settings.cache_clear()
