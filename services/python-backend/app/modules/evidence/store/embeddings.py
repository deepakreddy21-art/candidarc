"""Embedding helpers — mock is deterministic; OpenAI only when configured.

NEVER download local embedding models on import.
"""

from __future__ import annotations

import hashlib
import math
import struct
from typing import Any, Protocol

from app.core.errors import EVIDENCE_STORE_UNAVAILABLE, ProviderError


class EmbeddingProvider(Protocol):
    model: str
    dimensions: int

    async def embed_texts(self, texts: list[str], *, batch_size: int = 32) -> list[list[float]]:
        ...


def _unit_normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vector)) or 1.0
    return [v / norm for v in vector]


class MockEmbeddingProvider:
    """Deterministic hash→fixed-dim embeddings for tests and demo."""

    def __init__(self, *, model: str = "mock-hash-embedding@v1", dimensions: int = 64) -> None:
        if dimensions < 8:
            raise ValueError("embedding dimensions must be >= 8")
        self.model = model
        self.dimensions = dimensions

    def _embed_one(self, text: str) -> list[float]:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        values: list[float] = []
        # Expand digest into dimensions via repeated hashing
        seed = digest
        while len(values) < self.dimensions:
            for i in range(0, len(seed) - 3, 4):
                if len(values) >= self.dimensions:
                    break
                (raw,) = struct.unpack_from(">I", seed, i)
                values.append((raw / 0xFFFFFFFF) * 2.0 - 1.0)
            seed = hashlib.sha256(seed).digest()
        return _unit_normalize(values[: self.dimensions])

    async def embed_texts(self, texts: list[str], *, batch_size: int = 32) -> list[list[float]]:
        _ = batch_size
        return [self._embed_one(t) for t in texts]


class OpenAIEmbeddingProvider:
    """OpenAI embeddings when a client + API key are configured. Records model+dims."""

    def __init__(
        self,
        *,
        client: Any,
        model: str,
        dimensions: int,
    ) -> None:
        self._client = client
        self.model = model
        self.dimensions = dimensions

    async def embed_texts(self, texts: list[str], *, batch_size: int = 32) -> list[list[float]]:
        if self._client is None:
            raise ProviderError(EVIDENCE_STORE_UNAVAILABLE, "OpenAI embedding client is not configured")
        results: list[list[float]] = []
        size = max(1, batch_size)
        for start in range(0, len(texts), size):
            batch = texts[start : start + size]
            try:
                response = await self._client.embeddings.create(
                    model=self.model,
                    input=batch,
                    dimensions=self.dimensions,
                    timeout=30.0,
                )
            except Exception as exc:  # noqa: BLE001 — map to store unavailable
                raise ProviderError(EVIDENCE_STORE_UNAVAILABLE, f"Embedding provider failed: {exc}") from exc
            ordered = sorted(response.data, key=lambda row: row.index)
            for row in ordered:
                vec = list(row.embedding)
                if len(vec) != self.dimensions:
                    raise ProviderError(
                        EVIDENCE_STORE_UNAVAILABLE,
                        f"Embedding dimension mismatch: got {len(vec)} expected {self.dimensions}",
                    )
                results.append(_unit_normalize(vec))
        return results


def build_embedding_provider(
    *,
    provider: str,
    model: str,
    dimensions: int,
    openai_client: Any | None = None,
) -> EmbeddingProvider:
    if provider == "openai":
        if openai_client is None:
            raise ProviderError(EVIDENCE_STORE_UNAVAILABLE, "OpenAI client required for embedding_provider=openai")
        return OpenAIEmbeddingProvider(client=openai_client, model=model, dimensions=dimensions)
    return MockEmbeddingProvider(model=model if provider == "mock" else "mock-hash-embedding@v1", dimensions=dimensions)


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b, strict=True))
