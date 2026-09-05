#!/usr/bin/env python3
"""Fail if committed openapi.json drifts from runtime app.openapi() (full normalize)."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.main import app  # noqa: E402


def normalize(doc: dict) -> str:
    return json.dumps(
        {
            "info": doc.get("info", {}),
            "paths": doc.get("paths", {}),
            "components": doc.get("components", {}),
        },
        sort_keys=True,
        separators=(",", ":"),
    )


def main() -> None:
    path = ROOT / "openapi.json"
    if not path.exists():
        raise SystemExit("openapi.json missing — run npm run contract:python")
    committed = json.loads(path.read_text(encoding="utf-8"))
    runtime = app.openapi()
    if set(committed.get("paths", {})) != set(runtime.get("paths", {})):
        raise SystemExit("OpenAPI path drift")
    committed_schemas = set((committed.get("components") or {}).get("schemas", {}))
    runtime_schemas = set((runtime.get("components") or {}).get("schemas", {}))
    if committed_schemas != runtime_schemas:
        raise SystemExit("OpenAPI schema name drift")
    ch = hashlib.sha256(normalize(committed).encode()).hexdigest()
    rh = hashlib.sha256(normalize(runtime).encode()).hexdigest()
    if ch != rh:
        raise SystemExit("OpenAPI full contract drift — run npm run contract:python")
    print("OpenAPI contract OK", ch)


if __name__ == "__main__":
    main()
