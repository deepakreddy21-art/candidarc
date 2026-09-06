"""Versioned token-cost estimates for ProviderUsage.

Rates are **ESTIMATES** for observability only — review before any production billing.
Units: integer micro-cents per 1M tokens (1 micro-cent = 1e-6 cent).
Example: $0.15 / 1M tokens = 15 cents = 15_000_000 micro-cents per 1M tokens.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.metrics import METRICS

PRICING_TABLE_VERSION = "candidarc-pricing@v2"

# Metric name when provider/model is missing from the registry
PRICING_UNKNOWN = "pricing_unknown"

TOKENS_PER_MILLION = 1_000_000
MICRO_CENTS_PER_CENT = 1_000_000


@dataclass(frozen=True, slots=True)
class ModelPricing:
    """Micro-cents per 1M tokens. ESTIMATE — not for production billing without review."""

    input_micro_cents_per_1m: int
    output_micro_cents_per_1m: int
    cached_input_micro_cents_per_1m: int


# Placeholder rates aligned with configured models in Settings (ESTIMATES; review before billing).
# gpt-4o-mini (~$0.15 / $0.60 / cached ~$0.075 per 1M) — OpenAI public list pricing approx.
# claude-sonnet-4-20250514 (~$3 / $15 / cached ~$0.30 per 1M) — Anthropic list approx.
_PRICING: dict[tuple[str, str], ModelPricing] = {
    ("openai", "gpt-4o-mini"): ModelPricing(
        input_micro_cents_per_1m=15_000_000,
        output_micro_cents_per_1m=60_000_000,
        cached_input_micro_cents_per_1m=7_500_000,
    ),
    ("anthropic", "claude-sonnet-4-20250514"): ModelPricing(
        input_micro_cents_per_1m=300_000_000,
        output_micro_cents_per_1m=1_500_000_000,
        cached_input_micro_cents_per_1m=30_000_000,
    ),
}


def get_model_pricing(provider: str, model: str) -> ModelPricing | None:
    return _PRICING.get((provider, model))


def estimate_cost_cents(
    *,
    provider: str,
    model: str,
    input_tokens: int | None,
    output_tokens: int | None,
    cached_tokens: int = 0,
) -> float | None:
    """Estimate cost in cents from token counts.

    Returns None if provider/model is unknown or input/output token counts are missing.
    Never returns 0.0 for an unknown model — callers must treat None as unpriced.
    """
    entry = get_model_pricing(provider, model)
    if entry is None:
        METRICS.incr(PRICING_UNKNOWN)
        return None
    if input_tokens is None or output_tokens is None:
        return None

    cached = max(0, int(cached_tokens or 0))
    inp = max(0, int(input_tokens))
    out = max(0, int(output_tokens))
    # Prefer charging cached rate for the cached portion when reported.
    billable_input = max(0, inp - cached)

    # Integer product: tokens * (micro-cents / 1M tokens)
    total_scaled = (
        billable_input * entry.input_micro_cents_per_1m
        + cached * entry.cached_input_micro_cents_per_1m
        + out * entry.output_micro_cents_per_1m
    )
    # cents = total_scaled / (1M tokens * 1M micro-cents-per-cent)
    return float(total_scaled) / float(TOKENS_PER_MILLION * MICRO_CENTS_PER_CENT)
