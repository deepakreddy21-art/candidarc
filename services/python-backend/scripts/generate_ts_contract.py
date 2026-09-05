#!/usr/bin/env python3
"""Generate TypeScript path constants from OpenAPI into server/intelligence/generated/.

GENERATED files are clearly marked DO NOT EDIT.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
OUT_DIR = REPO / "server" / "intelligence" / "generated"
OPENAPI_PATH = ROOT / "openapi.json"

REQUIRED_PATHS = [
    "/health/live",
    "/health/ready",
    "/v1/resumes/parse",
    "/v1/jobs/parse",
    "/v1/research/synthesize",
    "/v1/evidence/index",
    "/v1/evidence/search",
    "/v1/evidence/match",
    "/v1/resumes/generate",
    "/v1/resumes/audit",
    "/v1/resumes/regenerate",
    "/v1/resumes/final-qa",
]


def main() -> None:
    if not OPENAPI_PATH.exists():
        from app.main import app

        OPENAPI_PATH.write_text(json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n", encoding="utf-8")

    schema = json.loads(OPENAPI_PATH.read_text(encoding="utf-8"))
    paths = schema.get("paths", {})
    missing = [p for p in REQUIRED_PATHS if p not in paths]
    if missing:
        raise SystemExit(f"OpenAPI missing required paths: {missing}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    lines = [
        "/**",
        " * GENERATED FILE — DO NOT EDIT.",
        " * Source: services/python-backend/openapi.json",
        " * Regenerate: npm run contract:python",
        " */",
        "",
        "export const PYTHON_BACKEND_PATHS = {",
        '  healthLive: "/health/live",',
        '  healthReady: "/health/ready",',
        '  resumesParse: "/v1/resumes/parse",',
        '  jobsParse: "/v1/jobs/parse",',
        '  researchSynthesize: "/v1/research/synthesize",',
        '  evidenceIndex: "/v1/evidence/index",',
        '  evidenceSearch: "/v1/evidence/search",',
        '  evidenceMatch: "/v1/evidence/match",',
        '  resumesGenerate: "/v1/resumes/generate",',
        '  resumesAudit: "/v1/resumes/audit",',
        '  resumesRegenerate: "/v1/resumes/regenerate",',
        '  resumesFinalQa: "/v1/resumes/final-qa",',
        "} as const;",
        "",
        "export type PythonBackendPath = (typeof PYTHON_BACKEND_PATHS)[keyof typeof PYTHON_BACKEND_PATHS];",
        "",
        "export const PYTHON_SCHEMA_VERSION =",
        f'  {json.dumps(schema.get("info", {}).get("version", "unknown"))} as const;',
        "",
    ]
    (OUT_DIR / "python-paths.ts").write_text("\n".join(lines), encoding="utf-8")

    zod_stub = [
        "/**",
        " * GENERATED FILE — DO NOT EDIT.",
        " * Minimal path presence assertions derived from OpenAPI.",
        " * Full response schemas live in server/intelligence/python-client.ts.",
        " */",
        "",
        'import { z } from "zod";',
        'import { PYTHON_BACKEND_PATHS } from "./python-paths";',
        "",
        "export const pythonPathCatalogSchema = z.object({",
        "  healthLive: z.literal(PYTHON_BACKEND_PATHS.healthLive),",
        "  healthReady: z.literal(PYTHON_BACKEND_PATHS.healthReady),",
        "  resumesParse: z.literal(PYTHON_BACKEND_PATHS.resumesParse),",
        "  jobsParse: z.literal(PYTHON_BACKEND_PATHS.jobsParse),",
        "  researchSynthesize: z.literal(PYTHON_BACKEND_PATHS.researchSynthesize),",
        "  evidenceIndex: z.literal(PYTHON_BACKEND_PATHS.evidenceIndex),",
        "  evidenceSearch: z.literal(PYTHON_BACKEND_PATHS.evidenceSearch),",
        "  evidenceMatch: z.literal(PYTHON_BACKEND_PATHS.evidenceMatch),",
        "  resumesGenerate: z.literal(PYTHON_BACKEND_PATHS.resumesGenerate),",
        "  resumesAudit: z.literal(PYTHON_BACKEND_PATHS.resumesAudit),",
        "  resumesRegenerate: z.literal(PYTHON_BACKEND_PATHS.resumesRegenerate),",
        "  resumesFinalQa: z.literal(PYTHON_BACKEND_PATHS.resumesFinalQa),",
        "});",
        "",
        "export const pythonPathCatalog = pythonPathCatalogSchema.parse(PYTHON_BACKEND_PATHS);",
        "",
    ]
    (OUT_DIR / "python-contract.ts").write_text("\n".join(zod_stub), encoding="utf-8")
    print(f"Wrote {OUT_DIR / 'python-paths.ts'}")
    print(f"Wrote {OUT_DIR / 'python-contract.ts'}")


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT))
    main()
