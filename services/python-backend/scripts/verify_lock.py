#!/usr/bin/env python3
"""Fail if requirements locks contain uvicorn[standard] or unpinned uvloop.

CI / Docker rely on `pip install --require-hashes`. uvicorn[standard] pulls
uvloop as an unpinned extra on Linux and breaks hashed installs.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK_FILES = (
    ROOT / "requirements.txt",
    ROOT / "requirements-dev.txt",
    ROOT / "requirements.in",
    ROOT / "pyproject.toml",
)

FORBIDDEN_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("uvicorn[standard]", re.compile(r"(?m)^(?!\s*#).*uvicorn\[standard\]", re.IGNORECASE)),
    ("unpinned uvloop", re.compile(r"(?m)^uvloop(?!\s*==)")),
]


def main() -> int:
    failures: list[str] = []
    for path in LOCK_FILES:
        if not path.exists():
            if path.name in {"requirements.txt", "pyproject.toml"}:
                failures.append(f"missing required file: {path}")
            continue
        text = path.read_text(encoding="utf-8")
        for label, pattern in FORBIDDEN_PATTERNS:
            if pattern.search(text):
                failures.append(f"{path.relative_to(ROOT)}: found {label}")
    if failures:
        print("verify_lock FAILED:", file=sys.stderr)
        for item in failures:
            print(f"  - {item}", file=sys.stderr)
        return 1
    print("verify_lock OK: no uvicorn[standard] or unpinned uvloop")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
