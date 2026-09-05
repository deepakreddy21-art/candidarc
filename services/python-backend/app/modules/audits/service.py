"""Audit adjudication helpers — retain rejected findings with reasons."""

from __future__ import annotations

from app.domain.schemas import AuditFinding, EvidenceItem, ResumeDocument
from app.modules.guardrails.service import adjudicate_finding
from app.prompts.registry import AUDIT_PROMPTS


def default_audit_findings(
    *,
    lens: str,
    resume: ResumeDocument,
    evidence: list[EvidenceItem],
) -> list[AuditFinding]:
    """Produce lens-distinct, evidence-safe findings for mock/fallback audits."""
    prompt = AUDIT_PROMPTS.get(lens)
    lens_focus = {
        "hr-1": ("recruiter clarity", "summary", "minor"),
        "em-1": ("technical depth", "experience", "major"),
        "hr-2": ("impact narrative", "summary", "suggestion"),
        "em-2": ("systems ownership", "experience", "minor"),
    }
    focus, section, severity = lens_focus.get(lens, ("clarity", "summary", "minor"))

    before = "Engineer with experience grounded in the supplied career evidence."
    suggested = f"Engineer applying {lens} feedback ({focus}) to evidence-backed delivery experience."
    evidence_ids: list[str] = []
    if evidence:
        first = evidence[0]
        before = (first.claim_text or first.title)[:400]
        org = first.organization or ""
        suggested = f"{org}: {before}".strip(": ") if org and org not in before else before
        # Keep suggestion wording lens-distinct without inventing metrics
        suggested = f"{suggested} [{lens}/{focus}]"[:400]
        evidence_ids = [first.id]

    # Pull a summary bullet before_text when available
    for sec in resume.sections:
        if sec.type == section and sec.bullets:
            before = sec.bullets[0].text[:400]
            break

    return [
        AuditFinding(
            severity=severity,  # type: ignore[arg-type]
            section=section,
            title=f"{lens} {focus} refinement",
            explanation=f"Tighten wording for {focus} without inventing claims. Prompt={prompt.prompt_version if prompt else lens}",
            before_text=before,
            suggested_text=suggested,
            expected_score_impact=2.0,
            evidence_source=evidence_ids[0] if evidence_ids else None,
            evidence_ids=evidence_ids,
            status="open",
        )
    ]


def adjudicate_findings(
    findings: list[AuditFinding],
    evidence: list[EvidenceItem],
    allowed_technologies: list[str] | None = None,
    *,
    tenant_id: str | None = None,
    owner_user_id: str | None = None,
) -> tuple[list[AuditFinding], list[AuditFinding]]:
    accepted: list[AuditFinding] = []
    rejected: list[AuditFinding] = []
    for finding in findings:
        ok, reason = adjudicate_finding(
            finding.suggested_text,
            evidence,
            allowed_technologies,
            evidence_ids=finding.evidence_ids or ([finding.evidence_source] if finding.evidence_source else None),
            tenant_id=tenant_id,
            owner_user_id=owner_user_id,
        )
        if ok:
            accepted.append(finding.model_copy(update={"status": finding.status or "accepted", "rejection_reason": None}))
        else:
            rejected.append(finding.model_copy(update={"status": "rejected", "rejection_reason": reason}))
    return accepted, rejected


def filter_adjudicated_findings(
    findings: list[AuditFinding],
    evidence: list[EvidenceItem],
    allowed_technologies: list[str] | None = None,
) -> list[AuditFinding]:
    """Backward-compatible helper returning only accepted findings."""
    accepted, _rejected = adjudicate_findings(findings, evidence, allowed_technologies)
    return accepted


def lens_to_role(lens: str) -> str:
    return "hr-audit" if lens.startswith("hr") else "em-audit"
