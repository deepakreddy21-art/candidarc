"""Career evidence normalization helpers."""

from __future__ import annotations

from app.domain.schemas import EvidenceItem


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
