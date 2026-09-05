/**
 * GENERATED FILE — DO NOT EDIT.
 * Path catalog + schema presence assertions derived from OpenAPI.
 * Runtime response parsing uses ./python-schemas.
 */

import { z } from "zod";
import { PYTHON_BACKEND_PATHS } from "./python-paths";
import { PYTHON_OPENAPI_SCHEMA_NAMES } from "./python-schemas";

export const pythonPathCatalogSchema = z.object({
  healthLive: z.literal(PYTHON_BACKEND_PATHS.healthLive),
  healthReady: z.literal(PYTHON_BACKEND_PATHS.healthReady),
  resumesParse: z.literal(PYTHON_BACKEND_PATHS.resumesParse),
  jobsParse: z.literal(PYTHON_BACKEND_PATHS.jobsParse),
  researchSynthesize: z.literal(PYTHON_BACKEND_PATHS.researchSynthesize),
  evidenceIndex: z.literal(PYTHON_BACKEND_PATHS.evidenceIndex),
  evidenceSearch: z.literal(PYTHON_BACKEND_PATHS.evidenceSearch),
  evidenceMatch: z.literal(PYTHON_BACKEND_PATHS.evidenceMatch),
  resumesGenerate: z.literal(PYTHON_BACKEND_PATHS.resumesGenerate),
  resumesAudit: z.literal(PYTHON_BACKEND_PATHS.resumesAudit),
  resumesRegenerate: z.literal(PYTHON_BACKEND_PATHS.resumesRegenerate),
  resumesFinalQa: z.literal(PYTHON_BACKEND_PATHS.resumesFinalQa),
});

export const pythonPathCatalog = pythonPathCatalogSchema.parse(PYTHON_BACKEND_PATHS);

export const REQUIRED_PYTHON_COMPONENT_SCHEMAS = [
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
] as const;

for (const name of REQUIRED_PYTHON_COMPONENT_SCHEMAS) {
  if (!(PYTHON_OPENAPI_SCHEMA_NAMES as readonly string[]).includes(name)) {
    throw new Error(`Generated OpenAPI catalog missing schema: ${name}`);
  }
}
