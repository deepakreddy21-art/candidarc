"""Deterministic résumé section structuring — no invented employers, dates, or metrics."""

from __future__ import annotations

import re
from typing import Any

EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
PHONE_RE = re.compile(r"(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}")
LINKEDIN_RE = re.compile(r"(?:linkedin\.com/in/[\w-]+)", re.I)
GITHUB_RE = re.compile(r"(?:github\.com/[\w-]+)", re.I)
URL_RE = re.compile(r"https?://[^\s)]+", re.I)
DATE_RANGE_RE = re.compile(
    r"(?P<start>(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{1,2}/\d{4}|\d{4})"
    r"\s*[-–—to?]+\s*"
    r"(?P<end>Present|Current|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{1,2}/\d{4}|\d{4})",
    re.I,
)


def _normalize_pdf_quirks(text: str) -> str:
    """pypdf often replaces bullets and en-dashes with '?'."""
    text = text.replace("\r\n", "\n")
    text = re.sub(r"(?m)^[?•●▪◦]\s+", "- ", text)
    text = re.sub(
        r"((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})\s*\?\s*(Present|Current|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})",
        r"\1 - \2",
        text,
        flags=re.I,
    )
    return text


def _split_lines(text: str) -> list[str]:
    return [ln.strip() for ln in _normalize_pdf_quirks(text).split("\n") if ln.strip()]

SECTION_ALIASES: dict[str, tuple[str, ...]] = {
    "experience": (
        "experience",
        "work experience",
        "professional experience",
        "employment",
        "employment history",
        "career experience",
        "relevant experience",
        "work history",
        "professional history",
        "work",
    ),
    "education": ("education", "academic background", "academics"),
    "projects": ("projects", "personal projects", "selected projects", "side projects"),
    "skills": ("skills", "technical skills", "core skills", "technologies", "tech stack"),
    "certifications": ("certifications", "certificates", "licenses", "licenses & certifications"),
    "summary": ("summary", "professional summary", "profile", "about", "objective"),
}


def _normalize_header(line: str) -> str | None:
    cleaned = re.sub(r"[^a-zA-Z &/]", "", line).strip().lower()
    cleaned = re.sub(r"\s+", " ", cleaned)
    if not cleaned or len(cleaned) > 48:
        return None
    for canonical, aliases in SECTION_ALIASES.items():
        if cleaned in aliases:
            return canonical
    return None


def _contact_from_text(lines: list[str], joined: str) -> dict[str, Any]:
    emails = EMAIL_RE.findall(joined)
    phones = PHONE_RE.findall(joined)
    linkedin = LINKEDIN_RE.search(joined)
    github = GITHUB_RE.search(joined)
    urls = URL_RE.findall(joined)
    portfolio = next((u for u in urls if "linkedin" not in u.lower() and "github" not in u.lower()), None)
    full_name = None
    for line in lines[:4]:
        if EMAIL_RE.search(line) or PHONE_RE.search(line) or _normalize_header(line):
            continue
        if len(line) < 80 and not DATE_RANGE_RE.search(line):
            full_name = line
            break
    return {
        "full_name": full_name,
        "email": emails[0] if emails else None,
        "phone": phones[0] if phones else None,
        "location": None,
        "linkedin": linkedin.group(0) if linkedin else None,
        "github": github.group(0) if github else None,
        "portfolio": portfolio,
    }


def _chunk_experience(lines: list[str]) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    def flush() -> None:
        nonlocal current
        if current:
            jobs.append(current)
            current = None

    for line in lines:
        is_bullet = bool(re.match(r"^[-•*●▪◦?]", line) or re.match(r"^\d+[.)]", line))
        date_match = DATE_RANGE_RE.search(line)
        if is_bullet:
            if not current:
                current = {"title": None, "employer": None, "location": None, "start_date": None, "end_date": None, "bullets": []}
            current["bullets"].append(re.sub(r"^[-•*●▪◦?\d.)]+\s*", "", line).strip())
            continue

        # Company / title / dates often on separate lines
        if date_match and current and not current.get("start_date"):
            current["start_date"] = date_match.group("start")
            current["end_date"] = date_match.group("end")
            remainder = DATE_RANGE_RE.sub("", line).strip(" -,|/•")
            if remainder and not current.get("location") and len(remainder) < 60:
                current["location"] = remainder
            continue

        if not is_bullet and len(line) < 140:
            flush()
            parts = re.split(r"\s+[|@]\s+|\s+[-–—]\s+", line)
            title = parts[0].strip() if parts else line
            employer = parts[1].strip() if len(parts) > 1 else None
            location = parts[2].strip() if len(parts) > 2 else None
            start = end = None
            if date_match:
                start = date_match.group("start")
                end = date_match.group("end")
                title = DATE_RANGE_RE.sub("", title).strip(" -,|/")
            # Heuristic: "Title, Company" or "Company — Title"
            if employer is None and "," in line and not date_match:
                left, right = [p.strip() for p in line.split(",", 1)]
                if len(left) < 60 and len(right) < 80:
                    # Prefer "Title at Company" style when second looks like org
                    if re.search(r"\b(Inc|LLC|Ltd|Corp|Company|Labs|University)\b", right, re.I):
                        title, employer = left, right
                    else:
                        title, employer = left, right
            current = {
                "title": title or None,
                "employer": employer,
                "location": location,
                "start_date": start,
                "end_date": end,
                "bullets": [],
            }
            continue

        if not current:
            current = {"title": None, "employer": None, "location": None, "start_date": None, "end_date": None, "bullets": []}
        current["bullets"].append(line)

    flush()
    # Drop empty shells
    return [
        job
        for job in jobs
        if job.get("title") or job.get("employer") or job.get("bullets")
    ]


def _chunk_education(lines: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    year_re = re.compile(r"\b(19|20)\d{2}\b")
    for line in lines[:20]:
        parts = [p.strip() for p in re.split(r"\s+[|,—-]\s+", line) if p.strip()]
        end_date = None
        if parts and year_re.fullmatch(parts[-1] or ""):
            end_date = parts.pop()
        degree = institution = field = None
        if len(parts) >= 2 and re.search(r"\b(B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|Ph\.?D\.?|Bachelor|Master|Associate)\b", parts[0], re.I):
            degree, institution = parts[0], parts[1]
            field = parts[2] if len(parts) > 2 else None
        elif len(parts) >= 2:
            institution, degree = parts[0], parts[1]
            field = parts[2] if len(parts) > 2 else None
        else:
            institution = parts[0] if parts else line
        out.append(
            {
                "institution": institution,
                "degree": degree,
                "field": field,
                "end_date": end_date,
            }
        )
    return out


def _chunk_projects(lines: list[str]) -> list[dict[str, Any]]:
    projects: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for line in lines:
        if re.match(r"^[-•*]", line):
            if not current:
                current = {"name": None, "description": "", "technologies": []}
            desc = re.sub(r"^[-•*]+\s*", "", line)
            current["description"] = f"{current.get('description') or ''} {desc}".strip()
            continue
        if current:
            projects.append(current)
        current = {"name": line, "description": "", "technologies": []}
    if current:
        projects.append(current)
    return projects


def structure_resume_text(text: str, warnings: list[str] | None = None) -> dict[str, Any]:
    warnings = list(warnings or [])
    lines = _split_lines(text)
    joined = "\n".join(lines)

    sections: dict[str, list[str]] = {"header": []}
    current = "header"
    for line in lines:
        header = _normalize_header(line)
        if header:
            current = header
            sections.setdefault(current, [])
            continue
        sections.setdefault(current, []).append(line)

    skills = [
        s.strip()
        for line in sections.get("skills", [])
        for s in re.split(r"[,•|/]", line)
        if 1 < len(s.strip()) < 60
    ]

    employment = _chunk_experience(sections.get("experience", []))
    education = _chunk_education(sections.get("education", []))
    projects = _chunk_projects(sections.get("projects", []))
    certifications = sections.get("certifications", [])[:20]
    contact = _contact_from_text(lines, joined)

    missing: list[str] = []
    if not employment:
        missing.append("employment")
    if not education:
        missing.append("education")
    if not skills:
        missing.append("skills")
    if not contact.get("email"):
        missing.append("email")

    usable = bool(
        employment
        or projects
        or (education and skills)
        or (certifications and (contact.get("full_name") or skills))
    )
    quality = "high" if employment and skills else "medium" if usable else "low"
    if not usable:
        warnings.append("INSUFFICIENT_STRUCTURED_CONTENT")

    evidence = []
    for job in employment[:5]:
        evidence.append(
            {
                "title": " @ ".join([p for p in [job.get("title"), job.get("employer")] if p]) or "Experience",
                "summary": " ".join((job.get("bullets") or [])[:3]),
                "technologies": skills[:8],
            }
        )

    return {
        "contact": contact,
        "employment": employment,
        "education": education,
        "projects": projects,
        "skills": list(dict.fromkeys(skills)),
        "certifications": certifications,
        "evidence": evidence,
        "raw_text": joined[:50_000],
        "page_count": None,
        "warnings": warnings,
        "extraction_quality": quality,
        "missing_fields": missing,
        "usable": usable,
    }
