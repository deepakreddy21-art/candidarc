"""Contract/enforcement tests with simulated model verdicts, not live accuracy claims."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.config import Settings
from app.core.errors import ProviderError
from app.domain.schemas import AuditFinding, EvidenceItem, FinalQaCheckCode, ResumeBullet, ResumeItem, ResumeSection
from app.modules.audits.service import adjudicate_findings
from app.modules.generation.service import apply_accepted_findings
from app.modules.guardrails.service import build_grounded_resume
from app.modules.quality.meaning import (
    ClaimReview,
    MeaningAssessment,
    ReviewedAuditFinding,
    ReviewedFinalQa,
    SourceQuote,
    authorize_audit_edit,
    authorize_meaning_reviews,
    review_targets,
)
from app.modules.quality.service import authorize_final_qa_response, run_deterministic_checks
from app.providers.anthropic_provider import AnthropicProvider
from app.providers.openai_provider import OpenAIProvider


def fixture(action: str = "Built a payment microservice. Designed a dashboard."):
    evidence = [EvidenceItem(id="e1", tenant_id="t1", owner_user_id="u1", title="Delivery",
                             actions=[action], claim_text=action, verification_status="user_attested",
                             candidate_confirmation_status="confirmed", confidence="high")]
    resume = build_grounded_resume(absolute_version=4, cycle_step=4, evidence=evidence, notes="test")
    resume.sections = [
        ResumeSection(type="summary", title="Summary", order=0,
                      bullets=[ResumeBullet(text="Implemented payment functionality.", evidence_ids=["e1"])]),
        ResumeSection(type="experience", title="Experience", order=1,
                      bullets=[ResumeBullet(text="Built a payment microservice.", evidence_ids=["e1"]),
                               ResumeBullet(text="Designed a dashboard.", evidence_ids=["e1"])])]
    return resume, evidence


def assessment(**updates) -> MeaningAssessment:
    return MeaningAssessment.model_validate({
        "action": "supported", "object": "supported", "ownership": "supported",
        "scope": "supported", "outcome": "supported", "naturalness": "natural",
        "explanation": "Implementation of this service is described in the source.",
        "source_quotes": [{"evidence_id": "e1", "quote": "Built a payment microservice."}],
        **updates,
    })


def finding(review: MeaningAssessment, **updates) -> ReviewedAuditFinding:
    return ReviewedAuditFinding.model_validate({
        "severity": "minor", "section": "experience", "title": "Clarify implementation",
        "explanation": "Improve clarity", "before_text": "Built a payment microservice.",
        "suggested_text": "Implemented a payment microservice.", "expected_score_impact": 0,
        "evidence_ids": ["e1"], "meaning_review": review.model_dump(), **updates,
    })


@pytest.mark.parametrize(("dimension", "replacement"), [
    ("action", "Architected a payment microservice."),
    ("object", "Designed the payment microservice rather than a dashboard."),
    ("ownership", "Led the team's payment migration."),
    ("scope", "Implemented payment services across the enterprise."),
    ("outcome", "Reduced payment failures through the microservice."),
])
@pytest.mark.parametrize("verdict", ["unsupported", "uncertain"])
def test_rejected_meaning_changes_preserve_original_and_survive_adjudication(dimension, replacement, verdict) -> None:
    resume, evidence = fixture()
    original = resume.model_dump()
    proposal = finding(assessment(**{dimension: verdict}), suggested_text=replacement)
    checked = authorize_audit_edit(proposal, resume, evidence)
    accepted, rejected = adjudicate_findings([checked], evidence)
    assert not accepted
    assert rejected[0].status == "rejected"
    assert dimension in rejected[0].rejection_reason
    assert apply_accepted_findings(resume, rejected).model_dump() == original


def test_natural_edit_changes_only_the_exact_bullet_not_another_action_with_same_evidence() -> None:
    resume, evidence = fixture()
    checked = authorize_audit_edit(finding(assessment(), edited_text="Owned all payment architecture."), resume, evidence)
    accepted, rejected = adjudicate_findings([checked], evidence)
    assert not rejected and len(accepted) == 1
    updated = apply_accepted_findings(resume, accepted)
    assert updated.sections[1].bullets[0].text == "Implemented a payment microservice."
    assert updated.sections[1].bullets[1].text == "Designed a dashboard."
    assert updated.sections[0] == resume.sections[0]
    assert resume.sections[1].bullets[0].text == "Built a payment microservice."


@pytest.mark.parametrize("update", [
    {"before_text": "Old text that is no longer present"},
    {"section": "projects"},
    {"evidence_ids": ["e2"]},
    {"evidence_source": "e2"},
])
def test_rejects_stale_or_wrong_role_edits(update) -> None:
    resume, evidence = fixture()
    assert authorize_audit_edit(finding(assessment(), **update), resume, evidence).status == "rejected"


@pytest.mark.parametrize("review", [
    assessment(naturalness="awkward", explanation="The verb does not fit the object naturally."),
    assessment(source_quotes=[]),
    assessment(source_quotes=[{"evidence_id": "e2", "quote": "Built a payment microservice."}]),
    assessment(source_quotes=[{"evidence_id": "e1", "quote": "Architected the payment platform."}]),
])
def test_awkward_or_unsubstantiated_audit_edits_are_not_applied(review) -> None:
    resume, evidence = fixture()
    assert authorize_audit_edit(finding(review), resume, evidence).status == "rejected"


def final_response(resume, evidence, reviews=None) -> ReviewedFinalQa:
    return ReviewedFinalQa(passed=True, provider="openai", model="test",
                           checks=run_deterministic_checks(resume, evidence),
                           meaning_reviews=reviews if reviews is not None else [
                               ClaimReview(target_id=target.target_id, assessment=assessment())
                               for target in review_targets(resume)])


def test_final_meaning_failure_cannot_be_overridden_by_overall_pass_or_deterministic_checks() -> None:
    resume, evidence = fixture()
    result = final_response(resume, evidence)
    result.meaning_reviews[1].assessment.ownership = "uncertain"
    authorized = authorize_meaning_reviews(result, resume, evidence)
    merged = authorize_final_qa_response(authorized, resume=resume, evidence=evidence)
    assert not merged.passed
    check = next(check for check in merged.checks if check.code == FinalQaCheckCode.MEANING_PRESERVATION)
    assert check.status == "fail" and check.blocking
    assert "Experience, bullet 1" in check.detail and "Built a payment microservice." in check.detail


def test_phrasing_is_advisory_and_source_quotations_are_validated() -> None:
    resume, evidence = fixture()
    response = final_response(resume, evidence)
    response.meaning_reviews[0].assessment.naturalness = "awkward"
    authorized = authorize_meaning_reviews(response, resume, evidence)
    assert authorized.passed
    assert next(c for c in authorized.checks if c.code == FinalQaCheckCode.NATURAL_PHRASING).status == "warn"
    response.meaning_reviews[0].assessment.source_quotes = [SourceQuote(evidence_id="e1", quote="Invented quote")]
    assert not authorize_meaning_reviews(response, resume, evidence).passed


@pytest.mark.parametrize("mode", ["missing", "duplicate", "unknown"])
def test_final_qa_requires_complete_current_target_coverage(mode) -> None:
    resume, evidence = fixture()
    response = final_response(resume, evidence)
    if mode == "missing":
        response.meaning_reviews.pop()
    elif mode == "duplicate":
        response.meaning_reviews.append(response.meaning_reviews[0])
    else:
        response.meaning_reviews[0].target_id = "another-version"
    with pytest.raises(ProviderError, match="omitted, duplicated or invented"):
        authorize_meaning_reviews(response, resume, evidence)


def test_review_covers_item_bullets_and_unlinked_prose_is_not_silently_approved() -> None:
    resume, evidence = fixture()
    resume.sections[1].items = [ResumeItem(heading="Harbor", bullets=[
        ResumeBullet(text="Built a payment microservice.", evidence_ids=["e1"])])]
    assert "s1.i0.b0" in [target.target_id for target in review_targets(resume)]
    resume.sections[0] = ResumeSection(type="summary", title="Summary", content="Led a global payment platform.")
    response = final_response(resume, evidence)
    authorized = authorize_meaning_reviews(response, resume, evidence)
    assert not authorized.passed
    assert "Summary" in next(c for c in authorized.checks if c.code == FinalQaCheckCode.MEANING_PRESERVATION).detail


def test_architecture_is_allowed_when_design_of_the_same_service_is_supported() -> None:
    original = "Designed the architecture of a payment microservice."
    resume, evidence = fixture(original)
    resume.sections[1].bullets[0].text = original
    review = assessment(source_quotes=[{"evidence_id": "e1", "quote": original}])
    proposal = finding(review, before_text=original, suggested_text="Architected a payment microservice.")
    accepted, rejected = adjudicate_findings([authorize_audit_edit(proposal, resume, evidence)], evidence)
    assert not rejected and len(accepted) == 1


@pytest.mark.asyncio
async def test_live_audit_cannot_silently_accept_missing_meaning_review() -> None:
    resume, evidence = fixture()
    client = MagicMock()
    client.messages.create = AsyncMock(return_value=SimpleNamespace(
        content=[SimpleNamespace(type="tool_use", name="emit_audit_findings", input={
            "summary": "Incomplete review",
            "findings": [finding(assessment()).model_dump(exclude={"meaning_review"})],
        })]))
    provider = AnthropicProvider(Settings(ai_mode="live", app_mode="demo"), client=client)
    with pytest.raises(ProviderError, match="meaning_review"):
        await provider.audit(lens="hr-1", reviews_version=0, produces_version=1, resume=resume, evidence=evidence)


@pytest.mark.asyncio
async def test_live_final_qa_cannot_accept_old_overall_pass_without_claim_reviews() -> None:
    resume, evidence = fixture()
    old_response = final_response(resume, evidence).model_dump(exclude={"meaning_reviews"})
    client = MagicMock()
    client.beta.chat.completions.parse = AsyncMock(return_value=SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(parsed=old_response))]))
    provider = OpenAIProvider(Settings(ai_mode="live", app_mode="demo"), role="final-review", client=client)
    with pytest.raises(ProviderError, match="meaning_reviews"):
        await provider.final_qa(resume=resume, evidence=evidence)


@pytest.mark.asyncio
@pytest.mark.parametrize("lens", ["hr-1", "em-1", "hr-2", "em-2"])
async def test_live_audit_path_requests_and_enforces_review_in_existing_call(lens) -> None:
    resume, evidence = fixture()
    proposed = finding(assessment(object="unsupported"), suggested_text="Architected a payment microservice.")
    client = MagicMock()
    client.messages.create = AsyncMock(return_value=SimpleNamespace(
        id="test", usage=SimpleNamespace(input_tokens=10, output_tokens=20),
        content=[SimpleNamespace(type="tool_use", name="emit_audit_findings",
                                 input={"summary": "Meaning review", "findings": [proposed.model_dump()]})]))
    provider = AnthropicProvider(Settings(ai_mode="live", app_mode="demo"), client=client)
    result, _, usage = await provider.audit(lens=lens, reviews_version=0, produces_version=1,
                                           resume=resume, evidence=evidence)
    assert not result.findings
    assert "object" in result.rejected_findings[0].rejection_reason
    assert usage.input_tokens == 10 and usage.output_tokens == 20
    client.messages.create.assert_awaited_once()
    assert "same relationship" in client.messages.create.call_args.kwargs["system"]


@pytest.mark.asyncio
@pytest.mark.parametrize("transport", ["parsed", "json"])
async def test_live_final_review_checks_model_output_in_existing_call(transport) -> None:
    resume, evidence = fixture()
    payload = final_response(resume, evidence)
    payload.meaning_reviews[1].assessment.action = "unsupported"
    response = SimpleNamespace(id="final", usage=SimpleNamespace(prompt_tokens=10, completion_tokens=20),
                               choices=[SimpleNamespace(message=SimpleNamespace(
                                   parsed=payload, content=json.dumps(payload.model_dump())))])
    call = AsyncMock(return_value=response)
    if transport == "parsed":
        client = SimpleNamespace(beta=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(parse=call))))
    else:
        client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=call)))
    provider = OpenAIProvider(Settings(ai_mode="live", app_mode="demo"), role="final-review", client=client)
    result, _, usage = await provider.final_qa(resume=resume, evidence=evidence)
    assert not result.passed
    call.assert_awaited_once()
    assert usage.provider == "openai" and usage.output_tokens == 20
    request = json.loads(call.call_args.kwargs["messages"][1]["content"])
    assert [target["target_id"] for target in request["review_targets"]] == ["s0.b0", "s1.b0", "s1.b1"]
    assert "meaning_reviews" not in result.model_dump()  # public response stays compatible


def test_deterministic_audit_also_rejects_responsibility_inflation() -> None:
    _, evidence = fixture("Built a payment microservice.")
    proposal = AuditFinding.model_validate(finding(assessment(), suggested_text="Architected a payment microservice.")
                                          .model_dump(exclude={"meaning_review"}))
    accepted, rejected = adjudicate_findings([proposal], evidence)
    assert not accepted
    assert rejected[0].rejection_reason == "UNSUPPORTED_OWNERSHIP"
