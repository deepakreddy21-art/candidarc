from __future__ import annotations

import time
from typing import Any

from app.domain.schemas import (
    AuditFinding,
    AuditResponse,
    EvidenceItem,
    EvidenceMatchResponse,
    EvidenceMatchRow,
    FinalQaCheck,
    FinalQaResponse,
    ResearchSource,
    ResearchSynthesizeResponse,
    ResumeDocument,
)
from app.modules.guardrails.service import build_grounded_resume, validate_resume_claims
from app.modules.quality import service as quality

SCORE_BY_VERSION = {0: 68.0, 1: 76.0, 2: 83.0, 3: 88.0, 4: 92.0}


class MockProvider:
    name = "mock"
    model = "mock-generation-v1"

    async def generate_resume(
        self,
        *,
        version_number: int,
        evidence: list[EvidenceItem],
        allowed_technologies: list[str],
        **_: Any,
    ) -> tuple[ResumeDocument, int]:
        started = time.perf_counter()
        resume = build_grounded_resume(
            version_number=version_number,
            evidence=evidence,
            allowed_technologies=allowed_technologies,
            notes=f"Mock grounded resume V{version_number}",
            score=SCORE_BY_VERSION.get(version_number, 70.0),
        )
        violations = validate_resume_claims(resume, evidence, allowed_technologies)
        if violations:
            raise ValueError(f"GUARDRAIL_VIOLATION:{','.join(violations)}")
        return resume, int((time.perf_counter() - started) * 1000)

    async def audit(
        self,
        *,
        lens: str,
        reviews_version: int,
        produces_version: int,
        resume: ResumeDocument,
        **_: Any,
    ) -> tuple[AuditResponse, int]:
        started = time.perf_counter()
        response = AuditResponse(
            lens=lens,  # type: ignore[arg-type]
            reviews_version=reviews_version,
            produces_version=produces_version,
            score_before=resume.score,
            score_after=min(resume.score + 4, 100),
            summary=f"Mock {lens} audit complete",
            findings=[
                AuditFinding(
                    severity="minor",
                    section="summary",
                    title="Clarify evidence-backed impact",
                    explanation="Tighten summary wording without inventing claims.",
                    before_text="Engineer with experience grounded in the supplied career evidence.",
                    suggested_text="Engineer applying accepted audit feedback to evidence-backed delivery experience.",
                    expected_score_impact=2.0,
                    evidence_source=None,
                )
            ],
            provider=self.name,
            model=self.model,
        )
        return response, int((time.perf_counter() - started) * 1000)

    async def final_qa(self, *, resume: ResumeDocument, evidence: list[EvidenceItem], **_: Any) -> tuple[FinalQaResponse, int]:
        started = time.perf_counter()
        checks = quality.run_deterministic_checks(resume, evidence)
        # Keep FinalQaCheck shape from domain schemas
        typed = [
            FinalQaCheck(label=c["label"], status=c["status"], detail=c["detail"])
            for c in checks
        ]
        passed = all(c.status == "pass" for c in typed)
        return (
            FinalQaResponse(passed=passed, checks=typed, provider=self.name, model=self.model),
            int((time.perf_counter() - started) * 1000),
        )

    async def synthesize_research(
        self,
        *,
        company: str,
        sources: list[ResearchSource],
        **_: Any,
    ) -> tuple[ResearchSynthesizeResponse, int]:
        from app.modules.research import service as research

        started = time.perf_counter()
        return research.synthesize_from_sources(company=company, sources=sources), int(
            (time.perf_counter() - started) * 1000
        )

    async def match_evidence(
        self,
        *,
        requirements: list[str],
        evidence: list[EvidenceItem],
        **_: Any,
    ) -> tuple[EvidenceMatchResponse, int]:
        started = time.perf_counter()
        rows: list[EvidenceMatchRow] = []
        for requirement in requirements:
            req_l = requirement.lower()
            matched = [
                item.id
                for item in evidence
                if any(tech.lower() in req_l for tech in item.technologies)
                or (
                    item.claim_text
                    and any(token in (item.claim_text or "").lower() for token in req_l.split() if len(token) > 4)
                )
            ][:3]
            rows.append(
                EvidenceMatchRow(
                    requirement=requirement,
                    importance="required",
                    evidence_ids=matched,
                    evidence_strength="strong" if matched else "none",
                    resume_usage="use" if matched else "skip",
                    coverage_gap=None if matched else "No owned evidence matched this requirement",
                )
            )
        coverage = 0.0 if not rows else sum(1 for row in rows if row.evidence_ids) / len(rows)
        return (
            EvidenceMatchResponse(rows=rows, evidence_coverage=coverage),
            int((time.perf_counter() - started) * 1000),
        )
