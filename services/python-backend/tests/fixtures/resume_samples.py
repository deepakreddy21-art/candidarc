"""Deterministic résumé fixtures for parse/structure tests (non-copyrighted)."""

from __future__ import annotations

import base64
import io

PROFESSIONAL_EXPERIENCE_RESUME = """Jordan Blake
jordan.blake@example.com | (555) 010-2244 | Seattle, WA
linkedin.com/in/jordanblake | github.com/jordanblake

PROFESSIONAL EXPERIENCE

Platform Engineer | Harbor Systems | Seattle, WA
Jan 2021 - Present
- Built Kubernetes-based deployment pipelines for 12 services
- Reduced mean recovery time from 45 minutes to 8 minutes
- Mentored three engineers on observability practices

Software Engineer | Northwind Labs
Jun 2018 - Dec 2020
- Designed REST APIs in TypeScript and Node.js
- Migrated billing workflows to PostgreSQL with zero downtime

EDUCATION
B.S. Computer Science | Cascadia University | 2018

SKILLS
TypeScript, Node.js, Kubernetes, PostgreSQL, AWS, React

CERTIFICATIONS
AWS Solutions Architect Associate
"""

WORK_HISTORY_RESUME = PROFESSIONAL_EXPERIENCE_RESUME.replace(
    "PROFESSIONAL EXPERIENCE", "WORK HISTORY"
)

NO_EMPLOYMENT_RESUME = """Sam Rivera
sam.rivera@example.com

PROJECTS
Campus Course Planner
- Built a Next.js app for course planning used by 200 students
- Stack: TypeScript, PostgreSQL

EDUCATION
B.A. Information Systems | Lakeside College | 2024

SKILLS
TypeScript, React, SQL, Figma
"""


def text_to_simple_pdf(text: str) -> bytes:
    """Minimal multi-line text PDF suitable for pypdf extraction."""
    lines = [ln[:90] for ln in text.splitlines() if ln.strip()][:80]
    content_lines = ["BT /F1 10 Tf 50 750 Td 12 TL"]
    for i, line in enumerate(lines):
        safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        if i == 0:
            content_lines.append(f"({safe}) Tj")
        else:
            content_lines.append(f"T* ({safe}) Tj")
    content_lines.append("ET")
    stream = "\n".join(content_lines)
    objects = [
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
        "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
        "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
        f"4 0 obj << /Length {len(stream)} >> stream\n{stream}\nendstream endobj",
        "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    ]
    pdf = ["%PDF-1.4"]
    offsets = [0]
    for obj in objects:
        offsets.append(sum(len(x) + 1 for x in pdf))
        pdf.append(obj)
    xref_pos = sum(len(x) + 1 for x in pdf)
    pdf.append("xref")
    pdf.append(f"0 {len(objects) + 1}")
    pdf.append("0000000000 65535 f ")
    for off in offsets[1:]:
        pdf.append(f"{off:010d} 00000 n ")
    pdf.append(f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>")
    pdf.append("startxref")
    pdf.append(str(xref_pos))
    pdf.append("%%EOF")
    return ("\n".join(pdf) + "\n").encode("latin-1", errors="replace")


def text_to_docx(text: str) -> bytes:
    from docx import Document

    document = Document()
    for line in text.splitlines():
        document.add_paragraph(line)
    buf = io.BytesIO()
    document.save(buf)
    return buf.getvalue()


def image_only_pdf() -> bytes:
    """PDF with a page but no text operators — triggers IMAGE_ONLY_PDF_OCR_REQUIRED."""
    stream = "q 200 0 0 200 100 400 cm /Im0 Do Q"
    pdf = f"""%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >> endobj
4 0 obj << /Length {len(stream)} >> stream
{stream}
endstream endobj
xref
0 5
0000000000 65535 f 
trailer << /Size 5 /Root 1 0 R >>
startxref
0
%%EOF
"""
    return pdf.encode("latin-1")


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")
