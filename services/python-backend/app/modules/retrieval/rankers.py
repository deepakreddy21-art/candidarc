"""Retrieval rankers.

Production baseline: deterministic hybrid keyword/vector scoring.
Experimental cross-encoder: optional protocol stub behind `[ranker]` extra.
It is DISABLED by default and MUST NOT download models on import, startup, or tests.
"""

from __future__ import annotations

import hashlib
import math
from typing import Any, Protocol

from app.domain.schemas import EvidenceItem


def _tokenize(text: str) -> list[str]:
    return [t for t in "".join(ch.lower() if ch.isalnum() else " " for ch in text).split() if len(t) > 2]


def _pseudo_vector(text: str, dims: int = 32) -> list[float]:
    """Deterministic bag-of-hash embedding — no external model download."""
    vec = [0.0] * dims
    for token in _tokenize(text):
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        idx = digest[0] % dims
        sign = 1.0 if digest[1] % 2 == 0 else -1.0
        vec[idx] += sign
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=True))


class Ranker(Protocol):
    name: str

    def rank(self, query: str, items: list[EvidenceItem], limit: int = 8) -> list[tuple[EvidenceItem, float]]: ...


class HybridKeywordVectorRanker:
    """Production baseline: keyword overlap + deterministic pseudo-vector cosine."""

    name = "hybrid"

    def rank(self, query: str, items: list[EvidenceItem], limit: int = 8) -> list[tuple[EvidenceItem, float]]:
        q_tokens = set(_tokenize(query))
        q_vec = _pseudo_vector(query)
        scored: list[tuple[EvidenceItem, float]] = []
        for item in items:
            blob = " ".join(
                [
                    item.title,
                    item.organization or "",
                    item.claim_text or "",
                    item.situation or "",
                    " ".join(item.technologies),
                ]
            )
            tokens = set(_tokenize(blob))
            keyword = len(q_tokens & tokens) / max(len(q_tokens), 1)
            vector = max(0.0, _cosine(q_vec, _pseudo_vector(blob)))
            score = 0.6 * keyword + 0.4 * vector
            if score <= 0:
                continue
            scored.append((item, score))
        scored.sort(key=lambda pair: pair[1], reverse=True)
        return scored[:limit]


class CrossEncoderRanker:
    """Optional experimental re-ranker.

    Disabled by default. Instantiation does not download models. Calling `rank`
    without the optional `[ranker]` extra raises ImportError clearly.
    """

    name = "cross_encoder"
    enabled = False

    def __init__(self, *, enabled: bool = False, model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2") -> None:
        self.enabled = enabled
        self.model_name = model_name
        self._model: Any | None = None

    def _load_model(self) -> Any:
        if self._model is not None:
            return self._model
        try:
            from sentence_transformers import CrossEncoder
        except ImportError as exc:
            raise ImportError(
                "CROSS_ENCODER_UNAVAILABLE: install optional extra `[ranker]` to enable experimental ranking"
            ) from exc
        # Explicit load only when enabled and invoked — never on import.
        self._model = CrossEncoder(self.model_name)
        return self._model

    def rank(self, query: str, items: list[EvidenceItem], limit: int = 8) -> list[tuple[EvidenceItem, float]]:
        if not self.enabled:
            raise RuntimeError("CROSS_ENCODER_DISABLED")
        model = self._load_model()
        pairs = [(query, (item.claim_text or item.title)) for item in items]
        scores = model.predict(pairs)
        ranked = sorted(zip(items, [float(s) for s in scores], strict=True), key=lambda p: p[1], reverse=True)
        return ranked[:limit]


def get_ranker(backend: str = "hybrid", *, enable_cross_encoder: bool = False) -> Ranker:
    if backend == "cross_encoder":
        return CrossEncoderRanker(enabled=enable_cross_encoder)
    return HybridKeywordVectorRanker()
