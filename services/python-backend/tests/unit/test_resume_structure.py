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
    assert len(body["employment"]) >= 2
    employers = {row.get("employer") for row in body["employment"]}
    assert "Harbor Systems" in employers or any("Harbor" in (e or "") for e in employers)
    assert any(row.get("title") for row in body["employment"])
    assert any(row.get("bullets") for row in body["employment"])
    assert any("TypeScript" in s or "Kubernetes" in s for s in body["skills"])
    assert body["education"]
    assert body["contact"]["email"]
    assert body["usable"] is True


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
