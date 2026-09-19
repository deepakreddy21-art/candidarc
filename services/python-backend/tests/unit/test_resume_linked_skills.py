"""Real document regressions for hyperlink targets and wrapped skill categories."""

from __future__ import annotations

import base64

import pytest

from app.modules.parsing.links import safe_link
from app.modules.parsing.service import parse_resume_bytes_sync
from app.modules.parsing.structure import structure_resume_text
from tests.fixtures.linked_resume import linked_resume_bytes


@pytest.mark.parametrize("fmt", ["pdf", "docx"])
def test_linked_supply_chain_resume_keeps_records_groups_and_issuers(fmt: str):
    result = parse_resume_bytes_sync(f"linked.{fmt}", "application/pdf" if fmt == "pdf" else
                                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                                    base64.b64encode(linked_resume_bytes(fmt)).decode())
    assert result.contact.full_name == "Casey Morgan"
    assert result.contact.linkedin == "linkedin.com/in/casey-example"
    assert result.contact.portfolio == "https://casey.example.com"
    assert result.contact.github is None
    assert len(result.employment) == 2
    assert [(row.employer, row.title, row.location, row.start_date, row.end_date) for row in result.employment] == [
        ("Harbor Logistics", "Senior Supply Chain Analyst", "Bensenville, Illinois", "May 2024", "Present"),
        ("Market Labs", "Supply Chain Analyst", "Hyderabad, India", "May 2020", "Dec 2022"),
    ]
    assert [len(row.bullets) for row in result.employment] == [2, 2]
    assert not any("ambiguous_title" in value for value in result.missing_fields)
    assert len(result.education) == 1
    school = result.education[0]
    assert (school.institution, school.degree, school.field, school.location) == (
        "Lakeside Institute of Technology", "Master's", "Industrial Technology and Operations", "Chicago, IL",
    )
    assert school.start_date is school.end_date is None
    groups = {row.category: row.skills for row in result.skill_groups}
    assert groups["Forecasting & Planning"] == ["demand planning", "safety stock modeling", "inventory optimization"]
    assert groups["Data & Analysis"] == ["Excel (advanced formulas, pivot tables, Power Query, VLOOKUP)", "SQL", "KPI dashboards", "inventory turnover tracking"]
    assert groups["Process & Soft Skills"] == ["stakeholder communication", "continuous improvement", "process automation"]
    assert len(result.skills) == 13
    assert [(row.name, row.issuer) for row in result.certification_entries] == [
        ("Certified Supply Chain Professional", "ASCM"),
        ("Certified Professional in Supply Management", "ISM (Institute for Supply Management)"),
    ]
    assert result.projects == result.publications == []


def test_skills_preserve_compounds_parentheses_and_separate_uncategorized_lines():
    result = structure_resume_text("Casey Morgan\nSKILLS\nCI/CD, TCP/IP, C/C++, AWS (Lambda, S3)\nPython\nSQL")
    assert result["skills"] == ["CI/CD", "TCP/IP", "C/C++", "AWS (Lambda, S3)", "Python", "SQL"]


@pytest.mark.parametrize("value", ["javascript:alert(1)", "file:///tmp/example", "https://user:pass@example.com", "https://bad.example/\nhello", "data:text/plain,test"])
def test_document_link_targets_are_data_not_executable_actions(value: str):
    assert safe_link(value) is None


def test_project_and_credential_urls_do_not_become_candidate_portfolios():
    result = structure_resume_text(
        "Casey Morgan\ncasey@example.com\nPROJECTS\nAtlas Scheduler\n- Built scheduling software.\n"
        "https://github.com/team/atlas\nCERTIFICATIONS\nExample Credential https://verify.example.com/123"
    )
    assert result["contact"]["portfolio"] is result["contact"]["github"] is None
    assert result["projects"][0]["repo_url"] == "https://github.com/team/atlas"
    assert result["certification_entries"][0]["credential_url"] == "https://verify.example.com/123"


def test_linked_entity_names_remain_clean_and_project_links_keep_their_owner():
    result = structure_resume_text(
        "Casey Morgan\ncasey@example.com\nWORK EXPERIENCE\n"
        "Software Engineer | Harbor Systems (https://harbor.example.com) | 2020 - Present\n- Built APIs.\n"
        "EDUCATION\nLakeside University (https://university.example.com)\nB.S. in Computer Science\n"
        "PROJECTS\nAtlas Scheduler (https://atlas.example.com)\n- Built a scheduler.\n"
        "GitHub (https://github.com/team/atlas)\nCERTIFICATIONS\n"
        "ASCM: Certified Supply Chain Professional (https://verify.example.com/123)"
    )
    assert result["employment"][0]["employer"] == "Harbor Systems"
    assert result["education"][0]["institution"] == "Lakeside University"
    assert len(result["projects"]) == 1
    assert result["projects"][0]["name"] == "Atlas Scheduler"
    assert result["projects"][0]["url"] == "https://atlas.example.com"
    assert result["projects"][0]["repo_url"] == "https://github.com/team/atlas"
    assert result["certification_entries"][0]["name"] == "Certified Supply Chain Professional"
    assert result["certification_entries"][0]["credential_url"] == "https://verify.example.com/123"
    assert result["contact"]["portfolio"] is result["contact"]["github"] is None


@pytest.mark.parametrize("phone,review", [("+1 170 855 501 01", True), ("+1 708 555 0101", False), ("+49 30 1234567", False)])
def test_suspicious_phone_is_preserved_and_marked_for_review(phone: str, review: bool):
    result = structure_resume_text(f"Casey Morgan\ncasey@example.com | {phone}\nSKILLS\nPython")
    assert result["contact"]["phone"] == phone
    assert ("contact.phone_needs_review" in result["missing_fields"]) is review


def test_uncertain_line_end_hyphenation_is_flagged_without_changing_source_spelling():
    result = structure_resume_text(
        "Casey Morgan\nWORK EXPERIENCE\nAnalyst | Harbor Logistics\n2020 - Present\n"
        "- Negotiated purchase price reduc-\ntions with suppliers."
    )
    assert result["employment"][0]["bullets"] == ["Negotiated purchase price reduc- tions with suppliers."]
    assert "employment[0].line_break_hyphenation" in result["missing_fields"]
