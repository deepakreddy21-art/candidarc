#!/usr/bin/env python3
"""Generate TypeScript path constants + Zod schemas from OpenAPI.

GENERATED files are clearly marked DO NOT EDIT.
Regenerate: npm run contract:python
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
OUT_DIR = REPO / "server" / "intelligence" / "generated"
OPENAPI_PATH = ROOT / "openapi.json"

REQUIRED_PATHS = [
    "/health/live",
    "/health/ready",
    "/metrics",
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

# Schemas emitted as Zod (response + shared domain types used by the TS client).
EMIT_SCHEMAS = [
    "ScoreBreakdown",
    "ResumeBullet",
    "ResumeItem",
    "ResumeSection-Output",
    "ResumeDocument-Output",
    "ProviderUsage",
    "ResumeGenerateResponse",
    "AuditFinding",
    "AuditResponse",
    "FinalQaCheck",
    "FinalQaResponse",
    "JobParseResponse",
    "ResearchFinding",
    "ResearchSynthesizeResponse",
    "EvidenceMatchRow",
    "EvidenceMatchResponse",
    "MistakeMemoryRule",
    "EvidenceItem",
]

SCHEMA_EXPORT_ALIASES = {
    "ResumeSection-Output": "ResumeSection",
    "ResumeDocument-Output": "ResumeDocument",
}


def _safe_ident(name: str) -> str:
    alias = SCHEMA_EXPORT_ALIASES.get(name, name)
    return re.sub(r"[^A-Za-z0-9_]", "_", alias)


def _resolve_ref(ref: str) -> str:
    return ref.rsplit("/", 1)[-1]


def _zod_for_schema(name: str, schema: dict[str, Any], components: dict[str, Any], stack: set[str]) -> str:
    if name in stack:
        return f"z.lazy(() => {_safe_ident(name)}Schema)"
    stack.add(name)
    try:
        return _zod_from_json_schema(schema, components, stack, preferred_name=name)
    finally:
        stack.discard(name)


def _zod_from_json_schema(
    schema: dict[str, Any],
    components: dict[str, Any],
    stack: set[str],
    *,
    preferred_name: str | None = None,
) -> str:
    if "$ref" in schema:
        ref_name = _resolve_ref(schema["$ref"])
        if ref_name in EMIT_SCHEMAS or preferred_name == ref_name:
            return f"{_safe_ident(ref_name)}Schema"
        target = components.get(ref_name, {})
        return _zod_from_json_schema(target, components, stack)

    if "anyOf" in schema or "oneOf" in schema:
        variants = schema.get("anyOf") or schema.get("oneOf") or []
        non_null = [v for v in variants if v.get("type") != "null"]
        nullish = len(non_null) != len(variants)
        if len(non_null) == 1:
            inner = _zod_from_json_schema(non_null[0], components, stack)
            return f"{inner}.nullable()" if nullish else inner
        parts = [_zod_from_json_schema(v, components, stack) for v in non_null]
        union = f"z.union([{', '.join(parts)}])"
        return f"{union}.nullable()" if nullish else union

    if "allOf" in schema:
        # Flatten trivial allOf wrappers.
        parts = schema["allOf"]
        if len(parts) == 1:
            return _zod_from_json_schema(parts[0], components, stack)
        merged: dict[str, Any] = {"type": "object", "properties": {}, "required": []}
        for part in parts:
            resolved = part
            if "$ref" in part:
                resolved = components.get(_resolve_ref(part["$ref"]), {})
            merged["properties"].update(resolved.get("properties") or {})
            merged["required"] = list({*merged.get("required", []), *(resolved.get("required") or [])})
            if "additionalProperties" in resolved:
                merged["additionalProperties"] = resolved["additionalProperties"]
        return _zod_from_json_schema(merged, components, stack)

    enum = schema.get("enum")
    if enum is not None and schema.get("type") == "string":
        lits = ", ".join(json.dumps(v) for v in enum)
        return f"z.enum([{lits}])"

    typ = schema.get("type")
    if isinstance(typ, list):
        non_null = [t for t in typ if t != "null"]
        nullish = "null" in typ
        if len(non_null) == 1:
            inner = _zod_from_json_schema({**schema, "type": non_null[0]}, components, stack)
            return f"{inner}.nullable()" if nullish else inner
        return "z.unknown()"

    if typ == "string":
        z = "z.string()"
        if "minLength" in schema:
            z = f"z.string().min({schema['minLength']})"
        if "maxLength" in schema:
            z = f"{z}.max({schema['maxLength']})" if z != "z.string()" else f"z.string().max({schema['maxLength']})"
        return z
    if typ == "integer":
        z = "z.number().int()"
        if "minimum" in schema:
            z = f"{z}.min({schema['minimum']})"
        if "maximum" in schema:
            z = f"{z}.max({schema['maximum']})"
        return z
    if typ == "number":
        z = "z.number()"
        if "minimum" in schema:
            z = f"{z}.min({schema['minimum']})"
        if "maximum" in schema:
            z = f"{z}.max({schema['maximum']})"
        return z
    if typ == "boolean":
        return "z.boolean()"
    if typ == "array":
        items = schema.get("items") or {}
        inner = _zod_from_json_schema(items, components, stack)
        z = f"z.array({inner})"
        if "minItems" in schema:
            z = f"{z}.min({schema['minItems']})"
        if "maxItems" in schema:
            z = f"{z}.max({schema['maxItems']})"
        return z
    if typ == "object" or "properties" in schema:
        props = schema.get("properties") or {}
        required = set(schema.get("required") or [])
        lines: list[str] = ["z.object({"]
        for key, prop in props.items():
            prop_z = _zod_from_json_schema(prop, components, stack)
            if key not in required:
                # OpenAPI optional → zod optional; nullable handled inside.
                if not prop_z.endswith(".nullable()") and "null" not in json.dumps(prop.get("type")):
                    # Keep defaulted fields optional at parse time.
                    prop_z = f"{prop_z}.optional()"
                else:
                    prop_z = f"{prop_z}.optional()" if not prop_z.endswith(".optional()") else prop_z
            lines.append(f"  {json.dumps(key)}: {prop_z},")
        additional = schema.get("additionalProperties")
        if additional is False:
            lines.append("}).strict()")
        elif additional is True:
            lines.append("}).passthrough()")
        elif isinstance(additional, dict):
            inner = _zod_from_json_schema(additional, components, stack)
            lines.append(f"}}).catchall({inner})")
        else:
            lines.append("})")
        return "\n".join(lines)

    return "z.unknown()"


def _emit_schemas_file(components: dict[str, Any]) -> str:
    lines = [
        "/**",
        " * GENERATED FILE — DO NOT EDIT.",
        " * Zod runtime schemas derived from services/python-backend/openapi.json components.",
        " * Regenerate: npm run contract:python",
        " */",
        "",
        'import { z } from "zod";',
        "",
    ]

    # Emit in dependency-friendly order: referenced schemas first where possible.
    emitted: set[str] = set()
    stack: set[str] = set()

    def emit(name: str) -> None:
        if name in emitted:
            return
        schema = components.get(name)
        if not schema:
            raise SystemExit(f"OpenAPI missing component schema: {name}")
        # Pre-emit $ref dependencies that are in EMIT_SCHEMAS.
        raw = json.dumps(schema)
        for dep in EMIT_SCHEMAS:
            if dep == name:
                continue
            if f'"#/components/schemas/{dep}"' in raw or f"/schemas/{dep}" in raw:
                emit(dep)
        ident = _safe_ident(name)
        body = _zod_for_schema(name, schema, components, stack)
        lines.append(f"export const {ident}Schema = {body};")
        lines.append(f"export type {ident} = z.infer<typeof {ident}Schema>;")
        lines.append("")
        emitted.add(name)

    for name in EMIT_SCHEMAS:
        emit(name)

    lines.append("export const PYTHON_OPENAPI_SCHEMA_NAMES = [")
    for name in sorted(components.keys()):
        lines.append(f"  {json.dumps(name)},")
    lines.append("] as const;")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    if not OPENAPI_PATH.exists():
        from app.main import app

        OPENAPI_PATH.write_text(json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n", encoding="utf-8")

    schema = json.loads(OPENAPI_PATH.read_text(encoding="utf-8"))
    paths = schema.get("paths", {})
    missing = [p for p in REQUIRED_PATHS if p not in paths]
    if missing:
        raise SystemExit(f"OpenAPI missing required paths: {missing}")

    components = schema.get("components", {}).get("schemas", {})
    missing_components = [name for name in EMIT_SCHEMAS if name not in components]
    if missing_components:
        raise SystemExit(f"OpenAPI missing required component schemas: {missing_components}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    paths_ts = [
        "/**",
        " * GENERATED FILE — DO NOT EDIT.",
        " * Source: services/python-backend/openapi.json",
        " * Regenerate: npm run contract:python",
        " */",
        "",
        "export const PYTHON_BACKEND_PATHS = {",
        '  healthLive: "/health/live",',
        '  healthReady: "/health/ready",',
        '  metrics: "/metrics",',
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
        "/** Sorted path keys — used by drift checks alongside full OpenAPI normalize. */",
        "export const PYTHON_OPENAPI_PATHS = [",
        *[f"  {json.dumps(p)}," for p in sorted(paths.keys())],
        "] as const;",
        "",
    ]
    (OUT_DIR / "python-paths.ts").write_text("\n".join(paths_ts), encoding="utf-8")

    schemas_ts = _emit_schemas_file(components)
    (OUT_DIR / "python-schemas.ts").write_text(schemas_ts, encoding="utf-8")

    contract_ts = [
        "/**",
        " * GENERATED FILE — DO NOT EDIT.",
        " * Path catalog + schema presence assertions derived from OpenAPI.",
        " * Runtime response parsing uses ./python-schemas.",
        " */",
        "",
        'import { z } from "zod";',
        'import { PYTHON_BACKEND_PATHS } from "./python-paths";',
        'import { PYTHON_OPENAPI_SCHEMA_NAMES } from "./python-schemas";',
        "",
        "export const pythonPathCatalogSchema = z.object({",
        "  healthLive: z.literal(PYTHON_BACKEND_PATHS.healthLive),",
        "  healthReady: z.literal(PYTHON_BACKEND_PATHS.healthReady),",
        "  metrics: z.literal(PYTHON_BACKEND_PATHS.metrics),",
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
        "export const REQUIRED_PYTHON_COMPONENT_SCHEMAS = [",
        *[f"  {json.dumps(n)}," for n in EMIT_SCHEMAS],
        "] as const;",
        "",
        "for (const name of REQUIRED_PYTHON_COMPONENT_SCHEMAS) {",
        "  if (!(PYTHON_OPENAPI_SCHEMA_NAMES as readonly string[]).includes(name)) {",
        "    throw new Error(`Generated OpenAPI catalog missing schema: ${name}`);",
        "  }",
        "}",
        "",
    ]
    (OUT_DIR / "python-contract.ts").write_text("\n".join(contract_ts), encoding="utf-8")

    print(f"Wrote {OUT_DIR / 'python-paths.ts'}")
    print(f"Wrote {OUT_DIR / 'python-schemas.ts'}")
    print(f"Wrote {OUT_DIR / 'python-contract.ts'}")


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT))
    main()
