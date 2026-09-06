"""Request-scoped evidence matching. Process-local index is non-authoritative demo helper only."""

from __future__ import annotations

from collections import defaultdict

from app.domain.schemas import EvidenceItem, EvidenceMatchResponse, EvidenceMatchRow, EvidenceSearchHit
from app.modules.evidence.service import normalize_evidence, scope_filter
from app.modules.retrieval.rankers import HybridKeywordVectorRanker

# NON-AUTHORITATIVE: process-local cache for demo-only fallbacks. Production routes
# must use EvidenceStore (postgres). Never treat this as the production index.
_INDEX: dict[str, list[EvidenceItem]] = defaultdict(list)
_RANKER = HybridKeywordVectorRanker()


def _key(tenant_id: str, owner_user_id: str) -> str:
    return f"{tenant_id}:{owner_user_id}"


def index_evidence(tenant_id: str, owner_user_id: str, evidence: list[EvidenceItem]) -> int:
    """Demo-only process-local cache. Prefer EvidenceStore via evidence.service.index_evidence_items."""
    scoped = scope_filter(normalize_evidence(evidence), tenant_id, owner_user_id)
    _INDEX[_key(tenant_id, owner_user_id)] = scoped
    return len(scoped)


def search_evidence(tenant_id: str, owner_user_id: str, query: str, limit: int = 8) -> list[EvidenceSearchHit]:
    """Demo-only process-local search. Prefer EvidenceStore via evidence.service.search_evidence_store."""
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


def match_evidence_request_scoped(
    requirements: list[str],
    evidence: list[EvidenceItem],
) -> EvidenceMatchResponse:
    """Authoritative matching: ranks ONLY the request-scoped evidence list.

    Ranking method: lexical hybrid = 0.6 * keyword-overlap + 0.4 * deterministic
    hash-vector cosine (HybridKeywordVectorRanker). No global RAG index is consulted.
    """
    rows: list[EvidenceMatchRow] = []
    for requirement in requirements:
        ranked = _RANKER.rank(requirement, evidence, limit=3)
        matched_ids = [item.id for item, _score in ranked]
        strength: str
        usage: str
        if not matched_ids:
            strength, usage = "none", "skip"
        elif ranked[0][1] >= 0.35:
            strength, usage = "strong", "use"
        else:
            strength, usage = "partial", "consider"
        rows.append(
            EvidenceMatchRow(
                requirement=requirement,
                importance="required",
                evidence_ids=matched_ids,
                evidence_strength=strength,  # type: ignore[arg-type]
                resume_usage=usage,  # type: ignore[arg-type]
                coverage_gap=None if matched_ids else "No owned evidence matched this requirement",
            )
        )
    coverage = 0.0 if not rows else sum(1 for row in rows if row.evidence_ids) / len(rows)
    return EvidenceMatchResponse(
        rows=rows,
        evidence_coverage=coverage,
        ranking_method="lexical_hybrid_request_scoped",
    )
