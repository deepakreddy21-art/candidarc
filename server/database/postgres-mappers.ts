import type {
  ApplicationRecord,
  AuditFindingRecord,
  AuditRunRecord,
  CandidateProfileRecord,
  EvidenceRecord,
  MistakeMemoryRuleRecord,
  ResearchRunRecord,
  ResumeRecord,
  ResumeVersionRecord,
  SessionRecord,
  StoredFileRecord,
  TenantRecord,
  UsageLedgerRecord,
  UserRecord,
  WorkflowRunRecord,
} from "./repositories";
import * as s from "./schema";

export const iso = (value: Date | null | undefined) => value?.toISOString();

export function mapUser(row?: typeof s.users.$inferSelect): UserRecord | null {
  return row
    ? {
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        deletedAt: iso(row.deletedAt) ?? null,
      }
    : null;
}

export function mapTenant(row: typeof s.tenants.$inferSelect): TenantRecord {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export function mapSession(row?: typeof s.sessions.$inferSelect): SessionRecord | null {
  return row
    ? {
        ...row,
        expiresAt: row.expiresAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        revokedAt: iso(row.revokedAt) ?? null,
      }
    : null;
}

export function mapApplication(row?: typeof s.applications.$inferSelect): ApplicationRecord | null {
  return row
    ? {
        ...row,
        companyMark: row.companyMark ?? "",
        location: row.location ?? "",
        employmentType: row.employmentType ?? "",
        deadline: row.deadline ?? undefined,
        roleFamily: row.roleFamily ?? "",
        nextAction: row.nextAction ?? "",
        jobDescriptionPublicId: undefined,
        resumePublicId: undefined,
        ownerUserId: row.ownerUserId ?? "",
        candidateProfileId: row.candidateProfileId ?? null,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        deletedAt: iso(row.deletedAt) ?? null,
      }
    : null;
}

export function mapEvidence(
  row: typeof s.evidenceItems.$inferSelect,
  matchInfo?: { matched: string[]; excluded: string[] },
): EvidenceRecord {
  return {
    id: row.id,
    publicId: row.publicId,
    tenantId: row.tenantId,
    ownerUserId: row.ownerUserId ?? null,
    candidateProfileId: row.candidateProfileId ?? null,
    title: row.title,
    organization: row.organization ?? "",
    situation: row.situation ?? "",
    task: row.task ?? "",
    actions: row.actions ?? [],
    result: row.result ?? "",
    technologies: row.technologies ?? [],
    confidence: row.confidence,
    verificationStatus: row.verificationStatus,
    privacyLevel: row.privacyLevel,
    excludedFromApplicationIds: matchInfo?.excluded ?? [],
    matchedApplicationIds: matchInfo?.matched ?? [],
    payload: row.payload ?? {},
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: iso(row.deletedAt) ?? null,
  };
}

export function mapResume(
  row: typeof s.resumes.$inferSelect,
  applicationPublicId: string,
  currentVersionPublicId: string | null,
): ResumeRecord {
  return {
    id: row.id,
    publicId: row.publicId,
    tenantId: row.tenantId,
    applicationId: row.applicationId,
    applicationPublicId,
    title: row.title,
    templateId: row.templateId,
    length: row.length,
    currentVersionPublicId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: iso(row.deletedAt) ?? null,
  };
}

export function mapResumeVersion(
  row: typeof s.resumeVersions.$inferSelect,
  sections: unknown[],
): ResumeVersionRecord {
  return {
    id: row.id,
    publicId: row.publicId,
    tenantId: row.tenantId,
    resumeId: row.resumeId,
    versionNumber: row.versionNumber,
    versionLabel: row.versionLabel,
    score: row.score,
    scoreBreakdown: row.scoreBreakdown ?? {},
    notes: row.notes ?? "",
    triggeredBy: row.triggeredBy ?? "",
    sections,
    idempotencyKey: row.idempotencyKey ?? "",
    promptVersion: row.promptVersion ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapAuditRun(
  row: typeof s.auditRuns.$inferSelect,
  applicationPublicId: string,
): AuditRunRecord {
  return {
    id: row.id,
    publicId: row.publicId,
    tenantId: row.tenantId,
    applicationId: row.applicationId,
    applicationPublicId,
    lens: row.lens,
    label: row.label,
    reviewsVersion: row.reviewsVersion,
    producesVersion: row.producesVersion ?? undefined,
    status: row.status,
    scoreBefore: row.scoreBefore,
    scoreAfter: row.scoreAfter ?? undefined,
    summary: row.summary ?? "",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: iso(row.completedAt),
  };
}

export function mapAuditFinding(
  row: typeof s.auditFindings.$inferSelect,
  auditRunPublicId: string,
): AuditFindingRecord {
  return {
    id: row.id,
    publicId: row.publicId,
    tenantId: row.tenantId,
    auditRunId: row.auditRunId,
    auditRunPublicId,
    severity: row.severity,
    status: row.status,
    section: row.section ?? "",
    title: row.title,
    explanation: row.explanation,
    beforeText: row.beforeText ?? "",
    suggestedText: row.suggestedText ?? "",
    evidenceSource: row.evidenceSource ?? undefined,
    expectedScoreImpact: row.expectedScoreImpact ?? 0,
    editedText: row.editedText ?? undefined,
  };
}

export function mapResearchRun(
  row: typeof s.researchRuns.$inferSelect,
  applicationPublicId: string,
  findings: unknown[],
  sources: unknown[],
): ResearchRunRecord {
  return {
    id: row.id,
    publicId: row.publicId,
    tenantId: row.tenantId,
    applicationId: row.applicationId,
    applicationPublicId,
    status: row.status,
    depth: row.depth,
    confidence: row.confidence ?? 0,
    findings,
    sources,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: iso(row.completedAt),
  };
}

export function mapUsage(row: typeof s.usageLedger.$inferSelect): UsageLedgerRecord {
  return {
    id: row.id,
    publicId: row.publicId,
    tenantId: row.tenantId,
    userId: row.userId ?? undefined,
    kind: row.kind,
    units: String(row.units),
    costCents: String(row.costCents),
    workflowRunId: row.workflowRunId ?? undefined,
    idempotencyKey: row.idempotencyKey,
    status: (row.status ?? "committed") as UsageLedgerRecord["status"],
    metadata: row.metadata ?? {},
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapStoredFile(row?: typeof s.storedFiles.$inferSelect): StoredFileRecord | null {
  return row
    ? {
        id: row.id,
        publicId: row.publicId,
        tenantId: row.tenantId,
        ownerUserId: row.ownerUserId ?? "",
        purpose: row.purpose,
        storageKey: row.storageKey,
        mimeType: row.mimeType,
        size: row.sizeBytes,
        checksum: row.checksum ?? undefined,
        scanStatus: row.scanStatus,
        retentionState: row.retentionState,
        physicalDeleteAt: iso(row.physicalDeleteAt),
        createdAt: row.createdAt.toISOString(),
        deletedAt: iso(row.deletedAt) ?? null,
      }
    : null;
}

export function mapCandidateProfile(row?: typeof s.candidateProfiles.$inferSelect): CandidateProfileRecord | null {
  return row
    ? {
        id: row.id,
        publicId: row.publicId,
        tenantId: row.tenantId,
        userId: row.userId,
        fullName: row.fullName,
        preferredName: row.preferredName,
        email: row.email,
        phone: row.phone,
        location: row.location,
        linkedIn: row.linkedIn,
        github: row.github,
        portfolio: row.portfolio,
        headline: row.headline,
        summary: row.summary,
        experienceLevel: row.experienceLevel,
        yearsExperience: row.yearsExperience,
        targetRoleFamilies: row.targetRoleFamilies ?? [],
        preferredResumeLength: row.preferredResumeLength,
        careerGoal: row.careerGoal,
        avatarInitials: row.avatarInitials,
        remoteOk: row.remoteOk ?? true,
        preferredLocations: row.preferredLocations ?? [],
        workAuthorization: row.workAuthorization,
        requiresSponsorship: row.requiresSponsorship,
        onboardingStep: row.onboardingStep ?? 0,
        onboardingCompletedAt: iso(row.onboardingCompletedAt) ?? null,
        modelImprovementOptIn: row.modelImprovementOptIn ?? false,
        sourceResumeFilePublicId: row.sourceResumeFilePublicId,
        resumeImportStatus: row.resumeImportStatus,
        resumeImportExtraction: row.resumeImportExtraction ?? null,
        version: row.version,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        deletedAt: iso(row.deletedAt) ?? null,
      }
    : null;
}

export function mapWorkflow(row?: typeof s.workflowRuns.$inferSelect, applicationPublicId = ""): WorkflowRunRecord | null {
  return row
    ? {
        ...row,
        applicationPublicId,
        inputVersion: row.inputVersion ?? undefined,
        outputVersion: row.outputVersion ?? undefined,
        provider: row.provider ?? undefined,
        model: row.model ?? undefined,
        promptVersion: row.promptVersion ?? undefined,
        tokenUsage: row.tokenUsage ?? undefined,
        estimatedCostCents: row.estimatedCostCents ?? undefined,
        errorClass: row.errorClass ?? undefined,
        retryStatus: row.retryStatus ?? undefined,
        maxAttempts: 5,
        traceId: row.traceId ?? undefined,
        startedAt: iso(row.startedAt),
        completedAt: iso(row.completedAt),
        payload: row.payload ?? {},
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }
    : null;
}

export function mapMistakeMemory(row: typeof s.mistakeMemoryRules.$inferSelect): MistakeMemoryRuleRecord {
  return {
    id: row.id,
    publicId: row.publicId,
    tenantId: row.tenantId,
    applicationId: row.applicationId,
    originatingAudit: row.originatingAudit,
    affectedVersion: row.affectedVersion,
    category: row.category ?? "",
    rule: row.rule,
    severity: row.severity ?? "minor",
    status: row.status,
    userOverride: row.userOverride,
    appliedIn: row.appliedIn ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toApplicationValues(
  row: Omit<ApplicationRecord, "createdAt" | "updatedAt" | "deletedAt" | "version"> & {
    version?: number;
  },
) {
  return {
    id: row.id,
    publicId: row.publicId,
    tenantId: row.tenantId,
    company: row.company,
    companyMark: row.companyMark,
    role: row.role,
    location: row.location,
    employmentType: row.employmentType,
    status: row.status as typeof s.applications.$inferInsert.status,
    stage: row.stage,
    workflowStage: row.workflowStage,
    resumeScore: row.resumeScore,
    evidenceCoverage: row.evidenceCoverage,
    atsAlignment: row.atsAlignment,
    interviewStatus: row.interviewStatus as typeof s.applications.$inferInsert.interviewStatus,
    researchConfidence: row.researchConfidence,
    deadline: row.deadline,
    archived: row.archived,
    roleFamily: row.roleFamily,
    nextAction: row.nextAction,
    ownerUserId: row.ownerUserId,
    candidateProfileId: row.candidateProfileId ?? null,
    metadata: row.metadata ?? {},
    version: row.version,
  };
}

export function toApplicationPatch(row: Partial<ApplicationRecord>) {
  const copy = { ...row } as Record<string, unknown>;
  for (const key of [
    "id",
    "publicId",
    "tenantId",
    "createdAt",
    "updatedAt",
    "deletedAt",
    "jobDescriptionPublicId",
    "resumePublicId",
  ]) {
    delete copy[key];
  }
  return copy;
}

export function toWorkflowValues(row: Omit<WorkflowRunRecord, "createdAt" | "updatedAt" | "applicationPublicId"> & { createdAt?: string }) {
  return {
    id: row.id,
    publicId: row.publicId,
    tenantId: row.tenantId,
    applicationId: row.applicationId,
    stage: row.stage,
    status: row.status,
    attempt: row.attempt,
    idempotencyKey: row.idempotencyKey,
    inputVersion: row.inputVersion,
    outputVersion: row.outputVersion,
    provider: row.provider,
    model: row.model,
    promptVersion: row.promptVersion,
    tokenUsage: row.tokenUsage,
    estimatedCostCents: row.estimatedCostCents,
    errorClass: row.errorClass,
    retryStatus: row.retryStatus,
    traceId: row.traceId,
    startedAt: row.startedAt ? new Date(row.startedAt) : undefined,
    completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
    payload: row.payload,
    createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
  };
}

export function toWorkflowPatch(row: Partial<WorkflowRunRecord>) {
  const copy = { ...row } as Record<string, unknown>;
  for (const key of [
    "id",
    "publicId",
    "tenantId",
    "applicationId",
    "applicationPublicId",
    "createdAt",
    "updatedAt",
    "maxAttempts",
    "backoffMs",
    "nextRetryAt",
  ]) {
    delete copy[key];
  }
  if (typeof copy.startedAt === "string") copy.startedAt = new Date(copy.startedAt);
  if (typeof copy.completedAt === "string") copy.completedAt = new Date(copy.completedAt);
  return copy;
}

export function toStoredFileValues(row: Omit<StoredFileRecord, "createdAt" | "deletedAt"> & { createdAt?: string }) {
  return {
    id: row.id,
    publicId: row.publicId,
    tenantId: row.tenantId,
    ownerUserId: row.ownerUserId,
    purpose: row.purpose,
    storageKey: row.storageKey,
    mimeType: row.mimeType,
    sizeBytes: row.size,
    checksum: row.checksum,
    scanStatus: row.scanStatus,
    retentionState: row.retentionState,
    createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
  };
}

export function toStoredFilePatch(row: Partial<StoredFileRecord>) {
  const copy = { ...row } as Record<string, unknown>;
  for (const key of ["id", "publicId", "tenantId", "createdAt", "deletedAt", "size"]) delete copy[key];
  if (typeof copy.size === "number") {
    copy.sizeBytes = copy.size;
    delete copy.size;
  }
  if (typeof copy.physicalDeleteAt === "string") {
    copy.physicalDeleteAt = new Date(copy.physicalDeleteAt);
  }
  return copy;
}

export function toCandidateProfileValues(
  row: Omit<CandidateProfileRecord, "createdAt" | "updatedAt" | "deletedAt" | "version"> & { version?: number },
) {
  return {
    id: row.id,
    publicId: row.publicId,
    tenantId: row.tenantId,
    userId: row.userId,
    fullName: row.fullName,
    preferredName: row.preferredName,
    email: row.email,
    phone: row.phone,
    location: row.location,
    linkedIn: row.linkedIn,
    github: row.github,
    portfolio: row.portfolio,
    headline: row.headline,
    summary: row.summary,
    experienceLevel: row.experienceLevel,
    yearsExperience: row.yearsExperience,
    targetRoleFamilies: row.targetRoleFamilies,
    preferredResumeLength: row.preferredResumeLength,
    careerGoal: row.careerGoal,
    avatarInitials: row.avatarInitials,
    remoteOk: row.remoteOk,
    preferredLocations: row.preferredLocations,
    workAuthorization: row.workAuthorization,
    requiresSponsorship: row.requiresSponsorship,
    onboardingStep: row.onboardingStep,
    onboardingCompletedAt: row.onboardingCompletedAt ? new Date(row.onboardingCompletedAt) : undefined,
    modelImprovementOptIn: row.modelImprovementOptIn,
    sourceResumeFilePublicId: row.sourceResumeFilePublicId,
    resumeImportStatus: row.resumeImportStatus,
    resumeImportExtraction: row.resumeImportExtraction,
    version: row.version,
  };
}

export function toCandidateProfilePatch(row: Partial<CandidateProfileRecord>) {
  const copy = { ...row } as Record<string, unknown>;
  for (const key of ["id", "publicId", "tenantId", "userId", "createdAt", "updatedAt", "deletedAt"]) delete copy[key];
  if (typeof copy.onboardingCompletedAt === "string") {
    copy.onboardingCompletedAt = new Date(copy.onboardingCompletedAt);
  }
  return copy;
}

export function sectionFromRow(row: typeof s.resumeSections.$inferSelect): Record<string, unknown> {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  return {
    ...payload,
    id: payload.id ?? row.publicId,
    type: row.type,
    title: row.title,
    order: row.order,
  };
}

export type EvidenceMatchInfo = { matched: string[]; excluded: string[] };

export function buildEvidenceMatchMap(
  rows: Array<{ evidenceItemId: string; applicationPublicId: string; excluded: boolean }>,
): Map<string, EvidenceMatchInfo> {
  const map = new Map<string, EvidenceMatchInfo>();
  for (const row of rows) {
    const current = map.get(row.evidenceItemId) ?? { matched: [], excluded: [] };
    if (row.excluded) {
      if (!current.excluded.includes(row.applicationPublicId)) current.excluded.push(row.applicationPublicId);
    } else if (!current.matched.includes(row.applicationPublicId)) {
      current.matched.push(row.applicationPublicId);
    }
    map.set(row.evidenceItemId, current);
  }
  return map;
}
