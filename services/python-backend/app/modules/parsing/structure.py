"""Deterministic résumé section structuring — no invented employers, dates, or metrics."""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.modules.parsing.fields import DATE_RANGE_RE, TITLE_HINT_RE, is_location
from app.modules.parsing.records import (
    chunk_education as _chunk_education,
)
from app.modules.parsing.records import (
    chunk_experience as _chunk_experience,
)
from app.modules.parsing.records import (
    chunk_projects as _chunk_projects,
)

EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
PHONE_RE = re.compile(
    r"(?:"
    r"\+\d{1,3}(?:[\s.-]?\d{2,4}){2,5}"  # international +CC …
    r"|"
    r"(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}"  # NANP-like
    r")"
)
LINKEDIN_RE = re.compile(r"(?:linkedin\.com/in/[\w-]+)", re.I)
GITHUB_RE = re.compile(r"(?:github\.com/[\w-]+)", re.I)
URL_RE = re.compile(r"https?://[^\s)]+", re.I)
DOI_RE = re.compile(r"\b10\.\d{4,9}/[-._;()/:A-Z0-9]+\b", re.I)

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
        "experience", "work experience", "professional experience", "employment", "employment history",
        "career experience", "relevant experience", "work history", "professional history", "work",
        "career history", "professional background", "relevant work experience", "professional and work experience",
        "work and professional experience", "industry experience", "employment experience", "career highlights",
    ),
    "education": ("education", "academic background", "academics", "academic qualifications", "educational qualifications",
                  "educational background", "academic history", "education and qualifications", "qualifications"),
    "projects": ("projects", "project experience", "personal projects", "selected projects", "side projects",
                 "academic projects", "technical projects", "selected technical projects", "research projects",
                 "relevant projects", "key projects", "professional projects", "project work"),
    "skills": ("skills", "technical skills", "core skills", "technologies", "tech stack", "technical expertise",
               "core competencies", "technical competencies", "skills and technologies", "technical proficiencies"),
    "certifications": ("certifications", "certificates", "licenses", "licenses and certifications", "certifications and licenses",
                       "professional certifications", "certifications and training"),
    "publications": ("publications", "papers", "research", "selected publications", "research publications"),
    "summary": ("summary", "professional summary", "profile", "about", "objective", "career summary", "summary of qualifications"),
    "other": ("awards", "honors", "awards and honors", "volunteering", "volunteer experience", "interests", "hobbies",
              "references", "languages", "activities", "leadership activities", "extracurricular activities"),
}


def _normalize_header(line: str) -> str | None:
    cleaned = unicodedata.normalize("NFKC", line).casefold().strip()
    cleaned = re.sub(r"^\s*(?:\d+[.)]\s*|[•#]+\s*)", "", cleaned)
    cleaned = re.sub(r"\s*\(continued\)\s*$", "", cleaned)
    cleaned = re.sub(r"[&/]", " and ", cleaned)
    cleaned = re.sub(r"[\s:—–_-]+", " ", cleaned).strip()
    if not cleaned or len(cleaned) > 64:
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


def _is_current_end(end: str | None) -> bool | None:
    if not end:
        return None
    return bool(re.search(r"^(present|current)$", end.strip(), re.I))


def _looks_like_person_name(text: str) -> bool:
    tokens = [t for t in re.split(r"\s+", text.strip()) if t]
    if not tokens or len(tokens) > 5:
        return False
    if any(re.search(r"\d|@", t) for t in tokens):
        return False
    if TITLE_HINT_RE.search(text):
        return False
    return all(re.match(r"^[A-Za-z][A-Za-z'’.\-]*$", t) for t in tokens)


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
    headline: str | None = None
    for line in lines[:4]:
        if EMAIL_RE.search(line) or PHONE_RE.search(line) or _normalize_header(line):
            continue
        if DATE_RANGE_RE.search(line):
            continue
        candidate = line
        if "|" in line:
            left, right = [p.strip() for p in line.split("|", 1)]
            if _looks_like_person_name(left) and right and not _looks_like_person_name(right):
                candidate = left
                headline = right[:200]
            elif _looks_like_person_name(left):
                candidate = left
        if len(candidate) < 80 and _looks_like_person_name(candidate):
            full_name = re.sub(r"\s+", " ", candidate).strip()
            # Preserve document casing for all-caps names via title-style normalization.
            if full_name.isupper():
                full_name = full_name.title()
            name_line = line
            break
        if len(candidate) < 80 and not DATE_RANGE_RE.search(candidate):
            # Fallback: first short non-contact line, still strip headline after pipe.
            full_name = re.sub(r"\s+", " ", candidate).strip()
            if full_name.isupper():
                full_name = full_name.title()
            name_line = line
            break
    location = None
    for line in lines:
        header = _normalize_header(line)
        if header:
            break
        if "|" in line and TITLE_HINT_RE.search(line) and not EMAIL_RE.search(line):
            continue
        # Contact lines often mix email/phone/location — still accept a state-coded city.
        cells = [re.sub(r"^location\s*:\s*", "", part.strip(), flags=re.I) for part in re.split(r"[|\t]|\s{2,}", line)]
        location = next((part for part in cells if is_location(part)), None)
        if location:
            break
        if ":" in line:
            continue
    name_parts = _split_name(full_name)
    provenance = _provenance(
        name_line or (emails[0] if emails else None),
        confidence="high" if full_name and emails else "medium",
        warnings=["headline_separated"] if headline else None,
    )
    if headline:
        provenance["location_hint"] = f"headline:{headline}"
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
        "provenance": provenance,
    }

def _chunk_certifications(lines: list[str]) -> tuple[list[str], list[dict[str, Any]]]:
    legacy: list[str] = []
    entries: list[dict[str, Any]] = []
    for line in lines[:40]:
        if not line.strip():
            continue
        cleaned = re.sub(r"^[-•*●▪◦?]+\s*", "", line).strip()
        if not cleaned:
            continue
        legacy.append(cleaned)
        issuer = None
        issue_date = None
        credential_id = None
        credential_url = None
        name = cleaned
        parts = [p.strip() for p in re.split(r"\s+[|—-]\s+", cleaned) if p.strip()]
        if len(parts) >= 2:
            name = parts[0]
            # Second token may be issuer or year
            if re.fullmatch(r"(19|20)\d{2}", parts[1]):
                issue_date = parts[1]
            else:
                issuer = parts[1]
            if len(parts) >= 3 and re.search(r"(19|20)\d{2}", parts[2]):
                issue_date = re.search(r"(19|20)\d{2}", parts[2]).group(0)  # type: ignore[union-attr]
        url_match = URL_RE.search(cleaned)
        if url_match:
            credential_url = url_match.group(0)
        id_match = re.search(r"\b(?:ID|Credential)[:\s#]+([A-Za-z0-9-]+)", cleaned, re.I)
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
                "provenance": _provenance(cleaned, confidence="medium"),
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
        inline_content = ""
        if not header and ":" in line:
            label, content = line.split(":", 1)
            header = _normalize_header(label)
            # "Languages: Python, SQL" is a skill group, and "Honors: ..."
            # belongs to its school; these labels do not start other sections.
            if (current == "skills" and label.strip().casefold() == "languages") or (
                current == "education" and label.strip().casefold() == "honors"
            ):
                header = None
            inline_content = content.strip() if header else ""
        if header:
            current = header
            sections.setdefault(current, [])
            if inline_content:
                sections[current].append(inline_content)
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
    record_warnings = [
        f"{section}[{index}].{warning}"
        for section, rows in (("employment", employment), ("education", education), ("projects", projects))
        for index, row in enumerate(rows)
        for warning in row.get("provenance", {}).get("warnings", [])
    ]
    missing.extend(record_warnings)
    quality = "high" if employment and skills and not record_warnings else "medium" if usable else "low"
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
        "missing_fields": list(dict.fromkeys(missing))[:40],
        "usable": usable,
    }
