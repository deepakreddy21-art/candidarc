"""Career evidence normalization and EvidenceStore indexing helpers."""

from __future__ import annotations

import hashlib

from app.domain.schemas import EvidenceItem, EvidenceSearchHit
from app.modules.evidence.store.embeddings import EmbeddingProvider
from app.modules.evidence.store.protocol import EvidenceStore, EvidenceStoreError


def normalize_evidence(items: list[EvidenceItem]) -> list[EvidenceItem]:
    """Normalize evidence for indexing / generation without inventing facts."""
    normalized: list[EvidenceItem] = []
    for item in items:
        techs = sorted({t.strip() for t in item.technologies if t and t.strip()}, key=str.lower)
        claim = (item.claim_text or item.situation or item.title or "").strip()
        actions = [a.strip() for a in item.actions if a and a.strip()]
        normalized.append(
            item.model_copy(
                update={
                    "technologies": techs,
                    "claim_text": claim or None,
                    "actions": actions,
                    "title": item.title.strip(),
                    "organization": (item.organization or "").strip() or None,
                }
            )
        )
    return normalized


def evidence_text_blob(item: EvidenceItem) -> str:
    parts = [
        item.title,
        item.organization or "",
        item.claim_text or "",
        item.situation or "",
        item.task or "",
        item.result or "",
        " ".join(item.actions),
        " ".join(item.technologies),
    ]
    return " ".join(p for p in parts if p).strip()


def scope_filter(items: list[EvidenceItem], tenant_id: str, owner_user_id: str) -> list[EvidenceItem]:
    return [item for item in items if item.tenant_id == tenant_id and item.owner_user_id == owner_user_id]


def content_hash_for_item(item: EvidenceItem) -> str:
    blob = evidence_text_blob(item)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def chunk_texts_for_item(item: EvidenceItem) -> list[str]:
    primary = evidence_text_blob(item)
    chunks = [primary] if primary else [item.title]
    if item.metrics:
        metric_blob = " ".join(item.metrics).strip()
        if metric_blob and metric_blob not in primary:
            chunks.append(metric_blob)
    return chunks


async def index_evidence_items(
    store: EvidenceStore,
    embedder: EmbeddingProvider,
    *,
    tenant_id: str,
    owner_user_id: str,
    evidence: list[EvidenceItem],
    batch_size: int = 32,
) -> int:
    """Upsert scoped evidence items into the EvidenceStore."""
    scoped = scope_filter(normalize_evidence(evidence), tenant_id, owner_user_id)
    indexed = 0
    for item in scoped:
        texts = chunk_texts_for_item(item)
        embeddings = await embedder.embed_texts(texts, batch_size=batch_size)
        await store.upsert_document(
            tenant_id=tenant_id,
            owner_user_id=owner_user_id,
            document_id=item.id,
            source_type=item.source_type or "career_evidence",
            source_identifier=item.id,
            source_span=None,
            content_hash=content_hash_for_item(item),
            chunk_texts=texts,
            embeddings=embeddings,
            embedding_model=embedder.model,
            embedding_dimensions=embedder.dimensions,
        )
        indexed += 1
    return indexed


async def search_evidence_store(
    store: EvidenceStore,
    embedder: EmbeddingProvider,
    *,
    tenant_id: str,
    owner_user_id: str,
    query: str,
    limit: int = 8,
) -> list[EvidenceSearchHit]:
    vectors = await embedder.embed_texts([query], batch_size=1)
    results = await store.search_similar(
        tenant_id=tenant_id,
        owner_user_id=owner_user_id,
        query_embedding=vectors[0],
        limit=limit,
    )
    return [
        EvidenceSearchHit(
            evidence_id=row.chunk.document_id,
            score=round(row.score, 4),
            snippet=row.chunk.chunk_text[:240],
        )
        for row in results
    ]


__all__ = [
    "EvidenceStoreError",
    "chunk_texts_for_item",
    "content_hash_for_item",
    "evidence_text_blob",
    "index_evidence_items",
    "normalize_evidence",
    "scope_filter",
    "search_evidence_store",
]
