from __future__ import annotations

import base64
import io
from typing import Any

from app.domain.schemas import ResumeParseResponse


def parse_resume_bytes(filename: str, content_type: str, content_base64: str) -> ResumeParseResponse:
    raw = base64.b64decode(content_base64)
    lowered = filename.lower()
    warnings: list[str] = []

    if "pdf" in content_type.lower() or lowered.endswith(".pdf"):
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(raw))
        pages = [page.extract_text() or "" for page in reader.pages]
        text = "\n".join(pages).strip()
        if not text:
            warnings.append("PDF_TEXT_LAYER_EMPTY")
        return ResumeParseResponse(text=text, page_count=len(reader.pages), warnings=warnings)

    if "word" in content_type.lower() or lowered.endswith(".docx"):
        from docx import Document

        document = Document(io.BytesIO(raw))
        text = "\n".join(p.text for p in document.paragraphs if p.text.strip()).strip()
        return ResumeParseResponse(text=text, page_count=None, warnings=warnings)

    if content_type.startswith("text/") or lowered.endswith(".txt"):
        return ResumeParseResponse(text=raw.decode("utf-8", errors="replace").strip(), warnings=warnings)

    raise ValueError("UNSUPPORTED_DOCUMENT_TYPE")


def parse_job_text(job_text: str, company: str | None = None, role: str | None = None) -> dict[str, Any]:
    import re

    company_match = re.search(r"\b([A-Z][A-Za-z0-9&.\- ]{1,60}?)\s+is seeking\b", job_text) or re.search(
        r"\bCompany:\s*([^\n]+)", job_text, re.I
    )
    role_match = re.search(
        r"\b((?:Senior|Staff|Principal|Lead)\s+)?(?:AI|ML|Machine Learning|Platform|Software|Data)?\s*Engineer(?:ing)?\b",
        job_text,
        re.I,
    )
    tech_candidates = [
        "Python",
        "PyTorch",
        "Hugging Face",
        "FastAPI",
        "AWS",
        "Docker",
        "Kubernetes",
        "RAG",
        "OpenSearch",
        "FAISS",
        "LangGraph",
        "vLLM",
        "Ray",
        "JAX",
        "TPU",
    ]
    found = [tech for tech in tech_candidates if re.search(rf"\b{re.escape(tech)}\b", job_text, re.I)]
    extracted_company = (company or "").strip() or (company_match.group(1).strip() if company_match else "Unknown company")
    extracted_role = (role or "").strip() or (role_match.group(0).strip() if role_match else "Software Engineer")
    if extracted_company.lower() == "target company":
        extracted_company = company_match.group(1).strip() if company_match else "Unknown company"
    return {
        "title": extracted_role,
        "company": extracted_company,
        "role": extracted_role,
        "location": "Remote" if re.search(r"Remote", job_text, re.I) else None,
        "employment_type": "Full-time",
        "seniority": "Senior" if re.search(r"Senior|Staff|Principal|Lead", job_text, re.I) else "Mid-level",
        "required_qualifications": ["Production systems experience", "Cloud deployment familiarity"],
        "preferred_qualifications": ["Observability", "On-call ownership"],
        "responsibilities": ["Design and ship production features"],
        "target_technologies": found,
    }
