"""Source-preserving field recognition shared by résumé record parsers.

Layout separators and record context establish boundaries. These patterns are
not a database of employers or cities, and an unknown value is never invented.
"""

from __future__ import annotations

import re

MONTH = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?"
DATE = rf"(?:{MONTH}\s+(?:19|20)\d{{2}}|(?:0?[1-9]|1[0-2])[/.-](?:19|20)\d{{2}}|(?:19|20)\d{{2}}(?:-(?:0[1-9]|1[0-2]))?)"
DATE_RANGE_RE = re.compile(
    rf"(?P<start>{DATE})\s*(?:[-–—]|\bto\b)\s*(?P<end>Present|Current|Now|Ongoing|{DATE})(?!\d)", re.I,
)
SINGLE_DATE_RE = re.compile(rf"(?<!\d){DATE}(?!\d)", re.I)
DEGREE_TOKEN_RE = re.compile(
    r"\b(?:"
    r"(?:Bachelor|Master|Doctor|Associate)(?:['’]s|s)?(?:\s+of\s+(?:Science|Arts|Engineering|Technology|Business Administration|Philosophy|Education|Medicine|Law|Fine Arts))?"
    r"|Ph\.?\s?D\.?|B\.?\s?(?:Tech|Eng|Sc|E|S|A)\.?|M\.?\s?(?:Tech|Eng|Sc|E|S|A)\.?|MBA|M\.?B\.?A\.?|BBA|MCA|BCA|MFA|MPH|Ed\.?D\.?|J\.?D\.?|Doctorate|Diploma"
    r")(?!\w)", re.I,
)
TITLE_HINT_RE = re.compile(
    r"\b(?:engineer|developer|architect|manager|analyst|consultant|specialist|scientist|designer|intern|lead|director|officer|administrator|"
    r"programmer|founder|owner|researcher|technician|coordinator|nurse|teacher|accountant|associate|professor|mechanic|physician|attorney)\b", re.I,
)
# Restrict modifiers so company words before a title do not become part of it.
_MODIFIER = (
    r"Senior|Sr\.?|Junior|Jr\.?|Staff|Principal|Lead|Chief|Distinguished|Associate|Assistant|Head|"
    r"Software|Development|Full[- ]?Stack|Frontend|Front[- ]End|Backend|Back[- ]End|Platform|Systems?|"
    r"Data|AI|ML|Machine Learning|Deep Learning|Artificial Intelligence|Research|Cloud|DevOps|SRE|"
    r"Site Reliability|Quality Assurance|QA|Test|Automation|Security|Network|Infrastructure|"
    r"Java|Python|Web|Mobile|Android|iOS|Applications?|Technical|Technology|IT|Engineering|"
    r"Product|Project|Program|Business|Financial|Finance|Sales|Marketing|Operations|Human Resources|"
    r"UX|UI|Registered|Clinical|Mechanical|Electrical|Civil"
)
TITLE_SPAN_RE = re.compile(
    rf"\b(?:(?:{_MODIFIER})\s+)*{TITLE_HINT_RE.pattern}(?:\s+(?:I{{1,3}}|IV|[1-5]))?\b", re.I,
)
INSTITUTION_RE = re.compile(
    r"\b(?:university|universities|institute|institut|college|school|academy|polytechnic|universidad|universidade|université|universität|hochschule|iit|nit)\b", re.I,
)
ORGANIZATION_RE = re.compile(
    r"\b(?:systems|labs|laboratories|technologies|solutions|mutual|capital|consulting|corporation|inc|llc|ltd|gmbh|pvt)\b", re.I,
)
ACTION_RE = re.compile(
    r"^(?:built|developed|designed|delivered|implemented|engineered|led|managed|created|maintained|worked|responsible|"
    r"collaborated|supported|improved|reduced|increased|deployed|operated|utilized|used|conducted|researched|"
    r"optimized|automated|established|architected|integrated|mentored|migrated|protected|structured|tuned|instrumented)\b", re.I,
)
BULLET_RE = re.compile(r"^(?:[-•*●▪◦?]|\d+[.)])\s*")
_WORD = r"[^\W\d_][\w .’'\-]*"
_LOCATION = re.compile(rf"^{_WORD},\s*{_WORD}(?:,\s*{_WORD})?$", re.UNICODE)
REMOTE_RE = re.compile(r"^(?:remote|hybrid|on[- ]?site)(?:\s*\([^\n]+\)|\s*[-,/|]\s*[^\n]+)?$", re.I)


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" ,|;–—\t")


def is_body(line: str) -> bool:
    return bool(BULLET_RE.match(line) or ACTION_RE.match(line))


def split_cells(line: str) -> list[str]:
    # Do not split commas here: they belong to places and company names.
    return [clean(p) for p in re.split(r"\s*[|\t•]\s*|\s{2,}|\s+[@–—]\s+|\s+-\s+|\s+at\s+", line) if clean(p)]


def is_location(value: str) -> bool:
    if REMOTE_RE.fullmatch(value):
        return True
    if TITLE_HINT_RE.search(value) or INSTITUTION_RE.search(value) or len(value) > 100:
        return False
    if ORGANIZATION_RE.search(value) or value.count(",") > 2:
        return False
    return bool(_LOCATION.fullmatch(value))


def split_organization_location(value: str) -> tuple[str, str | None]:
    """Delimited organization, City, Region[, Country]. No city allowlist."""
    comma_parts = [p.strip() for p in value.split(",")]
    if len(comma_parts) >= 3:
        # Region may be written out (Québec) or abbreviated (TX).
        tail = ", ".join(comma_parts[1:])
        if is_location(tail):
            return comma_parts[0], tail
    return value, None


def dates_from(line: str, *, single: bool = False) -> tuple[str, str | None, str | None]:
    match = DATE_RANGE_RE.search(line)
    if match:
        return line[:match.start()] + line[match.end():], match["start"], match["end"]
    if single:
        date = SINGLE_DATE_RE.search(line)
        if date:
            return line[:date.start()] + line[date.end():], None, date.group()
    return line, None, None


def degree_parts(value: str) -> tuple[str | None, str | None]:
    match = DEGREE_TOKEN_RE.match(value)
    if not match:
        return None, None
    degree = match.group().strip()
    field = re.sub(r"^\s*(?:in\b|[-:,])?\s*", "", value[match.end():], flags=re.I).strip(" ()")
    return degree, field or None


def is_current(end: str | None) -> bool | None:
    return bool(re.fullmatch(r"present|current|now|ongoing", end, re.I)) if end else None
