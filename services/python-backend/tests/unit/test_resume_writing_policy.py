import pytest

from app.domain.schemas import EvidenceItem, ResumeBullet, ResumeSection
from app.modules.generation.service import apply_visible_refinement, generate_grounded_resume
from app.modules.guardrails.service import build_grounded_resume, validate_resume_claims
from app.prompts.registry import AUDIT_PROMPTS, FINAL_QA, RESUME_GENERATION
from app.prompts.writing_policy import precise_action_opening


def source(evidence_id: str, action: str) -> EvidenceItem:
    return EvidenceItem(id=evidence_id, tenant_id="t1", owner_user_id="u1", title="Delivery",
                        actions=[action], claim_text=action, verification_status="user_attested",
                        candidate_confirmation_status="confirmed", confidence="high")


def test_all_provider_paths_receive_the_shared_policy() -> None:
    for prompt in [RESUME_GENERATION, FINAL_QA, *AUDIT_PROMPTS.values()]:
        assert "writing-r1" in prompt.prompt_version
        assert "Prefer context-specific verbs over Built, Developed" in prompt.system
        assert "never invent percentages" in prompt.system
        assert "selected-text edit scope" in prompt.system
        assert "advisory" in prompt.system


@pytest.mark.parametrize("verb", ["Spearheaded", "Led", "Owned", "Architected"])
def test_stronger_verbs_cannot_inflate_assistance_into_responsibility(verb: str) -> None:
    evidence = [source("e1", "Supported reporting delivery")]
    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=evidence, notes="writing")
    section = next(section for section in resume.sections if section.type == "experience")
    section.items = None
    section.bullets = [ResumeBullet(text=f"{verb} reporting delivery", evidence_ids=["e1"])]
    assert "UNSUPPORTED_OWNERSHIP" in validate_resume_claims(resume, evidence, [])


def test_leadership_elsewhere_does_not_authorize_an_uncited_role() -> None:
    evidence = [
        source("e1", "Supported reporting delivery"),
        source("e2", "Led billing delivery"),
    ]
    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=evidence, notes="writing")
    section = next(section for section in resume.sections if section.type == "experience")
    section.items = None
    section.bullets = [ResumeBullet(text="Spearheaded reporting delivery", evidence_ids=["e1"])]
    assert "UNSUPPORTED_OWNERSHIP" in validate_resume_claims(resume, evidence, [])
    section.bullets = [ResumeBullet(text="Spearheaded billing delivery", evidence_ids=["e2"])]
    assert "UNSUPPORTED_OWNERSHIP" not in validate_resume_claims(resume, evidence, [])


@pytest.mark.parametrize(("action", "claim", "expected"), [
    ("Built 5 microservices for payments", "Built five microservices for payments", set()),
    ("Built 5 microservices for payments", "Architected five microservices for payments", {"UNSUPPORTED_OWNERSHIP"}),
    ("Designed 5 microservices for payments", "Architected five microservices for payments", set()),
])
def test_number_paraphrases_keep_responsibility_checks(action: str, claim: str, expected: set[str]) -> None:
    evidence = [source("e1", action)]
    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=evidence, notes="writing")
    resume.sections = [ResumeSection(type="experience", title="Experience", order=0,
                                    bullets=[ResumeBullet(text=claim, evidence_ids=["e1"])])]
    assert set(validate_resume_claims(resume, evidence, [])) == expected


@pytest.mark.parametrize(("original", "expected"), [
    ("Built APIs for 3 departments.", "Implemented APIs for 3 departments."),
    ("Developed documentation for analysts.", "Authored documentation for analysts."),
    ("Create runbooks for support.", "Author runbooks for support."),
    ("Helped with quarterly reporting.", "Supported quarterly reporting."),
    ("Built trust with patients.", "Built trust with patients."),
    ("Developed an interest in finance.", "Developed an interest in finance."),
    ("Supported delivery.", "Supported delivery."),
])
def test_local_verb_edits_preserve_meaning_tense_and_scope(original: str, expected: str) -> None:
    assert precise_action_opening(original) == expected


def test_selected_refinement_preserves_prior_edits_and_other_bullets() -> None:
    selected = "Built APIs for 3 departments."
    untouched = "Developed documentation for analysts."
    evidence = [source("e1", selected), source("e2", untouched)]
    resume = build_grounded_resume(absolute_version=4, cycle_step=4, evidence=evidence, notes="writing")
    resume.sections = [ResumeSection(type="experience", title="Reviewed experience", order=0, bullets=[
        ResumeBullet(text=selected, evidence_ids=["e1"]),
        ResumeBullet(text=untouched, evidence_ids=["e2"]),
    ])]
    instruction = (
        "Improve only this selected text (do not rewrite the rest of the resume unless required for grammar). "
        f"Selected text:\n{selected}\n\nInstruction: Use more precise action verbs"
    )
    updated = generate_grounded_resume(absolute_version=5, cycle_step=0, evidence=evidence,
                                      previous_resume=resume, refinement_instruction=instruction)
    assert len(updated.sections) == 1
    assert updated.sections[0].title == "Reviewed experience"
    bullets = updated.sections[0].bullets
    assert bullets is not None
    assert [bullet.text for bullet in bullets] == ["Implemented APIs for 3 departments.", untouched]
    assert [bullet.evidence_ids for bullet in bullets] == [["e1"], ["e2"]]
    assert resume.sections[0].bullets is not None
    assert resume.sections[0].bullets[0].text == selected


def test_concise_does_not_truncate_parenthetical_scope_or_late_metrics() -> None:
    original = (
        "Documented reporting procedures (for 3 departments) in order to support onboarding. "
        + "Reviewed reconciliation practices with analysts and recorded exceptions. " * 4
        + "Reduced duplicated work by 25%."
    )
    evidence = [source("e1", original)]
    resume = build_grounded_resume(absolute_version=4, cycle_step=4, evidence=evidence, notes="writing")
    resume.sections = [ResumeSection(type="experience", title="Experience", order=0,
                                    bullets=[ResumeBullet(text=original, evidence_ids=["e1"])])]
    updated = apply_visible_refinement(resume, "Make it more concise", evidence)
    assert updated.sections[0].bullets is not None
    text = updated.sections[0].bullets[0].text
    assert "(for 3 departments)" in text
    assert text.endswith("Reduced duplicated work by 25%.")
    assert "in order to" not in text
