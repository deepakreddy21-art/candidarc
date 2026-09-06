"""Postgres evidence store integration.

Skip only when RUN_PGVECTOR_TESTS is unset/0.
When RUN_PGVECTOR_TESTS=1, connection/schema failures must fail the suite.
"""

from __future__ import annotations

import os

import pytest

from app.core.errors import EVIDENCE_SCHEMA_INCOMPATIBLE
from app.modules.evidence.store.embeddings import MockEmbeddingProvider
from app.modules.evidence.store.protocol import EvidenceStoreError

pytestmark = pytest.mark.asyncio

DSN = os.getenv("DATABASE_URL", "").strip()
RUN_FLAG = os.getenv("RUN_PGVECTOR_TESTS", "0") == "1"


@pytest.fixture()
async def pg_store():  # type: ignore[no-untyped-def]
    if not RUN_FLAG:
        pytest.skip("RUN_PGVECTOR_TESTS!=1")
    if not DSN:
        pytest.fail("RUN_PGVECTOR_TESTS=1 requires DATABASE_URL")

    from app.modules.evidence.store.postgres import PostgresEvidenceStore

    # Must match migration 0009 vector(1536); store no longer ALTER TABLE at runtime.
    store = PostgresEvidenceStore(dsn=DSN, embedding_dimensions=1536, statement_timeout_ms=5000)
    try:
        await store.connect()
    except EvidenceStoreError as exc:
        pytest.fail(f"pgvector evidence store connection/schema failed: {exc.code}: {exc.message}")
    except Exception as exc:  # noqa: BLE001
        pytest.fail(f"pgvector evidence store connection failed: {exc}")
    if not await store.health_check():
        await store.close()
        pytest.fail("pgvector health check failed (apply migration 0009)")
    yield store
    await store.close()


@pytest.fixture()
def embedder() -> MockEmbeddingProvider:
    return MockEmbeddingProvider(dimensions=1536)


async def _upsert(
    store,  # type: ignore[no-untyped-def]
    embedder: MockEmbeddingProvider,
    *,
    tenant_id: str,
    owner_user_id: str,
    document_id: str,
    text: str,
    content_hash: str,
) -> None:
    embeddings = await embedder.embed_texts([text])
    await store.upsert_document(
        tenant_id=tenant_id,
        owner_user_id=owner_user_id,
        document_id=document_id,
        source_type="employment",
        source_identifier=document_id,
        source_span=None,
        content_hash=content_hash,
        chunk_texts=[text],
        embeddings=embeddings,
        embedding_model=embedder.model,
        embedding_dimensions=embedder.dimensions,
    )


async def test_postgres_upsert_search_delete_cascade(pg_store, embedder: MockEmbeddingProvider) -> None:  # type: ignore[no-untyped-def]
    doc_id = "pg-doc-1"
    await _upsert(
        pg_store,
        embedder,
        tenant_id="ten_pg_a",
        owner_user_id="user_pg_a",
        document_id=doc_id,
        text="Integration: Python FastAPI at Contoso Labs",
        content_hash="pg-hash-1",
    )
    hits = await pg_store.search_similar(
        tenant_id="ten_pg_a",
        owner_user_id="user_pg_a",
        query_embedding=(await embedder.embed_texts(["FastAPI Contoso"]))[0],
        limit=5,
    )
    assert hits
    assert hits[0].chunk.document_id == doc_id

    await pg_store.delete_document(tenant_id="ten_pg_a", owner_user_id="user_pg_a", document_id=doc_id)
    after = await pg_store.search_similar(
        tenant_id="ten_pg_a",
        owner_user_id="user_pg_a",
        query_embedding=(await embedder.embed_texts(["FastAPI Contoso"]))[0],
        limit=5,
    )
    assert after == []


async def test_postgres_tenant_isolation(pg_store, embedder: MockEmbeddingProvider) -> None:  # type: ignore[no-untyped-def]
    await _upsert(
        pg_store,
        embedder,
        tenant_id="ten_iso_a",
        owner_user_id="user_shared",
        document_id="pg-tenant-iso",
        text="Tenant A secret Redis stream processor",
        content_hash="pg-tenant-hash",
    )
    other = await pg_store.search_similar(
        tenant_id="ten_iso_b",
        owner_user_id="user_shared",
        query_embedding=(await embedder.embed_texts(["Redis stream processor"]))[0],
        limit=5,
    )
    assert other == []
    await pg_store.delete_document(tenant_id="ten_iso_a", owner_user_id="user_shared", document_id="pg-tenant-iso")


async def test_postgres_owner_isolation(pg_store, embedder: MockEmbeddingProvider) -> None:  # type: ignore[no-untyped-def]
    await _upsert(
        pg_store,
        embedder,
        tenant_id="ten_owner_iso",
        owner_user_id="user_owner_a",
        document_id="pg-owner-iso",
        text="Owner A private OpenSearch ranking notes",
        content_hash="pg-owner-hash",
    )
    other_owner = await pg_store.search_similar(
        tenant_id="ten_owner_iso",
        owner_user_id="user_owner_b",
        query_embedding=(await embedder.embed_texts(["OpenSearch ranking"]))[0],
        limit=5,
    )
    assert other_owner == []
    same = await pg_store.search_similar(
        tenant_id="ten_owner_iso",
        owner_user_id="user_owner_a",
        query_embedding=(await embedder.embed_texts(["OpenSearch ranking"]))[0],
        limit=5,
    )
    assert same
    await pg_store.delete_document(
        tenant_id="ten_owner_iso",
        owner_user_id="user_owner_a",
        document_id="pg-owner-iso",
    )


async def test_postgres_upsert_dimension_mismatch(pg_store, embedder: MockEmbeddingProvider) -> None:  # type: ignore[no-untyped-def]
    bad = [0.1] * 64
    with pytest.raises((ValueError, EvidenceStoreError)) as excinfo:
        await pg_store.upsert_document(
            tenant_id="ten_dim",
            owner_user_id="user_dim",
            document_id="pg-dim-mismatch",
            source_type="employment",
            source_identifier="pg-dim-mismatch",
            source_span=None,
            content_hash="pg-dim-hash",
            chunk_texts=["Wrong vector width"],
            embeddings=[bad],
            embedding_model=embedder.model,
            embedding_dimensions=embedder.dimensions,
        )
    message = str(excinfo.value).lower()
    assert "dimension" in message or "mismatch" in message


async def test_postgres_connect_rejects_config_dimension_mismatch() -> None:
    if not RUN_FLAG:
        pytest.skip("RUN_PGVECTOR_TESTS!=1")
    if not DSN:
        pytest.fail("RUN_PGVECTOR_TESTS=1 requires DATABASE_URL")

    from app.modules.evidence.store.postgres import PostgresEvidenceStore

    # DB migration declares vector(1536); connecting with a different config must fail closed.
    store = PostgresEvidenceStore(dsn=DSN, embedding_dimensions=768, statement_timeout_ms=5000)
    with pytest.raises(EvidenceStoreError) as excinfo:
        await store.connect()
    assert excinfo.value.code == EVIDENCE_SCHEMA_INCOMPATIBLE
    assert "dimension" in excinfo.value.message.lower()
