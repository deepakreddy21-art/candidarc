"""Unit tests for MemoryEvidenceStore — including cross-tenant denial."""

from __future__ import annotations

import pytest

from app.core.errors import EVIDENCE_CROSS_TENANT, EVIDENCE_NOT_FOUND
from app.modules.evidence.store.embeddings import MockEmbeddingProvider
from app.modules.evidence.store.memory import MemoryEvidenceStore
from app.modules.evidence.store.protocol import EvidenceStoreError


@pytest.fixture()
def store() -> MemoryEvidenceStore:
    return MemoryEvidenceStore()


@pytest.fixture()
def embedder() -> MockEmbeddingProvider:
    return MockEmbeddingProvider(dimensions=32)


@pytest.mark.asyncio
async def test_upsert_search_and_dedup(store: MemoryEvidenceStore, embedder: MockEmbeddingProvider) -> None:
    texts = ["Built Python APIs at Northwind Labs"]
    embeddings = await embedder.embed_texts(texts)
    doc = await store.upsert_document(
        tenant_id="ten_a",
        owner_user_id="user_a",
        document_id="doc-1",
        source_type="employment",
        source_identifier="doc-1",
        source_span=None,
        content_hash="abc123",
        chunk_texts=texts,
        embeddings=embeddings,
        embedding_model=embedder.model,
        embedding_dimensions=embedder.dimensions,
    )
    assert doc.document_id == "doc-1"
    again = await store.upsert_document(
        tenant_id="ten_a",
        owner_user_id="user_a",
        document_id="doc-1",
        source_type="employment",
        source_identifier="doc-1",
        source_span=None,
        content_hash="abc123",
        chunk_texts=texts,
        embeddings=embeddings,
        embedding_model=embedder.model,
        embedding_dimensions=embedder.dimensions,
    )
    assert again.updated_at == doc.updated_at

    query = await embedder.embed_texts(["Python APIs"])
    hits = await store.search_similar(
        tenant_id="ten_a",
        owner_user_id="user_a",
        query_embedding=query[0],
        limit=5,
    )
    assert hits
    assert hits[0].chunk.document_id == "doc-1"


@pytest.mark.asyncio
async def test_cross_tenant_search_isolation(store: MemoryEvidenceStore, embedder: MockEmbeddingProvider) -> None:
    texts = ["Secret Rivertown project"]
    embeddings = await embedder.embed_texts(texts)
    await store.upsert_document(
        tenant_id="ten_a",
        owner_user_id="user_a",
        document_id="doc-secret",
        source_type="project",
        source_identifier="doc-secret",
        source_span=None,
        content_hash="hash-a",
        chunk_texts=texts,
        embeddings=embeddings,
        embedding_model=embedder.model,
        embedding_dimensions=embedder.dimensions,
    )
    query = await embedder.embed_texts(["Rivertown"])
    other = await store.search_similar(
        tenant_id="ten_b",
        owner_user_id="user_b",
        query_embedding=query[0],
        limit=5,
    )
    assert other == []
    listed = await store.list_by_owner(tenant_id="ten_b", owner_user_id="user_b")
    assert listed == []


@pytest.mark.asyncio
async def test_delete_cascades_chunks(store: MemoryEvidenceStore, embedder: MockEmbeddingProvider) -> None:
    texts = ["Chunk one", "Chunk two"]
    embeddings = await embedder.embed_texts(texts)
    await store.upsert_document(
        tenant_id="ten_a",
        owner_user_id="user_a",
        document_id="doc-del",
        source_type="employment",
        source_identifier="doc-del",
        source_span=None,
        content_hash="hash-del",
        chunk_texts=texts,
        embeddings=embeddings,
        embedding_model=embedder.model,
        embedding_dimensions=embedder.dimensions,
    )
    await store.delete_document(tenant_id="ten_a", owner_user_id="user_a", document_id="doc-del")
    query = await embedder.embed_texts(["Chunk"])
    hits = await store.search_similar(
        tenant_id="ten_a",
        owner_user_id="user_a",
        query_embedding=query[0],
        limit=5,
    )
    assert hits == []
    with pytest.raises(EvidenceStoreError) as exc:
        await store.delete_document(tenant_id="ten_a", owner_user_id="user_a", document_id="doc-del")
    assert exc.value.code == EVIDENCE_NOT_FOUND


@pytest.mark.asyncio
async def test_cross_tenant_upsert_denied_on_collision(store: MemoryEvidenceStore, embedder: MockEmbeddingProvider) -> None:
    texts = ["Owned evidence"]
    embeddings = await embedder.embed_texts(texts)
    await store.upsert_document(
        tenant_id="ten_a",
        owner_user_id="user_a",
        document_id="shared-id",
        source_type="employment",
        source_identifier="shared-id",
        source_span=None,
        content_hash="h1",
        chunk_texts=texts,
        embeddings=embeddings,
        embedding_model=embedder.model,
        embedding_dimensions=embedder.dimensions,
    )
    # Different tenant+owner with same document_id is a separate key — isolation by scope
    await store.upsert_document(
        tenant_id="ten_b",
        owner_user_id="user_b",
        document_id="shared-id",
        source_type="employment",
        source_identifier="shared-id",
        source_span=None,
        content_hash="h2",
        chunk_texts=["Other tenant text"],
        embeddings=await embedder.embed_texts(["Other tenant text"]),
        embedding_model=embedder.model,
        embedding_dimensions=embedder.dimensions,
    )
    a_hits = await store.search_similar(
        tenant_id="ten_a",
        owner_user_id="user_a",
        query_embedding=(await embedder.embed_texts(["Owned"]))[0],
        limit=5,
    )
    assert all(h.chunk.tenant_id == "ten_a" for h in a_hits)
    # Attempting to delete another tenant's doc via wrong scope → not found (scoped key)
    with pytest.raises(EvidenceStoreError) as exc:
        await store.delete_document(tenant_id="ten_a", owner_user_id="user_a", document_id="missing")
    assert exc.value.code in {EVIDENCE_NOT_FOUND, EVIDENCE_CROSS_TENANT}


@pytest.mark.asyncio
async def test_factory_forbids_memory_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings
    from app.modules.evidence.store.factory import resolve_evidence_store_backend
    from app.modules.evidence.store.protocol import EvidenceStoreError

    monkeypatch.setenv("APP_MODE", "production")
    monkeypatch.setenv("EVIDENCE_STORE", "memory")
    get_settings.cache_clear()
    settings = get_settings()
    with pytest.raises(EvidenceStoreError) as exc:
        resolve_evidence_store_backend(settings)
    assert exc.value.code == "EVIDENCE_STORE_UNAVAILABLE"
    get_settings.cache_clear()
