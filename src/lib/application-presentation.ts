import type { Application, ApplicationStatus } from "@/types/domain";

export type ResumeProgress = "Not started" | "Preparing" | "Ready" | "Needs attention";

export type CandidateApplicationStatus =
  | "Saved"
  | "Ready to apply"
  | "Applied"
  | "Interviewing"
  | "Offer"
  | "Rejected"
  | "Withdrawn";

export const CANDIDATE_STATUS_OPTIONS: CandidateApplicationStatus[] = [
  "Saved",
  "Ready to apply",
  "Applied",
  "Interviewing",
  "Offer",
  "Rejected",
  "Withdrawn",
];

const WORKFLOW_HIDDEN = new Set([
  "researching",
  "evidence",
  "resume",
  "auditing",
  "final-qa",
  "draft",
]);

export function mapResumeProgress(app: Pick<Application, "status" | "resumeScore" | "stage">): ResumeProgress {
  if (app.status === "archived") return "Needs attention";
  if (app.status === "ready" || app.resumeScore >= 85) return "Ready";
  if (app.status === "draft" && app.resumeScore <= 0) return "Not started";
  if (WORKFLOW_HIDDEN.has(app.status) || app.resumeScore > 0) return "Preparing";
  if (app.resumeScore <= 0) return "Not started";
  return "Needs attention";
}

export function defaultCandidateStatus(
  app: Pick<Application, "status" | "interviewStatus" | "archived" | "resumeScore"> & {
    candidateStatus?: string | null;
  },
): CandidateApplicationStatus {
  const stored = app.candidateStatus;
  if (
    stored === "Saved" ||
    stored === "Ready to apply" ||
    stored === "Applied" ||
    stored === "Interviewing" ||
    stored === "Offer" ||
    stored === "Rejected" ||
    stored === "Withdrawn"
  ) {
    return stored;
  }
  if (app.archived || app.status === "archived") return "Withdrawn";
  if (app.status === "interviewing" || app.interviewStatus === "completed") return "Interviewing";
  if (app.status === "ready" || app.resumeScore >= 85) return "Ready to apply";
  if (app.status === "draft") return "Saved";
  return "Saved";
}

export function customerNextAction(
  app: Pick<Application, "status" | "resumeScore" | "nextAction"> & {
    candidateStatus?: CandidateApplicationStatus;
    interviewStatus?: Application["interviewStatus"];
    archived?: boolean;
    stage?: Application["stage"];
  },
): string {
  const status = app.candidateStatus ?? defaultCandidateStatus({
    status: app.status,
    interviewStatus: app.interviewStatus ?? "not-started",
    archived: app.archived ?? false,
    resumeScore: app.resumeScore,
    candidateStatus: app.candidateStatus,
  });
  const resume = mapResumeProgress({
    status: app.status,
    resumeScore: app.resumeScore,
    stage: app.stage ?? "research",
  });
  if (resume === "Preparing") return "Wait for resume";
  if (resume === "Not started") return "Tailor resume";
  if (status === "Ready to apply" || status === "Saved") return "Apply on company site";
  if (status === "Applied") return "Follow up";
  if (status === "Interviewing") return "Prepare for interview";
  if (status === "Offer") return "Review offer";
  if (status === "Rejected" || status === "Withdrawn") return "Archive or reopen";
  // Strip internal pipeline jargon from legacy nextAction strings
  const raw = app.nextAction ?? "";
  if (/research|evidence|audit|final.?qa|v\d|hr-|em-/i.test(raw)) {
    return resume === "Ready" ? "Review resume" : "Continue resume";
  }
  return raw || "Review";
}

export function isInternalWorkflowStatus(status: ApplicationStatus | string): boolean {
  return WORKFLOW_HIDDEN.has(status) || /audit|evidence|final-qa|research/i.test(status);
}
