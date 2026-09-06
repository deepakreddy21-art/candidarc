from __future__ import annotations

import logging
import re
from typing import Any

_PII_PATTERNS = [
    re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I),
    re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
    re.compile(r"\b(?:sk-|sk-ant-)[A-Za-z0-9_-]{10,}\b"),
]

_SENSITIVE_KEYS = {
    "prompt",
    "system",
    "user",
    "raw_text",
    "resume_text",
    "resume",
    "evidence",
    "job_description",
    "content_base64",
    "claim_text",
    "suggested_text",
    "before_text",
}


def redact(value: str) -> str:
    redacted = value
    for pattern in _PII_PATTERNS:
        redacted = pattern.sub("[REDACTED]", redacted)
    # Never keep long resume-like free text in logs.
    if len(redacted) > 240:
        return redacted[:80] + "...[REDACTED_LONG_TEXT]"
    return redacted


def configure_logging(level: str = "info") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format='{"level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
    )


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def safe_extra(payload: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in payload.items():
        if key.lower() in _SENSITIVE_KEYS:
            out[key] = "[REDACTED]"
        elif isinstance(value, str):
            out[key] = redact(value)[:200]
        else:
            out[key] = value
    return out
