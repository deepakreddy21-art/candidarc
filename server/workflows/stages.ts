import { AUDIT_SEQUENCE, type WorkflowStage, AppError } from "../domain/types";

/** Ordered happy-path stages (excludes CANCELLED/FAILED terminal branches). */
export const STAGE_ORDER: WorkflowStage[] = [
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
  "FINAL_READY",
];

const TRANSITIONS: Partial<Record<WorkflowStage, WorkflowStage[]>> = {
  APPLICATION_CREATED: ["RESEARCH_QUEUED", "CANCELLED", "FAILED"],
  RESEARCH_QUEUED: ["RESEARCH_RUNNING", "CANCELLED", "FAILED"],
  RESEARCH_RUNNING: ["RESEARCH_REVIEW_REQUIRED", "RESEARCH_COMPLETED", "CANCELLED", "FAILED"],
  RESEARCH_REVIEW_REQUIRED: ["RESEARCH_COMPLETED", "RESEARCH_RUNNING", "CANCELLED", "FAILED"],
  RESEARCH_COMPLETED: ["EVIDENCE_MATCHING_RUNNING", "CANCELLED", "FAILED"],
  EVIDENCE_MATCHING_RUNNING: ["EVIDENCE_MATCHING_COMPLETED", "CANCELLED", "FAILED"],
  EVIDENCE_MATCHING_COMPLETED: ["V0_GENERATING", "CANCELLED", "FAILED"],
  V0_GENERATING: ["V0_READY", "CANCELLED", "FAILED"],
  V0_READY: ["HR_AUDIT_1_RUNNING", "CANCELLED", "FAILED"],
  HR_AUDIT_1_RUNNING: ["HR_AUDIT_1_REVIEW", "CANCELLED", "FAILED"],
  HR_AUDIT_1_REVIEW: ["V1_GENERATING", "CANCELLED", "FAILED"],
  V1_GENERATING: ["V1_READY", "CANCELLED", "FAILED"],
  V1_READY: ["EM_AUDIT_1_RUNNING", "CANCELLED", "FAILED"],
  EM_AUDIT_1_RUNNING: ["EM_AUDIT_1_REVIEW", "CANCELLED", "FAILED"],
  EM_AUDIT_1_REVIEW: ["V2_GENERATING", "CANCELLED", "FAILED"],
  V2_GENERATING: ["V2_READY", "CANCELLED", "FAILED"],
  V2_READY: ["HR_AUDIT_2_RUNNING", "CANCELLED", "FAILED"],
  HR_AUDIT_2_RUNNING: ["HR_AUDIT_2_REVIEW", "CANCELLED", "FAILED"],
  HR_AUDIT_2_REVIEW: ["V3_GENERATING", "CANCELLED", "FAILED"],
  V3_GENERATING: ["V3_READY", "CANCELLED", "FAILED"],
  V3_READY: ["EM_AUDIT_2_RUNNING", "CANCELLED", "FAILED"],
  EM_AUDIT_2_RUNNING: ["EM_AUDIT_2_REVIEW", "CANCELLED", "FAILED"],
  EM_AUDIT_2_REVIEW: ["V4_GENERATING", "CANCELLED", "FAILED"],
  V4_GENERATING: ["V4_READY", "CANCELLED", "FAILED"],
  V4_READY: ["FINAL_QA_RUNNING", "CANCELLED", "FAILED"],
  FINAL_QA_RUNNING: ["FINAL_READY", "FINAL_QA_FAILED", "CANCELLED", "FAILED"],
  FINAL_QA_FAILED: ["FINAL_QA_RUNNING", "CANCELLED", "FAILED"],
  FINAL_READY: [],
  CANCELLED: [],
  FAILED: ["RESEARCH_QUEUED", "EVIDENCE_MATCHING_RUNNING", "V0_GENERATING", "HR_AUDIT_1_RUNNING", "EM_AUDIT_1_RUNNING", "HR_AUDIT_2_RUNNING", "EM_AUDIT_2_RUNNING", "V4_GENERATING", "FINAL_QA_RUNNING"],
};

export function canTransition(from: WorkflowStage, to: WorkflowStage): boolean {
  if (from === to) return true;
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(from: WorkflowStage, to: WorkflowStage): void {
  if (!canTransition(from, to)) {
    throw new AppError("INVALID_STAGE_TRANSITION", `Cannot transition from ${from} to ${to}`, 409);
  }
}

export function nextStage(current: WorkflowStage): WorkflowStage | null {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx === -1 || idx === STAGE_ORDER.length - 1) return null;
  // Skip FINAL_QA_FAILED which is not in happy path order between RUNNING and READY
  return STAGE_ORDER[idx + 1] ?? null;
}

export function stageIndex(stage: WorkflowStage): number {
  return STAGE_ORDER.indexOf(stage);
}

/**
 * HR1 reviews V0, EM1 reviews V1, HR2 reviews V2, EM2 reviews V3.
 * V4 is produced only after EM Audit 2.
 */
export function assertAuditOrder(opts: {
  stage: WorkflowStage;
  reviewsVersion: number;
  producesVersion?: number;
}): void {
  const rule = AUDIT_SEQUENCE.find((r) => r.stage === opts.stage);
  if (rule) {
    if (opts.reviewsVersion !== rule.reviewsVersion) {
      throw new AppError(
        "AUDIT_ORDER_VIOLATION",
        `${rule.lens} must review V${rule.reviewsVersion}, got V${opts.reviewsVersion}`,
        409,
      );
    }
    if (opts.producesVersion !== undefined && opts.producesVersion !== rule.producesVersion) {
      throw new AppError(
        "AUDIT_ORDER_VIOLATION",
        `${rule.lens} must produce V${rule.producesVersion}, got V${opts.producesVersion}`,
        409,
      );
    }
    return;
  }

  if (opts.stage === "V4_GENERATING" || opts.stage === "V4_READY") {
    if (opts.producesVersion !== undefined && opts.producesVersion !== 4) {
      throw new AppError("AUDIT_ORDER_VIOLATION", "V4 stage must produce version 4", 409);
    }
    if (opts.reviewsVersion !== 3) {
      throw new AppError("AUDIT_ORDER_VIOLATION", "V4 must be generated from EM Audit 2 / V3 findings", 409);
    }
  }
}

/** Explicit stage → queue mapping. Completed / review / terminal stages enqueue nothing. */
const STAGE_QUEUE_MAP: Partial<Record<WorkflowStage, string>> = {
  RESEARCH_QUEUED: "research",
  RESEARCH_RUNNING: "research",
  EVIDENCE_MATCHING_RUNNING: "evidence-matching",
  V0_GENERATING: "resume-generation",
  V1_GENERATING: "resume-generation",
  V2_GENERATING: "resume-generation",
  V3_GENERATING: "resume-generation",
  V4_GENERATING: "resume-generation",
  HR_AUDIT_1_RUNNING: "resume-audit",
  EM_AUDIT_1_RUNNING: "resume-audit",
  HR_AUDIT_2_RUNNING: "resume-audit",
  EM_AUDIT_2_RUNNING: "resume-audit",
  FINAL_QA_RUNNING: "resume-audit",
};

export function queueForStage(stage: WorkflowStage): string | null {
  return STAGE_QUEUE_MAP[stage] ?? null;
}

/** When a job claims a *_QUEUED stage, the run may already be on the running counterpart. */
export function runningCounterpartForQueuedStage(stage: WorkflowStage): WorkflowStage | null {
  if (!stage.endsWith("_QUEUED")) return null;
  return stage.replace(/_QUEUED$/, "_RUNNING") as WorkflowStage;
}

export function stageMatchesJobClaim(actual: WorkflowStage, claimed: WorkflowStage): boolean {
  if (actual === claimed) return true;
  const running = runningCounterpartForQueuedStage(claimed);
  return running !== null && actual === running;
}

export function stageClaimKey(stage: WorkflowStage): string {
  return `claimed:${stage}`;
}

export function isTerminalStage(stage: WorkflowStage): boolean {
  return stage === "FINAL_READY" || stage === "CANCELLED" || stage === "FAILED";
}

export function isReviewPause(stage: WorkflowStage): boolean {
  return stage.endsWith("_REVIEW") || stage === "RESEARCH_REVIEW_REQUIRED" || stage.endsWith("_READY");
}
