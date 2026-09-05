/**
 * GENERATED FILE — DO NOT EDIT.
 * Minimal path presence assertions derived from OpenAPI.
 * Full response schemas live in server/intelligence/python-client.ts.
 */

import { z } from "zod";
import { PYTHON_BACKEND_PATHS } from "./python-paths";

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
