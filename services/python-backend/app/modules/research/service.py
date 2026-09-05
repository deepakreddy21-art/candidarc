"""Research synthesis — sourced findings only; never fabricate employer claims."""

from __future__ import annotations

from app.domain.schemas import ResearchFinding, ResearchSource, ResearchSynthesizeResponse


def is_fictional_or_unsourced(company: str, sources: list[ResearchSource]) -> bool:
    lowered = company.lower()
    fictional = lowered.startswith("asteria") or "example.com" in lowered or "fictional" in lowered
    return fictional or not sources


def synthesize_from_sources(*, company: str, sources: list[ResearchSource]) -> ResearchSynthesizeResponse:
    """Build findings exclusively from caller-supplied sources.

    Research output must never be treated as candidate career evidence.
    """
    if is_fictional_or_unsourced(company, sources):
        return ResearchSynthesizeResponse(
            findings=[
                ResearchFinding(
                    category="company",
                    title="Company research unavailable",
                    summary="No verified public sources were available for this employer.",
                    confidence="low",
                    status="unavailable",
                    source_ids=[],
                )
            ],
            sources=sources,
            overall_confidence=0.1,
            company_research_status="unavailable",
        )

    findings = [
        ResearchFinding(
            category="company",
            title=source.title,
            summary=source.supporting_text[:400],
            confidence=source.confidence,
            status="supported",
            source_ids=[source.id],
        )
        for source in sources[:5]
        if source.supporting_text.strip()
    ]
    if not findings:
        return ResearchSynthesizeResponse(
            findings=[
                ResearchFinding(
                    category="company",
                    title="Company research unavailable",
                    summary="Sources were provided but contained no usable supporting text.",
                    confidence="low",
                    status="unavailable",
                    source_ids=[],
                )
            ],
            sources=sources,
            overall_confidence=0.1,
            company_research_status="unavailable",
        )

    return ResearchSynthesizeResponse(
        findings=findings,
        sources=sources,
        overall_confidence=min(0.9, 0.4 + 0.1 * len(findings)),
        company_research_status="available",
    )


def research_must_not_become_claims(findings: list[ResearchFinding]) -> list[str]:
    """Return violation codes if research text looks like it was promoted to candidate claims."""
    violations: list[str] = []
    for finding in findings:
        lower = finding.summary.lower()
        if "i built" in lower or "my experience" in lower or "candidate has" in lower:
            violations.append("RESEARCH_AS_CANDIDATE_CLAIM")
    return violations
