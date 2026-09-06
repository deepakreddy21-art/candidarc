"""Optional live provider smoke — skipped unless RUN_LIVE_PROVIDER_TESTS=1."""

from __future__ import annotations

import os
import sys
import threading
from dataclasses import dataclass, field
from unittest.mock import AsyncMock, MagicMock

import pytest

from tests.conftest import qa_context, qa_evidence

RUN = os.getenv("RUN_LIVE_PROVIDER_TESTS", "0") == "1"

pytestmark = [
    pytest.mark.skipif(not RUN, reason="RUN_LIVE_PROVIDER_TESTS!=1"),
    pytest.mark.asyncio,
]


@dataclass
class LiveBudget:
    """Tracks remaining live-provider budget; stop before exceeding configured maxima."""

    max_calls: int
    max_tokens: int
    max_cost_usd: float
    calls_used: int = 0
    tokens_used: int = 0
    cost_usd_used: float = 0.0
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def remaining_calls(self) -> int:
        return max(0, self.max_calls - self.calls_used)

    def remaining_tokens(self) -> int:
        return max(0, self.max_tokens - self.tokens_used)

    def remaining_cost_usd(self) -> float:
        return max(0.0, self.max_cost_usd - self.cost_usd_used)

    def ensure_room(self, *, estimated_tokens: int = 0, estimated_cost_usd: float = 0.0) -> None:
        with self._lock:
            if self.calls_used + 1 > self.max_calls:
                pytest.fail(
                    f"Live provider budget exhausted: calls {self.calls_used}/{self.max_calls} "
                    f"(remaining={self.remaining_calls()})"
                )
            if self.tokens_used + estimated_tokens > self.max_tokens:
                pytest.fail(
                    f"Live provider budget would exceed token limit: "
                    f"{self.tokens_used}+{estimated_tokens}/{self.max_tokens} "
                    f"(remaining={self.remaining_tokens()})"
                )
            if self.cost_usd_used + estimated_cost_usd > self.max_cost_usd:
                pytest.fail(
                    f"Live provider budget would exceed cost limit: "
                    f"${self.cost_usd_used + estimated_cost_usd:.4f}/${self.max_cost_usd} "
                    f"(remaining=${self.remaining_cost_usd():.4f})"
                )

    def record(self, *, tokens: int = 0, cost_usd: float = 0.0) -> None:
        with self._lock:
            self.calls_used += 1
            self.tokens_used += max(0, tokens)
            self.cost_usd_used += max(0.0, cost_usd)
            if self.calls_used > self.max_calls:
                pytest.fail(f"Exceeded MAX_LIVE_PROVIDER_CALLS ({self.max_calls})")
            if self.tokens_used > self.max_tokens:
                pytest.fail(f"Exceeded MAX_LIVE_PROVIDER_TOKENS ({self.max_tokens})")
            if self.cost_usd_used > self.max_cost_usd:
                pytest.fail(f"Exceeded MAX_LIVE_PROVIDER_COST_USD ({self.max_cost_usd})")


_BUDGET: LiveBudget | None = None


def _cost_warning() -> None:
    print(
        "WARNING: live provider smoke tests may incur API costs. "
        "Sanitize outputs; never log secrets or real PII.",
        file=sys.stderr,
    )


def _parse_positive_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        value = int(raw)
    except ValueError:
        pytest.fail(f"{name} must be an integer, got {raw!r}")
    if value <= 0:
        pytest.fail(f"{name} must be > 0")
    return value


def _require_budget_guard() -> LiveBudget:
    """Fail/skip when RUN=1 but MAX_LIVE_PROVIDER_COST_USD is unset or invalid.

    Also loads MAX_LIVE_PROVIDER_CALLS / MAX_LIVE_PROVIDER_TOKENS (defaults keep smoke small).
    """
    global _BUDGET
    raw = os.getenv("MAX_LIVE_PROVIDER_COST_USD")
    if raw is None or not str(raw).strip():
        pytest.fail("MAX_LIVE_PROVIDER_COST_USD must be set when RUN_LIVE_PROVIDER_TESTS=1")
    try:
        budget_usd = float(raw)
    except ValueError:
        pytest.fail(f"MAX_LIVE_PROVIDER_COST_USD must be a number, got {raw!r}")
    if budget_usd <= 0:
        pytest.fail("MAX_LIVE_PROVIDER_COST_USD must be > 0")

    max_calls = _parse_positive_int("MAX_LIVE_PROVIDER_CALLS", default=10)
    max_tokens = _parse_positive_int("MAX_LIVE_PROVIDER_TOKENS", default=50_000)

    if _BUDGET is None:
        _BUDGET = LiveBudget(max_calls=max_calls, max_tokens=max_tokens, max_cost_usd=budget_usd)
    else:
        # Keep a single session budget; refresh caps if env changed mid-run.
        _BUDGET.max_calls = max_calls
        _BUDGET.max_tokens = max_tokens
        _BUDGET.max_cost_usd = budget_usd
    return _BUDGET


def _record_usage(budget: LiveBudget, usage: object) -> None:
    input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
    output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
    cached = int(getattr(usage, "cached_tokens", 0) or 0)
    tokens = input_tokens + output_tokens + cached
    cost_cents = getattr(usage, "estimated_cost_cents", None)
    cost_usd = (float(cost_cents) / 100.0) if cost_cents is not None else 0.0
    budget.record(tokens=tokens, cost_usd=cost_usd)


async def test_live_generation_smoke(monkeypatch: pytest.MonkeyPatch) -> None:
    _cost_warning()
    budget = _require_budget_guard()
    budget.ensure_room(estimated_tokens=4_000, estimated_cost_usd=0.05)
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
    provider = OpenAIProvider(get_settings(), role="generation", client=client)
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
        _record_usage(budget, usage)
    finally:
        await client.close()
        get_settings.cache_clear()

    assert resume.sections
    assert latency >= 0
    assert usage.provider == "openai"
    assert usage.model
    assert usage.prompt_version
    print(
        f"live generation ok latency_ms={latency} model={usage.model} "
        f"budget_calls={budget.calls_used}/{budget.max_calls} "
        f"budget_tokens={budget.tokens_used}/{budget.max_tokens} "
        f"budget_cost_usd={budget.cost_usd_used:.4f}/{budget.max_cost_usd}"
    )


async def test_live_openai_final_qa(monkeypatch: pytest.MonkeyPatch) -> None:
    """Factory maps final-review → OpenAIProvider.final_qa."""
    _cost_warning()
    budget = _require_budget_guard()
    budget.ensure_room(estimated_tokens=4_000, estimated_cost_usd=0.05)
    if not (os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_FINAL_API_KEY")):
        pytest.skip("OPENAI_API_KEY not set")

    monkeypatch.setenv("AI_MODE", "live")
    monkeypatch.setenv("APP_MODE", "demo")
    from app.core.config import get_settings
    from app.modules.guardrails.service import build_grounded_resume
    from app.providers.factory import get_provider

    get_settings.cache_clear()
    provider = get_provider("final-review")
    assert provider.name == "openai"

    ctx = qa_context()
    evidence = qa_evidence(ctx)
    resume = build_grounded_resume(
        absolute_version=0,
        cycle_step=0,
        evidence=evidence,
        notes="live qa",
        allowed_technologies=["Python", "PyTorch", "OpenSearch"],
        job_description="Python platform engineer role " + ("z" * 20),
    )
    try:
        result, latency, usage = await provider.final_qa(resume=resume, evidence=evidence)
        _record_usage(budget, usage)
    finally:
        get_settings.cache_clear()

    assert latency >= 0
    assert usage.provider == "openai"
    assert usage.input_tokens is None or usage.input_tokens >= 0
    assert usage.output_tokens is None or usage.output_tokens >= 0
    assert result.passed is True or result.passed is False
    print(f"live final_qa ok latency_ms={latency} passed={result.passed}")


async def test_live_anthropic_hr_em_audit(monkeypatch: pytest.MonkeyPatch) -> None:
    """Factory maps audit roles → AnthropicProvider.audit (hr-1 / em-1)."""
    _cost_warning()
    budget = _require_budget_guard()
    if not (os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUDIT_API_KEY")):
        pytest.skip("ANTHROPIC_API_KEY not set")

    monkeypatch.setenv("AI_MODE", "live")
    monkeypatch.setenv("APP_MODE", "demo")
    from app.core.config import get_settings
    from app.modules.guardrails.service import build_grounded_resume
    from app.providers.factory import get_provider

    get_settings.cache_clear()
    provider = get_provider("hr-audit")
    assert provider.name == "anthropic"

    ctx = qa_context()
    evidence = qa_evidence(ctx)
    resume = build_grounded_resume(
        absolute_version=1,
        cycle_step=1,
        evidence=evidence,
        notes="live audit",
        allowed_technologies=["Python", "PyTorch", "OpenSearch"],
        job_description="Python platform engineer role " + ("a" * 20),
    )
    try:
        for lens in ("hr-1", "em-1"):
            budget.ensure_room(estimated_tokens=4_000, estimated_cost_usd=0.10)
            response, latency, usage = await provider.audit(
                lens=lens,
                reviews_version=0,
                produces_version=1,
                resume=resume,
                evidence=evidence,
                job_description="Python platform engineer",
                allowed_technologies=["Python", "PyTorch", "OpenSearch"],
                tenant_id=ctx.tenant_id,
                owner_user_id=ctx.user_id,
            )
            _record_usage(budget, usage)
            assert latency >= 0
            assert usage.provider == "anthropic"
            assert usage.prompt_version
            assert response.summary
            print(f"live audit {lens} ok latency_ms={latency} findings={len(response.findings)}")
    finally:
        get_settings.cache_clear()


async def test_invalid_structured_response_handling(monkeypatch: pytest.MonkeyPatch) -> None:
    """Malformed provider payloads must surface PROVIDER_OUTPUT_INVALID (no silent success)."""
    _require_budget_guard()
    monkeypatch.setenv("AI_MODE", "live")
    monkeypatch.setenv("APP_MODE", "demo")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-used-for-network")
    from app.core.config import get_settings
    from app.core.errors import PROVIDER_OUTPUT_INVALID, ProviderError
    from app.providers.openai_provider import OpenAIProvider

    get_settings.cache_clear()

    class _Msg:
        parsed = None
        content = "{not-json"

    class _Choice:
        message = _Msg()

    class _Resp:
        choices = [_Choice()]
        usage = None
        id = "resp_invalid"

    client = MagicMock()
    client.beta = MagicMock()
    client.beta.chat = MagicMock()
    client.beta.chat.completions = MagicMock()
    client.beta.chat.completions.parse = AsyncMock(return_value=_Resp())
    client.chat = MagicMock()
    client.chat.completions = MagicMock()
    client.chat.completions.create = AsyncMock(return_value=_Resp())

    provider = OpenAIProvider(get_settings(), role="final-review", client=client)
    ctx = qa_context()
    evidence = qa_evidence(ctx)
    from app.modules.guardrails.service import build_grounded_resume

    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=evidence, notes="n")
    with pytest.raises(ProviderError) as excinfo:
        await provider.final_qa(resume=resume, evidence=evidence)
    assert PROVIDER_OUTPUT_INVALID in str(excinfo.value) or "INVALID" in str(excinfo.value).upper()
    get_settings.cache_clear()


async def test_usage_extraction_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    """ProviderUsage must extract provider/model/token/latency fields from SDK usage objects."""
    _require_budget_guard()
    monkeypatch.setenv("AI_MODE", "live")
    monkeypatch.setenv("APP_MODE", "demo")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-used")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-not-used")
    from app.core.config import get_settings
    from app.core.pricing import PRICING_TABLE_VERSION
    from app.providers.anthropic_provider import AnthropicProvider
    from app.providers.openai_provider import OpenAIProvider

    get_settings.cache_clear()
    settings = get_settings()

    class _TokenDetails:
        cached_tokens = 3

    class _OpenAIUsage:
        prompt_tokens = 11
        completion_tokens = 7
        prompt_tokens_details = _TokenDetails()

    class _OpenAIRaw:
        usage = _OpenAIUsage()
        id = "chatcmpl_test"

    openai_usage = OpenAIProvider(settings, role="generation", client=object())._usage_from_response(
        _OpenAIRaw(), latency_ms=42, prompt_version="resume@test", retry_count=1
    )
    assert openai_usage.provider == "openai"
    assert openai_usage.input_tokens == 11
    assert openai_usage.output_tokens == 7
    assert openai_usage.cached_tokens == 3
    assert openai_usage.latency_ms == 42
    assert openai_usage.provider_request_id == "chatcmpl_test"
    assert openai_usage.retry_count == 1
    assert openai_usage.prompt_version == "resume@test"
    assert openai_usage.estimated_cost_cents is not None
    assert openai_usage.pricing_table_version == PRICING_TABLE_VERSION

    class _AnthropicUsage:
        input_tokens = 21
        output_tokens = 5

    class _AnthropicRaw:
        usage = _AnthropicUsage()
        id = "msg_test"

    anthropic_usage = AnthropicProvider(settings, role="hr-audit", client=object())._usage_from_response(
        _AnthropicRaw(), latency_ms=99, prompt_version="audit@test", retry_count=0
    )
    assert anthropic_usage.provider == "anthropic"
    assert anthropic_usage.input_tokens == 21
    assert anthropic_usage.output_tokens == 5
    assert anthropic_usage.latency_ms == 99
    assert anthropic_usage.provider_request_id == "msg_test"
    assert anthropic_usage.estimated_cost_cents is not None
    get_settings.cache_clear()


async def test_budget_guard_requires_max_cost(monkeypatch: pytest.MonkeyPatch) -> None:
    """When RUN=1, missing/invalid MAX_LIVE_PROVIDER_COST_USD must fail (not silently proceed)."""
    global _BUDGET
    _BUDGET = None
    monkeypatch.delenv("MAX_LIVE_PROVIDER_COST_USD", raising=False)
    with pytest.raises(pytest.fail.Exception, match="MAX_LIVE_PROVIDER_COST_USD"):
        _require_budget_guard()

    monkeypatch.setenv("MAX_LIVE_PROVIDER_COST_USD", "not-a-number")
    with pytest.raises(pytest.fail.Exception, match="must be a number"):
        _require_budget_guard()

    monkeypatch.setenv("MAX_LIVE_PROVIDER_COST_USD", "0")
    with pytest.raises(pytest.fail.Exception, match="must be > 0"):
        _require_budget_guard()

    monkeypatch.setenv("MAX_LIVE_PROVIDER_COST_USD", "1.5")
    monkeypatch.setenv("MAX_LIVE_PROVIDER_CALLS", "3")
    monkeypatch.setenv("MAX_LIVE_PROVIDER_TOKENS", "1000")
    _BUDGET = None
    budget = _require_budget_guard()
    assert budget.max_cost_usd == 1.5
    assert budget.max_calls == 3
    assert budget.max_tokens == 1000


async def test_budget_stops_before_exceeding(monkeypatch: pytest.MonkeyPatch) -> None:
    global _BUDGET
    _BUDGET = None
    monkeypatch.setenv("MAX_LIVE_PROVIDER_COST_USD", "0.01")
    monkeypatch.setenv("MAX_LIVE_PROVIDER_CALLS", "2")
    monkeypatch.setenv("MAX_LIVE_PROVIDER_TOKENS", "100")
    budget = _require_budget_guard()
    budget.record(tokens=40, cost_usd=0.004)
    budget.ensure_room(estimated_tokens=40, estimated_cost_usd=0.004)
    budget.record(tokens=40, cost_usd=0.004)
    with pytest.raises(pytest.fail.Exception, match="calls"):
        budget.ensure_room(estimated_tokens=1, estimated_cost_usd=0.0)
