"""Regression coverage for finance, academic and multi-record résumé layouts."""

from __future__ import annotations

import base64

import pytest

from app.modules.parsing.service import parse_resume_bytes_sync
from app.modules.parsing.structure import structure_resume_text
from tests.fixtures.finance_resume import finance_resume_bytes


@pytest.mark.parametrize("fmt", ["pdf", "docx"])
def test_compound_jobs_and_finance_degrees_from_real_documents(fmt: str):
    result = parse_resume_bytes_sync(
        f"finance.{fmt}", "application/pdf" if fmt == "pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        base64.b64encode(finance_resume_bytes(fmt)).decode(),
    )
    assert [(job.title, job.employer, job.location, job.start_date, job.end_date) for job in result.employment] == [
        ("Operations / Financial Analyst (Contract)", "Cedar Instruments", "Chicago, IL", "Apr 2024", "Present"),
        ("Strategic Financial Analyst Intern", "Fairway Markets", "Chicago, IL", "Jun 2023", "Dec 2023"),
        ("Executive – Finance & Operations", "Aster Aviation (Regional Air)", "Hyderabad, India", "Aug 2018", "Nov 2022"),
    ]
    assert [len(job.bullets) for job in result.employment] == [7, 4, 5]
    for job, employer in zip(result.employment, ["Cedar", "Fairway", "Aster"], strict=True):
        assert all(employer in bullet for bullet in job.bullets)
        assert not job.provenance.warnings
    assert "Financial Modeling & Forecasting" not in " ".join(result.employment[0].bullets)
    assert "Financial Modeling & Forecasting" in result.employment[0].provenance.source_text
    assert [(edu.institution, edu.degree, edu.field, edu.location, edu.start_date, edu.end_date) for edu in result.education] == [
        ("Eastlake University", "Master of Science", "Finance", "Naperville, IL", "Sep 2022", "May 2024"),
        ("Marina College", "Bachelor of Commerce", None, "Chennai, India", "Jun 2015", "Apr 2018"),
    ]
    assert "Thesis: Budget planning" in result.education[0].provenance.source_text
    assert len(result.projects) == 3
    assert result.projects[0].name == "Budget Scenario Planner"
    assert all(project.role is None and project.organization is None for project in result.projects)
    assert len(result.skill_groups) == 6
    assert len(result.skills) == 17
    assert "Excel (Pivot Tables, Power Query, XLOOKUP)" in result.skills
    assert "Financial Planning" not in result.skills


@pytest.mark.parametrize("title", [
    "Operations / Financial Analyst (Contract)", "Strategic Financial Analyst Intern",
    "Executive – Finance & Operations", "Senior Supply Chain Analyst", "Graduate Research Assistant",
    "Machine Learning Engineer Intern", "Commercial Planning Manager (Part-time)",
])
@pytest.mark.parametrize("order", ["title_first", "employer_first", "separate_lines"])
def test_independent_cells_preserve_whole_title_with_unseen_employers(title: str, order: str):
    cells = [title, "Astervale Partners"]
    if order == "employer_first":
        cells.reverse()
    header = ("\n" if order == "separate_lines" else " | ").join(cells)
    result = structure_resume_text(f"Casey Morgan\nWORK HISTORY\n{header}\nZürich, Switzerland\n2021 – 2024\n- Built reports.")
    assert len(result["employment"]) == 1
    job = result["employment"][0]
    assert (job["title"], job["employer"], job["location"]) == (title, "Astervale Partners", "Zürich, Switzerland")


def test_empty_job_does_not_borrow_next_jobs_identity_dates_or_bullets():
    result = structure_resume_text(
        "Casey Morgan\nWORK EXPERIENCE\nMachine Learning Engineer | Aster Labs | Remote\nMay 2025 – Present\n"
        "Applied Scientist Intern | Harbor Research | Chicago, IL\nJun 2023 – Sep 2023\n- Built Harbor models."
    )
    one, two = result["employment"]
    assert (one["employer"], one["start_date"], one["bullets"]) == ("Aster Labs", "May 2025", [])
    assert (two["employer"], two["end_date"], two["bullets"]) == ("Harbor Research", "Sep 2023", ["Built Harbor models."])


def test_capitalized_bullet_continuation_is_not_discarded_as_subheading():
    result = structure_resume_text(
        "Casey Morgan\nWORK EXPERIENCE\nEngineer | Aster Labs | Remote\n2023 – Present\n"
        "- Built reports using\nSQL and Python\n- Maintained dashboards."
    )
    assert result["employment"][0]["bullets"] == ["Built reports using SQL and Python", "Maintained dashboards."]


def test_ambiguous_dated_record_is_separate_and_flagged_not_merged_into_previous_job():
    result = structure_resume_text(
        "Casey Morgan\nWORK EXPERIENCE\nEngineer | Aster Labs | Remote\n2023 – Present\n- Built Aster models.\n"
        "Orbital Wrangler | Meridian Labs | Remote\n2020 – 2022\n- Operated Meridian systems."
    )
    one, two = result["employment"]
    assert one["bullets"] == ["Built Aster models."]
    assert two["bullets"] == ["Operated Meridian systems."]
    assert two["provenance"]["confidence"] == "low"
    assert "Orbital Wrangler" in two["provenance"]["source_text"]


@pytest.mark.parametrize("degree", ["Ph.D.", "M.S.", "B.S."])
def test_academic_degrees_and_descriptions_do_not_become_extra_institutions(degree: str):
    result = structure_resume_text(
        f"Casey Morgan\nEDUCATION\n{degree}in Computer Engineering | Aster University – NJ, USA\n2020 – 2024\n"
        "Dissertation: Reliable Computing Systems\n- Research focused on fault tolerance.\n"
        "M.S. Statistics | Harbor University – Chicago, IL\n2018 – 2020\nThesis: Forecasting Methods"
    )
    first, second = result["education"]
    assert (first["institution"], first["degree"], first["field"], first["location"]) == (
        "Aster University", degree, "Computer Engineering", "NJ, USA",
    )
    assert second["institution"] == "Harbor University"
    assert second["location"] == "Chicago, IL"


def test_employer_department_dash_location_and_intern_suffix_are_separated():
    result = structure_resume_text(
        "Casey Morgan\nWORK EXPERIENCE\nApplied Scientist Intern    Aster, Research & Development – CA, USA    2023 – 2024\n"
        "- Built Aster models.\nMachine Learning Engineer Intern Meridian Labs, Hyderabad, India\n2021 – 2022\n- Built Meridian models."
    )
    first, second = result["employment"]
    assert (first["title"], first["employer"], first["location"]) == ("Applied Scientist Intern", "Aster, Research & Development", "CA, USA")
    assert (second["title"], second["employer"], second["location"]) == ("Machine Learning Engineer Intern", "Meridian Labs", "Hyderabad, India")


def test_flat_skills_stay_flat_and_table_continuations_preserve_compound_names():
    result = structure_resume_text("Casey Morgan\nSKILLS\nPython | SQL, Java")
    assert result["skills"] == ["Python", "SQL", "Java"]
    assert result["skill_groups"] == []
    result = structure_resume_text(
        "Casey Morgan\nC O R E   C O M P E T E N C I E S\n"
        "Systems & Tools     Excel (Pivot Tables, Power Query), SQL, SAP\nFICO, Oracle Hyperion\n"
        "Financial Planning    FP&A, Corporate Finance &\nValuation\n"
        "Featured Publications\nModeling inventory. Example Journal, 2024"
    )
    assert result["skills"] == ["Excel (Pivot Tables, Power Query)", "SQL", "SAP FICO", "Oracle Hyperion", "FP&A", "Corporate Finance & Valuation"]
    assert len(result["publications"]) == 1
