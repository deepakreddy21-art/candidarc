"""Evidence store factory — production fail-closed; never silent memory fallback."""

from __future__ import annotations

from typing import Any, cast

from app.core.config import Settings, get_settings
from app.core.errors import EVIDENCE_STORE_UNAVAILABLE
from app.modules.evidence.store.embeddings import EmbeddingProvider, build_embedding_provider
from app.modules.evidence.store.memory import MemoryEvidenceStore
from app.modules.evidence.store.postgres import PostgresEvidenceStore
from app.modules.evidence.store.protocol import EvidenceStore, EvidenceStoreError

_store: EvidenceStore | None = None
_embedder: EmbeddingProvider | None = None


def resolve_evidence_store_backend(settings: Settings) -> str:
    """Return the configured store backend with production fail-closed defaults."""
    configured = settings.evidence_store
    if settings.app_mode == "production":
        if configured == "memory":
            raise EvidenceStoreError(
                EVIDENCE_STORE_UNAVAILABLE,
                "EVIDENCE_STORE=memory is forbidden in production",
            )
        return "postgres"
    return configured


async def create_evidence_store(
    settings: Settings | None = None,
    *,
    openai_client: Any | None = None,
) -> tuple[EvidenceStore, EmbeddingProvider]:
    """Construct store + embedder. Production requires DATABASE_URL + pgvector."""
    cfg = settings or get_settings()
    backend = resolve_evidence_store_backend(cfg)
    embedder = build_embedding_provider(
        provider=cfg.embedding_provider,
        model=cfg.embedding_model if cfg.embedding_provider == "openai" else "mock-hash-embedding@v1",
        dimensions=cfg.embedding_dimensions,
        openai_client=openai_client,
    )

    if backend == "memory":
        return MemoryEvidenceStore(), embedder

    if not cfg.database_url:
        raise EvidenceStoreError(
            EVIDENCE_STORE_UNAVAILABLE,
            "DATABASE_URL is required for EVIDENCE_STORE=postgres",
        )
    store = PostgresEvidenceStore(
        dsn=cfg.database_url,
        embedding_dimensions=cfg.embedding_dimensions,
        statement_timeout_ms=cfg.evidence_store_timeout_ms,
        command_timeout=cfg.evidence_store_timeout_ms / 1000.0,
    )
    await store.connect()
    healthy = await store.health_check()
    if not healthy:
        await store.close()
        raise EvidenceStoreError(
            EVIDENCE_STORE_UNAVAILABLE,
            "Postgres/pgvector evidence store failed health check",
        )
    return store, embedder


async def init_evidence_store(
    settings: Settings | None = None,
    *,
    openai_client: Any | None = None,
) -> EvidenceStore:
    global _store, _embedder
    store, embedder = await create_evidence_store(settings, openai_client=openai_client)
    _store = store
    _embedder = embedder
    return store


def get_evidence_store() -> EvidenceStore:
    if _store is None:
        raise EvidenceStoreError(EVIDENCE_STORE_UNAVAILABLE, "Evidence store is not initialized")
    return _store


def get_embedding_provider() -> EmbeddingProvider:
    if _embedder is None:
        raise EvidenceStoreError(EVIDENCE_STORE_UNAVAILABLE, "Embedding provider is not initialized")
    return _embedder


async def close_evidence_store() -> None:
    global _store, _embedder
    store = _store
    _store = None
    _embedder = None
    if store is not None and hasattr(store, "close"):
        close_fn = getattr(store, "close")
        result = close_fn()
        if hasattr(result, "__await__"):
            await cast(Any, result)


def reset_evidence_store_for_tests(store: EvidenceStore | None = None, embedder: EmbeddingProvider | None = None) -> None:
    """Test helper to inject a memory store without touching production paths."""
    global _store, _embedder
    _store = store
    _embedder = embedder
