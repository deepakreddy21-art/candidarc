"""Hostile-provider tests for server-authoritative Final QA."""

from __future__ import annotations

import pytest

from app.core.errors import PROVIDER_OUTPUT_INVALID, ProviderError
from app.domain.schemas import DeterministicQaCheck, FinalQaCheckCode
from app.modules.generation.service import generate_grounded_resume
from app.modules.quality.registry import FINAL_QA_CHECK_REGISTRY, REQUIRED_FINAL_QA_CODES
from app.modules.quality.service import authorize_final_qa_response
from tests.conftest import qa_context, qa_evidence


def _fixture():
    evidence = qa_evidence(qa_context())
    resume = generate_grounded_resume(
        absolute_version=4,
        cycle_step=4,
        evidence=evidence,
        allowed_technologies=["Python", "PyTorch", "OpenSearch"],
        job_description="Platform engineer " + ("x" * 20),
    )
    critical = DeterministicQaCheck(
        code=FinalQaCheckCode.CRITICAL_FINDINGS,
        label="Critical findings",
        status="pass",
        blocking=True,
        detail="0 unresolved critical findings",
    )
    return resume, evidence, [critical]


def _provider_payload(*, passed: bool = False) -> dict[str, object]:
    return {
        "passed": passed,
        "checks": [
            {
                "code": code.value,
                "label": definition.label,
                "status": "pass",
                "blocking": definition.blocking,
                "detail": "provider advisory detail",
            }
            for code, definition in FINAL_QA_CHECK_REGISTRY.items()
            if definition.required
        ],
        "provider": "hostile",
        "model": "hostile-model",
    }


@pytest.mark.parametrize(
    "mutate",
    [
        lambda payload: payload.update(checks=[]),
        lambda payload: payload["checks"].append(dict(payload["checks"][0])),
        lambda payload: payload.update(checks=payload["checks"][1:]),
        lambda payload: payload["checks"][0].update(status="not-a-status"),
        lambda payload: payload["checks"][0].update(blocking=False),
    ],
    ids=["empty", "duplicate", "missing-required", "malformed", "blocking-mismatch"],
)
def test_hostile_provider_payload_fails_closed(mutate) -> None:
    resume, evidence, deterministic = _fixture()
    payload = _provider_payload()
    mutate(payload)
    with pytest.raises(ProviderError, match=PROVIDER_OUTPUT_INVALID):
        authorize_final_qa_response(
            payload,
            resume=resume,
            evidence=evidence,
            deterministic_checks=deterministic,
        )


def test_unknown_blocking_failure_fails_closed() -> None:
    resume, evidence, deterministic = _fixture()
    payload = _provider_payload()
    payload["checks"].append({
        "code": "NOT_A_REAL_CHECK",
        "label": "Unknown",
        "status": "fail",
        "blocking": True,
        "detail": "hostile",
    })
    with pytest.raises(ProviderError, match=PROVIDER_OUTPUT_INVALID):
        authorize_final_qa_response(
            payload,
            resume=resume,
            evidence=evidence,
            deterministic_checks=deterministic,
        )


def test_provider_passed_true_cannot_override_authoritative_failure() -> None:
    resume, evidence, deterministic = _fixture()
    resume = resume.model_copy(update={
        "sections": [section for section in resume.sections if section.type != "summary"],
    })
    with pytest.raises(ProviderError, match=PROVIDER_OUTPUT_INVALID):
        authorize_final_qa_response(
            _provider_payload(passed=True),
            resume=resume,
            evidence=evidence,
            deterministic_checks=deterministic,
        )


def test_required_statuses_and_passed_are_server_derived() -> None:
    resume, evidence, deterministic = _fixture()
    payload = _provider_payload()
    for check in payload["checks"]:
        if check["code"] == FinalQaCheckCode.HAS_SUMMARY.value:
            check["status"] = "fail"
    result = authorize_final_qa_response(
        payload,
        resume=resume,
        evidence=evidence,
        deterministic_checks=deterministic,
    )
    assert result.passed is True
    assert {check.code for check in result.checks}.issuperset(REQUIRED_FINAL_QA_CODES)
    summary = next(check for check in result.checks if check.code == FinalQaCheckCode.HAS_SUMMARY)
    assert summary.status == "pass"
