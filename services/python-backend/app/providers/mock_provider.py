"""Mock intelligence provider — JD-aware, lens-distinct, calculated scores."""

from __future__ import annotations

import time
from typing import Any

from app.domain.schemas import (
    SCORE_RUBRIC_VERSION,
    AuditFinding,
    AuditResponse,
    EvidenceItem,
    EvidenceMatchResponse,
    EvidenceMatchRow,
    FinalQaCheck,
    FinalQaCheckCode,
    FinalQaResponse,
    MistakeMemoryRule,
    ProviderUsage,
    ResearchFinding,
    ResearchSource,
    ResearchSynthesizeResponse,
    ResumeDocument,
    UserConfirmation,
)
from app.modules.generation import service as generation
from app.modules.guardrails.service import validate_resume_claims
from app.modules.quality import service as quality
from app.modules.retrieval.service import match_evidence_request_scoped
from app.prompts.registry import AUDIT_PROMPTS, RESUME_GENERATION


class MockProvider:
    name = "mock"
    model = "mock-generation-v1"

    def __init__(self) -> None:
        self.model = "mock-generation-v1"

    async def generate_resume(
        self,
        *,
        absolute_version: int = 0,
        cycle_step: int = 0,
        version_number: int | None = None,
        evidence: list[EvidenceItem],
        allowed_technologies: list[str],
        job_description: str = "",
        job_requirements: list[str] | None = None,
        previous_resume: ResumeDocument | None = None,
        accepted_findings: list[AuditFinding] | None = None,
        rejected_findings: list[AuditFinding] | None = None,
        mistake_memory: list[MistakeMemoryRule] | None = None,
        research_findings: list[ResearchFinding] | None = None,
        user_confirmations: list[UserConfirmation] | None = None,
        refinement_instruction: str | None = None,
        evidence_matches: list[EvidenceMatchRow] | None = None,
        final_qa_repair: Any | None = None,
        **_: Any,
    ) -> tuple[ResumeDocument, int, ProviderUsage]:
        started = time.perf_counter()
        absolute = absolute_version if version_number is None else absolute_version
        if version_number is not None and absolute_version == 0:
            absolute = version_number
        resume = generation.generate_grounded_resume(
            absolute_version=absolute,
            cycle_step=cycle_step,
            evidence=evidence,
            allowed_technologies=allowed_technologies,
            notes=f"Mock grounded resume V{absolute}",
            job_description=job_description,
            job_requirements=job_requirements,
            previous_resume=previous_resume,
            accepted_findings=accepted_findings,
            rejected_findings=rejected_findings,
            mistake_memory=mistake_memory,
            research_findings=research_findings,
            user_confirmations=user_confirmations,
            refinement_instruction=refinement_instruction,
            final_qa_repair=final_qa_repair,
            evidence_matches=evidence_matches,
        )
        violations = validate_resume_claims(
            resume,
            evidence,
            allowed_technologies,
            job_description=job_description,
            research_findings=research_findings,
            user_confirmations=user_confirmations,
        )
        if violations:
            raise ValueError(f"GUARDRAIL_VIOLATION:{','.join(violations)}")
        latency = int((time.perf_counter() - started) * 1000)
        deterministic_operation = final_qa_repair is not None or bool(refinement_instruction)
        usage = ProviderUsage(
            provider="deterministic" if deterministic_operation else self.name,
            model="internal" if deterministic_operation else self.model,
            prompt_version=RESUME_GENERATION.prompt_version,
            rubric_version=SCORE_RUBRIC_VERSION,
            input_tokens=0 if deterministic_operation else 120,
            output_tokens=0 if deterministic_operation else 80,
            cached_tokens=0,
            latency_ms=latency,
            provider_request_id=None if deterministic_operation else "mock-gen-1",
            estimated_cost_cents=0 if deterministic_operation else None,
            retry_count=0,
        )
        return resume, latency, usage

    async def audit(
        self,
        *,
        lens: str,
        reviews_version: int,
        produces_version: int,
        resume: ResumeDocument,
        evidence: list[EvidenceItem] | None = None,
        job_description: str = "",
        **_: Any,
    ) -> tuple[AuditResponse, int, ProviderUsage]:
        from app.modules.audits import service as audits

        started = time.perf_counter()
        evidence = evidence or []
        findings = audits.default_audit_findings(lens=lens, resume=resume, evidence=evidence)
        accepted, rejected = audits.adjudicate_findings(findings, evidence)
        response = AuditResponse(
            lens=lens,  # type: ignore[arg-type]
            reviews_version=reviews_version,
            produces_version=produces_version,
            score_before=resume.score,
            score_after=resume.score,  # score changes only when content changes on regenerate
            summary=f"Mock {lens} audit complete — {AUDIT_PROMPTS[lens].name}",
            findings=accepted,
            rejected_findings=rejected,
            provider=self.name,
            model=self.model,
        )
        latency = int((time.perf_counter() - started) * 1000)
        usage = ProviderUsage(
            provider=self.name,
            model=self.model,
            prompt_version=AUDIT_PROMPTS[lens].prompt_version,
            rubric_version=SCORE_RUBRIC_VERSION,
            input_tokens=90,
            output_tokens=60,
            cached_tokens=0,
            latency_ms=latency,
            provider_request_id=f"mock-audit-{lens}",
            estimated_cost_cents=None,
            retry_count=0,
        )
        response = response.model_copy(update={"usage": usage})
        return response, latency, usage

    async def final_qa(
        self,
        *,
        resume: ResumeDocument,
        evidence: list[EvidenceItem],
        deterministic_checks: list[Any] | None = None,
        grounded_targets: list[str] | None = None,
        allowed_technologies: list[str] | None = None,
        **_: Any,
    ) -> tuple[FinalQaResponse, int, ProviderUsage]:
        import os

        started = time.perf_counter()
        checks = quality.run_deterministic_checks(
            resume,
            evidence,
            allowed_technologies,
            grounded_targets=grounded_targets,
        )
        checks_by_code = {check["code"]: check for check in checks}
        if deterministic_checks:
            for item in deterministic_checks:
                if hasattr(item, "model_dump"):
                    data = item.model_dump()
                elif isinstance(item, dict):
                    data = item
                else:
                    continue
                status = data.get("status", "pass")
                if status == "warning":
                    status = "warn"
                parsed = FinalQaCheck.model_validate({**data, "status": status})
                check_status: quality.CheckStatus = "fail"
                if parsed.status == "pass":
                    check_status = "pass"
                elif parsed.status == "warn":
                    check_status = "warn"
                definition = quality.FINAL_QA_CHECK_REGISTRY[parsed.code]
                checks_by_code[parsed.code] = quality.qa_check(
                    parsed.code,
                    check_status,
                    parsed.detail,
                    blocking=definition.blocking,
                )

        # Test-only hook (mock provider): force V4 to fail Primary technology emphasis once so
        # repair journeys can run. Later revisions must satisfy the real content postcondition.
        force = os.environ.get("CANDIDARC_MOCK_FINAL_QA_FORCE", "").strip().lower()
        if force == "fail_until_repair":
            primary_tech: str | None = None
            if grounded_targets:
                primary_tech = grounded_targets[0].lower()
            else:
                evidence_techs = [t.lower() for item in evidence for t in item.technologies]
                if evidence_techs:
                    primary_tech = evidence_techs[0]

            version = getattr(resume, "version_number", None)
            if version is None:
                version = getattr(resume, "absolute_version", None)

            condition_fixed = False
            if primary_tech:
                for section in resume.sections:
                    if section.type in {"summary", "skills"} and section.bullets:
                        lead_text = section.bullets[0].text.lower()[:80]
                        lead_techs = [t.lower() for t in section.bullets[0].technologies]
                        if primary_tech in lead_text or primary_tech in lead_techs:
                            condition_fixed = True
                            break

            # Original V4 always fails once (even if content already looks fine).
            # V4R1+ must actually lead with the grounded primary tech to pass.
            force_fail = version == 4 or (version is not None and version > 4 and not condition_fixed)
            if force_fail:
                checks_by_code[FinalQaCheckCode.PRIMARY_TECHNOLOGY_EMPHASIS] = quality.qa_check(
                    FinalQaCheckCode.PRIMARY_TECHNOLOGY_EMPHASIS,
                    "fail",
                    f"Lead with grounded primary technology from evidence ({primary_tech or 'none'})",
                    blocking=True,
                )

        typed = [FinalQaCheck.model_validate(c) for c in checks_by_code.values()]
        # Server authorize_final_qa_response owns passed; keep mock advisory false-safe
        # so a local/auth mismatch cannot trip PROVIDER_OUTPUT_INVALID on happy paths.
        passed = False
        latency = int((time.perf_counter() - started) * 1000)
        usage = ProviderUsage(
            provider=self.name,
            model=self.model,
            prompt_version="final-qa@python-v2",
            rubric_version=SCORE_RUBRIC_VERSION,
            input_tokens=40,
            output_tokens=20,
            cached_tokens=0,
            latency_ms=latency,
            provider_request_id="mock-final-qa",
            estimated_cost_cents=None,
            retry_count=0,
        )
        return (
            FinalQaResponse(passed=passed, checks=typed, provider=self.name, model=self.model, usage=usage),
            latency,
            usage,
        )

    async def synthesize_research(
        self,
        *,
        company: str,
        sources: list[ResearchSource],
        **_: Any,
    ) -> tuple[ResearchSynthesizeResponse, int, ProviderUsage]:
        from app.modules.research import service as research

        started = time.perf_counter()
        result = research.synthesize_from_sources(company=company, sources=sources)
        latency = int((time.perf_counter() - started) * 1000)
        usage = ProviderUsage(
            provider="deterministic",
            model="internal",
            prompt_version="research@python-v1",
            latency_ms=latency,
            input_tokens=0,
            output_tokens=0,
            cached_tokens=0,
            provider_request_id=None,
            estimated_cost_cents=0,
            retry_count=0,
        )
        return (
            result.model_copy(
                update={
                    "provider": usage.provider,
                    "model": usage.model,
                    "latency_ms": latency,
                    "usage": usage,
                }
            ),
            latency,
            usage,
        )

    async def match_evidence(
        self,
        *,
        requirements: list[str],
        evidence: list[EvidenceItem],
        **_: Any,
    ) -> tuple[EvidenceMatchResponse, int, ProviderUsage]:
        started = time.perf_counter()
        result = match_evidence_request_scoped(requirements, evidence)
        latency = int((time.perf_counter() - started) * 1000)
        usage = ProviderUsage(
            provider="deterministic",
            model="internal",
            prompt_version="evidence-match@lexical-v1",
            latency_ms=latency,
            input_tokens=0,
            output_tokens=0,
            cached_tokens=0,
            provider_request_id=None,
            estimated_cost_cents=0,
            retry_count=0,
        )
        return (
            result.model_copy(
                update={
                    "provider": usage.provider,
                    "model": usage.model,
                    "latency_ms": latency,
                    "usage": usage,
                }
            ),
            latency,
            usage,
        )
