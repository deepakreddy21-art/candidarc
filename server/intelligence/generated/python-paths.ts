/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: services/python-backend/openapi.json
 * Regenerate: npm run contract:python
 */

export const PYTHON_BACKEND_PATHS = {
  healthLive: "/health/live",
  healthReady: "/health/ready",
  resumesParse: "/v1/resumes/parse",
  jobsParse: "/v1/jobs/parse",
  researchSynthesize: "/v1/research/synthesize",
  evidenceIndex: "/v1/evidence/index",
  evidenceSearch: "/v1/evidence/search",
  evidenceMatch: "/v1/evidence/match",
  resumesGenerate: "/v1/resumes/generate",
  resumesAudit: "/v1/resumes/audit",
  resumesRegenerate: "/v1/resumes/regenerate",
  resumesFinalQa: "/v1/resumes/final-qa",
} as const;

export type PythonBackendPath = (typeof PYTHON_BACKEND_PATHS)[keyof typeof PYTHON_BACKEND_PATHS];

export const PYTHON_SCHEMA_VERSION =
  "2026-09-resume-intelligence.v1" as const;

/** Sorted path keys — used by drift checks alongside full OpenAPI normalize. */
export const PYTHON_OPENAPI_PATHS = [
  "/health/live",
  "/health/ready",
  "/v1/evidence/index",
  "/v1/evidence/match",
  "/v1/evidence/search",
  "/v1/jobs/parse",
  "/v1/research/synthesize",
  "/v1/resumes/audit",
  "/v1/resumes/final-qa",
  "/v1/resumes/generate",
  "/v1/resumes/parse",
  "/v1/resumes/regenerate",
] as const;
