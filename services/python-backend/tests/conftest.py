"""Shared fictional QA fixtures — no real PII or API keys."""

from __future__ import annotations

from app.domain.schemas import EvidenceItem, RequestContext


def qa_context() -> RequestContext:
    return RequestContext(
        tenant_id="ten_qa",
        user_id="user_qa",
        application_id="app_qa",
        workflow_run_id="wf_qa",
        request_id="req_qa",
    )


def qa_evidence(ctx: RequestContext | None = None) -> list[EvidenceItem]:
    context = ctx or qa_context()
    return [
        EvidenceItem(
            id="ev-1",
            tenant_id=context.tenant_id,
            owner_user_id=context.user_id,
            title="Northwind Labs employment",
            organization="Northwind Labs",
            claim_text="Software Engineer at Northwind Labs, January 2024 – Present",
            technologies=["Python", "PyTorch", "OpenSearch"],
            source_type="employment",
            employer_association="Northwind Labs",
            verification_status="user_attested",
            candidate_confirmation_status="confirmed",
            confidence="high",
            metrics=["latency improved 35%"],
        ),
        EvidenceItem(
            id="ev-2",
            tenant_id=context.tenant_id,
            owner_user_id=context.user_id,
            title="Rivertown Institute education",
            organization="Rivertown Institute of Technology",
            claim_text="MS Information Systems, January 2023 – May 2024",
            technologies=[],
            source_type="education",
            verification_status="user_attested",
            candidate_confirmation_status="confirmed",
            confidence="high",
        ),
    ]


AUTH_HEADERS = {"Authorization": "Bearer dev-python-backend-token-change-me"}
