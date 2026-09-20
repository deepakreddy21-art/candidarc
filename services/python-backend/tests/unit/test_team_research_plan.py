"""Source and evidence boundaries with simulated SDK responses, not live accuracy claims."""

import json
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.errors import ProviderError
from app.domain.schemas import EvidenceItem, ResearchFinding, ResearchSource
from app.main import app
from app.modules.research.intelligence import (
    ResearchAnalysis,
    ResumePlanAnalysis,
    authorize_plan,
    authorize_research,
    mentions,
)
from app.providers.openai_provider import OpenAIProvider
from tests.conftest import AUTH_HEADERS, qa_context

QUOTE = "Harbor's Payments team uses PostgreSQL and automated integration tests for its payment services."


def test_short_technology_and_company_names_use_token_boundaries():
    assert not mentions("Go", "Google uses Python")
    assert not mentions("Meta", "metadata service")
    assert not mentions("C", "C++ services")
    assert mentions("C++", "services in C++ and Go")
    assert mentions("Go", "services in C++ and Go")


def source(**updates):
    return ResearchSource.model_validate({
        "id": "source-1", "url": "https://engineering.example/payments", "title": "Harbor Payments engineering",
        "accessed_at": datetime.now(UTC).isoformat(), "published_at": datetime.now(UTC).isoformat(),
        "supporting_text": QUOTE, "source_kind": "public-reference", **updates,
    })


def finding(**updates):
    return ResearchFinding.model_validate({
        "title": "Payment reliability", "category": "team", "summary": QUOTE,
        "scope": "team", "subject": "Payments", "relationship": "stack_usage", "confidence": "high",
        "status": "supported", "source_ids": ["source-1"], "technologies": ["PostgreSQL"],
        "capabilities": ["integration testing"], "supporting_quotes": [{"source_id": "source-1", "quote": QUOTE}],
        **updates,
    })


def evidence(**updates):
    return EvidenceItem.model_validate({
        "id": "e1", "tenant_id": "ten_qa", "owner_user_id": "user_qa", "title": "Engineer",
        "organization": "Previous Employer", "employer_association": "Previous Employer", "source_type": "employment",
        "actions": ["Automated integration tests for payment APIs on AWS."], "technologies": ["AWS"],
        "verification_status": "user_attested", "candidate_confirmation_status": "confirmed", "confidence": "high", **updates,
    })


def plan(**updates):
    return ResumePlanAnalysis.model_validate({"items": [{
        "capability": "Service reliability", "rationale": "Relevant to Payments engineering",
        "basis": "team_research", "research_source_ids": ["source-1"], "evidence_ids": ["e1"],
        "candidate_technologies": ["AWS"], "placement": "experience", "emphasis": "Highlight the candidate's API integration tests.",
        "candidate_quotes": [{"evidence_id": "e1", "quote": "Automated integration tests for payment APIs on AWS."}],
        **updates,
    }]})


def research(**updates):
    return authorize_research(ResearchAnalysis(findings=[finding(**updates)], limitations=[]), [source()], company="Harbor", team="Payments")


def test_specific_team_finding_has_real_quote_and_scope():
    result = research()
    assert result.findings[0].status == "supported"
    assert result.findings[0].scope == "team"
    assert result.findings[0].supporting_quotes[0].quote == QUOTE


@pytest.mark.parametrize("update", [
    {"source_ids": ["invented"]},
    {"supporting_quotes": [{"source_id": "source-1", "quote": "Harbor uses Kafka everywhere."}]},
])
def test_fabricated_references_are_removed(update):
    assert not research(**update).findings


def test_other_company_and_unknown_team_are_not_verified():
    analysis = ResearchAnalysis(findings=[finding()], limitations=[])
    assert not authorize_research(analysis, [source()], company="Unrelated Corp", team="Payments").findings
    result = authorize_research(analysis, [source()], company="Harbor", team="Compute")
    assert (result.findings[0].scope, result.findings[0].status) == ("company", "inferred")


@pytest.mark.parametrize("date", [None, "2019-01-01", "invalid", "2100-01-01"])
def test_old_or_undated_sources_are_uncertain(date):
    result = authorize_research(ResearchAnalysis(findings=[finding()], limitations=[]), [source(published_at=date)], company="Harbor", team="Payments")
    assert result.findings[0].confidence == "low"
    assert result.findings[0].status == "inferred"
    assert "Publication date" in result.findings[0].caveat


def test_product_offering_and_jd_mentions_do_not_authorize_team_usage():
    assert research(relationship="product_capability").findings[0].status == "inferred"
    result = authorize_research(ResearchAnalysis(findings=[finding()], limitations=[]), [source(source_kind="job-posting")], company="Harbor", team="Payments")
    assert result.findings[0].status == "inferred"
    assert not authorize_plan(plan(), [evidence()], result.findings)


def test_unknown_tech_is_removed_and_candidate_tools_are_preserved():
    assert research(technologies=["PostgreSQL", "Kafka"]).findings[0].technologies == ["PostgreSQL"]
    result = authorize_plan(plan(candidate_technologies=["AWS", "OCI", "Kafka"]), [evidence()], [finding()])
    assert result[0].candidate_technologies == ["AWS"]


@pytest.mark.parametrize("update", [
    {"evidence_ids": ["another-user"]},
    {"candidate_quotes": [{"evidence_id": "e1", "quote": "Deployed Kafka at Previous Employer."}]},
    {"research_source_ids": ["unknown-source"]},
    {"evidence_ids": []},
])
def test_invalid_plan_citations_are_removed(update):
    assert not authorize_plan(plan(**update), [evidence()], [finding()])


def test_cross_employer_plan_cannot_merge_responsibilities():
    proposed = plan(evidence_ids=["e1", "e2"], candidate_quotes=[
        {"evidence_id": id, "quote": "Automated integration tests for payment APIs on AWS."} for id in ["e1", "e2"]])
    assert not authorize_plan(proposed, [evidence(), evidence(id="e2", organization="Other", employer_association="Other")], [finding()])


@pytest.mark.parametrize("kind", ["skills", "education", "project", "company_research"])
def test_non_employment_evidence_cannot_be_promoted_into_work_experience(kind):
    assert not authorize_plan(plan(), [evidence(source_type=kind)], [finding()])


def test_gaps_stay_out_of_resume_and_projects_stay_projects():
    gaps = authorize_plan(plan(placement="interview_only", gap="Any relevant testing projects to add?"), [], [finding()])
    assert gaps[0].evidence_ids == gaps[0].candidate_technologies == []
    projects = authorize_plan(plan(placement="projects"), [evidence(source_type="project", project_association="API demo")], [finding()])
    assert projects[0].placement == "projects"


def sdk(payload):
    client = MagicMock()
    client.beta.chat.completions.parse = AsyncMock(return_value=SimpleNamespace(
        id="call-1", choices=[SimpleNamespace(message=SimpleNamespace(parsed=payload))],
        usage=SimpleNamespace(prompt_tokens=1200, completion_tokens=240, prompt_tokens_details=None)))
    return client


@pytest.mark.asyncio
async def test_live_research_requests_structured_analysis_and_records_real_usage():
    client = sdk(ResearchAnalysis(findings=[finding()], limitations=[]))
    provider = OpenAIProvider(Settings(ai_mode="live", app_mode="demo"), client=client)
    result, _, usage = await provider.synthesize_research(company="Harbor", role="Engineer", sources=[source()], team="Payments")
    assert result.findings[0].scope == "team"
    assert usage.provider == "openai" and usage.input_tokens == 1200
    assert usage.estimated_cost_cents is None or usage.estimated_cost_cents > 0
    message = json.loads(client.beta.chat.completions.parse.call_args.kwargs["messages"][1]["content"])
    assert message["team"] == "Payments"
    assert message["sources"][0]["supporting_text"] == QUOTE


@pytest.mark.asyncio
async def test_live_planning_uses_full_evidence_and_is_not_reported_as_free_lexical_matching():
    client = sdk(plan())
    provider = OpenAIProvider(Settings(ai_mode="live", app_mode="demo"), client=client)
    result, _, usage = await provider.match_evidence(requirements=["Distributed systems"], evidence=[evidence()], research_findings=[finding()],
                                                    job_description="Work on backend payment services.", role="Platform Engineer", company="Harbor")
    assert result.resume_plan[0].capability == "Service reliability"
    assert usage.provider == "openai" and usage.output_tokens == 240
    assert usage.estimated_cost_cents is None or usage.estimated_cost_cents > 0
    sent = json.loads(client.beta.chat.completions.parse.call_args.kwargs["messages"][1]["content"])
    assert sent["candidate_evidence"][0]["actions"] == evidence().actions
    assert sent["role"] == "Platform Engineer"
    assert sent["job_description"] == "Work on backend payment services."


@pytest.mark.asyncio
async def test_malformed_planning_is_not_a_silent_success():
    provider = OpenAIProvider(Settings(ai_mode="live", app_mode="demo"), client=sdk({"wrong": []}))
    with pytest.raises(ProviderError, match="PROVIDER_OUTPUT_INVALID"):
        await provider.match_evidence(requirements=["Python"], evidence=[evidence()])


def test_research_and_plan_retries_replay_without_second_provider_call(monkeypatch):
    from app.api.v1 import routes
    client = sdk(ResearchAnalysis(findings=[finding()], limitations=[]))
    provider = OpenAIProvider(Settings(ai_mode="live", app_mode="demo"), client=client)
    monkeypatch.setattr(routes, "get_provider", lambda *_: provider)
    with TestClient(app) as api:
        context = qa_context().model_dump(mode="json")
        headers = {**AUTH_HEADERS, "Idempotency-Key": "team-research-repeat"}
        body = {"context": context, "company": "Harbor", "role": "Engineer", "job_description": "Build payment services.", "team": "Payments", "sources": [source().model_dump(mode="json")]}
        one = api.post("/v1/research/synthesize", json=body, headers=headers)
        two = api.post("/v1/research/synthesize", json=body, headers=headers)
        assert one.status_code == two.status_code == 200, one.text
        assert one.json() == two.json()
        assert client.beta.chat.completions.parse.await_count == 1
        client.beta.chat.completions.parse.return_value.choices[0].message.parsed = plan()
        body = {"context": context, "requirements": ["Distributed systems"], "evidence": [evidence().model_dump(mode="json")], "research_findings": [finding().model_dump(mode="json")]}
        one = api.post("/v1/evidence/match", json=body, headers=headers)
        two = api.post("/v1/evidence/match", json=body, headers=headers)
        assert one.status_code == two.status_code == 200, one.text
        assert one.json() == two.json()
        assert client.beta.chat.completions.parse.await_count == 2
        body["evidence"][0]["owner_user_id"] = "other-user"
        assert api.post("/v1/evidence/match", json=body, headers=headers).status_code == 403
