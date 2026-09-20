"""The optional publication section carries evidence, not invented citations."""
from app.domain.schemas import EvidenceItem, ResumeBullet, ResumeItem, ResumeSection
from app.modules.guardrails.service import build_grounded_resume, validate_resume_claims


def publication(source_type: str = "publication") -> EvidenceItem:
    return EvidenceItem(
        id="pub-1", tenant_id="tenant-1", owner_user_id="user-1",
        title="Practical Data Validation", organization="Engineering Review",
        claim_text="Jordan Lee. Practical Data Validation. Engineering Review. 2024.",
        source_type=source_type, verification_status="user_attested",
        candidate_confirmation_status="confirmed", confidence="high",
    )


def test_optional_publication_survives_grounded_generation() -> None:
    item = publication()
    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=[item], notes="template")
    section = next(section for section in resume.sections if section.type == "publications")
    assert section.bullets and section.bullets[0].evidence_ids == [item.id]
    assert "Practical Data Validation" in section.bullets[0].text
    assert "UNSUPPORTED_PUBLICATION" not in validate_resume_claims(resume, [item], [])


def test_publication_requires_publication_evidence_and_grounded_title() -> None:
    item = publication()
    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=[item], notes="template")
    resume.sections = [ResumeSection(type="publications", title="Publications", order=0, items=[
        ResumeItem(heading="Practical Data Validation", subheading="Engineering Review", dates="2024", bullets=[
            ResumeBullet(text=item.claim_text or "", evidence_ids=[item.id]),
        ]),
    ])]
    assert "UNSUPPORTED_PUBLICATION" not in validate_resume_claims(resume, [item], [])
    assert "UNSUPPORTED_PUBLICATION" in validate_resume_claims(resume, [publication("employment")], [])
    assert resume.sections[0].items
    resume.sections[0].items[0].heading = "Imaginary Quantum Medicine"
    assert "UNSUPPORTED_PUBLICATION" in validate_resume_claims(resume, [item], [])


def test_no_publications_section_without_evidence() -> None:
    resume = build_grounded_resume(absolute_version=0, cycle_step=0, evidence=[publication("employment")], notes="template")
    assert all(section.type != "publications" for section in resume.sections)
