"""Deterministic in-memory EvidenceStore for demo and unit tests."""

from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4

from app.core.errors import EVIDENCE_CROSS_TENANT, EVIDENCE_NOT_FOUND
from app.modules.evidence.store.embeddings import cosine_similarity
from app.modules.evidence.store.protocol import (
    EvidenceChunkRecord,
    EvidenceDocumentRecord,
    EvidenceSearchResult,
    EvidenceStoreError,
)


class MemoryEvidenceStore:
    """Process-local store. Never authoritative in production (factory forbids it)."""

    def __init__(self) -> None:
        self._documents: dict[str, EvidenceDocumentRecord] = {}
        self._chunks: dict[str, list[EvidenceChunkRecord]] = {}

    @staticmethod
    def _doc_key(tenant_id: str, owner_user_id: str, document_id: str) -> str:
        return f"{tenant_id}:{owner_user_id}:{document_id}"

    def _assert_scope(self, tenant_id: str, owner_user_id: str, record_tenant: str, record_owner: str) -> None:
        if record_tenant != tenant_id or record_owner != owner_user_id:
            raise EvidenceStoreError(EVIDENCE_CROSS_TENANT, "Evidence tenant/owner mismatch")

    async def upsert_document(
        self,
        *,
        tenant_id: str,
        owner_user_id: str,
        document_id: str,
        source_type: str,
        source_identifier: str,
        source_span: str | None,
        content_hash: str,
        chunk_texts: list[str],
        embeddings: list[list[float]],
        embedding_model: str,
        embedding_dimensions: int,
    ) -> EvidenceDocumentRecord:
        if len(chunk_texts) != len(embeddings):
            raise ValueError("chunk_texts and embeddings length mismatch")
        key = self._doc_key(tenant_id, owner_user_id, document_id)
        now = datetime.now(UTC)
        existing = self._documents.get(key)
        if existing is not None:
            self._assert_scope(tenant_id, owner_user_id, existing.tenant_id, existing.owner_user_id)
            if existing.content_hash == content_hash and existing.embedding_dimensions == embedding_dimensions:
                # Deduplicate unchanged document
                return deepcopy(existing)

        record = EvidenceDocumentRecord(
            document_id=document_id,
            tenant_id=tenant_id,
            owner_user_id=owner_user_id,
            source_type=source_type,
            source_identifier=source_identifier,
            source_span=source_span,
            content_hash=content_hash,
            chunk_texts=list(chunk_texts),
            embedding_model=embedding_model,
            embedding_dimensions=embedding_dimensions,
            created_at=existing.created_at if existing else now,
            updated_at=now,
        )
        chunks: list[EvidenceChunkRecord] = []
        for text, emb in zip(chunk_texts, embeddings, strict=True):
            if len(emb) != embedding_dimensions:
                raise ValueError("embedding dimension mismatch")
            chunks.append(
                EvidenceChunkRecord(
                    chunk_id=str(uuid4()),
                    document_id=document_id,
                    tenant_id=tenant_id,
                    owner_user_id=owner_user_id,
                    source_type=source_type,
                    source_identifier=source_identifier,
                    source_span=source_span,
                    content_hash=content_hash,
                    chunk_text=text,
                    embedding=list(emb),
                    embedding_model=embedding_model,
                    embedding_dimensions=embedding_dimensions,
                    created_at=now,
                    updated_at=now,
                )
            )
        self._documents[key] = record
        self._chunks[key] = chunks
        return deepcopy(record)

    async def delete_document(
        self,
        *,
        tenant_id: str,
        owner_user_id: str,
        document_id: str,
    ) -> None:
        key = self._doc_key(tenant_id, owner_user_id, document_id)
        existing = self._documents.get(key)
        if existing is None:
            raise EvidenceStoreError(EVIDENCE_NOT_FOUND, f"Document not found: {document_id}")
        self._assert_scope(tenant_id, owner_user_id, existing.tenant_id, existing.owner_user_id)
        del self._documents[key]
        self._chunks.pop(key, None)

    async def search_similar(
        self,
        *,
        tenant_id: str,
        owner_user_id: str,
        query_embedding: list[float],
        limit: int = 8,
    ) -> list[EvidenceSearchResult]:
        scored: list[EvidenceSearchResult] = []
        for key, chunks in self._chunks.items():
            for chunk in chunks:
                if chunk.tenant_id != tenant_id or chunk.owner_user_id != owner_user_id:
                    continue
                score = cosine_similarity(query_embedding, chunk.embedding)
                scored.append(EvidenceSearchResult(chunk=deepcopy(chunk), score=score))
        scored.sort(key=lambda row: (-row.score, row.chunk.chunk_id))
        return scored[: max(1, limit)]

    async def list_by_owner(
        self,
        *,
        tenant_id: str,
        owner_user_id: str,
        limit: int = 100,
    ) -> list[EvidenceDocumentRecord]:
        docs = [
            deepcopy(doc)
            for doc in self._documents.values()
            if doc.tenant_id == tenant_id and doc.owner_user_id == owner_user_id
        ]
        docs.sort(key=lambda d: d.document_id)
        return docs[: max(1, limit)]

    async def health_check(self) -> bool:
        return True

    def clear(self) -> None:
        self._documents.clear()
        self._chunks.clear()
