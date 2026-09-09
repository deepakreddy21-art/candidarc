"""Structured résumé parse coverage."""

from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient

from app.domain.schemas import RequestContext
from app.main import app
from tests.conftest import AUTH_HEADERS, qa_context
from tests.fixtures.resume_samples import (
    NO_EMPLOYMENT_RESUME,
    PROFESSIONAL_EXPERIENCE_RESUME,
    WORK_HISTORY_RESUME,
    b64,
    image_only_pdf,
    text_to_docx,
    text_to_simple_pdf,
)


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def auth_headers() -> dict[str, str]:
    return dict(AUTH_HEADERS)


@pytest.fixture()
def ctx() -> RequestContext:
    return qa_context()


def _parse(client: TestClient, headers: dict[str, str], ctx: RequestContext, filename: str, content_type: str, raw: bytes):
    return client.post(
        "/v1/resumes/parse",
        headers=headers,
        json={
            "context": ctx.model_dump(),
            "filename": filename,
            "content_type": content_type,
            "content_base64": b64(raw),
        },
    )


def test_professional_experience_pdf_structures_roles(client: TestClient, auth_headers: dict[str, str], ctx: RequestContext):
    raw = text_to_simple_pdf(PROFESSIONAL_EXPERIENCE_RESUME)
    response = _parse(client, auth_headers, ctx, "resume.pdf", "application/pdf", raw)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body.get("schema_version") == 2
    assert len(body["employment"]) >= 2
    employers = {row.get("employer") for row in body["employment"]}
    assert "Harbor Systems" in employers or any("Harbor" in (e or "") for e in employers)
    assert any(row.get("title") for row in body["employment"])
    assert any(row.get("bullets") for row in body["employment"])
    assert any(row.get("is_current") for row in body["employment"])
    assert any("TypeScript" in s or "Kubernetes" in s for s in body["skills"])
    assert body["education"]
    assert body["contact"]["email"]
    assert body["contact"].get("first_name") or body["contact"].get("full_name")
    # Do not attach global skills onto every employer.
    for job in body["employment"]:
        assert set(job.get("technologies") or []).issubset(
            {t for t in (job.get("technologies") or [])} | set()
        )
        for tech in job.get("technologies") or []:
            assert any(tech.lower() in (b or "").lower() for b in (job.get("bullets") or []))
    assert body["usable"] is True


def test_legacy_doc_unsupported(client: TestClient, auth_headers: dict[str, str], ctx: RequestContext):
    response = _parse(
        client,
        auth_headers,
        ctx,
        "resume.doc",
        "application/msword",
        b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 32,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "LEGACY_DOC_UNSUPPORTED"
    assert "docx" in response.json()["detail"]["message"].lower()


def test_rich_resume_publications_and_certs(client: TestClient, auth_headers: dict[str, str], ctx: RequestContext):
    rich = """Maria Elena Vasquez-Smith
maria.vasquez@example.com | (555) 010-9988 | Austin, TX

PROFESSIONAL SUMMARY
Platform engineer focused on reliable data systems.

PROFESSIONAL EXPERIENCE
Staff Engineer | Riverbend Analytics | Austin, TX
Mar 2022 - Present
- Led migration of batch pipelines to Apache Spark on AWS

PROJECTS
Campus Lab Scheduler
- Built a Next.js scheduling board
- Stack: TypeScript, PostgreSQL

EDUCATION
M.S. Computer Science | Hillcrest Institute | 2018 | GPA: 3.8

SKILLS
Languages: TypeScript, Python, SQL

CERTIFICATIONS
AWS Solutions Architect Associate | Amazon | 2021

PUBLICATIONS
Vasquez-Smith, M. Reliable Batch Pipelines. Journal of Systems Practice (2022). doi:10.1000/josp.2022.001
"""
    response = _parse(client, auth_headers, ctx, "rich.txt", "text/plain", rich.encode("utf-8"))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["schema_version"] == 2
    assert body["professional_summary"]
    assert body["publications"]
    assert body["certification_entries"]
    assert body["contact"]["full_name"]
    assert "TypeScript" in body["skills"] or any("TypeScript" in g.get("skills", []) for g in body.get("skill_groups", []))



def test_work_history_heading(client: TestClient, auth_headers: dict[str, str], ctx: RequestContext):
    raw = text_to_simple_pdf(WORK_HISTORY_RESUME)
    response = _parse(client, auth_headers, ctx, "resume.pdf", "application/pdf", raw)
    assert response.status_code == 200
    assert len(response.json()["employment"]) >= 2


def test_docx_same_content(client: TestClient, auth_headers: dict[str, str], ctx: RequestContext):
    raw = text_to_docx(PROFESSIONAL_EXPERIENCE_RESUME)
    response = _parse(
        client,
        auth_headers,
        ctx,
        "resume.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        raw,
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["employment"]) >= 2
    assert body["skills"]


def test_image_only_pdf_explicit_code(client: TestClient, auth_headers: dict[str, str], ctx: RequestContext):
    response = _parse(client, auth_headers, ctx, "scan.pdf", "application/pdf", image_only_pdf())
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "IMAGE_ONLY_PDF_OCR_REQUIRED"


def test_corrupt_pdf(client: TestClient, auth_headers: dict[str, str], ctx: RequestContext):
    response = _parse(client, auth_headers, ctx, "bad.pdf", "application/pdf", b"not-a-pdf")
    assert response.status_code == 422
    assert response.json()["detail"]["code"] in {"INVALID_PDF_MAGIC", "CORRUPT_PDF"}


def test_no_employment_still_usable(client: TestClient, auth_headers: dict[str, str], ctx: RequestContext):
    response = _parse(client, auth_headers, ctx, "student.txt", "text/plain", NO_EMPLOYMENT_RESUME.encode("utf-8"))
    assert response.status_code == 200
    body = response.json()
    assert body["employment"] == []
    assert body["projects"] or body["education"]
    assert body["skills"]
    assert body["usable"] is True


def test_document_too_large(client: TestClient, auth_headers: dict[str, str], ctx: RequestContext):
    huge = base64.b64encode(b"%PDF" + b"0" * (10 * 1024 * 1024 + 10)).decode("ascii")
    response = client.post(
        "/v1/resumes/parse",
        headers=auth_headers,
        json={
            "context": ctx.model_dump(),
            "filename": "huge.pdf",
            "content_type": "application/pdf",
            "content_base64": huge,
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "DOCUMENT_TOO_LARGE"


def test_encrypted_pdf(client: TestClient, auth_headers: dict[str, str], ctx: RequestContext):
    from tests.fixtures.resume_samples import encrypted_pdf

    response = _parse(client, auth_headers, ctx, "locked.pdf", "application/pdf", encrypted_pdf())
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "PDF_ENCRYPTED"


def test_empty_pdf(client: TestClient, auth_headers: dict[str, str], ctx: RequestContext):
    from tests.fixtures.resume_samples import empty_pdf

    response = _parse(client, auth_headers, ctx, "empty.pdf", "application/pdf", empty_pdf())
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "IMAGE_ONLY_PDF_OCR_REQUIRED"


def test_two_column_pdf_extracts_employment(
    client: TestClient, auth_headers: dict[str, str], ctx: RequestContext
):
    from tests.fixtures.resume_samples import two_column_text_pdf

    pdf_bytes = two_column_text_pdf()
    # Genuine positioning: distinct X coordinates present in the content stream.
    assert b"50 " in pdf_bytes and b"320 " in pdf_bytes
    assert b"Td" in pdf_bytes or b"Tm" in pdf_bytes

    response = _parse(client, auth_headers, ctx, "two-col.pdf", "application/pdf", pdf_bytes)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["usable"] is True
    assert body.get("employment"), "must not report empty-success"
    assert len(body["employment"]) >= 2
    harbor = next(row for row in body["employment"] if "Harbor" in (row.get("employer") or ""))
    northwind = next(row for row in body["employment"] if "Northwind" in (row.get("employer") or ""))
    assert "Platform" in (harbor.get("title") or "")
    assert "Software" in (northwind.get("title") or "")
    # Employer/title must not be swapped across columns.
    assert "Harbor" not in (northwind.get("title") or "")
    assert "Northwind" not in (harbor.get("title") or "")
    assert harbor.get("start_date") and "2021" in (harbor.get("start_date") or "")
    assert northwind.get("start_date") and "2018" in (northwind.get("start_date") or "")
    assert body["skills"]
    assert body["education"]
    assert any("Cascadia" in (row.get("institution") or "") or "Cascadia" in (row.get("degree") or "") for row in body["education"])
    assert body["text"].strip()
