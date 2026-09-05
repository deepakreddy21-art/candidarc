"""Postgres evidence store integration — skipped without DATABASE_URL/pgvector."""

from __future__ import annotations

import os

import pytest

from app.modules.evidence.store.embeddings import MockEmbeddingProvider

pytestmark = pytest.mark.asyncio

DSN = os.getenv("DATABASE_URL", "").strip()
RUN = bool(DSN) and os.getenv("RUN_PGVECTOR_TESTS", "0") == "1"


def _skip_reason() -> str:
    if not DSN:
        return "DATABASE_URL not set"
    if os.getenv("RUN_PGVECTOR_TESTS", "0") != "1":
        return "RUN_PGVECTOR_TESTS!=1"
    return "unavailable"


@pytest.fixture()
async def pg_store():  # type: ignore[no-untyped-def]
    if not RUN:
        pytest.skip(_skip_reason())
    from app.modules.evidence.store.postgres import PostgresEvidenceStore

    store = PostgresEvidenceStore(dsn=DSN, embedding_dimensions=32, statement_timeout_ms=5000)
    try:
        await store.connect()
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"pgvector unavailable: {exc}")
    if not await store.health_check():
        await store.close()
        pytest.skip("pgvector health check failed")
    yield store
    await store.close()


@pytest.fixture()
def embedder() -> MockEmbeddingProvider:
    return MockEmbeddingProvider(dimensions=32)


async def test_postgres_upsert_search_delete_cascade(pg_store, embedder: MockEmbeddingProvider) -> None:  # type: ignore[no-untyped-def]
    texts = ["Integration: Python FastAPI at Contoso Labs"]
    embeddings = await embedder.embed_texts(texts)
    doc_id = "pg-doc-1"
    await pg_store.upsert_document(
        tenant_id="ten_pg_a",
        owner_user_id="user_pg_a",
        document_id=doc_id,
        source_type="employment",
        source_identifier=doc_id,
        source_span=None,
        content_hash="pg-hash-1",
        chunk_texts=texts,
        embeddings=embeddings,
        embedding_model=embedder.model,
        embedding_dimensions=embedder.dimensions,
    )
    hits = await pg_store.search_similar(
        tenant_id="ten_pg_a",
        owner_user_id="user_pg_a",
        query_embedding=(await embedder.embed_texts(["FastAPI Contoso"]))[0],
        limit=5,
    )
    assert hits
    assert hits[0].chunk.document_id == doc_id

    # Cross-tenant isolation
    other = await pg_store.search_similar(
        tenant_id="ten_pg_b",
        owner_user_id="user_pg_b",
        query_embedding=(await embedder.embed_texts(["FastAPI Contoso"]))[0],
        limit=5,
    )
    assert other == []

    await pg_store.delete_document(tenant_id="ten_pg_a", owner_user_id="user_pg_a", document_id=doc_id)
    after = await pg_store.search_similar(
        tenant_id="ten_pg_a",
        owner_user_id="user_pg_a",
        query_embedding=(await embedder.embed_texts(["FastAPI Contoso"]))[0],
        limit=5,
    )
    assert after == []
