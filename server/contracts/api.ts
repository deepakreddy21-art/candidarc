import { z } from "zod";
import {
  createApplicationInputSchema,
  findingDecisionSchema,
  workflowStageSchema,
  apiErrorSchema,
} from "../domain/types";

export { apiErrorSchema };

export const requestIdSchema = z.string().min(1);

export const apiErrorResponseSchema = apiErrorSchema;

/* -------------------------------------------------------------------------- */
/* Applications                                                               */
/* -------------------------------------------------------------------------- */

export const createApplicationRequestSchema = createApplicationInputSchema;
export const updateApplicationRequestSchema = z.object({
  company: z.string().min(1).max(120).optional(),
  role: z.string().min(1).max(160).optional(),
  location: z.string().max(160).optional(),
  employmentType: z.string().max(64).optional(),
  deadline: z.string().optional(),
  roleFamily: z.string().max(120).optional(),
  nextAction: z.string().max(200).optional(),
  jobUrl: z.string().url().optional(),
  jobDescriptionText: z.string().max(100_000).optional(),
});

export const applicationResponseSchema = z.object({
  id: z.string(),
  company: z.string(),
  companyMark: z.string(),
  role: z.string(),
  location: z.string(),
  employmentType: z.string(),
  status: z.string(),
  stage: workflowStageSchema,
  resumeScore: z.number(),
  evidenceCoverage: z.number(),
  atsAlignment: z.number(),
  interviewStatus: z.string(),
  researchConfidence: z.number(),
  deadline: z.string().optional(),
  archived: z.boolean(),
  roleFamily: z.string(),
  nextAction: z.string(),
  resumeId: z.string().optional(),
  workflowId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const listApplicationsQuerySchema = z.object({
  includeArchived: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((v) => v === true || v === "true"),
});

export const archiveApplicationRequestSchema = z.object({
  ids: z.array(z.string()).min(1).max(100).optional(),
});

/* -------------------------------------------------------------------------- */
/* Research                                                                   */
/* -------------------------------------------------------------------------- */

export const startResearchRequestSchema = z.object({
  depth: z.enum(["standard", "deep-team", "priority"]).default("standard"),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const researchStatusResponseSchema = z.object({
  applicationId: z.string(),
  status: z.string(),
  confidence: z.number(),
  stage: workflowStageSchema.optional(),
  workflowId: z.string().optional(),
  findingsCount: z.number(),
  updatedAt: z.string(),
});

export const researchFindingsResponseSchema = z.object({
  applicationId: z.string(),
  findings: z.array(z.record(z.unknown())),
  sources: z.array(z.record(z.unknown())),
  confidence: z.number(),
});

export const reviewFindingRequestSchema = z.object({
  findingId: z.string(),
  useInResumeStrategy: z.boolean().optional(),
  status: z.enum(["verified", "inferred", "unverified", "disputed"]).optional(),
  uncertaintyNote: z.string().max(500).optional(),
});

/* -------------------------------------------------------------------------- */
/* Evidence                                                                   */
/* -------------------------------------------------------------------------- */

export const createEvidenceRequestSchema = z.object({
  title: z.string().min(1).max(200),
  organization: z.string().min(1).max(200),
  situation: z.string().max(4000),
  task: z.string().max(4000),
  actions: z.array(z.string()).default([]),
  result: z.string().max(4000),
  technologies: z.array(z.string()).default([]),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
  verificationStatus: z.enum(["verified", "inferred", "unverified", "disputed"]).default("unverified"),
  privacyLevel: z.enum(["public", "share-safe", "private", "do-not-use"]).default("share-safe"),
  payload: z.record(z.unknown()).optional(),
});

export const updateEvidenceRequestSchema = createEvidenceRequestSchema.partial();

export const matchEvidenceRequestSchema = z.object({
  applicationId: z.string(),
  evidenceIds: z.array(z.string()).min(1),
});

export const excludeEvidenceRequestSchema = z.object({
  applicationId: z.string(),
  evidenceId: z.string(),
  reason: z.string().max(500).optional(),
});

export const attachEvidenceSourceRequestSchema = z.object({
  url: z.string().url().optional(),
  title: z.string().max(200).optional(),
  note: z.string().max(1000).optional(),
});

export const verifyEvidenceClaimRequestSchema = z.object({
  verificationStatus: z.enum(["verified", "inferred", "unverified", "disputed"]),
  note: z.string().max(500).optional(),
});

/* -------------------------------------------------------------------------- */
/* Resumes                                                                    */
/* -------------------------------------------------------------------------- */

export const compareVersionsRequestSchema = z.object({
  leftVersionId: z.string(),
  rightVersionId: z.string(),
});

export const lockResumeContentRequestSchema = z.object({
  versionId: z.string(),
  sectionIds: z.array(z.string()).default([]),
  locked: z.boolean().default(true),
});

export const regenerateResumeRequestSchema = z.object({
  targetVersion: z.number().int().min(0).max(4).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  reason: z.string().max(500).optional(),
});

export const exportResumeRequestSchema = z.object({
  versionId: z.string().optional(),
  format: z.enum(["pdf"]).default("pdf"),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const resumeResponseSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  title: z.string(),
  templateId: z.string(),
  length: z.string(),
  currentVersionId: z.string().nullable(),
  versions: z.array(
    z.object({
      id: z.string(),
      versionLabel: z.string(),
      versionNumber: z.number(),
      score: z.number(),
      notes: z.string(),
      createdAt: z.string(),
    }),
  ),
});

/* -------------------------------------------------------------------------- */
/* Audits                                                                     */
/* -------------------------------------------------------------------------- */

export const updateFindingRequestSchema = z.object({
  status: findingDecisionSchema,
  editedText: z.string().max(4000).optional(),
  reason: z.string().max(500).optional(),
});

export const startNextGenerationRequestSchema = z.object({
  idempotencyKey: z.string().min(8).max(128).optional(),
});

/* -------------------------------------------------------------------------- */
/* Workflows                                                                  */
/* -------------------------------------------------------------------------- */

export const workflowStatusResponseSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  stage: workflowStageSchema,
  status: z.string(),
  attempt: z.number(),
  inputVersion: z.string().optional(),
  outputVersion: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  errorClass: z.string().optional(),
});

export const workflowEventsQuerySchema = z.object({
  sinceSeq: z.coerce.number().int().min(0).optional(),
});

export const cancelWorkflowRequestSchema = z.object({
  reason: z.string().max(500).optional(),
});

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export function formatApiError(code: string, message: string, requestId: string, details?: unknown): ApiErrorBody {
  return {
    error: {
      code,
      message,
      requestId,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

/** Route map documented for /api/v1 (handlers live elsewhere). */
export const API_V1_ROUTES = {
  applications: {
    create: "POST /api/v1/applications",
    list: "GET /api/v1/applications",
    get: "GET /api/v1/applications/:id",
    update: "PATCH /api/v1/applications/:id",
    archive: "POST /api/v1/applications/:id/archive",
    restore: "POST /api/v1/applications/:id/restore",
  },
  research: {
    start: "POST /api/v1/applications/:id/research",
    status: "GET /api/v1/applications/:id/research",
    findings: "GET /api/v1/applications/:id/research/findings",
    review: "POST /api/v1/applications/:id/research/review",
    retry: "POST /api/v1/applications/:id/research/retry",
  },
  evidence: {
    list: "GET /api/v1/evidence",
    create: "POST /api/v1/evidence",
    update: "PATCH /api/v1/evidence/:id",
    attach: "POST /api/v1/evidence/:id/sources",
    verify: "POST /api/v1/evidence/:id/verify",
    match: "POST /api/v1/evidence/match",
    exclude: "POST /api/v1/evidence/exclude",
  },
  resumes: {
    get: "GET /api/v1/applications/:id/resume",
    versions: "GET /api/v1/applications/:id/resume/versions",
    version: "GET /api/v1/applications/:id/resume/versions/:versionId",
    compare: "POST /api/v1/applications/:id/resume/compare",
    lock: "POST /api/v1/applications/:id/resume/lock",
    regenerate: "POST /api/v1/applications/:id/resume/regenerate",
    export: "POST /api/v1/applications/:id/resume/export",
  },
  audits: {
    list: "GET /api/v1/applications/:id/audits",
    findings: "GET /api/v1/applications/:id/audits/:auditId/findings",
    decide: "POST /api/v1/audits/findings/:findingId",
    next: "POST /api/v1/applications/:id/audits/next-generation",
  },
  workflows: {
    status: "GET /api/v1/workflows/:id",
    cancel: "POST /api/v1/workflows/:id/cancel",
    retry: "POST /api/v1/workflows/:id/retry",
    events: "GET /api/v1/workflows/:id/events",
    subscribe: "GET /api/v1/workflows/:id/events/stream",
  },} as const;

