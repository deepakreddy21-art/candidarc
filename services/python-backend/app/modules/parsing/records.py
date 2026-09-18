"""Group résumé lines into records before assigning typed fields.

Unknown text remains in provenance. Missing identity fields lower confidence;
prose is never promoted to an employer, institution, or degree just to fill a slot.
"""

from __future__ import annotations

import re
from typing import Any

from app.modules.parsing.fields import (
    ACTION_RE,
    BULLET_RE,
    DEGREE_TOKEN_RE,
    INSTITUTION_RE,
    TITLE_HINT_RE,
    TITLE_SPAN_RE,
    clean,
    dates_from,
    degree_parts,
    is_body,
    is_current,
    is_location,
    split_cells,
    split_organization_location,
)

_TECHNOLOGIES = (
    "Python", "TypeScript", "JavaScript", "Node.js", "React", "Kubernetes", "PostgreSQL",
    "AWS", "GCP", "Azure", "Docker", "FastAPI", "Next.js", "Redis", "GraphQL", "Java",
    "Go", "Rust", "SQL", "Spark", "TensorFlow", "PyTorch", "Spring Boot", "Kafka",
    "Angular", "Hibernate", "Oracle", "DynamoDB",
)
_GPA = re.compile(r"\bGPA\s*:?\s*([0-9]+(?:\.\d+)?(?:\s*/\s*[0-9]+(?:\.\d+)?)?)", re.I)
_HONORS = re.compile(r"\b(?:summa cum laude|magna cum laude|cum laude|dean['’]?s list|with honors|honors)\b", re.I)
_URL = re.compile(r"(?:https?://|www\.)[^\s|)]+", re.I)


def technologies(lines: list[str]) -> list[str]:
    blob = " ".join(lines)
    return [tech for tech in _TECHNOLOGIES if re.search(rf"\b{re.escape(tech)}\b", blob, re.I)]


def provenance(lines: list[str], warnings: list[str]) -> dict[str, Any]:
    return {
        "source_text": "\n".join(lines)[:4000],
        "confidence": "low" if warnings else "high",
        "warnings": list(dict.fromkeys(warnings))[:20],
        "extracted_or_normalized": "extracted",
    }


def append_bullet(bullets: list[str], line: str) -> None:
    if BULLET_RE.match(line):
        bullets.append(BULLET_RE.sub("", line).strip())
    elif bullets:
        # Preserve a wrapped sentence as one bullet; do not lose its continuation.
        bullets[-1] = f"{bullets[-1]} {line.strip()}"
    else:
        bullets.append(line.strip())


def _role_header(lines: list[str]) -> dict[str, Any]:
    row: dict[str, Any] = dict(title=None, employer=None, location=None, start_date=None, end_date=None)
    unknown: list[str] = []
    warnings: list[str] = []
    for line in lines:
        text, start, end = dates_from(line)
        if start:
            row.update(start_date=start, end_date=end)
        cells = split_cells(text)
        combined_employer_cell = len(cells) == 2 and any(TITLE_HINT_RE.search(cell) for cell in cells)
        for cell in cells:
            label = re.match(r"^(employer|company|job title|title|role|location)\s*:\s*(.+)$", cell, re.I)
            if label:
                field = {"company": "employer", "job title": "title", "role": "title"}.get(label[1].lower(), label[1].lower())
                row[field] = label[2].strip()
                continue
            if combined_employer_cell and not TITLE_HINT_RE.search(cell) and cell.count(",") >= 2:
                organization, location = split_organization_location(cell)
                if location:
                    unknown.append(organization)
                    row["location"] = location
                    continue
            if is_location(cell):
                row["location"] = cell
                continue
            title = TITLE_SPAN_RE.search(cell)
            if title:
                before, after = clean(cell[:title.start()]), clean(cell[title.end():])
                if after and is_location(after):
                    row["location"] = after
                    after = ""
                if not before and not after:
                    row["title"] = cell
                elif before and not after:
                    # "Example Labs Software Engineer". A recognized multiword title
                    # gives an independent boundary; a bare "Engineer" does not.
                    if " " in title.group():
                        row["title"], row["employer"] = title.group(), before
                    else:
                        row["title"] = cell
                        warnings.append("ambiguous_title_employer_boundary")
                elif not before and after:
                    # "Software Engineer Example Labs, City, Country".
                    company, location = split_organization_location(after)
                    row["title"], row["employer"] = title.group(), company
                    row["location"] = location or row["location"]
                else:
                    unknown.append(cell)
                    warnings.append("ambiguous_role_header")
                continue
            organization, location = split_organization_location(cell)
            if location:
                row["location"] = location
            unknown.append(organization)
    if row["title"] and not row["employer"] and len(unknown) == 1:
        row["employer"] = unknown.pop()
    if unknown:
        warnings.append("unassigned_role_header")
    row["is_current"] = is_current(row["end_date"])
    row["_warnings"] = warnings
    return row


def _header_window(lines: list[str], start: int) -> list[str]:
    out: list[str] = []
    for line in lines[start:start + 5]:
        if is_body(line) or len(line) > 220 or (line[:1].islower() and not TITLE_HINT_RE.search(line)):
            break
        out.append(line)
    return out


def chunk_experience(lines: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    header: list[str] = []
    bullets: list[str] = []
    source: list[str] = []
    shared_employer: str | None = None

    def flush() -> None:
        nonlocal header, bullets, source, shared_employer
        if not (header or bullets):
            return
        row = _role_header(header)
        # Only inherit when an employer was explicitly declared on a separate
        # group header, never from an unrelated previous job's combined header.
        if len(header) >= 2 and row["employer"] == clean(header[0]):
            shared_employer = row["employer"]
        if not row["employer"] and row["title"] and shared_employer:
            row["employer"] = shared_employer
        elif row["employer"] and row["employer"] != shared_employer:
            shared_employer = None
        warnings = row.pop("_warnings")
        warnings.extend(f"missing_{key}" for key in ("title", "employer") if not row[key])
        row.update(bullets=bullets, technologies=technologies(bullets), source_order=len(out),
                   provenance=provenance(source, warnings))
        out.append(row)
        header, bullets, source = [], [], []

    for index, line in enumerate(lines):
        if bullets and not is_body(line):
            candidate = _role_header(_header_window(lines, index))
            if candidate["title"] and (candidate["employer"] or candidate["start_date"]):
                flush()
        source.append(line)
        if is_body(line) or bullets:
            append_bullet(bullets, line)
        else:
            header.append(line)
    flush()
    return out[:40]


def _education_line(line: str) -> dict[str, Any]:
    row: dict[str, Any] = {}
    text, start, end = dates_from(line, single=True)
    if start:
        row["start_date"] = start
    if end:
        row["end_date"] = end
    gpa, honors = _GPA.search(text), _HONORS.search(text)
    if gpa:
        row["gpa"] = gpa[1]
        text = text[:gpa.start()] + text[gpa.end():]
    if honors:
        row["honors"] = honors.group()
        text = _HONORS.sub("", text)
    cells = split_cells(text)
    unknown: list[str] = []
    for cell in cells:
        label = re.match(r"^(institution|university|school|degree|field of study|major|location)\s*:\s*(.+)$", cell, re.I)
        if label:
            field = {"school": "institution", "university": "institution", "major": "field", "field of study": "field"}.get(label[1].lower(), label[1].lower())
            row[field] = label[2]
            continue
        # Degree | Major | School, City, Country (including acronym schools).
        if row.get("degree") and not row.get("institution") and cell.count(",") >= 2:
            institution, location = split_organization_location(cell)
            if location and (not unknown or not row.get("field")):
                row["institution"], row["location"] = institution, location
                if unknown and not row.get("field"):
                    row["field"] = unknown.pop(0)
                continue
        if is_location(cell):
            row["location"] = cell
            continue
        degree, field = degree_parts(cell)
        if degree:
            row["degree"] = degree
            if field:
                row["field"] = field
            continue
        # Institution then degree on one line, with no delimiter.
        degree_match = DEGREE_TOKEN_RE.search(cell)
        if degree_match and degree_match.start() > 0:
            row["institution"] = clean(cell[:degree_match.start()])
            degree, field = degree_parts(cell[degree_match.start():])
            row["degree"] = degree
            if field:
                row["field"] = field
            continue
        institution, location = split_organization_location(cell)
        if location:
            row["location"] = location
        if INSTITUTION_RE.search(institution):
            row["institution"] = institution
        elif institution:
            unknown.append(institution)
    # Degree | Field | School also works for an acronym-only institution (MIT).
    if row.get("degree") and unknown:
        if not row.get("field") and len(unknown) >= 2:
            row["field"] = unknown.pop(0)
        if not row.get("institution"):
            row["institution"] = unknown.pop()
        if not row.get("field") and unknown:
            row["field"] = unknown.pop(0)
    row["_unknown"] = unknown
    return row


def chunk_education(lines: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    current: dict[str, Any] = {}
    source: list[str] = []
    unresolved: list[str] = []

    def flush() -> None:
        nonlocal current, source, unresolved
        if not source:
            return
        # A standalone school is useful; a responsibility sentence is not a school.
        warnings = [f"missing_{key}" for key in ("institution", "degree") if not current.get(key)]
        if unresolved:
            warnings.append("unassigned_education_text")
        row = {key: current.get(key) for key in ("institution", "degree", "field", "location", "start_date", "end_date", "gpa", "honors")}
        row["provenance"] = provenance(source, warnings)
        out.append(row)
        current, source, unresolved = {}, [], []

    for line in lines:
        values = _education_line(line)
        unknown = values.pop("_unknown")
        if unknown and not is_body(line):
            # Context, not an institute allowlist: standalone "MIT" or "Stanford".
            candidate = unknown[0]
            if len(unknown) == 1 and len(candidate) < 150:
                if current.get("degree") and not current.get("field") and not current.get("institution"):
                    # No source boundary proves whether this is school or major.
                    unresolved.append(candidate)
                else:
                    values["institution"] = candidate
                    unknown = []
        starts_new_school = bool(values.get("institution") and current.get("institution"))
        starts_new_degree = bool(values.get("degree") and current.get("degree"))
        if starts_new_school or starts_new_degree:
            flush()
        source.append(line)
        current.update({k: v for k, v in values.items() if v})
        unresolved.extend(unknown)
    flush()
    return out[:20]


def _project_header(line: str) -> dict[str, Any]:
    text, start, end = dates_from(line)
    urls = _URL.findall(text)
    text = _URL.sub("", text)
    cells = split_cells(text)
    row: dict[str, Any] = dict(name=cells[0] if cells else None, role=None, organization=None,
                              start_date=start, end_date=end, description="", bullets=[], technologies=[], url=None, repo_url=None)
    for cell in cells[1:]:
        if TITLE_HINT_RE.search(cell) and not row["role"]:
            row["role"] = cell
        elif not row["organization"]:
            row["organization"] = cell
    for url in urls:
        row["repo_url" if "github.com/" in url.lower() else "url"] = url
    return row


def chunk_projects(lines: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    source: list[str] = []

    def flush() -> None:
        nonlocal current, source
        if current is not None:
            current["description"] = " ".join(current["bullets"])
            current["technologies"] = list(dict.fromkeys(current["technologies"] + technologies(current["bullets"])))
            current["provenance"] = provenance(source, [] if current["name"] else ["missing_project_name"])
            out.append(current)
        current, source = None, []

    for line in lines:
        urls = _URL.findall(line)
        if current is not None and urls and not _URL.sub("", line).strip(" |"):
            for url in urls:
                current["repo_url" if "github.com/" in url.lower() else "url"] = url
            source.append(line)
            continue
        text, start, end = dates_from(line)
        if current is not None and start and not clean(text):
            current.update(start_date=start, end_date=end)
            source.append(line)
            continue
        meta = re.match(r"^(Role|Organization|Client|Stack|Technologies)\s*:\s*(.+)$", line, re.I)
        if current is not None and meta:
            if meta[1].lower() in ("stack", "technologies"):
                current["technologies"].extend([s.strip() for s in re.split(r"[,|]", meta[2]) if s.strip()])
            else:
                current["role" if meta[1].lower() == "role" else "organization"] = meta[2]
            source.append(line)
            continue
        continuation = current is not None and bool(current["bullets"]) and (
            line[:1].islower() or len(line) > 120 or ACTION_RE.match(line)
        )
        if is_body(line) or continuation:
            if current is None:
                current = _project_header("")
            append_bullet(current["bullets"], line)
        else:
            flush()
            current = _project_header(line)
        source.append(line)
    flush()
    return out[:20]
