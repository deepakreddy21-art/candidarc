import type { ApplicationRecord } from "../database/repositories";
import type { Application, ApplicationStatus, WorkflowStage } from "../../src/types/domain";

type BackendStage = string;

/** Complete backend workflow stage → customer UI stage map (production authority). */
const BACKEND_TO_UI_STAGE: Record<string, WorkflowStage> = {
  APPLICATION_CREATED: "research",
  RESEARCH_QUEUED: "research",
  RESEARCH_RUNNING: "research",
  RESEARCH_REVIEW_REQUIRED: "research",
  RESEARCH_COMPLETED: "research",
  EVIDENCE_MATCHING_RUNNING: "evidence-match",
  EVIDENCE_MATCHING_COMPLETED: "evidence-match",
  V0_GENERATING: "resume-v0",
  V0_READY: "resume-v0",
  HR_AUDIT_1_RUNNING: "hr-audit-1",
  HR_AUDIT_1_REVIEW: "hr-audit-1",
  V1_GENERATING: "resume-v1",
  V1_READY: "resume-v1",
  EM_AUDIT_1_RUNNING: "em-audit-1",
  EM_AUDIT_1_REVIEW: "em-audit-1",
  V2_GENERATING: "resume-v2",
  V2_READY: "resume-v2",
  HR_AUDIT_2_RUNNING: "hr-audit-2",
  HR_AUDIT_2_REVIEW: "hr-audit-2",
  V3_GENERATING: "resume-v3",
  V3_READY: "resume-v3",
  EM_AUDIT_2_RUNNING: "em-audit-2",
  EM_AUDIT_2_REVIEW: "em-audit-2",
  V4_GENERATING: "resume-v4",
  V4_READY: "resume-v4",
  FINAL_QA_RUNNING: "final-qa",
  FINAL_QA_FAILED: "final-qa",
  FINAL_READY: "ready",
  CANCELLED: "ready",
  FAILED: "ready",
};

export function mapBackendStageToUi(stage: BackendStage | string): WorkflowStage {
  return BACKEND_TO_UI_STAGE[stage] ?? "research";
}

/**
 * Pure application → UI mapper. Side-effect free — safe for unit tests and API handlers.
 * Does not invent demo identifiers when authorized records omit them.
 */
export function mapApplicationToUi(app: ApplicationRecord): Application {
  const status = (app.archived ? "archived" : app.status) as ApplicationStatus;
  return {
    id: app.publicId,
    company: app.company,
    companyMark: app.companyMark,
    role: app.role,
    location: app.location,
    employmentType: app.employmentType,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    deadline: app.deadline,
    status,
    stage: mapBackendStageToUi(app.stage),
    resumeScore: app.resumeScore,
    evidenceCoverage: app.evidenceCoverage,
    atsAlignment: app.atsAlignment,
    interviewStatus: app.interviewStatus as Application["interviewStatus"],
    researchConfidence: app.researchConfidence,
    ownerProfileId: "",
    jobDescriptionId: app.jobDescriptionPublicId ?? "",
    resumeId: app.resumePublicId ?? "",
    nextAction: app.nextAction,
    archived: app.archived,
    roleFamily: app.roleFamily,
    candidateStatus: (() => {
      const raw = app.metadata?.candidateStatus;
      if (
        raw === "Saved" ||
        raw === "Ready to apply" ||
        raw === "Applied" ||
        raw === "Interviewing" ||
        raw === "Offer" ||
        raw === "Rejected" ||
        raw === "Withdrawn"
      ) {
        return raw;
      }
      return undefined;
    })(),
    version: app.version,
    workflowId:
      typeof app.metadata?.customerWorkflowPublicId === "string"
        ? app.metadata.customerWorkflowPublicId
        : undefined,
  };
}
