"""In-process metrics — counters/histograms without PII."""

from __future__ import annotations

import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any


@dataclass
class _Histogram:
    count: int = 0
    total_ms: float = 0.0
    min_ms: float | None = None
    max_ms: float | None = None

    def observe(self, value_ms: float) -> None:
        self.count += 1
        self.total_ms += value_ms
        self.min_ms = value_ms if self.min_ms is None else min(self.min_ms, value_ms)
        self.max_ms = value_ms if self.max_ms is None else max(self.max_ms, value_ms)

    def snapshot(self) -> dict[str, float | int | None]:
        avg = (self.total_ms / self.count) if self.count else 0.0
        return {
            "count": self.count,
            "total_ms": round(self.total_ms, 3),
            "avg_ms": round(avg, 3),
            "min_ms": None if self.min_ms is None else round(self.min_ms, 3),
            "max_ms": None if self.max_ms is None else round(self.max_ms, 3),
        }


@dataclass
class MetricsRegistry:
    counters: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    histograms: dict[str, _Histogram] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def incr(self, name: str, amount: int = 1) -> None:
        with self._lock:
            self.counters[name] += amount

    def observe(self, name: str, value_ms: float) -> None:
        with self._lock:
            hist = self.histograms.get(name)
            if hist is None:
                hist = _Histogram()
                self.histograms[name] = hist
            hist.observe(value_ms)

    def time_block(self, name: str) -> _Timer:
        return _Timer(self, name)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "counters": dict(self.counters),
                "histograms": {k: v.snapshot() for k, v in self.histograms.items()},
            }

    def reset(self) -> None:
        with self._lock:
            self.counters.clear()
            self.histograms.clear()


class _Timer:
    def __init__(self, registry: MetricsRegistry, name: str) -> None:
        self._registry = registry
        self._name = name
        self._started = 0.0

    def __enter__(self) -> _Timer:
        self._started = time.perf_counter()
        return self

    def __exit__(self, *_exc: object) -> None:
        elapsed_ms = (time.perf_counter() - self._started) * 1000.0
        self._registry.observe(self._name, elapsed_ms)


METRICS = MetricsRegistry()


# Convenience metric names (no PII labels)
STAGE_LATENCY = "stage_latency_ms"
PROVIDER_FAILURES = "provider_failures"
TOKENS_IN = "tokens_input"
TOKENS_OUT = "tokens_output"
UNSUPPORTED_CLAIMS_BLOCKED = "unsupported_claims_blocked"
IDEMPOTENCY_HITS = "idempotency_hits"
