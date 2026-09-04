import { z } from "zod";

export const tenantRoleSchema = z.enum(["owner", "admin", "member", "viewer", "support"]);
export type TenantRole = z.infer<typeof tenantRoleSchema>;

export const workflowStageSchema = z.enum([
  "APPLICATION_CREATED",
  "RESEARCH_QUEUED",
  "RESEARCH_RUNNING",
  "RESEARCH_REVIEW_REQUIRED",
  "RESEARCH_COMPLETED",
  "EVIDENCE_MATCHING_RUNNING",
  "EVIDENCE_MATCHING_COMPLETED",
  "V0_GENERATING",
  "V0_READY",
  "HR_AUDIT_1_RUNNING",
  "HR_AUDIT_1_REVIEW",
  "V1_GENERATING",
  "V1_READY",
  "EM_AUDIT_1_RUNNING",
  "EM_AUDIT_1_REVIEW",
  "V2_GENERATING",
  "V2_READY",
  "HR_AUDIT_2_RUNNING",
  "HR_AUDIT_2_REVIEW",
  "V3_GENERATING",
  "V3_READY",
  "EM_AUDIT_2_RUNNING",
  "EM_AUDIT_2_REVIEW",
  "V4_GENERATING",
  "V4_READY",
  "FINAL_QA_RUNNING",
  "FINAL_QA_FAILED",
  "FINAL_READY",
  "CANCELLED",
  "FAILED",
]);
export type WorkflowStage = z.infer<typeof workflowStageSchema>;

export const AUDIT_SEQUENCE = [
  { stage: "HR_AUDIT_1_RUNNING", reviewsVersion: 0, producesVersion: 1, lens: "hr-1" },
  { stage: "EM_AUDIT_1_RUNNING", reviewsVersion: 1, producesVersion: 2, lens: "em-1" },
  { stage: "HR_AUDIT_2_RUNNING", reviewsVersion: 2, producesVersion: 3, lens: "hr-2" },
  { stage: "EM_AUDIT_2_RUNNING", reviewsVersion: 3, producesVersion: 4, lens: "em-2" },
] as const;

export const findingDecisionSchema = z.enum(["accepted", "edited", "rejected", "deferred"]);
export type FindingDecision = z.infer<typeof findingDecisionSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const createApplicationInputSchema = z.object({
  company: z.string().min(1).max(120),
  role: z.string().min(1).max(160).optional(),
  title: z.string().min(1).max(160).optional(),
  location: z.string().max(160).optional(),
  employmentType: z.string().max(64).optional(),
  deadline: z.string().datetime().optional().or(z.string().date().optional()),
  jobUrl: z.string().url().optional(),
  jobDescription: z.string().max(100_000).optional(),
  jobDescriptionText: z.string().max(100_000).optional(),
  roleFamily: z.string().max(120).optional(),
  researchDepth: z.enum(["standard", "deep-team"]).optional(),
  candidateProfileId: z.string().max(160).optional(),
  excludedEvidenceIds: z.array(z.string()).optional(),
  resumeLength: z.enum(["one-page", "two-page"]).optional(),
  experienceLevel: z.string().max(80).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
}).refine((input) => input.role || input.title, { message: "role or title is required" })
  .transform((input) => ({ ...input, role: input.role ?? input.title! }));

export type CreateApplicationInput = z.infer<typeof createApplicationInputSchema>;

export const updateFindingInputSchema = z.object({
  status: findingDecisionSchema,
  editedText: z.string().max(4000).optional(),
  reason: z.string().max(500).optional(),
});

export const QUEUE_NAMES = [
  "research",
  "evidence-matching",
  "resume-generation",
  "resume-audit",
  "document-parsing",
  "pdf-rendering",
  "notifications",
  "maintenance",
  // Radar (Phase 3)
  "source-discovery",
  "ats-ingestion",
  "job-normalization",
  "job-deduplication",
  "job-verification",
  "job-indexing",
  "job-matching",
  "job-alerting",
  "job-expiration",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

