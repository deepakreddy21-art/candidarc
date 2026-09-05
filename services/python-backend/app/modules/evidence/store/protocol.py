"""EvidenceStore protocol and shared record types."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol, runtime_checkable

from app.core.errors import (
    EVIDENCE_CROSS_TENANT,
    EVIDENCE_NOT_FOUND,
    EVIDENCE_STORE_UNAVAILABLE,
)


class EvidenceStoreError(Exception):
    """Typed evidence-store failure with a stable machine-readable code."""

    def __init__(self, code: str, message: str | None = None) -> None:
        self.code = code
        self.message = message or code
        super().__init__(f"{self.code}:{self.message}" if self.message != self.code else self.code)


@dataclass(slots=True)
class EvidenceDocumentRecord:
    document_id: str
    tenant_id: str
    owner_user_id: str
    source_type: str
    source_identifier: str
    source_span: str | None
    content_hash: str
    chunk_texts: list[str]
    embedding_model: str
    embedding_dimensions: int
    created_at: datetime | None = None
    updated_at: datetime | None = None
    metadata: dict[str, str] = field(default_factory=dict)


@dataclass(slots=True)
class EvidenceChunkRecord:
    chunk_id: str
    document_id: str
    tenant_id: str
    owner_user_id: str
    source_type: str
    source_identifier: str
    source_span: str | None
    content_hash: str
    chunk_text: str
    embedding: list[float]
    embedding_model: str
    embedding_dimensions: int
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass(slots=True)
class EvidenceSearchResult:
    chunk: EvidenceChunkRecord
    score: float


@runtime_checkable
class EvidenceStore(Protocol):
    """Tenant+owner scoped evidence persistence with vector search."""

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
        """Upsert a document and replace its chunks. Dedup unchanged docs by content_hash."""
        ...

    async def delete_document(
        self,
        *,
        tenant_id: str,
        owner_user_id: str,
        document_id: str,
    ) -> None:
        """Delete a document and cascade-delete its chunks. Raises EVIDENCE_NOT_FOUND."""
        ...

    async def search_similar(
        self,
        *,
        tenant_id: str,
        owner_user_id: str,
        query_embedding: list[float],
        limit: int = 8,
    ) -> list[EvidenceSearchResult]:
        """Similarity search scoped to tenant+owner."""
        ...

    async def list_by_owner(
        self,
        *,
        tenant_id: str,
        owner_user_id: str,
        limit: int = 100,
    ) -> list[EvidenceDocumentRecord]:
        """List documents for an owner within a tenant."""
        ...

    async def health_check(self) -> bool:
        """Return True when the store is reachable and usable."""
        ...


# Re-export codes for callers
__all__ = [
    "EVIDENCE_CROSS_TENANT",
    "EVIDENCE_NOT_FOUND",
    "EVIDENCE_STORE_UNAVAILABLE",
    "EvidenceChunkRecord",
    "EvidenceDocumentRecord",
    "EvidenceSearchResult",
    "EvidenceStore",
    "EvidenceStoreError",
]
