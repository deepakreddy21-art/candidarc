"""Persistent evidence store (memory for demo/tests; postgres+pgvector for production)."""

from __future__ import annotations

from app.modules.evidence.store.factory import close_evidence_store, get_evidence_store
from app.modules.evidence.store.protocol import (
    EvidenceChunkRecord,
    EvidenceDocumentRecord,
    EvidenceSearchResult,
    EvidenceStore,
    EvidenceStoreError,
)

__all__ = [
    "EvidenceChunkRecord",
    "EvidenceDocumentRecord",
    "EvidenceSearchResult",
    "EvidenceStore",
    "EvidenceStoreError",
    "close_evidence_store",
    "get_evidence_store",
]
