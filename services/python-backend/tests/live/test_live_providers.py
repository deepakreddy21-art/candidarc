"""Optional live provider smoke — skipped unless RUN_LIVE_PROVIDER_TESTS=1."""

from __future__ import annotations

import os
import sys

import pytest

from tests.conftest import qa_context, qa_evidence

RUN = os.getenv("RUN_LIVE_PROVIDER_TESTS", "0") == "1"

pytestmark = [
    pytest.mark.skipif(not RUN, reason="RUN_LIVE_PROVIDER_TESTS!=1"),
    pytest.mark.asyncio,
]


def _cost_warning() -> None:
    print(
        "WARNING: live provider smoke tests may incur API costs. "
        "Sanitize outputs; never log secrets or real PII.",
        file=sys.stderr,
    )


async def test_live_generation_smoke(monkeypatch: pytest.MonkeyPatch) -> None:
    _cost_warning()
    if not (os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_GENERATION_API_KEY")):
        pytest.skip("OPENAI_API_KEY not set")

    monkeypatch.setenv("AI_MODE", "live")
    monkeypatch.setenv("APP_MODE", "demo")
    monkeypatch.setenv("GENERATION_PROVIDER", "openai")
    from app.core.config import get_settings

    get_settings.cache_clear()

    from openai import AsyncOpenAI

    from app.providers.openai_provider import OpenAIProvider

    client = AsyncOpenAI(api_key=get_settings().generation_api_key())
    provider = OpenAIProvider(client=client, role="generation", model=get_settings().openai_generation_model)
    ctx = qa_context()
    evidence = qa_evidence(ctx)
    try:
        resume, latency, usage = await provider.generate_resume(
            absolute_version=0,
            cycle_step=0,
            evidence=evidence,
            allowed_technologies=["Python", "PyTorch", "OpenSearch"],
            job_description="Python platform engineer building search systems " + ("q" * 20),
        )
    finally:
        await client.close()
        get_settings.cache_clear()

    assert resume.sections
    assert latency >= 0
    assert usage.provider == "openai"
    # Sanitize: do not print resume content (may contain fixture text only)
    print(f"live generation ok latency_ms={latency} model={usage.model}")
