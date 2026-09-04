import {
  SubmissionState,
  classifyFieldConfidence,
  isSensitiveIntent,
  type ApplicationAttempt,
  type ApplicationMode,
  type ApplicationPackage,
  type ApplicationReceipt,
  type ReusableAnswer,
} from "./types";

type PackageOptions = {
  mode?: ApplicationMode;
  company?: string;
  role?: string;
  resumeId?: string;
  requiredIntents?: string[];
};

type ReceiptEvidence = {
  confirmationId?: string;
  confirmationUrl?: string;
  verificationEvidence?: string;
};

const id = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function freezePackage(value: ApplicationPackage): ApplicationPackage {
  value.answers.forEach((answer) => {
    Object.freeze(answer.approvedForOpportunityIds);
    Object.freeze(answer);
  });
  Object.freeze(value.answers);
  Object.freeze(value.unresolvedIntents);
  return Object.freeze(value);
}

export class CopilotService {
  private readonly answers = new Map<string, ReusableAnswer>();
  private readonly packages = new Map<string, ApplicationPackage>();
  private readonly packageKeys = new Map<string, string>();
  private readonly attempts = new Map<string, ApplicationAttempt>();
  private readonly receipts = new Map<string, ApplicationReceipt>();
  private readonly appliedOpportunities = new Set<string>();

  constructor() {
    const now = new Date().toISOString();
    const seed = [
      ["full_name", "Full name", "Deepak Reddy Kilaru", "profile"],
      ["preferred_name", "Preferred name", "Deepak", "profile"],
      ["email", "Email", "deepak.kilaru@email.com", "profile"],
      ["phone", "Phone", "+1 (415) 555-0142", "profile"],
      ["location", "Location", "United States", "profile"],
      ["work_authorization", "Authorized to work in the United States", true, "user"],
      ["sponsorship", "Requires employer sponsorship", false, "user"],
    ] as const;
    for (const [intent, label, answer, source] of seed) {
      const sensitive = isSensitiveIntent(intent);
      const record: ReusableAnswer = {
        id: `answer_${intent}`,
        tenantId: "demo",
        userId: "demo",
        intent,
        label,
        answer,
        confidence: classifyFieldConfidence(intent, answer),
        source,
        sensitive,
        requiresApproval: sensitive,
        approvedForOpportunityIds: [],
        updatedAt: now,
      };
      this.answers.set(record.id, record);
    }
  }

  get authorizedSubmissionEnabled(): boolean {
    return process.env.COPILOT_AUTHORIZED_SUBMISSION === "true";
  }

  listAnswers(tenantId: string, userId: string): ReusableAnswer[] {
    return [...this.answers.values()].map((answer) => ({
      ...answer,
      tenantId,
      userId,
      approvedForOpportunityIds: [...answer.approvedForOpportunityIds],
    }));
  }

  approveAnswer(
    tenantId: string,
    userId: string,
    answerId: string,
    opportunityId: string,
  ): ReusableAnswer {
    const current = this.answers.get(answerId);
    if (!current) throw new Error("Answer not found");
    const approved = new Set(current.approvedForOpportunityIds);
    approved.add(opportunityId);
    const updated: ReusableAnswer = {
      ...current,
      tenantId,
      userId,
      approvedForOpportunityIds: [...approved],
      updatedAt: new Date().toISOString(),
    };
    this.answers.set(answerId, updated);
    return updated;
  }

  getOrCreatePackage(
    tenantId: string,
    userId: string,
    opportunityId: string,
    opts: PackageOptions = {},
  ): ApplicationPackage {
    const mode = opts.mode ?? "prepare_only";
    if (mode === "authorized_submission" && !this.authorizedSubmissionEnabled) {
      throw new Error("Authorized submission is disabled by feature flag");
    }
    const key = `${tenantId}:${userId}:${opportunityId}:${mode}`;
    const existingId = this.packageKeys.get(key);
    if (existingId) return this.packages.get(existingId)!;

    const allAnswers = this.listAnswers(tenantId, userId);
    const required = opts.requiredIntents ?? allAnswers.map((answer) => answer.intent);
    const selected = allAnswers.filter((answer) => required.includes(answer.intent));
    const unresolvedIntents = required.filter(
      (intent) => !selected.some((answer) => answer.intent === intent),
    );
    const duplicateWarning = this.checkDuplicateApplication(opportunityId);
    const pkg = freezePackage({
      id: id("pkg"),
      tenantId,
      userId,
      opportunityId,
      mode,
      state: SubmissionState.PREPARED,
      company: opts.company ?? "Cisco",
      role: opts.role ?? "CX AI Software Engineer",
      resumeId: opts.resumeId ?? "resume-cisco",
      answers: selected,
      unresolvedIntents,
      duplicateWarning,
      createdAt: new Date().toISOString(),
    });
    this.packages.set(pkg.id, pkg);
    this.packageKeys.set(key, pkg.id);
    return pkg;
  }

  preparePackage(
    tenantId: string,
    userId: string,
    opportunityId: string,
    opts: PackageOptions = {},
  ): ApplicationPackage {
    return this.getOrCreatePackage(tenantId, userId, opportunityId, opts);
  }

  checkDuplicateApplication(opportunityId: string): string | undefined {
    return this.appliedOpportunities.has(opportunityId)
      ? "You already recorded an application for this opportunity."
      : undefined;
  }

  recordAttempt(packageId: string): ApplicationAttempt {
    const pkg = this.packages.get(packageId);
    if (!pkg) throw new Error("Application package not found");
    if (pkg.mode === "prepare_only") {
      return {
        id: id("attempt"),
        packageId,
        opportunityId: pkg.opportunityId,
        mode: pkg.mode,
        state: SubmissionState.BLOCKED,
        startedAt: new Date().toISOString(),
        error: "Prepare Only mode never submits.",
      };
    }
    if (pkg.mode === "authorized_submission" && !this.authorizedSubmissionEnabled) {
      throw new Error("Authorized submission is disabled by feature flag");
    }
    const blockedSensitive = pkg.answers.some(
      (answer) =>
        answer.sensitive &&
        answer.requiresApproval &&
        !answer.approvedForOpportunityIds.includes(pkg.opportunityId),
    );
    const attempt: ApplicationAttempt = {
      id: id("attempt"),
      packageId,
      opportunityId: pkg.opportunityId,
      mode: pkg.mode,
      state: blockedSensitive
        ? SubmissionState.BLOCKED
        : SubmissionState.SUBMISSION_STARTED,
      startedAt: new Date().toISOString(),
      error: blockedSensitive
        ? "Sensitive answers require approval for this opportunity."
        : undefined,
    };
    this.attempts.set(attempt.id, attempt);
    return attempt;
  }

  confirmReceipt(attemptId: string, evidence: ReceiptEvidence = {}): ApplicationReceipt {
    const attempt = this.attempts.get(attemptId);
    if (!attempt) throw new Error("Application attempt not found");
    const verified = Boolean(
      evidence.confirmationId &&
        (evidence.confirmationUrl || evidence.verificationEvidence),
    );
    const receipt: ApplicationReceipt = {
      id: id("receipt"),
      attemptId,
      opportunityId: attempt.opportunityId,
      state: verified
        ? SubmissionState.CONFIRMED
        : SubmissionState.SUBMITTED_UNVERIFIED,
      ...evidence,
      receivedAt: new Date().toISOString(),
    };
    this.receipts.set(receipt.id, receipt);
    if (verified) this.appliedOpportunities.add(attempt.opportunityId);
    return receipt;
  }
}
