"""Restore immutable career facts from reviewed structured evidence, never company research.

This is document assembly, not generative inference. Unsupported/missing fields remain absent.
"""
from __future__ import annotations

from app.domain.schemas import EvidenceItem, ResumeBullet, ResumeDocument, ResumeItem, ResumeSection

KINDS = {"employment": ("experience", "Professional Experience"), "project": ("projects", "Projects"),
    "education": ("education", "Education"), "certification": ("certifications", "Certifications"),
    "publication": ("publications", "Publications")}


def restore_source_fields(resume: ResumeDocument, evidence: list[EvidenceItem]) -> ResumeDocument:
    result = resume.model_copy(deep=True)
    all_bullets = [b for s in result.sections for b in [*(s.bullets or []), *(b for item in s.items or [] for b in item.bullets)]]
    groups: dict[str, list[ResumeItem]] = {}
    for source in evidence:
        kind = source.source_type or ""
        data = source.details
        if kind not in KINDS or not data:
            continue
        section_type, _ = KINDS[kind]
        def text(key: str) -> str:
            return str(data[key]).strip() if isinstance(data.get(key), str) else ""
        if kind == "employment":
            heading, subheading = text("company"), text("title")
        elif kind == "education":
            heading, subheading = text("institution"), ", ".join(filter(None, [text("degree"), text("field")]))
        elif kind == "project":
            heading, subheading = text("name"), " · ".join(filter(None, [text("role"), text("organization")]))
        elif kind == "certification":
            heading, subheading = text("name"), text("issuer")
        else:
            heading, subheading = text("title"), text("publisher")
        if not heading:
            continue
        # A bullet cannot migrate achievements between employers. Ambiguous multi-source bullets
        # are excluded from canonical role entries. Checks below validate the assembled document.
        bullets = [b for b in all_bullets if source.id in b.evidence_ids and set(b.evidence_ids) == {source.id}]
        if not bullets:
            original = data.get("bullets") or ([data["description"]] if data.get("description") else [])
            bullets = [ResumeBullet(text=line, evidence_ids=[source.id], technologies=[], source_version="reviewed-source")
                for line in original if isinstance(line, str) and line.strip()]
        # Keep optional URLs and publication/certification details in the approved template's
        # text flow. The template itself (fonts, spacing, headings) is unchanged.
        extra_keys = {"education": ["gpa", "honors"], "project": ["url", "repoUrl"],
            "certification": ["credentialId", "credentialUrl"], "publication": ["doi", "url"]}.get(kind, [])
        for key in extra_keys:
            value = text(key)
            if value and not any(value in b.text for b in bullets):
                bullets.append(ResumeBullet(text=value, evidence_ids=[source.id], technologies=[], source_version="reviewed-source"))
        if not bullets:
            # The existing wire format stores evidence IDs on bullets. Preserve attribution even
            # for a credential with no responsibilities; this line contains source facts only.
            bullets = [ResumeBullet(text=subheading or heading, evidence_ids=[source.id], technologies=[], source_version="reviewed-source")]
        authors = data.get("authors")
        if kind == "publication" and isinstance(authors, list):
            author_text = ", ".join(author for author in authors if isinstance(author, str))
            if author_text:
                bullets.append(ResumeBullet(text=author_text, evidence_ids=[source.id], technologies=[], source_version="reviewed-source"))
        start = text("startDate") or text("issueDate") or text("publicationDate")
        end = "Present" if data.get("isCurrent") is True else text("endDate") or text("expirationDate")
        dates = " – ".join(filter(None, [start, end])) or None
        groups.setdefault(section_type, []).append(ResumeItem(heading=heading, subheading=subheading or None,
            location=text("location") or None, dates=dates, bullets=bullets))
    for kind, (section_type, title) in KINDS.items():
        if section_type in groups:
            # Keep source order; remove generated headers that can have merged company/location.
            result.sections = [s for s in result.sections if s.type != section_type]
            result.sections.append(ResumeSection(type=section_type, title=title, items=groups[section_type]))  # type: ignore[arg-type]
    order = ["summary", "skills", "experience", "projects", "education", "certifications", "publications"]
    result.sections.sort(key=lambda s: order.index(s.type))
    for i, section in enumerate(result.sections):
        section.order = i
    return result
