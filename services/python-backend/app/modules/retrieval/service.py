from __future__ import annotations

from collections import defaultdict

from app.domain.schemas import EvidenceItem, EvidenceSearchHit
from app.modules.evidence.service import normalize_evidence, scope_filter
from app.modules.retrieval.rankers import HybridKeywordVectorRanker

_INDEX: dict[str, list[EvidenceItem]] = defaultdict(list)
_RANKER = HybridKeywordVectorRanker()


def _key(tenant_id: str, owner_user_id: str) -> str:
    return f"{tenant_id}:{owner_user_id}"


def index_evidence(tenant_id: str, owner_user_id: str, evidence: list[EvidenceItem]) -> int:
    # Hard tenant+owner isolation: never merge across keys.
    scoped = scope_filter(normalize_evidence(evidence), tenant_id, owner_user_id)
    _INDEX[_key(tenant_id, owner_user_id)] = scoped
    return len(scoped)


def search_evidence(tenant_id: str, owner_user_id: str, query: str, limit: int = 8) -> list[EvidenceSearchHit]:
    items = _INDEX.get(_key(tenant_id, owner_user_id), [])
    ranked = _RANKER.rank(query, items, limit=limit)
    return [
        EvidenceSearchHit(
            evidence_id=item.id,
            score=round(score, 4),
            snippet=(item.claim_text or item.title)[:240],
        )
        for item, score in ranked
    ]


def clear_index() -> None:
    _INDEX.clear()
