"""Unit tests for versioned pricing estimates."""

from __future__ import annotations

from app.core.metrics import METRICS
from app.core.pricing import PRICING_TABLE_VERSION, estimate_cost_cents, get_model_pricing


def test_pricing_table_version() -> None:
    assert PRICING_TABLE_VERSION == "candidarc-pricing@v2"


def test_known_openai_model_cost() -> None:
    entry = get_model_pricing("openai", "gpt-4o-mini")
    assert entry is not None
    # 1M input tokens at 15_000_000 micro-cents/1M => 15 cents
    cost = estimate_cost_cents(
        provider="openai",
        model="gpt-4o-mini",
        input_tokens=1_000_000,
        output_tokens=0,
        cached_tokens=0,
    )
    assert cost == 15.0


def test_known_anthropic_model_with_output() -> None:
    cost = estimate_cost_cents(
        provider="anthropic",
        model="claude-sonnet-4-20250514",
        input_tokens=0,
        output_tokens=1_000_000,
        cached_tokens=0,
    )
    # 1_500_000_000 micro-cents / 1M = 1500 cents
    assert cost == 1500.0


def test_cached_tokens_use_cached_rate() -> None:
    # All input cached: prefer cached rate over full input rate.
    cost = estimate_cost_cents(
        provider="openai",
        model="gpt-4o-mini",
        input_tokens=1_000_000,
        output_tokens=0,
        cached_tokens=1_000_000,
    )
    assert cost == 7.5


def test_unknown_model_returns_none_and_increments_metric() -> None:
    METRICS.reset()
    cost = estimate_cost_cents(
        provider="openai",
        model="gpt-nonexistent-999",
        input_tokens=100,
        output_tokens=50,
    )
    assert cost is None
    assert METRICS.snapshot()["counters"].get("pricing_unknown", 0) >= 1


def test_missing_tokens_returns_none_without_false_zero() -> None:
    assert (
        estimate_cost_cents(
            provider="openai",
            model="gpt-4o-mini",
            input_tokens=None,
            output_tokens=10,
        )
        is None
    )
    assert (
        estimate_cost_cents(
            provider="openai",
            model="gpt-4o-mini",
            input_tokens=10,
            output_tokens=None,
        )
        is None
    )
