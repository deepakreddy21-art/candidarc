"""Recover document hyperlink targets without fetching or executing them."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlsplit


def safe_link(value: Any) -> str | None:
    if not isinstance(value, str) or len(value) > 512 or re.search(r"\s", value):
        return None
    try:
        url = urlsplit(value)
        if url.scheme.lower() in {"http", "https"} and url.hostname and not url.username and not url.password:
            return value
    except ValueError:
        pass
    return None


def linked_text(label: str, target: Any) -> str:
    url = safe_link(target)
    return f"{label} ({url})" if url and url not in label else label


def strip_link_targets(text: str) -> str:
    """Keep visible names intact when assigning linked entity text to fields."""
    return re.sub(r"\s*\(https?://[^\s)]+\)", "", text, flags=re.I)


def pdf_link_text(page: Any, text: str) -> str:
    """Attach URI annotations to their visible anchor, retaining section ownership.

    Unplaceable or repeated anchors are left alone rather than assigning a project
    link to contact details. Only bounded, external HTTP(S) URI links are read.
    """
    from pypdf import mult

    links: list[tuple[list[float], str]] = []
    for ref in list(page.get("/Annots", []))[:200]:
        try:
            annotation = ref.get_object()
            action = annotation.get("/A")
            if annotation.get("/Subtype") != "/Link" or not action or action.get("/S") != "/URI":
                continue
            uri = safe_link(action.get("/URI"))
            rect = [float(v) for v in annotation.get("/Rect", [])]
            if uri and len(rect) == 4:
                links.append((rect, uri))
        except (AttributeError, TypeError, ValueError):
            continue
    if not links:
        return text

    fragments: list[tuple[float, float, str]] = []
    last_text_position: tuple[float, float] | None = None

    def remember_position(operator: bytes, _operands: Any, cm: Any, tm: Any) -> None:
        nonlocal last_text_position
        if operator in {b"Tj", b"TJ", b"'", b'"'}:
            position = mult(tm, cm)
            last_text_position = (float(position[4]), float(position[5]))

    def visitor(value: str, cm: Any, tm: Any, _font: Any, _size: Any) -> None:
        if value.strip():
            position = mult(tm, cm)
            xy = (float(position[4]), float(position[5]))
            # pypdf can flush a final text fragment after BT resets its matrix.
            # The preceding text-show operand retains the actual anchor position.
            if xy == (0.0, 0.0) and last_text_position is not None:
                xy = last_text_position
            fragments.append((*xy, value.strip()))

    try:
        page.extract_text(visitor_text=visitor, visitor_operand_before=remember_position)
    except (TypeError, ValueError, IndexError):
        return text
    for rect, uri in links:
        if uri in text:
            continue
        x0, y0, x1, y1 = rect
        anchored = sorted(
            ((x, y, value) for x, y, value in fragments if x0 - 1 <= x <= x1 + 1 and y0 - 2 <= y <= y1 + 2),
            key=lambda item: (-item[1], item[0]),
        )
        label = " ".join(value for _x, _y, value in anchored).strip()
        if not label or len(label) > 512:
            continue
        pattern = r"\s+".join(re.escape(part) for part in label.split())
        matches = list(re.finditer(pattern, text))
        if len(matches) == 1:
            match = matches[0]
            text = text[:match.start()] + linked_text(match.group(), uri) + text[match.end():]
    return text
