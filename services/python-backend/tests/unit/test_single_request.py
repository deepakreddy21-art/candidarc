from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.core.config import Settings
from app.core.single_request import SingleRequestLedger
from app.domain.schemas import SingleRequestGenerateRequest
from app.modules.generation.service import generate_grounded_resume
from app.modules.single_request import generate_once
from app.providers.openai_provider import OpenAIProvider
from tests.conftest import qa_context, qa_evidence


def payload() -> SingleRequestGenerateRequest:
    return SingleRequestGenerateRequest(context=qa_context(), operation_id="operation-0123456789",
        job_description="Software engineer working with Python", evidence=qa_evidence(),
        allowed_technologies=["Python", "PyTorch", "OpenSearch"], absolute_version=0)


@pytest.mark.asyncio
async def test_allowance_concurrency_and_unknown_outcome_never_releases() -> None:
    ledger = SingleRequestLedger(allow_memory=True)
    calls = await asyncio.gather(*(ledger.consume("t", "u", "k", "digest") for _ in range(20)), return_exceptions=True)
    assert calls.count(None) == 1
    assert sum(isinstance(value, HTTPException) for value in calls) == 19
    await ledger.save("t", "u", "k", "digest", None)
    with pytest.raises(HTTPException) as err:
        await ledger.consume("t", "u", "k", "digest")
    assert err.value.detail["code"] == "GENERATION_OUTCOME_UNCERTAIN"
    # Successful late completion can recover an uncertain operation without another dispatch.
    await ledger.save("t", "u", "k", "digest", {"resume": "saved"})
    assert await ledger.consume("t", "u", "k", "digest") == {"resume": "saved"}
    with pytest.raises(HTTPException):
        await ledger.consume("t", "u", "k", "different")
    assert await ledger.consume("t", "other", "k", "digest") is None


@pytest.mark.asyncio
async def test_no_live_memory_allowance() -> None:
    with pytest.raises(HTTPException, match="503"):
        await SingleRequestLedger().consume("t", "u", "k", "digest")


@pytest.mark.asyncio
async def test_initial_response_survives_local_validation_crash(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.providers.mock_provider import MockProvider
    provider = MockProvider()
    spy = AsyncMock(wraps=provider.generate_resume)
    provider.generate_resume = spy  # type: ignore[method-assign]
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(
        single_request_ledger=SingleRequestLedger(allow_memory=True), settings=Settings(AI_MODE="mock"))))
    monkeypatch.setattr("app.modules.single_request.get_provider", lambda *args: provider)
    monkeypatch.setattr("app.modules.single_request.validate_resume_claims", lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("local crash")))
    with pytest.raises(RuntimeError, match="local crash"):
        await generate_once(request, payload())  # type: ignore[arg-type]
    monkeypatch.setattr("app.modules.single_request.validate_resume_claims", lambda *a, **kw: [])
    result = await generate_once(request, payload())  # type: ignore[arg-type]
    assert result["local_validation"]["passed"]
    assert result["local_validation"]["capabilities"]["generative_model_available"] is False
    assert spy.await_count == 1


@pytest.mark.asyncio
async def test_provider_timeout_is_not_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    call = AsyncMock(side_effect=TimeoutError("uncertain"))
    provider = SimpleNamespace(generate_resume_once=call)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(
        single_request_ledger=SingleRequestLedger(allow_memory=True), settings=Settings(AI_MODE="live"))))
    monkeypatch.setattr("app.modules.single_request.get_provider", lambda *args: provider)
    with pytest.raises(TimeoutError):
        await generate_once(request, payload())  # type: ignore[arg-type]
    with pytest.raises(HTTPException):
        await generate_once(request, payload())  # type: ignore[arg-type]
    assert call.await_count == 1


@pytest.mark.asyncio
async def test_sdk_retry_disabled_and_no_wrapper_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, object]] = []
    client = SimpleNamespace(with_options=lambda **kwargs: calls.append(kwargs) or SimpleNamespace())
    provider = OpenAIProvider(Settings(AI_MODE="live", OPENAI_API_KEY="test-key-not-real"), client=client)
    sdk = AsyncMock(side_effect=TimeoutError("provider timeout"))
    monkeypatch.setattr(OpenAIProvider, "_sdk_generate", sdk)
    with pytest.raises(TimeoutError):
        await provider.generate_resume_once(evidence=qa_evidence())
    assert calls == [{"max_retries": 0}]
    assert sdk.await_count == 1


def test_field_boundaries_and_structured_education_location() -> None:
    from app.domain.schemas import ResumeItem
    from app.modules.guardrails.service import validate_resume_claims
    evidence = qa_evidence()
    evidence[0].task = "Software Engineer January 2024 Present San Antonio, TX"
    evidence[1].details = {"location": "Chicago, IL", "degree": "MS Information Systems"}
    resume = generate_grounded_resume(absolute_version=0, cycle_step=0, evidence=evidence,
        job_description="Python engineer", allowed_technologies=["Python", "PyTorch", "OpenSearch"])
    for section in resume.sections:
        if section.type == "experience":
            section.items = [ResumeItem(heading="Northwind Labs", subheading="Software Engineer", bullets=section.bullets or [])]
            section.bullets = []
            section.items[0].location = "San Antonio, TX"  # type: ignore[index]
            section.items[0].dates = "January 2024 – Present"  # type: ignore[index]
    assert "UNSUPPORTED_COMPANY" not in validate_resume_claims(resume, evidence)


def test_structured_facts_restored_without_changing_role_ownership() -> None:
    from app.domain.schemas import EvidenceItem
    from app.modules.source_fields import restore_source_fields
    evidence = qa_evidence()
    evidence[0].details = {"company": "Northwind Labs", "title": "Software Engineer", "location": "San Antonio, TX",
        "startDate": "January 2024", "endDate": "Present", "bullets": ["Maintained Python APIs."]}
    evidence[1].details = {"institution": "Rivertown Institute of Technology", "degree": "MS", "field": "Information Systems",
        "location": "Chicago, IL", "startDate": "January 2023", "endDate": "May 2024", "gpa": "3.8"}
    evidence.append(EvidenceItem(id="project-1", tenant_id="ten_qa", owner_user_id="user_qa", title="Budget Planner",
        source_type="project", verification_status="user_attested", candidate_confirmation_status="confirmed", confidence="high", details={"name": "Budget Planner", "role": "Contributor", "url": "https://example.com/planner",
        "bullets": ["Analyzed budget forecasts."]}))
    source = generate_grounded_resume(absolute_version=0, cycle_step=0, evidence=qa_evidence(), job_description="Python engineer")
    restored = restore_source_fields(source, evidence)
    by_type = {section.type: section for section in restored.sections}
    assert by_type["experience"].items[0].heading == "Northwind Labs"  # type: ignore[index]
    assert by_type["experience"].items[0].location == "San Antonio, TX"  # type: ignore[index]
    assert by_type["education"].items[0].dates == "January 2023 – May 2024"  # type: ignore[index]
    assert by_type["education"].items[0].subheading == "MS, Information Systems"  # type: ignore[index]
    assert "3.8" in [b.text for b in by_type["education"].items[0].bullets]  # type: ignore[index]
    assert all(b.evidence_ids == ["project-1"] for b in by_type["projects"].items[0].bullets)  # type: ignore[index]
    assert "https://example.com/planner" in [b.text for b in by_type["projects"].items[0].bullets]  # type: ignore[index]


@pytest.mark.asyncio
async def test_unchanged_embeddings_reused_but_model_or_metrics_change_reindexes() -> None:
    from app.modules.evidence.service import index_evidence_items
    from app.modules.evidence.store.embeddings import MockEmbeddingProvider
    from app.modules.evidence.store.memory import MemoryEvidenceStore
    store = MemoryEvidenceStore()
    embedder = MockEmbeddingProvider()
    spy = AsyncMock(wraps=embedder.embed_texts)
    embedder.embed_texts = spy  # type: ignore[method-assign]
    evidence = qa_evidence()
    async def index() -> None:
        await index_evidence_items(store, embedder, tenant_id="ten_qa", owner_user_id="user_qa", evidence=evidence)
    await index()
    await index()
    assert spy.await_count == 2
    evidence[0].metrics = ["Supported 10 users"]
    await index()
    assert spy.await_count == 3
    embedder.model = "changed-model-v2"
    await index()
    assert spy.await_count == 5


def test_http_contract_replays_saved_response_and_rejects_rewrite(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi.testclient import TestClient

    from app.core.config import get_settings
    from app.main import create_app
    from tests.conftest import AUTH_HEADERS
    monkeypatch.setenv("APP_MODE", "demo")
    monkeypatch.setenv("AI_MODE", "mock")
    monkeypatch.setenv("EVIDENCE_STORE", "memory")
    get_settings.cache_clear()
    with TestClient(create_app()) as client:
        body = payload().model_dump(mode="json")
        first = client.post("/v1/resumes/generate-once", json=body, headers=AUTH_HEADERS)
        assert first.status_code == 200, first.text
        assert first.json()["local_validation"]["passed"], first.text
        body["context"]["request_id"] = "retry-trace"
        second = client.post("/v1/resumes/generate-once", json=body, headers=AUTH_HEADERS)
        assert second.status_code == 200, second.text
        assert second.json()["resume"] == first.json()["resume"]
        assert len(client.app.state.single_request_ledger.rows) == 1  # type: ignore[union-attr]
        body["refinement_instruction"] = "Make a new version"
        assert client.post("/v1/resumes/generate-once", json=body, headers=AUTH_HEADERS).status_code == 422
        assert client.post("/v1/resumes/generate-once", json=body).status_code in (401, 403)
    get_settings.cache_clear()
