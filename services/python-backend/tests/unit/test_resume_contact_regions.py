"""Contact identity and layout failures must not silently become trusted facts."""

from __future__ import annotations

import base64

import pytest

from app.modules.parsing.fields import is_location
from app.modules.parsing.service import parse_resume_bytes_sync
from app.modules.parsing.structure import structure_resume_text
from tests.fixtures.sidebar_resume import JOBS, SUMMARY, sidebar_resume_bytes


@pytest.mark.parametrize("fmt", ["pdf", "docx"])
@pytest.mark.parametrize("contact_on_right", [False, True])
@pytest.mark.parametrize("labelled_summary", [False, True])
def test_sidebar_header_keeps_identity_summary_and_all_records(fmt: str, contact_on_right: bool, labelled_summary: bool):
    result = parse_resume_bytes_sync(
        f"sidebar.{fmt}", "application/pdf" if fmt == "pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        base64.b64encode(sidebar_resume_bytes(fmt, contact_on_right=contact_on_right, labelled_summary=labelled_summary)).decode(),
    )
    assert result.contact.full_name == "Avery Ramos"
    assert result.contact.location == "Chicago, IL"
    assert result.contact.email == "avery.ramos@example.com"
    assert result.contact.phone == "+1 312 555 0199"
    assert result.contact.linkedin == "linkedin.com/in/avery-ramos-example"
    assert result.contact.github is result.contact.portfolio is None
    assert result.professional_summary == "\n".join(SUMMARY)
    assert [(job.title, job.employer, job.location, job.start_date, job.end_date) for job in result.employment] == [
        ("Senior Supply Chain Analyst", "Cedar Freight", "Evanston, IL", "Apr 2024", "Present"),
        ("Supply Chain Analyst", "Harbor Retail", "Chennai, India", "Jun 2020", "Nov 2022"),
    ]
    assert [len(job.bullets) for job in result.employment] == [6, 5]
    for job, (_, employer, _, count) in zip(result.employment, JOBS):
        assert job.bullets == [f"Coordinated {employer.split(' - ')[0]} shipment workflow {i + 1}." for i in range(count)]
    assert len(result.education) == 1
    edu = result.education[0]
    assert (edu.institution, edu.degree, edu.field, edu.location, edu.start_date, edu.end_date) == (
        "Cascadia Institute of Technology", "Master's", "Industrial Engineering and Operations", "Chicago, IL", "Jan 2023", "Dec 2024",
    )
    assert len(result.certification_entries) == 2
    assert not result.projects and not result.publications
    assert not result.missing_fields


@pytest.mark.parametrize("name", ["Élodie O’Neill", "José García", "李 明", "Núria de la Cruz", "Sukarno"])
def test_unicode_and_mononym_contacts_are_not_replaced_by_prose(name: str):
    result = structure_resume_text(f"{name}\ncontact@example.com | +44 20 7946 0958\nZürich, Switzerland\nSKILLS\nSQL")
    assert result["contact"]["full_name"] == name
    assert result["contact"]["location"] == "Zürich, Switzerland"


@pytest.mark.parametrize("heading", ["Contact", "Contact Information", "Résumé", "Curriculum Vitae"])
def test_contact_labels_are_not_names_and_explicit_identity_labels_are_recognized(heading: str):
    result = structure_resume_text(
        f"{heading}\nFull name: Avery Ramos\ncontact@example.com | +44 20 7946 0958\nCurrent location: London, UK\nSKILLS\nSQL"
    )
    assert result["contact"]["full_name"] == "Avery Ramos"
    assert result["contact"]["location"] == "London, UK"


@pytest.mark.parametrize("sentence", [
    "procurement, inventory planning, and supplier performance across domestic",
    "inventory planning, procurement",
    "Professional with experience in logistics",
    "Worked across domestic operations",
])
def test_missing_identity_is_reviewable_not_filled_with_body_text(sentence: str):
    result = structure_resume_text(f"{sentence}\ncontact@example.com\nSKILLS\nSQL\nPROJECTS\nInventory Planner\n- Created an inventory report.")
    contact = result["contact"]
    assert contact["full_name"] is None
    assert contact["location"] is None
    assert contact["provenance"]["confidence"] != "high"
    assert {"contact.missing_full_name", "contact.missing_phone", "contact.missing_location"} <= set(result["missing_fields"])
    assert result["extraction_quality"] != "high"
    assert not is_location(sentence)


@pytest.mark.parametrize("gap", ["  ", " " * 250, "\t\t"])
def test_visual_padding_does_not_swallow_second_job_or_split_wrapped_qualification(gap: str):
    result = structure_resume_text(
        f"Avery Ramos\nWORK EXPERIENCE\nSenior Analyst{gap}Cedar Freight{gap}2024 - Present\n- Reviewed Cedar records.\n"
        f"Analyst{gap}Harbor Retail{gap}2020 - 2022\n- Reviewed Harbor records.\nEDUCATION\n"
        f"Master's{gap}in Industrial Engineering{gap}Cascadia Institute of Technology{gap}2023 - 2024\n"
        f"and Operations{gap}Chicago, IL\n"
        "Bachelor of Science | Mathematics | Lakeside University | 2018 - 2022"
    )
    assert [job["employer"] for job in result["employment"]] == ["Cedar Freight", "Harbor Retail"]
    assert [len(job["bullets"]) for job in result["employment"]] == [1, 1]
    assert len(result["education"]) == 2
    first, second = result["education"]
    assert first["field"] == "Industrial Engineering and Operations"
    assert first["location"] == "Chicago, IL"
    assert second["institution"] == "Lakeside University"


def test_wrapped_parenthetical_skill_detail_stays_attached_and_category_has_no_bullet():
    result = structure_resume_text(
        "Avery Ramos\nTechnical Skills\n- Systems & Analytics: SQL, advanced Excel\n"
        "(Power Query, pivot tables, VLOOKUP), ERP integrations\n- Planning: Demand planning, forecasting"
    )
    assert result["skill_groups"] == [
        {"category": "Systems & Analytics", "skills": ["SQL", "advanced Excel (Power Query, pivot tables, VLOOKUP)", "ERP integrations"]},
        {"category": "Planning", "skills": ["Demand planning", "forecasting"]},
    ]
    assert len(result["skills"]) == 5
