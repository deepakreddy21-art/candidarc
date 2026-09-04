export type FieldConfidence =
  | "VERIFIED"
  | "HIGH_CONFIDENCE"
  | "NEEDS_REVIEW"
  | "SENSITIVE"
  | "UNSUPPORTED"
  | "BLOCKED";

export type ApplicationMode =
  | "prepare_only"
  | "autofill_review"
  | "authorized_submission";

export enum SubmissionState {
  PREPARED = "PREPARED",
  AWAITING_REVIEW = "AWAITING_REVIEW",
  APPROVED = "APPROVED",
  SUBMISSION_STARTED = "SUBMISSION_STARTED",
  SUBMITTED_UNVERIFIED = "SUBMITTED_UNVERIFIED",
  CONFIRMED = "CONFIRMED",
  FAILED = "FAILED",
  BLOCKED = "BLOCKED",
  CANCELLED = "CANCELLED",
}

export type SensitiveQuestionPolicy = {
  sensitive: boolean;
  requiresPerApplicationApproval: boolean;
  allowAutofill: boolean;
  reason?: string;
};

export type ReusableAnswer = {
  id: string;
  tenantId: string;
  userId: string;
  intent: string;
  label: string;
  answer: string | boolean | number | null;
  confidence: FieldConfidence;
  source: "profile" | "user" | "document" | "inferred";
  sensitive: boolean;
  requiresApproval: boolean;
  approvedForOpportunityIds: readonly string[];
  updatedAt: string;
};

export type ApplicationPackage = {
  id: string;
  tenantId: string;
  userId: string;
  opportunityId: string;
  mode: ApplicationMode;
  state: SubmissionState;
  company: string;
  role: string;
  resumeId?: string;
  answers: readonly ReusableAnswer[];
  unresolvedIntents: readonly string[];
  duplicateWarning?: string;
  createdAt: string;
};

export type ApplicationAttempt = {
  id: string;
  packageId: string;
  opportunityId: string;
  mode: ApplicationMode;
  state: SubmissionState;
  startedAt: string;
  completedAt?: string;
  error?: string;
};

export type ApplicationReceipt = {
  id: string;
  attemptId: string;
  opportunityId: string;
  state: SubmissionState.SUBMITTED_UNVERIFIED | SubmissionState.CONFIRMED;
  confirmationId?: string;
  confirmationUrl?: string;
  verificationEvidence?: string;
  receivedAt: string;
};

export const SENSITIVE_INTENTS = [
  "work authorization",
  "sponsorship",
  "citizenship",
  "clearance",
  "criminal",
  "disability",
  "veteran",
  "race",
  "gender",
  "salary",
  "relocation",
  "conflicts",
  "legal attestations",
  "signatures",
  "accuracy declarations",
] as const;

const normalizeIntent = (intent: string) =>
  intent.toLowerCase().replaceAll("_", " ").replaceAll("-", " ").trim();

export function isSensitiveIntent(intent: string): boolean {
  const normalized = normalizeIntent(intent);
  return SENSITIVE_INTENTS.some(
    (sensitive) =>
      normalized === sensitive ||
      normalized.includes(sensitive) ||
      sensitive.includes(normalized),
  );
}

export function classifyFieldConfidence(
  intent: string,
  answer: unknown,
): FieldConfidence {
  if (isSensitiveIntent(intent)) return "SENSITIVE";
  if (answer === undefined || answer === null || answer === "") return "UNSUPPORTED";
  if (typeof answer === "string" && /unknown|not sure|n\/a/i.test(answer)) {
    return "NEEDS_REVIEW";
  }
  if (
    typeof answer === "string" ||
    typeof answer === "boolean" ||
    typeof answer === "number"
  ) {
    return "HIGH_CONFIDENCE";
  }
  return "BLOCKED";
}
