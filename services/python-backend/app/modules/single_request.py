"""One paid generation, then local checks. No critic, rewrite, planner or synthesis calls."""
from __future__ import annotations

import time
from typing import Any

from fastapi import Request

from app.core.idempotency import request_hash
from app.domain.schemas import ResumeGenerateResponse, SingleRequestGenerateRequest
from app.modules.guardrails.service import validate_resume_claims
from app.modules.source_fields import restore_source_fields
from app.providers.factory import get_provider

LOCAL_CAPABILITIES = {
    "generative_model_available": False,
    "runtime": None,
    "supported_repairs": ["whitespace", "duplicate_bullets", "source_headers"],
    "unsupported": ["free_form_rewrite", "semantic_equivalence_proof"],
}


def repair_locally(resume: Any) -> Any:
    repaired = resume.model_copy(deep=True)
    for section in repaired.sections:
        for container in [section, *(section.items or [])]:
            seen: set[str] = set()
            kept = []
            for bullet in container.bullets or []:
                bullet.text = " ".join(bullet.text.split())
                # Include evidence in identity: identical text with different ownership is not deduped.
                key = repr((bullet.text.casefold(), sorted(bullet.evidence_ids)))
                if key not in seen:
                    kept.append(bullet)
                    seen.add(key)
            if container.bullets is not None:
                container.bullets = kept
    return repaired


async def generate_once(request: Request, body: SingleRequestGenerateRequest) -> dict[str, Any]:
    ledger = request.app.state.single_request_ledger
    tenant, owner = body.context.tenant_id, body.context.user_id
    # Request/trace IDs change on retries; the immutable business input does not.
    content = body.model_dump(mode="json", exclude={"context"})
    digest = request_hash(content)
    # Resolve the provider locally; construction does not dispatch network traffic.
    provider = get_provider("generation", request)
    saved = await ledger.consume(tenant, owner, body.operation_id, digest)
    if saved is None:
        kwargs = {key: getattr(body, key) for key in (
            "absolute_version", "cycle_step", "version_number", "evidence", "allowed_technologies",
            "job_description", "job_requirements", "research_findings", "evidence_matches", "resume_plan")}
        kwargs["research_sources"] = body.research_sources
        try:
            if request.app.state.settings.ai_mode == "mock":
                resume, latency, usage = await provider.generate_resume(**kwargs)
            else:
                # Deliberately bypass generate_resume's retries and guardrails until response is saved.
                resume, latency, usage = await provider.generate_resume_once(**kwargs)
            saved = ResumeGenerateResponse(resume=resume, provider=usage.provider, model=usage.model,
                prompt_version=usage.prompt_version, latency_ms=latency, usage=usage).model_dump(mode="json")
            await ledger.save(tenant, owner, body.operation_id, digest, saved)
        except BaseException:
            # Cancellation and process loss must never restore the allowance. If this write fails,
            # 'dispatched' itself is already an uncertain terminal dispatch state.
            await ledger.save(tenant, owner, body.operation_id, digest, None)
            raise
    result = ResumeGenerateResponse.model_validate(saved)
    started = time.perf_counter()
    cpu_started = time.process_time()
    result.resume = repair_locally(restore_source_fields(result.resume, body.evidence))
    violations = validate_resume_claims(result.resume, body.evidence, body.allowed_technologies,
        tenant_id=tenant, owner_user_id=owner, job_description=body.job_description,
        research_findings=body.research_findings)
    kinds = {item.source_type for item in body.evidence}
    types = {section.type for section in result.resume.sections}
    required = {target for kind, target in [("employment", "experience"), ("education", "education"),
        ("project", "projects"), ("certification", "certifications"), ("publication", "publications")] if kind in kinds}
    violations += [f"MISSING_SOURCE_SECTION:{kind}" for kind in sorted(required - types)]
    if not result.resume.sections:
        violations.append("EMPTY_RESUME")
    # Peak process RSS is not per-request allocation; Windows lacks resource.
    try:
        import resource
        peak_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    except ImportError:
        peak_rss = None
    # Facts are checked locally; semantic correctness remains a human review limitation.
    return {**result.model_dump(mode="json"), "local_validation": {
        "passed": not violations, "violations": violations,
        "latency_ms": round((time.perf_counter() - started) * 1000),
        "cpu_ms": round((time.process_time() - cpu_started) * 1000), "process_peak_rss_native_units": peak_rss,
        "capabilities": LOCAL_CAPABILITIES}}
