"""Deterministic résumé section structuring — no invented employers, dates, or metrics."""

from __future__ import annotations

import re
from typing import Any

EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
PHONE_RE = re.compile(r"(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}")
LINKEDIN_RE = re.compile(r"(?:linkedin\.com/in/[\w-]+)", re.I)
GITHUB_RE = re.compile(r"(?:github\.com/[\w-]+)", re.I)
URL_RE = re.compile(r"https?://[^\s)]+", re.I)
DOI_RE = re.compile(r"\b10\.\d{4,9}/[-._;()/:A-Z0-9]+\b", re.I)
DATE_RANGE_RE = re.compile(
    r"(?P<start>(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{1,2}/\d{4}|\d{4})"
    r"\s*[-–—to?]+\s*"
    r"(?P<end>Present|Current|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{1,2}/\d{4}|\d{4})",
    re.I,
)
GPA_RE = re.compile(r"\bGPA[:\s]+([0-4](?:\.\d{1,2})?(?:\s*/\s*4(?:\.0)?)?)", re.I)
LOCATION_HINT_RE = re.compile(
    r"\b([A-Z][a-zA-Z .'-]+,\s*(?:[A-Z]{2}|[A-Z][a-zA-Z]+))\b"
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
    "publications": ("publications", "papers", "research", "selected publications"),
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


def _provenance(source_text: str | None, *, confidence: str = "medium", warnings: list[str] | None = None) -> dict[str, Any]:
    return {
        "source_text": (source_text or "")[:4000] or None,
        "page_number": None,
        "location_hint": None,
        "confidence": confidence,
        "warnings": list(warnings or []),
        "extracted_or_normalized": "extracted",
    }


def _split_name(full_name: str | None) -> dict[str, str | None]:
    """Split only when tokens look like a simple Western-style personal name."""
    if not full_name:
        return {"first_name": None, "middle_name": None, "last_name": None}
    tokens = [t for t in re.split(r"\s+", full_name.strip()) if t]
    if len(tokens) < 2 or len(tokens) > 4:
        return {"first_name": None, "middle_name": None, "last_name": None}
    if any(re.search(r"\d|@", t) for t in tokens):
        return {"first_name": None, "middle_name": None, "last_name": None}
    if len(tokens) == 2:
        return {"first_name": tokens[0], "middle_name": None, "last_name": tokens[1]}
    if len(tokens) == 3:
        return {"first_name": tokens[0], "middle_name": tokens[1], "last_name": tokens[2]}
    return {"first_name": tokens[0], "middle_name": " ".join(tokens[1:-1]), "last_name": tokens[-1]}


def _contact_from_text(lines: list[str], joined: str) -> dict[str, Any]:
    emails = EMAIL_RE.findall(joined)
    phones = [p.strip() for p in PHONE_RE.findall(joined)]
    linkedin = LINKEDIN_RE.search(joined)
    github = GITHUB_RE.search(joined)
    urls = URL_RE.findall(joined)
    portfolio = next((u for u in urls if "linkedin" not in u.lower() and "github" not in u.lower()), None)
    other_urls = [
        u
        for u in urls
        if u != portfolio
        and "linkedin" not in u.lower()
        and "github" not in u.lower()
    ][:20]
    full_name = None
    name_line = None
    for line in lines[:4]:
        if EMAIL_RE.search(line) or PHONE_RE.search(line) or _normalize_header(line):
            continue
        if len(line) < 80 and not DATE_RANGE_RE.search(line):
            full_name = line
            name_line = line
            break
    location = None
    for line in lines[:8]:
        loc = LOCATION_HINT_RE.search(line)
        if loc and not EMAIL_RE.search(line):
            location = loc.group(1).strip()
            break
    name_parts = _split_name(full_name)
    return {
        "full_name": full_name,
        "first_name": name_parts["first_name"],
        "middle_name": name_parts["middle_name"],
        "last_name": name_parts["last_name"],
        "email": emails[0] if emails else None,
        "emails": list(dict.fromkeys(emails))[:10],
        "phone": phones[0] if phones else None,
        "phones": list(dict.fromkeys(phones))[:10],
        "location": location,
        "linkedin": linkedin.group(0) if linkedin else None,
        "github": github.group(0) if github else None,
        "portfolio": portfolio,
        "other_urls": other_urls,
        "provenance": _provenance(name_line or (emails[0] if emails else None), confidence="high" if full_name and emails else "medium"),
    }


def _is_current_end(end: str | None) -> bool | None:
    if not end:
        return None
    return bool(re.search(r"^(present|current)$", end.strip(), re.I))


def _role_technologies(bullets: list[str]) -> list[str]:
    """Technologies mentioned in role bullets only — never the global skills list."""
    tech_hints = (
        "Python", "TypeScript", "JavaScript", "Node.js", "React", "Kubernetes", "PostgreSQL",
        "AWS", "GCP", "Azure", "Docker", "FastAPI", "Next.js", "Redis", "GraphQL", "Java",
        "Go", "Rust", "SQL", "Spark", "TensorFlow", "PyTorch",
    )
    found: list[str] = []
    blob = " ".join(bullets)
    for hint in tech_hints:
        if re.search(rf"\b{re.escape(hint)}\b", blob, re.I):
            found.append(hint)
    return found[:40]


def _chunk_experience(lines: list[str]) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    source_order = 0

    def flush() -> None:
        nonlocal current, source_order
        if current:
            bullets = list(current.get("bullets") or [])
            current["technologies"] = _role_technologies(bullets)
            current["is_current"] = _is_current_end(current.get("end_date"))
            current["source_order"] = source_order
            current["provenance"] = _provenance(
                " | ".join(
                    p
                    for p in [current.get("title"), current.get("employer"), current.get("start_date"), current.get("end_date")]
                    if p
                ),
                confidence="high" if current.get("title") and current.get("employer") else "medium",
            )
            jobs.append(current)
            source_order += 1
            current = None

    for line in lines:
        is_bullet = bool(re.match(r"^[-•*●▪◦?]", line) or re.match(r"^\d+[.)]", line))
        date_match = DATE_RANGE_RE.search(line)
        if is_bullet:
            if not current:
                current = {
                    "title": None,
                    "employer": None,
                    "location": None,
                    "start_date": None,
                    "end_date": None,
                    "is_current": None,
                    "bullets": [],
                    "technologies": [],
                    "source_order": source_order,
                }
            current["bullets"].append(re.sub(r"^[-•*●▪◦?\d.)]+\s*", "", line).strip())
            continue

        if date_match and current and not current.get("start_date"):
            current["start_date"] = date_match.group("start")
            current["end_date"] = date_match.group("end")
            current["is_current"] = _is_current_end(current["end_date"])
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
            if employer is None and "," in line and not date_match:
                left, right = [p.strip() for p in line.split(",", 1)]
                if len(left) < 60 and len(right) < 80:
                    title, employer = left, right
            current = {
                "title": title or None,
                "employer": employer,
                "location": location,
                "start_date": start,
                "end_date": end,
                "is_current": _is_current_end(end),
                "bullets": [],
                "technologies": [],
                "source_order": source_order,
            }
            continue

        if not current:
            current = {
                "title": None,
                "employer": None,
                "location": None,
                "start_date": None,
                "end_date": None,
                "is_current": None,
                "bullets": [],
                "technologies": [],
                "source_order": source_order,
            }
        current["bullets"].append(line)

    flush()
    return [
        job
        for job in jobs
        if job.get("title") or job.get("employer") or job.get("bullets")
    ]


def _chunk_education(lines: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    year_re = re.compile(r"\b(19|20)\d{2}\b")
    for line in lines[:20]:
        gpa_match = GPA_RE.search(line)
        honors = None
        if re.search(r"\b(cum laude|magna cum laude|summa cum laude|dean'?s list|honors)\b", line, re.I):
            honors_match = re.search(
                r"\b(cum laude|magna cum laude|summa cum laude|dean'?s list|honors)\b",
                line,
                re.I,
            )
            honors = honors_match.group(1) if honors_match else None
        parts = [p.strip() for p in re.split(r"\s+[|,—-]\s+", line) if p.strip()]
        end_date = None
        if parts and year_re.fullmatch(parts[-1] or ""):
            end_date = parts.pop()
        degree = institution = field = location = None
        if len(parts) >= 2 and re.search(
            r"\b(B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|Ph\.?D\.?|Bachelor|Master|Associate)\b",
            parts[0],
            re.I,
        ):
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
                "location": location,
                "start_date": None,
                "end_date": end_date,
                "gpa": gpa_match.group(1).strip() if gpa_match else None,
                "honors": honors,
                "provenance": _provenance(line, confidence="high" if institution and degree else "medium"),
            }
        )
    return out


def _chunk_projects(lines: list[str]) -> list[dict[str, Any]]:
    projects: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    def flush() -> None:
        nonlocal current
        if not current:
            return
        bullets = list(current.get("bullets") or [])
        if not current.get("description") and bullets:
            current["description"] = bullets[0]
        if not current.get("technologies"):
            current["technologies"] = _role_technologies(bullets + [current.get("description") or ""])
        current["provenance"] = _provenance(current.get("name"), confidence="medium")
        projects.append(current)
        current = None

    for line in lines:
        url_match = URL_RE.search(line)
        if re.match(r"^[-•*]", line):
            if not current:
                current = {
                    "name": None,
                    "role": None,
                    "organization": None,
                    "start_date": None,
                    "end_date": None,
                    "description": "",
                    "bullets": [],
                    "technologies": [],
                    "url": None,
                    "repo_url": None,
                }
            desc = re.sub(r"^[-•*]+\s*", "", line)
            current["bullets"].append(desc)
            if not current.get("description"):
                current["description"] = desc
            stack = re.search(r"(?i)\bstack:\s*(.+)$", desc)
            if stack:
                current["technologies"] = [
                    t.strip() for t in re.split(r"[,|/]", stack.group(1)) if 1 < len(t.strip()) < 60
                ][:40]
            continue
        flush()
        name = line
        repo_url = url_match.group(0) if url_match and "github" in url_match.group(0).lower() else None
        url = url_match.group(0) if url_match and not repo_url else None
        if url_match:
            name = URL_RE.sub("", line).strip(" -|")
        current = {
            "name": name or None,
            "role": None,
            "organization": None,
            "start_date": None,
            "end_date": None,
            "description": "",
            "bullets": [],
            "technologies": [],
            "url": url,
            "repo_url": repo_url,
        }
    flush()
    return projects


def _chunk_certifications(lines: list[str]) -> tuple[list[str], list[dict[str, Any]]]:
    legacy: list[str] = []
    entries: list[dict[str, Any]] = []
    for line in lines[:40]:
        if not line.strip():
            continue
        legacy.append(line.strip())
        issuer = None
        issue_date = None
        credential_id = None
        credential_url = None
        name = line.strip()
        parts = [p.strip() for p in re.split(r"\s+[|—-]\s+", line) if p.strip()]
        if len(parts) >= 2:
            name = parts[0]
            # Second token may be issuer or year
            if re.fullmatch(r"(19|20)\d{2}", parts[1]):
                issue_date = parts[1]
            else:
                issuer = parts[1]
            if len(parts) >= 3 and re.search(r"(19|20)\d{2}", parts[2]):
                issue_date = re.search(r"(19|20)\d{2}", parts[2]).group(0)  # type: ignore[union-attr]
        url_match = URL_RE.search(line)
        if url_match:
            credential_url = url_match.group(0)
        id_match = re.search(r"\b(?:ID|Credential)[:\s#]+([A-Za-z0-9-]+)", line, re.I)
        if id_match:
            credential_id = id_match.group(1)
        entries.append(
            {
                "name": name[:256],
                "issuer": issuer,
                "issue_date": issue_date,
                "expiration_date": None,
                "credential_id": credential_id,
                "credential_url": credential_url,
                "provenance": _provenance(line, confidence="medium"),
            }
        )
    return legacy[:40], entries[:40]


def _chunk_publications(lines: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for line in lines[:40]:
        if not line.strip():
            continue
        doi = DOI_RE.search(line)
        url = URL_RE.search(line)
        title = line.strip()
        publisher = None
        publication_date = None
        authors: list[str] = []
        # "Title. Journal (2022)" or "Authors. Title. Venue, 2021"
        year = re.search(r"\b((?:19|20)\d{2})\b", line)
        if year:
            publication_date = year.group(1)
        parts = [p.strip() for p in re.split(r"\.\s+", line) if p.strip()]
        if len(parts) >= 2:
            if "," in parts[0] and len(parts[0]) < 120:
                authors = [a.strip() for a in parts[0].split(",") if a.strip()][:40]
                title = parts[1]
                publisher = parts[2] if len(parts) > 2 else None
            else:
                title = parts[0]
                publisher = parts[1] if len(parts) > 1 else None
        if url:
            title = URL_RE.sub("", title).strip(" -|")
        if doi:
            title = DOI_RE.sub("", title).strip(" -|")
        out.append(
            {
                "title": (title or line.strip())[:512],
                "authors": authors,
                "publisher": publisher[:256] if publisher else None,
                "publication_date": publication_date,
                "doi": doi.group(0) if doi else None,
                "url": url.group(0) if url else None,
                "description": line.strip()[:2000],
                "provenance": _provenance(line, confidence="medium"),
            }
        )
    return out


def _skill_groups(lines: list[str]) -> tuple[list[str], list[dict[str, Any]]]:
    flat: list[str] = []
    groups: list[dict[str, Any]] = []
    for line in lines:
        if ":" in line and len(line.split(":", 1)[0]) < 40:
            category, rest = line.split(":", 1)
            skills = [s.strip() for s in re.split(r"[,•|/]", rest) if 1 < len(s.strip()) < 60]
            if skills:
                groups.append({"category": category.strip()[:128], "skills": skills[:100]})
                flat.extend(skills)
            continue
        for s in re.split(r"[,•|/]", line):
            token = s.strip()
            if 1 < len(token) < 60:
                flat.append(token)
    # Deduplicate only normalized exact equivalents
    seen: set[str] = set()
    deduped: list[str] = []
    for skill in flat:
        key = skill.casefold()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(skill)
    return deduped[:200], groups[:40]


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

    skills, skill_groups = _skill_groups(sections.get("skills", []))
    employment = _chunk_experience(sections.get("experience", []))
    education = _chunk_education(sections.get("education", []))
    projects = _chunk_projects(sections.get("projects", []))
    certifications_legacy, certification_entries = _chunk_certifications(sections.get("certifications", []))
    publications = _chunk_publications(sections.get("publications", []))
    contact = _contact_from_text(lines, joined)
    professional_summary = "\n".join(sections.get("summary", [])).strip() or None

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
        or (certification_entries and (contact.get("full_name") or skills))
        or publications
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
                # Role-scoped technologies only — never attach the global skills list.
                "technologies": list(job.get("technologies") or [])[:8],
            }
        )

    return {
        "schema_version": 2,
        "contact": contact,
        "professional_summary": professional_summary,
        "employment": employment,
        "education": education,
        "projects": projects,
        "skills": skills,
        "skill_groups": skill_groups,
        "certifications": certifications_legacy,
        "certification_entries": certification_entries,
        "publications": publications,
        "evidence": evidence,
        "raw_text": joined[:50_000],
        "page_count": None,
        "warnings": warnings,
        "extraction_quality": quality,
        "missing_fields": missing,
        "usable": usable,
    }
