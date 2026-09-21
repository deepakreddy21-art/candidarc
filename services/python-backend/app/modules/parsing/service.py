"""Document and job parsing with strict safety limits."""

from __future__ import annotations

import asyncio
import base64
import io
import re
import zipfile
from typing import Any

from app.domain.schemas import (
    JobParseResponse,
    ResumeParseCertification,
    ResumeParseContact,
    ResumeParseEducation,
    ResumeParseEmployment,
    ResumeParseEvidence,
    ResumeParseProject,
    ResumeParseProvenance,
    ResumeParsePublication,
    ResumeParseResponse,
    ResumeParseSkillGroup,
)
from app.modules.guardrails.service import INJECTION_MARKERS, KNOWN_TECH_HINTS
from app.modules.parsing.fields import BULLET_RE
from app.modules.parsing.links import linked_text, pdf_link_text
from app.modules.parsing.structure import EMAIL_RE, PHONE_RE, _normalize_header, structure_resume_text

MAX_RESUME_BYTES = 10 * 1024 * 1024
MAX_PDF_PAGES = 30
MAX_DOCX_UNCOMPRESSED = 20 * 1024 * 1024
PARSE_TIMEOUT_SECONDS = 15.0

PDF_MAGIC = b"%PDF"
DOCX_MAGIC = b"PK"


def _decode_base64_strict(content_base64: str) -> bytes:
    try:
        raw = base64.b64decode(content_base64, validate=True)
    except Exception as exc:
        raise ValueError("INVALID_BASE64") from exc
    if len(raw) > MAX_RESUME_BYTES:
        raise ValueError("DOCUMENT_TOO_LARGE")
    if not raw:
        raise ValueError("EMPTY_DOCUMENT")
    return raw


def _map_provenance(raw: dict[str, Any] | None) -> ResumeParseProvenance | None:
    if not raw:
        return None
    return ResumeParseProvenance(
        source_text=raw.get("source_text"),
        page_number=raw.get("page_number"),
        location_hint=raw.get("location_hint"),
        confidence=raw.get("confidence") or "medium",
        warnings=list(raw.get("warnings") or [])[:20],
        extracted_or_normalized=raw.get("extracted_or_normalized") or "extracted",
    )


def _with_structure(text: str, page_count: int | None, warnings: list[str]) -> ResumeParseResponse:
    structured = structure_resume_text(text, warnings)
    contact_raw = structured.get("contact") or {}
    return ResumeParseResponse(
        schema_version=2,
        text=text[:500_000],
        page_count=page_count if page_count is not None else structured.get("page_count"),
        warnings=list(structured.get("warnings") or warnings),
        contact=ResumeParseContact(
            full_name=contact_raw.get("full_name"),
            first_name=contact_raw.get("first_name"),
            middle_name=contact_raw.get("middle_name"),
            last_name=contact_raw.get("last_name"),
            email=contact_raw.get("email"),
            emails=list(contact_raw.get("emails") or [])[:10],
            phone=contact_raw.get("phone"),
            phones=list(contact_raw.get("phones") or [])[:10],
            location=contact_raw.get("location"),
            linkedin=contact_raw.get("linkedin"),
            github=contact_raw.get("github"),
            portfolio=contact_raw.get("portfolio"),
            other_urls=list(contact_raw.get("other_urls") or [])[:20],
            provenance=_map_provenance(contact_raw.get("provenance")),
        ),
        professional_summary=structured.get("professional_summary"),
        employment=[
            ResumeParseEmployment(
                title=item.get("title"),
                employer=item.get("employer"),
                location=item.get("location"),
                start_date=item.get("start_date"),
                end_date=item.get("end_date"),
                is_current=item.get("is_current"),
                bullets=list(item.get("bullets") or [])[:40],
                technologies=list(item.get("technologies") or [])[:40],
                source_order=item.get("source_order"),
                provenance=_map_provenance(item.get("provenance")),
            )
            for item in structured.get("employment") or []
        ],
        education=[
            ResumeParseEducation(
                institution=item.get("institution"),
                degree=item.get("degree"),
                field=item.get("field"),
                location=item.get("location"),
                start_date=item.get("start_date"),
                end_date=item.get("end_date"),
                gpa=item.get("gpa"),
                honors=item.get("honors"),
                provenance=_map_provenance(item.get("provenance")),
            )
            for item in structured.get("education") or []
        ],
        projects=[
            ResumeParseProject(
                name=item.get("name"),
                role=item.get("role"),
                organization=item.get("organization"),
                start_date=item.get("start_date"),
                end_date=item.get("end_date"),
                description=item.get("description"),
                bullets=list(item.get("bullets") or [])[:40],
                technologies=list(item.get("technologies") or [])[:40],
                url=item.get("url"),
                repo_url=item.get("repo_url"),
                provenance=_map_provenance(item.get("provenance")),
            )
            for item in structured.get("projects") or []
        ],
        skills=list(structured.get("skills") or [])[:200],
        skill_groups=[
            ResumeParseSkillGroup(category=g.get("category") or "Skills", skills=list(g.get("skills") or [])[:100])
            for g in structured.get("skill_groups") or []
            if g.get("category")
        ],
        certifications=list(structured.get("certifications") or [])[:40],
        certification_entries=[
            ResumeParseCertification(
                name=item.get("name") or "Certification",
                issuer=item.get("issuer"),
                issue_date=item.get("issue_date"),
                expiration_date=item.get("expiration_date"),
                credential_id=item.get("credential_id"),
                credential_url=item.get("credential_url"),
                provenance=_map_provenance(item.get("provenance")),
            )
            for item in structured.get("certification_entries") or []
            if item.get("name")
        ],
        publications=[
            ResumeParsePublication(
                title=item.get("title") or "Publication",
                authors=list(item.get("authors") or [])[:40],
                publisher=item.get("publisher"),
                publication_date=item.get("publication_date"),
                doi=item.get("doi"),
                url=item.get("url"),
                description=item.get("description"),
                provenance=_map_provenance(item.get("provenance")),
            )
            for item in structured.get("publications") or []
            if item.get("title")
        ],
        evidence=[
            ResumeParseEvidence(
                title=item.get("title") or "Evidence",
                summary=(item.get("summary") or item.get("title") or "Imported experience").strip()[:2000],
                technologies=list(item.get("technologies") or [])[:40],
            )
            for item in structured.get("evidence") or []
            if (item.get("summary") or item.get("title") or item.get("technologies"))
        ],
        extraction_quality=structured.get("extraction_quality"),
        missing_fields=list(structured.get("missing_fields") or []),
        usable=structured.get("usable"),
    )


def _reconstruct_column_text(page: Any) -> str | None:
    """Rebuild reading order from positioned PDF text when multiple X columns exist.

    Resumes often place experience on the left and skills/education on the right with
    overlapping Y ranges. Default pypdf line-reading interleaves columns and swaps
    employer/title associations. Column-major (left then right) preserves structure.
    """
    fragments: list[tuple[float, float, str]] = []

    def visitor(text: str, cm: Any, tm: Any, _font_dict: Any, _font_size: Any) -> None:
        if not text or not str(text).strip():
            return
        try:
            from pypdf import mult

            position = mult(tm, cm)
            x = float(position[4])
            y = float(position[5])
        except (TypeError, ValueError, IndexError):
            return
        fragments.append((x, y, str(text)))

    try:
        page.extract_text(visitor_text=visitor)
    except TypeError:
        return None
    except Exception:
        return None

    if len(fragments) < 4:
        return None

    xs = sorted({round(x / 10.0) * 10.0 for x, _y, _t in fragments})
    if len(xs) < 2:
        return None
    # Detect a gap large enough to indicate distinct columns (≈1.5").
    gaps = [(xs[i + 1] - xs[i], i) for i in range(len(xs) - 1)]
    widest_gap, gap_idx = max(gaps, key=lambda item: item[0])
    if widest_gap < 80:
        return None
    split_x = (xs[gap_idx] + xs[gap_idx + 1]) / 2.0

    left = [(x, y, t) for x, y, t in fragments if x < split_x]
    right = [(x, y, t) for x, y, t in fragments if x >= split_x]
    if not left or not right:
        return None

    # A right-aligned date/location column is part of each row, not a separate
    # reading column. Require independent section headings in the right lane.
    if not any(_normalize_header(line) for _x, _y, text in right for line in text.splitlines()):
        return None

    # Overlapping vertical ranges required for a genuine two-column layout.
    left_ys = [y for _x, y, _t in left]
    right_ys = [y for _x, y, _t in right]
    if max(left_ys) < min(right_ys) or max(right_ys) < min(left_ys):
        return None

    def column_lines(items: list[tuple[float, float, str]]) -> list[str]:
        # Top-to-bottom, then left-to-right within a line band.
        ordered = sorted(items, key=lambda row: (-row[1], row[0]))
        lines: list[str] = []
        band_y: float | None = None
        band: list[str] = []
        for _x, y, text in ordered:
            cleaned = text.replace("\r", "").strip("\n")
            if not cleaned.strip():
                continue
            if band_y is None or abs(y - band_y) <= 3:
                band.append(cleaned)
                band_y = y if band_y is None else band_y
            else:
                lines.append("  ".join(band).strip())
                band = [cleaned]
                band_y = y
        if band:
            lines.append("  ".join(band).strip())
        return [ln for ln in lines if ln]

    left_text = "\n".join(column_lines(left))
    right_text = "\n".join(column_lines(right))
    if not left_text or not right_text:
        return None
    return f"{left_text}\n\n{right_text}".strip()


def _extract_pdf_page_text(page: Any) -> str:
    reconstructed = _reconstruct_column_text(page)
    if reconstructed:
        return reconstructed
    # Layout mode preserves spacing between employer/title/location/date cells.
    # Default stream order can concatenate these or place dates after all bullets.
    try:
        text = page.extract_text(extraction_mode="layout", layout_mode_space_vertically=False) or ""
    except (TypeError, ValueError):
        return page.extract_text() or ""
    return _separate_pdf_contact_header(page, text)


def _separate_pdf_contact_header(page: Any, text: str) -> str:
    """Keep a contact sidebar separate from an adjacent, unlabelled summary.

    This is a page-local region, not a two-column document: job headers below it
    must still be read across the page. Only split when positions, overlapping
    vertical ranges, contact anchors and a substantial prose lane agree.
    """
    lines = text.splitlines()
    boundary = next((i for i, line in enumerate(lines)
                     if _normalize_header(line) not in (None, "summary")), None)
    if boundary is None:
        return text
    fragments: list[tuple[float, float, str]] = []

    def visitor(value: str, cm: Any, tm: Any, _font: Any, _size: Any) -> None:
        from pypdf import mult

        if value.strip():
            position = mult(tm, cm)
            fragments.append((float(position[4]), float(position[5]), value.strip()))

    try:
        page.extract_text(visitor_text=visitor)
    except (TypeError, ValueError, IndexError):
        return text
    heading = _normalize_header(lines[boundary])
    heading_ys = [y for _x, y, value in fragments if _normalize_header(value) == heading]
    if not heading_ys:
        return text
    header = [part for part in fragments if part[1] > max(heading_ys) + 3]
    if len(header) < 4 or any("\n" in value for _x, _y, value in header):
        return text
    xs = sorted({round(x / 10) * 10 for x, _y, _value in header})
    if len(xs) < 2:
        return text
    gap, index = max((xs[i + 1] - xs[i], i) for i in range(len(xs) - 1))
    if gap < 80:
        return text
    split = (xs[index] + xs[index + 1]) / 2
    lanes = [[part for part in header if part[0] < split], [part for part in header if part[0] >= split]]
    contact_lanes = [i for i, lane in enumerate(lanes)
                     if any(EMAIL_RE.search(value) or PHONE_RE.search(value) for _x, _y, value in lane)]
    if len(contact_lanes) != 1:
        return text
    contact, summary = lanes[contact_lanes[0]], lanes[1 - contact_lanes[0]]
    if len(contact) < 2 or len(summary) < 2 or sum(len(value) for _x, _y, value in summary) < 120:
        return text
    if min(y for _x, y, _v in contact) > max(y for _x, y, _v in summary) or min(y for _x, y, _v in summary) > max(y for _x, y, _v in contact):
        return text

    def ordered(lane: list[tuple[float, float, str]]) -> str:
        rows: list[str] = []
        band_y: float | None = None
        for _x, y, value in sorted(lane, key=lambda part: (-part[1], part[0])):
            if band_y is not None and abs(y - band_y) <= 3:
                rows[-1] += " " + value
            else:
                rows.append(value)
                band_y = y
        return "\n".join(rows)

    return ordered(contact) + "\nProfessional Summary\n" + ordered(summary) + "\n" + "\n".join(lines[boundary:])


def _parse_pdf(raw: bytes) -> ResumeParseResponse:
    from pypdf import PdfReader
    from pypdf.errors import FileNotDecryptedError, PdfReadError

    if not raw.startswith(PDF_MAGIC):
        raise ValueError("INVALID_PDF_MAGIC")
    try:
        reader = PdfReader(io.BytesIO(raw))
    except PdfReadError as exc:
        raise ValueError("CORRUPT_PDF") from exc
    except Exception as exc:
        message = str(exc).lower()
        if "encrypt" in message or "password" in message:
            raise ValueError("PDF_ENCRYPTED") from exc
        raise ValueError("CORRUPT_PDF") from exc

    if getattr(reader, "is_encrypted", False):
        try:
            # Empty password attempt — fail closed if still encrypted
            result = reader.decrypt("")
            if result == 0:
                raise ValueError("PDF_ENCRYPTED")
        except FileNotDecryptedError as exc:
            raise ValueError("PDF_ENCRYPTED") from exc
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError("PDF_ENCRYPTED") from exc

    page_count = len(reader.pages)
    if page_count > MAX_PDF_PAGES:
        raise ValueError("PDF_PAGE_LIMIT_EXCEEDED")
    try:
        pages = [pdf_link_text(page, _extract_pdf_page_text(page)) for page in reader.pages]
    except Exception as exc:
        raise ValueError("CORRUPT_PDF") from exc
    text = "\n".join(pages).strip()
    warnings: list[str] = []
    if not text:
        warnings.append("PDF_TEXT_LAYER_EMPTY")
        warnings.append("IMAGE_ONLY_PDF_OCR_REQUIRED")
        raise ValueError("IMAGE_ONLY_PDF_OCR_REQUIRED")
    return _with_structure(text, page_count, warnings)


def _parse_docx(raw: bytes) -> ResumeParseResponse:
    if not raw.startswith(DOCX_MAGIC):
        raise ValueError("INVALID_DOCX_MAGIC")
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        total_uncompressed = sum(info.file_size for info in zf.infolist())
        if total_uncompressed > MAX_DOCX_UNCOMPRESSED:
            raise ValueError("DOCX_ZIP_BOMB_SUSPECTED")
        for info in zf.infolist():
            if info.file_size > MAX_DOCX_UNCOMPRESSED:
                raise ValueError("DOCX_ZIP_BOMB_SUSPECTED")

    from docx import Document
    from docx.table import Table
    from docx.text.hyperlink import Hyperlink
    from docx.text.paragraph import Paragraph

    document = Document(io.BytesIO(raw))

    def paragraph_text(paragraph: Any) -> str:
        return "".join(
            linked_text(part.text, part.url) if isinstance(part, Hyperlink) else part.text
            for part in paragraph.iter_inner_content()
        )

    def is_list_paragraph(paragraph: Any) -> bool:
        properties = paragraph._p.pPr
        if properties is not None and properties.numPr is not None:
            return True
        style = paragraph.style
        for _ in range(6):
            if style is None:
                break
            properties = style.element.pPr
            if (properties is not None and properties.numPr is not None) or re.match(r"List (Bullet|Number)", style.name or ""):
                return True
            style = style.base_style
        return False

    def blocks(container: Any) -> list[str]:
        lines: list[str] = []
        for block in container.iter_inner_content():
            if isinstance(block, Paragraph):
                paragraph_lines = [line for line in paragraph_text(block).splitlines() if line.strip()]
                if paragraph_lines and is_list_paragraph(block) and not BULLET_RE.match(paragraph_lines[0]):
                    paragraph_lines[0] = "- " + paragraph_lines[0]
                lines.extend(paragraph_lines)
            elif isinstance(block, Table):
                seen_cells: set[Any] = set()
                for row in block.rows:
                    cells: list[list[str]] = []
                    for cell in row.cells:
                        # A merged Word cell appears once per covered grid column.
                        if cell._tc in seen_cells:
                            continue
                        seen_cells.add(cell._tc)
                        cells.append(blocks(cell))
                    independent_sections = any(_normalize_header(line) for cell in cells[1:] for line in cell)
                    contact_cells = [i for i, cell in enumerate(cells)
                                     if any(EMAIL_RE.search(line) or PHONE_RE.search(line) for line in cell)]
                    header_sidebar = (
                        len(cells) == 2 and len(contact_cells) == 1
                        and not any(_normalize_header(line) for cell in cells for line in cell)
                        and sum(len(line) for line in cells[1 - contact_cells[0]]) >= 120
                        and not any(_normalize_header(line) for line in lines)
                    )
                    if header_sidebar:
                        lines.extend(cells[contact_cells[0]])
                        lines.append("Professional Summary")
                        lines.extend(cells[1 - contact_cells[0]])
                    elif independent_sections:
                        lines.extend(line for cell in cells for line in cell)
                    else:
                        for i in range(max((len(cell) for cell in cells), default=0)):
                            lines.append(" | ".join(cell[i] for cell in cells if i < len(cell)))
        return lines

    header_lines: list[str] = []
    seen_headers: set[str] = set()
    for section in document.sections:
        for header in (section.header, section.first_page_header):
            for paragraph in header.paragraphs:
                value = paragraph_text(paragraph)
                if value.strip() and value not in seen_headers:
                    seen_headers.add(value)
                    header_lines.append(value)
    text = "\n".join(header_lines + blocks(document)).strip()
    if not text:
        raise ValueError("EMPTY_DOCUMENT")
    return _with_structure(text, None, [])


def _parse_txt(raw: bytes) -> ResumeParseResponse:
    text = raw.decode("utf-8", errors="replace").strip()
    if not text:
        raise ValueError("EMPTY_DOCUMENT")
    return _with_structure(text, None, [])


def parse_resume_bytes_sync(filename: str, content_type: str, content_base64: str) -> ResumeParseResponse:
    """Synchronous parse — never log raw content."""
    raw = _decode_base64_strict(content_base64)
    lowered = filename.lower()
    ctype = content_type.lower()

    if lowered.endswith(".doc") and not lowered.endswith(".docx"):
        raise ValueError("LEGACY_DOC_UNSUPPORTED")
    if "msword" in ctype and "officedocument" not in ctype and not lowered.endswith(".docx"):
        raise ValueError("LEGACY_DOC_UNSUPPORTED")

    if "pdf" in ctype or lowered.endswith(".pdf"):
        return _parse_pdf(raw)
    if "officedocument" in ctype or lowered.endswith(".docx"):
        return _parse_docx(raw)
    if "word" in ctype and lowered.endswith(".docx"):
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
