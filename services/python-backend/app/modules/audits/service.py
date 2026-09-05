"""Audit adjudication helpers."""

from __future__ import annotations

from app.domain.schemas import AuditFinding, EvidenceItem, ResumeDocument
from app.modules.guardrails.service import adjudicate_finding


def default_audit_findings(
    *,
    lens: str,
    resume: ResumeDocument,
    evidence: list[EvidenceItem],
) -> list[AuditFinding]:
    """Produce a small, evidence-safe finding set for mock/fallback audits."""
    before = "Engineer with experience grounded in the supplied career evidence."
    suggested = "Engineer applying accepted audit feedback to evidence-backed delivery experience."
    if evidence:
        first = evidence[0]
        before = first.claim_text or first.title
        org = first.organization or ""
        suggested = f"{org}: {before}".strip(": ") if org and org not in before else before
    return [
        AuditFinding(
            severity="minor",
            section="summary",
            title=f"{lens} clarity refinement",
            explanation="Tighten wording without inventing claims.",
            before_text=before[:400],
            suggested_text=suggested[:400],
            expected_score_impact=2.0,
            evidence_source=evidence[0].id if evidence else None,
        )
    ]


def filter_adjudicated_findings(
    findings: list[AuditFinding],
    evidence: list[EvidenceItem],
    allowed_technologies: list[str] | None = None,
) -> list[AuditFinding]:
    safe: list[AuditFinding] = []
    for finding in findings:
        ok, _reason = adjudicate_finding(finding.suggested_text, evidence, allowed_technologies)
        if ok:
            safe.append(finding)
    return safe


def lens_to_role(lens: str) -> str:
    return "hr-audit" if lens.startswith("hr") else "em-audit"
