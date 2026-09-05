"""Document and job parsing with strict safety limits."""

from __future__ import annotations

import asyncio
import base64
import io
import re
import zipfile
from typing import Any

from app.domain.schemas import JobParseResponse, ResumeParseResponse
from app.modules.guardrails.service import INJECTION_MARKERS, KNOWN_TECH_HINTS

MAX_RESUME_BYTES = 5 * 1024 * 1024
MAX_PDF_PAGES = 30
MAX_DOCX_UNCOMPRESSED = 20 * 1024 * 1024
PARSE_TIMEOUT_SECONDS = 15.0

PDF_MAGIC = b"%PDF"
DOCX_MAGIC = b"PK"


def _decode_base64_strict(content_base64: str) -> bytes:
    try:
        # validate=True rejects non-alphabet characters
        raw = base64.b64decode(content_base64, validate=True)
    except Exception as exc:
        raise ValueError("INVALID_BASE64") from exc
    if len(raw) > MAX_RESUME_BYTES:
        raise ValueError("DOCUMENT_TOO_LARGE")
    if not raw:
        raise ValueError("EMPTY_DOCUMENT")
    return raw


def _parse_pdf(raw: bytes) -> ResumeParseResponse:
    from pypdf import PdfReader

    if not raw.startswith(PDF_MAGIC):
        raise ValueError("INVALID_PDF_MAGIC")
    reader = PdfReader(io.BytesIO(raw))
    page_count = len(reader.pages)
    if page_count > MAX_PDF_PAGES:
        raise ValueError("PDF_PAGE_LIMIT_EXCEEDED")
    pages = [page.extract_text() or "" for page in reader.pages]
    text = "\n".join(pages).strip()
    warnings: list[str] = []
    if not text:
        warnings.append("PDF_TEXT_LAYER_EMPTY")
        warnings.append("IMAGE_ONLY_PDF_NO_OCR")
    return ResumeParseResponse(text=text, page_count=page_count, warnings=warnings)


def _parse_docx(raw: bytes) -> ResumeParseResponse:
    if not raw.startswith(DOCX_MAGIC):
        raise ValueError("INVALID_DOCX_MAGIC")
    # Zip-bomb protection: inspect uncompressed sizes before full extract
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        total_uncompressed = sum(info.file_size for info in zf.infolist())
        if total_uncompressed > MAX_DOCX_UNCOMPRESSED:
            raise ValueError("DOCX_ZIP_BOMB_SUSPECTED")
        for info in zf.infolist():
            if info.file_size > MAX_DOCX_UNCOMPRESSED:
                raise ValueError("DOCX_ZIP_BOMB_SUSPECTED")

    from docx import Document

    document = Document(io.BytesIO(raw))
    text = "\n".join(p.text for p in document.paragraphs if p.text.strip()).strip()
    return ResumeParseResponse(text=text, page_count=None, warnings=[])


def _parse_txt(raw: bytes) -> ResumeParseResponse:
    return ResumeParseResponse(text=raw.decode("utf-8", errors="replace").strip(), warnings=[])


def parse_resume_bytes_sync(filename: str, content_type: str, content_base64: str) -> ResumeParseResponse:
    """Synchronous parse — never log raw content."""
    raw = _decode_base64_strict(content_base64)
    lowered = filename.lower()
    ctype = content_type.lower()

    if "pdf" in ctype or lowered.endswith(".pdf"):
        return _parse_pdf(raw)
    if "word" in ctype or "officedocument" in ctype or lowered.endswith(".docx"):
        return _parse_docx(raw)
    if ctype.startswith("text/") or lowered.endswith(".txt"):
        return _parse_txt(raw)
    raise ValueError("UNSUPPORTED_DOCUMENT_TYPE")


async def parse_resume_bytes(filename: str, content_type: str, content_base64: str) -> ResumeParseResponse:
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(parse_resume_bytes_sync, filename, content_type, content_base64),
            timeout=PARSE_TIMEOUT_SECONDS,
        )
    except TimeoutError as exc:
        raise ValueError("PARSE_TIMEOUT") from exc


def _excerpt_lines(job_text: str, header_patterns: list[str], limit: int = 12) -> list[str]:
    lines = [ln.strip(" -\t") for ln in job_text.splitlines() if ln.strip()]
    collecting = False
    collected: list[str] = []
    header_re = re.compile("|".join(header_patterns), re.I)
    stop_re = re.compile(
        r"^(requirements|qualifications|responsibilities|preferred|about|benefits|what you|nice to)\b",
        re.I,
    )
    for line in lines:
        if header_re.search(line) and len(line) < 80:
            collecting = True
            continue
        if collecting and stop_re.search(line) and not header_re.search(line):
            break
        if collecting:
            if len(line) > 8:
                collected.append(line[:500])
            if len(collected) >= limit:
                break
    return collected


def parse_job_text(job_text: str, company: str | None = None, role: str | None = None) -> dict[str, Any]:
    """Extract job fields ONLY from text — no invented Full-time/seniority/generic quals."""
    warnings: list[str] = []
    lower = job_text.lower()
    for marker in INJECTION_MARKERS:
        if marker in lower:
            warnings.append(f"JD_INJECTION:{marker}")

    company_match = re.search(r"\b([A-Z][A-Za-z0-9&.\- ]{1,60}?)\s+is seeking\b", job_text) or re.search(
        r"\bCompany:\s*([^\n]+)", job_text, re.I
    )
    role_match = re.search(r"\b(?:Title|Role):\s*([^\n]+)", job_text, re.I) or re.search(
        r"\bis seeking (?:a |an )?([^\n.]{3,80})",
        job_text,
        re.I,
    )

    extracted_company = (company or "").strip() or (company_match.group(1).strip() if company_match else None)
    if extracted_company and extracted_company.lower() == "target company":
        extracted_company = company_match.group(1).strip() if company_match else None
    extracted_role = (role or "").strip() or (role_match.group(1).strip() if role_match else None)

    location = None
    loc_match = re.search(r"\bLocation:\s*([^\n]+)", job_text, re.I)
    if loc_match:
        location = loc_match.group(1).strip()[:512]
    elif re.search(r"\bRemote\b", job_text):
        location = "Remote"

    employment_type = None
    emp_match = re.search(r"\b(Full-time|Part-time|Contract|Internship)\b", job_text, re.I)
    if emp_match:
        employment_type = emp_match.group(1)

    seniority = None
    sen_match = re.search(r"\b(Intern|Junior|Mid-level|Senior|Staff|Principal|Lead)\b", job_text, re.I)
    if sen_match:
        seniority = sen_match.group(1)

    # Prefer canonical casing from hints list
    canonical: list[str] = []
    for hint in KNOWN_TECH_HINTS:
        if re.search(rf"\b{re.escape(hint)}\b", job_text, re.I):
            display = {
                "python": "Python",
                "pytorch": "PyTorch",
                "fastapi": "FastAPI",
                "aws": "AWS",
                "gcp": "GCP",
                "jax": "JAX",
                "tpu": "TPU",
                "vllm": "vLLM",
                "rag": "RAG",
                "opensearch": "OpenSearch",
                "typescript": "TypeScript",
                "javascript": "JavaScript",
                "next.js": "Next.js",
                "node.js": "Node.js",
                "figma": "Figma",
            }.get(hint, hint[0].upper() + hint[1:])
            if display not in canonical:
                canonical.append(display)

    required = _excerpt_lines(job_text, [r"^required", r"^requirements", r"^qualifications", r"^must have"])
    preferred = _excerpt_lines(job_text, [r"^preferred", r"^nice to have", r"^bonus"])
    responsibilities = _excerpt_lines(job_text, [r"^responsibilities", r"^what you.?ll do", r"^you will"])

    return JobParseResponse(
        title=extracted_role,
        company=extracted_company,
        role=extracted_role,
        location=location,
        employment_type=employment_type,
        seniority=seniority,
        required_qualifications=required,
        preferred_qualifications=preferred,
        responsibilities=responsibilities,
        target_technologies=canonical,
        warnings=warnings,
    ).model_dump()
