import { randomUUID } from "crypto";
import type { TenantRole } from "../domain/types";

export type WorkflowStage =
  | "APPLICATION_CREATED"
  | "RESEARCH_QUEUED"
  | "RESEARCH_RUNNING"
  | "RESEARCH_REVIEW_REQUIRED"
  | "RESEARCH_COMPLETED"
  | "EVIDENCE_MATCHING_RUNNING"
  | "EVIDENCE_MATCHING_COMPLETED"
  | "V0_GENERATING"
  | "V0_READY"
  | "HR_AUDIT_1_RUNNING"
  | "HR_AUDIT_1_REVIEW"
  | "V1_GENERATING"
  | "V1_READY"
  | "EM_AUDIT_1_RUNNING"
  | "EM_AUDIT_1_REVIEW"
  | "V2_GENERATING"
  | "V2_READY"
  | "HR_AUDIT_2_RUNNING"
  | "HR_AUDIT_2_REVIEW"
  | "V3_GENERATING"
  | "V3_READY"
  | "EM_AUDIT_2_RUNNING"
  | "EM_AUDIT_2_REVIEW"
  | "V4_GENERATING"
  | "V4_READY"
  | "FINAL_QA_RUNNING"
  | "FINAL_QA_FAILED"
  | "FINAL_READY"
  | "CANCELLED"
  | "FAILED";

export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "waiting_review"
  | "completed"
  | "failed"
  | "cancelled"
  | "retrying";

export type ApplicationStatus =
  | "draft"
  | "researching"
  | "evidence"
  | "resume"
  | "auditing"
  | "final-qa"
  | "ready"
  | "interviewing"
  | "archived";

export type FindingStatus = "open" | "accepted" | "edited" | "rejected" | "deferred";
export type AuditLens = "hr-1" | "em-1" | "hr-2" | "em-2" | "final-qa";
export type Confidence = "high" | "medium" | "low";
export type VerificationStatus = "verified" | "inferred" | "unverified" | "disputed";
export type PrivacyLevel = "public" | "share-safe" | "private" | "do-not-use";
export type FindingSeverity = "critical" | "major" | "minor" | "suggestion";
export type UsageKind =
  | "research"
  | "resume_generation"
  | "audit"
  | "embedding"
  | "interview_minutes"
  | "transcription_minutes"
  | "storage"
  | "export"
  | "input_tokens"
  | "output_tokens"
  | "provider_cost";

function now(): Date {
  return new Date();
}

function id(): string {
  return randomUUID();
}

function notDeleted<T extends { deletedAt?: Date | null }>(row: T): boolean {
  return row.deletedAt == null;
}

export interface MemUser {
  id: string;
  publicId: string;
  email: string;
  emailVerified: boolean;
  passwordHash: string | null;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MemTenant {
  id: string;
  publicId: string;
  name: string;
  plan: "free" | "pro" | "team" | "enterprise";
  createdAt: Date;
  updatedAt: Date;
}

export interface MemMembership {
  id: string;
  tenantId: string;
  userId: string;
  role: TenantRole;
  createdAt: Date;
}

export interface MemSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface MemCandidateProfile {
  id: string;
  publicId: string;
  tenantId: string;
  userId: string | null;
  fullName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedIn: string | null;
  github: string | null;
  portfolio: string | null;
  headline: string | null;
  summary: string | null;
  experienceLevel: string | null;
  yearsExperience: number | null;
  targetRoleFamilies: string[];
  preferredResumeLength: string | null;
  careerGoal: string | null;
  avatarInitials: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MemJobDescription {
  id: string;
  publicId: string;
  tenantId: string;
  title: string;
  company: string;
  location: string | null;
  employmentType: string | null;
  source: string | null;
  url: string | null;
  deadline: string | null;
  rawText: string;
  requirements: string[];
  preferred: string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MemApplication {
  id: string;
  publicId: string;
  tenantId: string;
  company: string;
  companyMark: string | null;
  role: string;
  location: string | null;
  employmentType: string | null;
  status: ApplicationStatus;
  stage: WorkflowStage;
  workflowStage: WorkflowStage;
  resumeScore: number;
  evidenceCoverage: number;
  atsAlignment: number;
  interviewStatus: "not-started" | "preparing" | "ready" | "completed";
  researchConfidence: number;
  deadline: string | null;
  archived: boolean;
  roleFamily: string | null;
  nextAction: string | null;
  jobDescriptionId: string | null;
  resumeId: string | null;
  ownerUserId: string | null;
  candidateProfileId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MemResearchRun {
  id: string;
  publicId: string;
  tenantId: string;
  applicationId: string;
  status: string;
  depth: string;
  confidence: number;
  workflowRunId: string | null;
  promptVersion: string | null;
  version: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MemResearchSource {
  id: string;
  publicId: string;
  tenantId: string;
  researchRunId: string | null;
  applicationId: string | null;
  title: string;
  url: string | null;
  accessedAt: Date | null;
  type: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MemResearchFinding {
  id: string;
  publicId: string;
  tenantId: string;
  researchRunId: string | null;
  applicationId: string;
  category: string;
  title: string;
  summary: string;
  confidence: Confidence;
  status: VerificationStatus;
  sourceIds: string[];
  useInResumeStrategy: boolean;
  dateAccessed: Date | null;
  uncertaintyNote: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MemEvidenceMetric {
  id: string;
  publicId: string;
  tenantId: string;
  evidenceItemId: string;
  label: string;
  value: string;
  unit: string | null;
  baseline: string | null;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MemEvidenceItem {
  id: string;
  publicId: string;
  tenantId: string;
  title: string;
  organization: string | null;
  situation: string | null;
  task: string | null;
  actions: string[];
  result: string | null;
  technologies: string[];
  roleRelevance: string[];
  confidence: Confidence;
  verificationStatus: VerificationStatus;
  supportingSource: string | null;
  privacyLevel: PrivacyLevel;
  resumeUsageHistory: string[];
  interviewStoryReady: boolean;
  tags: string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MemEvidenceMatch {
  id: string;
  publicId: string;
  tenantId: string;
  evidenceItemId: string;
  applicationId: string;
  requirement: string | null;
  importance: string;
  evidenceStrength: Confidence;
  resumeUsage: string;
  coverageGap: string | null;
  excluded: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MemResume {
  id: string;
  publicId: string;
  tenantId: string;
  applicationId: string;
  title: string;
  templateId: string;
  length: string;
  currentVersionId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MemResumeVersion {
  id: string;
  publicId: string;
  tenantId: string;
  resumeId: string;
  versionLabel: string;
  versionNumber: number;
  notes: string | null;
  score: number;
  scoreBreakdown: Record<string, number>;
  triggeredBy: string | null;
  promptVersion: string | null;
  workflowRunId: string | null;
  locked: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MemResumeSection {
  id: string;
  publicId: string;
  tenantId: string;
  resumeVersionId: string;
  type: string;
  title: string;
  order: number;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface MemResumeClaim {
  id: string;
  publicId: string;
  tenantId: string;
  resumeVersionId: string;
  sectionId: string | null;
  bulletId: string | null;
  text: string;
  evidenceIds: string[];
  confidence: Confidence;
  unsupported: boolean;
  metricsUsed: string[];
  transformations: string[];
  createdAt: Date;
}

export interface MemAuditRun {
  id: string;
  publicId: string;
  tenantId: string;
  applicationId: string;
  lens: AuditLens;
  label: string;
  reviewsVersion: string;
  producesVersion: string | null;
  status: string;
  scoreBefore: number;
  scoreAfter: number | null;
  summary: string | null;
  workflowRunId: string | null;
  version: number;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MemAuditFinding {
  id: string;
  publicId: string;
  tenantId: string;
  auditRunId: string;
  severity: FindingSeverity;
  status: FindingStatus;
  section: string | null;
  title: string;
  explanation: string;
  beforeText: string | null;
  suggestedText: string | null;
  evidenceSource: string | null;
  expectedScoreImpact: number;
  bulletId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MemAuditDecision {
  id: string;
  publicId: string;
  tenantId: string;
  auditFindingId: string;
  userId: string | null;
  status: FindingStatus;
  editedText: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface MemMistakeMemoryRule {
  id: string;
  publicId: string;
  tenantId: string;
  applicationId: string;
  originatingAudit: AuditLens;
  affectedVersion: string;
  category: string | null;
  rule: string;
  severity: FindingSeverity;
  status: string;
  userOverride: boolean;
  appliedIn: string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MemFinalQaRun {
  id: string;
  publicId: string;
  tenantId: string;
  applicationId: string;
  resumeVersionId: string | null;
  status: string;
  passed: boolean | null;
  version: number;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MemFinalQaCheck {
  id: string;
  publicId: string;
  tenantId: string;
  finalQaRunId: string;
  label: string;
  status: string;
  detail: string | null;
  createdAt: Date;
}

export interface MemInterviewSession {
  id: string;
  publicId: string;
  tenantId: string;
  applicationId: string | null;
  mode: string;
  status: string;
  difficulty: string;
  durationMinutes: number;
  interviewerPersona: string | null;
  voiceMode: boolean;
  resumeVersionId: string | null;
  currentQuestionIndex: number;
  readinessScore: number;
  startedAt: Date | null;
  endedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MemInterviewQuestion {
  id: string;
  publicId: string;
  tenantId: string;
  sessionId: string;
  prompt: string;
  type: string;
  competency: string | null;
  evidenceCueIds: string[];
  hint: string | null;
  followUp: string | null;
  order: number;
  createdAt: Date;
}

export interface MemInterviewResponse {
  id: string;
  publicId: string;
  tenantId: string;
  sessionId: string;
  questionId: string | null;
  role: string;
  text: string;
  at: Date;
  createdAt: Date;
}

export interface MemInterviewFeedback {
  id: string;
  publicId: string;
  tenantId: string;
  sessionId: string;
  overall: number;
  structure: number;
  relevance: number;
  technicalDepth: number;
  evidenceUsage: number;
  concision: number;
  clarity: number;
  pacing: number;
  fillerTrend: string | null;
  strongestAnswer: string | null;
  weakestAnswer: string | null;
  missedEvidence: string[];
  followUpRisk: string | null;
  practicePlan: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MemStoredFile {
  id: string;
  publicId: string;
  tenantId: string;
  ownerUserId: string | null;
  purpose: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  scanStatus: string;
  retentionState: string;
  originalFilename: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MemWorkflowRun {
  id: string;
  publicId: string;
  tenantId: string;
  applicationId: string;
  stage: WorkflowStage;
  status: WorkflowRunStatus;
  attempt: number;
  idempotencyKey: string;
  inputVersion: string | null;
  outputVersion: string | null;
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  tokenUsage: { input?: number; output?: number; total?: number } | null;
  estimatedCostCents: string | null;
  errorClass: string | null;
  retryStatus: string | null;
  traceId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemWorkflowEvent {
  id: string;
  publicId: string;
  workflowRunId: string;
  tenantId: string;
  applicationId: string;
  stage: WorkflowStage;
  status: string;
  message: string | null;
  seq: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface MemUsageLedgerEntry {
  id: string;
  publicId: string;
  tenantId: string;
  userId: string | null;
  kind: UsageKind;
  units: string;
  costCents: string;
  workflowRunId: string | null;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface MemNotification {
  id: string;
  publicId: string;
  tenantId: string;
  userId: string;
  title: string;
  body: string;
  href: string | null;
  tone: string;
  read: boolean;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface MemAuditLog {
  id: string;
  publicId: string;
  tenantId: string | null;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  requestId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface MemOutboxMessage {
  id: string;
  publicId: string;
  tenantId: string | null;
  topic: string;
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "published" | "failed";
  attempts: number;
  availableAt: Date;
  publishedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemIdempotencyKey {
  id: string;
  publicId: string;
  tenantId: string;
  userId: string | null;
  key: string;
  scope: string;
  requestHash: string | null;
  responseStatus: number | null;
  responseBody: Record<string, unknown> | null;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Complete in-memory multi-tenant store for the Phase 2 vertical slice.
 * Soft-deleted rows are retained with `deletedAt` set and filtered from reads.
 */
export class MemoryStore {
  users = new Map<string, MemUser>();
  tenants = new Map<string, MemTenant>();
  memberships = new Map<string, MemMembership>();
  sessions = new Map<string, MemSession>();
  candidateProfiles = new Map<string, MemCandidateProfile>();
  jobDescriptions = new Map<string, MemJobDescription>();
  applications = new Map<string, MemApplication>();
  researchRuns = new Map<string, MemResearchRun>();
  researchSources = new Map<string, MemResearchSource>();
  researchFindings = new Map<string, MemResearchFinding>();
  evidenceItems = new Map<string, MemEvidenceItem>();
  evidenceMetrics = new Map<string, MemEvidenceMetric>();
  evidenceMatches = new Map<string, MemEvidenceMatch>();
  resumes = new Map<string, MemResume>();
  resumeVersions = new Map<string, MemResumeVersion>();
  resumeSections = new Map<string, MemResumeSection>();
  resumeClaims = new Map<string, MemResumeClaim>();
  auditRuns = new Map<string, MemAuditRun>();
  auditFindings = new Map<string, MemAuditFinding>();
  auditDecisions = new Map<string, MemAuditDecision>();
  mistakeMemoryRules = new Map<string, MemMistakeMemoryRule>();
  finalQaRuns = new Map<string, MemFinalQaRun>();
  finalQaChecks = new Map<string, MemFinalQaCheck>();
  interviewSessions = new Map<string, MemInterviewSession>();
  interviewQuestions = new Map<string, MemInterviewQuestion>();
  interviewResponses = new Map<string, MemInterviewResponse>();
  interviewFeedback = new Map<string, MemInterviewFeedback>();
  storedFiles = new Map<string, MemStoredFile>();
  workflowRuns = new Map<string, MemWorkflowRun>();
  workflowEvents = new Map<string, MemWorkflowEvent>();
  usageLedger = new Map<string, MemUsageLedgerEntry>();
  notifications = new Map<string, MemNotification>();
  auditLogs = new Map<string, MemAuditLog>();
  outboxMessages = new Map<string, MemOutboxMessage>();
  idempotencyKeys = new Map<string, MemIdempotencyKey>();

  private workflowEventSeq = new Map<string, number>();

  clear(): void {
    for (const map of [
      this.users,
      this.tenants,
      this.memberships,
      this.sessions,
      this.candidateProfiles,
      this.jobDescriptions,
      this.applications,
      this.researchRuns,
      this.researchSources,
      this.researchFindings,
      this.evidenceItems,
      this.evidenceMetrics,
      this.evidenceMatches,
      this.resumes,
      this.resumeVersions,
      this.resumeSections,
      this.resumeClaims,
      this.auditRuns,
      this.auditFindings,
      this.auditDecisions,
      this.mistakeMemoryRules,
      this.finalQaRuns,
      this.finalQaChecks,
      this.interviewSessions,
      this.interviewQuestions,
      this.interviewResponses,
      this.interviewFeedback,
      this.storedFiles,
      this.workflowRuns,
      this.workflowEvents,
      this.usageLedger,
      this.notifications,
      this.auditLogs,
      this.outboxMessages,
      this.idempotencyKeys,
    ]) {
      map.clear();
    }
    this.workflowEventSeq.clear();
  }

  /* ---- Users / tenants / memberships / sessions ---- */

  createUser(input: Omit<MemUser, "id" | "createdAt" | "updatedAt" | "deletedAt"> & { id?: string }): MemUser {
    const row: MemUser = {
      id: input.id ?? id(),
      publicId: input.publicId,
      email: input.email.toLowerCase(),
      emailVerified: input.emailVerified,
      passwordHash: input.passwordHash,
      name: input.name,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    this.users.set(row.id, row);
    return row;
  }

  findUserByEmail(email: string): MemUser | undefined {
    const needle = email.toLowerCase();
    return [...this.users.values()].find((u) => notDeleted(u) && u.email === needle);
  }

  findUserByPublicId(publicId: string): MemUser | undefined {
    return [...this.users.values()].find((u) => notDeleted(u) && u.publicId === publicId);
  }

  findUserById(userId: string): MemUser | undefined {
    const u = this.users.get(userId);
    return u && notDeleted(u) ? u : undefined;
  }

  createTenant(input: Omit<MemTenant, "id" | "createdAt" | "updatedAt"> & { id?: string }): MemTenant {
    const row: MemTenant = {
      id: input.id ?? id(),
      publicId: input.publicId,
      name: input.name,
      plan: input.plan,
      createdAt: now(),
      updatedAt: now(),
    };
    this.tenants.set(row.id, row);
    return row;
  }

  findTenantByPublicId(publicId: string): MemTenant | undefined {
    return [...this.tenants.values()].find((t) => t.publicId === publicId);
  }

  findTenantById(tenantId: string): MemTenant | undefined {
    return this.tenants.get(tenantId);
  }

  addMembership(input: Omit<MemMembership, "id" | "createdAt"> & { id?: string }): MemMembership {
    const existing = [...this.memberships.values()].find(
      (m) => m.tenantId === input.tenantId && m.userId === input.userId,
    );
    if (existing) return existing;
    const row: MemMembership = {
      id: input.id ?? id(),
      tenantId: input.tenantId,
      userId: input.userId,
      role: input.role,
      createdAt: now(),
    };
    this.memberships.set(row.id, row);
    return row;
  }

  listMembershipsForUser(userId: string): MemMembership[] {
    return [...this.memberships.values()].filter((m) => m.userId === userId);
  }

  getMembership(tenantId: string, userId: string): MemMembership | undefined {
    return [...this.memberships.values()].find((m) => m.tenantId === tenantId && m.userId === userId);
  }

  createSession(input: Omit<MemSession, "id" | "createdAt" | "revokedAt"> & { id?: string }): MemSession {
    const row: MemSession = {
      id: input.id ?? id(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: now(),
      revokedAt: null,
    };
    this.sessions.set(row.id, row);
    return row;
  }

  findSessionByTokenHash(tokenHash: string): MemSession | undefined {
    return [...this.sessions.values()].find(
      (s) => s.tokenHash === tokenHash && s.revokedAt == null && s.expiresAt > now(),
    );
  }

  revokeSession(sessionId: string): MemSession | undefined {
    const s = this.sessions.get(sessionId);
    if (!s) return undefined;
    s.revokedAt = now();
    return s;
  }

  /* ---- Applications ---- */

  createApplication(
    input: Omit<MemApplication, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version"> & {
      id?: string;
      version?: number;
    },
  ): MemApplication {
    const row: MemApplication = {
      ...input,
      id: input.id ?? id(),
      version: input.version ?? 1,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    this.applications.set(row.id, row);
    return row;
  }

  listApplications(tenantId: string, opts?: { includeArchived?: boolean; includeDeleted?: boolean }): MemApplication[] {
    return [...this.applications.values()]
      .filter((a) => a.tenantId === tenantId)
      .filter((a) => opts?.includeDeleted || notDeleted(a))
      .filter((a) => opts?.includeArchived || !a.archived)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  getApplication(tenantId: string, applicationIdOrPublicId: string): MemApplication | undefined {
    const a =
      this.applications.get(applicationIdOrPublicId) ??
      [...this.applications.values()].find((x) => x.publicId === applicationIdOrPublicId);
    if (!a || a.tenantId !== tenantId || !notDeleted(a)) return undefined;
    return a;
  }

  getApplicationByPublicId(publicId: string): MemApplication | undefined {
    return [...this.applications.values()].find((a) => notDeleted(a) && a.publicId === publicId);
  }

  updateApplication(
    tenantId: string,
    applicationIdOrPublicId: string,
    patch: Partial<MemApplication>,
    expectedVersion?: number,
  ): MemApplication {
    const a = this.getApplication(tenantId, applicationIdOrPublicId);
    if (!a) throw new Error("APPLICATION_NOT_FOUND");
    if (expectedVersion != null && a.version !== expectedVersion) {
      throw new Error("OPTIMISTIC_LOCK_CONFLICT");
    }
    Object.assign(a, patch, {
      id: a.id,
      publicId: a.publicId,
      tenantId: a.tenantId,
      version: a.version + 1,
      updatedAt: now(),
      createdAt: a.createdAt,
      deletedAt: patch.deletedAt !== undefined ? patch.deletedAt : a.deletedAt,
    });
    return a;
  }

  softDeleteApplication(tenantId: string, applicationIdOrPublicId: string): MemApplication {
    return this.updateApplication(tenantId, applicationIdOrPublicId, { deletedAt: now(), archived: true });
  }

  archiveApplication(tenantId: string, applicationIdOrPublicId: string): MemApplication {
    return this.updateApplication(tenantId, applicationIdOrPublicId, {
      archived: true,
      status: "archived",
    });
  }

  restoreApplication(tenantId: string, applicationIdOrPublicId: string): MemApplication {
    const a =
      this.applications.get(applicationIdOrPublicId) ??
      [...this.applications.values()].find((x) => x.publicId === applicationIdOrPublicId);
    if (!a || a.tenantId !== tenantId) throw new Error("APPLICATION_NOT_FOUND");
    a.archived = false;
    a.deletedAt = null;
    a.status = a.status === "archived" ? "draft" : a.status;
    a.version += 1;
    a.updatedAt = now();
    return a;
  }

  /* ---- Job descriptions / candidate profiles ---- */

  upsertJobDescription(
    input: Omit<MemJobDescription, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version"> & {
      id?: string;
    },
  ): MemJobDescription {
    const existing = [...this.jobDescriptions.values()].find(
      (j) => j.publicId === input.publicId && notDeleted(j),
    );
    if (existing) {
      Object.assign(existing, input, { version: existing.version + 1, updatedAt: now() });
      return existing;
    }
    const row: MemJobDescription = {
      ...input,
      id: input.id ?? id(),
      version: 1,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    this.jobDescriptions.set(row.id, row);
    return row;
  }

  getJobDescription(tenantId: string, idOrPublicId: string): MemJobDescription | undefined {
    const j =
      this.jobDescriptions.get(idOrPublicId) ??
      [...this.jobDescriptions.values()].find((x) => x.publicId === idOrPublicId);
    if (!j || j.tenantId !== tenantId || !notDeleted(j)) return undefined;
    return j;
  }

  upsertCandidateProfile(
    input: Omit<MemCandidateProfile, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version"> & {
      id?: string;
    },
  ): MemCandidateProfile {
    const existing = [...this.candidateProfiles.values()].find(
      (c) => c.publicId === input.publicId && notDeleted(c),
    );
    if (existing) {
      Object.assign(existing, input, { version: existing.version + 1, updatedAt: now() });
      return existing;
    }
    const row: MemCandidateProfile = {
      ...input,
      id: input.id ?? id(),
      version: 1,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    this.candidateProfiles.set(row.id, row);
    return row;
  }

  /* ---- Workflow runs + events ---- */

  createWorkflowRun(
    input: Omit<MemWorkflowRun, "id" | "createdAt" | "updatedAt" | "attempt"> & {
      id?: string;
      attempt?: number;
    },
  ): MemWorkflowRun {
    const existing = [...this.workflowRuns.values()].find(
      (w) => w.tenantId === input.tenantId && w.idempotencyKey === input.idempotencyKey,
    );
    if (existing) return existing;
    const row: MemWorkflowRun = {
      ...input,
      id: input.id ?? id(),
      attempt: input.attempt ?? 1,
      createdAt: now(),
      updatedAt: now(),
    };
    this.workflowRuns.set(row.id, row);
    return row;
  }

  getWorkflowRun(tenantId: string, idOrPublicId: string): MemWorkflowRun | undefined {
    const w =
      this.workflowRuns.get(idOrPublicId) ??
      [...this.workflowRuns.values()].find((x) => x.publicId === idOrPublicId);
    if (!w || w.tenantId !== tenantId) return undefined;
    return w;
  }

  getWorkflowRunByIdempotency(tenantId: string, idempotencyKey: string): MemWorkflowRun | undefined {
    return [...this.workflowRuns.values()].find(
      (w) => w.tenantId === tenantId && w.idempotencyKey === idempotencyKey,
    );
  }

  updateWorkflowRun(tenantId: string, runId: string, patch: Partial<MemWorkflowRun>): MemWorkflowRun {
    const w = this.getWorkflowRun(tenantId, runId);
    if (!w) throw new Error("WORKFLOW_RUN_NOT_FOUND");
    Object.assign(w, patch, {
      id: w.id,
      publicId: w.publicId,
      tenantId: w.tenantId,
      idempotencyKey: w.idempotencyKey,
      updatedAt: now(),
    });
    return w;
  }

  appendWorkflowEvent(
    input: Omit<MemWorkflowEvent, "id" | "createdAt" | "seq" | "publicId"> & {
      id?: string;
      publicId?: string;
      seq?: number;
    },
  ): MemWorkflowEvent {
    const next = (this.workflowEventSeq.get(input.workflowRunId) ?? 0) + 1;
    this.workflowEventSeq.set(input.workflowRunId, input.seq ?? next);
    const row: MemWorkflowEvent = {
      id: input.id ?? id(),
      publicId: input.publicId ?? `wevt_${(input.seq ?? next).toString().padStart(4, "0")}`,
      workflowRunId: input.workflowRunId,
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      stage: input.stage,
      status: input.status,
      message: input.message,
      seq: input.seq ?? next,
      metadata: input.metadata ?? {},
      createdAt: now(),
    };
    this.workflowEvents.set(row.id, row);
    return row;
  }

  listWorkflowEvents(
    tenantId: string,
    opts: { workflowRunId?: string; applicationId?: string; sinceSeq?: number },
  ): MemWorkflowEvent[] {
    return [...this.workflowEvents.values()]
      .filter((e) => e.tenantId === tenantId)
      .filter((e) => !opts.workflowRunId || e.workflowRunId === opts.workflowRunId)
      .filter((e) => !opts.applicationId || e.applicationId === opts.applicationId)
      .filter((e) => opts.sinceSeq == null || e.seq > opts.sinceSeq)
      .sort((a, b) => a.seq - b.seq);
  }

  listWorkflowRunsForApplication(tenantId: string, applicationId: string): MemWorkflowRun[] {
    return [...this.workflowRuns.values()]
      .filter((w) => w.tenantId === tenantId && w.applicationId === applicationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /* ---- Resumes (immutable versions) ---- */

  createResume(
    input: Omit<MemResume, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version"> & { id?: string },
  ): MemResume {
    const row: MemResume = {
      ...input,
      id: input.id ?? id(),
      version: 1,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    this.resumes.set(row.id, row);
    return row;
  }

  getResume(tenantId: string, idOrPublicId: string): MemResume | undefined {
    const r =
      this.resumes.get(idOrPublicId) ??
      [...this.resumes.values()].find((x) => x.publicId === idOrPublicId);
    if (!r || r.tenantId !== tenantId || !notDeleted(r)) return undefined;
    return r;
  }

  getResumeForApplication(tenantId: string, applicationId: string): MemResume | undefined {
    return [...this.resumes.values()].find(
      (r) => r.tenantId === tenantId && r.applicationId === applicationId && notDeleted(r),
    );
  }

  /**
   * Append-only resume version. Content is immutable after create.
   * Retries with the same versionNumber return the existing row.
   */
  appendResumeVersion(
    input: Omit<MemResumeVersion, "id" | "createdAt" | "updatedAt" | "deletedAt" | "locked"> & {
      id?: string;
      locked?: boolean;
    },
  ): MemResumeVersion {
    const existing = [...this.resumeVersions.values()].find(
      (v) =>
        v.resumeId === input.resumeId &&
        v.versionNumber === input.versionNumber &&
        notDeleted(v),
    );
    if (existing) return existing;

    const row: MemResumeVersion = {
      ...input,
      id: input.id ?? id(),
      locked: input.locked ?? false,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    this.resumeVersions.set(row.id, row);

    const resume = this.resumes.get(input.resumeId);
    if (resume) {
      resume.currentVersionId = row.id;
      resume.version += 1;
      resume.updatedAt = now();
    }
    return row;
  }

  /** Soft metadata only — never mutates score/notes/content. */
  updateResumeVersionMetadata(
    tenantId: string,
    versionId: string,
    patch: Pick<Partial<MemResumeVersion>, "locked" | "deletedAt">,
  ): MemResumeVersion {
    const v = this.resumeVersions.get(versionId);
    if (!v || v.tenantId !== tenantId) throw new Error("RESUME_VERSION_NOT_FOUND");
    if (patch.locked != null) v.locked = patch.locked;
    if (patch.deletedAt !== undefined) v.deletedAt = patch.deletedAt;
    v.updatedAt = now();
    return v;
  }

  listResumeVersions(tenantId: string, resumeId: string): MemResumeVersion[] {
    return [...this.resumeVersions.values()]
      .filter((v) => v.tenantId === tenantId && v.resumeId === resumeId && notDeleted(v))
      .sort((a, b) => a.versionNumber - b.versionNumber);
  }

  getResumeVersion(tenantId: string, idOrPublicId: string): MemResumeVersion | undefined {
    const v =
      this.resumeVersions.get(idOrPublicId) ??
      [...this.resumeVersions.values()].find((x) => x.publicId === idOrPublicId);
    if (!v || v.tenantId !== tenantId || !notDeleted(v)) return undefined;
    return v;
  }

  addResumeSection(input: Omit<MemResumeSection, "id" | "createdAt"> & { id?: string }): MemResumeSection {
    const row: MemResumeSection = {
      ...input,
      id: input.id ?? id(),
      createdAt: now(),
    };
    this.resumeSections.set(row.id, row);
    return row;
  }

  listResumeSections(tenantId: string, resumeVersionId: string): MemResumeSection[] {
    return [...this.resumeSections.values()]
      .filter((s) => s.tenantId === tenantId && s.resumeVersionId === resumeVersionId)
      .sort((a, b) => a.order - b.order);
  }

  addResumeClaim(input: Omit<MemResumeClaim, "id" | "createdAt"> & { id?: string }): MemResumeClaim {
    const row: MemResumeClaim = {
      ...input,
      id: input.id ?? id(),
      createdAt: now(),
    };
    this.resumeClaims.set(row.id, row);
    return row;
  }

  /* ---- Audits ---- */

  createAuditRun(
    input: Omit<MemAuditRun, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version"> & { id?: string },
  ): MemAuditRun {
    const existing = [...this.auditRuns.values()].find(
      (a) => a.publicId === input.publicId && notDeleted(a),
    );
    if (existing) return existing;
    const row: MemAuditRun = {
      ...input,
      id: input.id ?? id(),
      version: 1,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    this.auditRuns.set(row.id, row);
    return row;
  }

  listAuditRuns(tenantId: string, applicationId: string): MemAuditRun[] {
    return [...this.auditRuns.values()]
      .filter((a) => a.tenantId === tenantId && a.applicationId === applicationId && notDeleted(a))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  getAuditRun(tenantId: string, idOrPublicId: string): MemAuditRun | undefined {
    const a =
      this.auditRuns.get(idOrPublicId) ??
      [...this.auditRuns.values()].find((x) => x.publicId === idOrPublicId);
    if (!a || a.tenantId !== tenantId || !notDeleted(a)) return undefined;
    return a;
  }

  addAuditFinding(
    input: Omit<MemAuditFinding, "id" | "createdAt" | "updatedAt" | "deletedAt"> & { id?: string },
  ): MemAuditFinding {
    const existing = [...this.auditFindings.values()].find((f) => f.publicId === input.publicId);
    if (existing) return existing;
    const row: MemAuditFinding = {
      ...input,
      id: input.id ?? id(),
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    this.auditFindings.set(row.id, row);
    return row;
  }

  listAuditFindings(tenantId: string, auditRunId: string): MemAuditFinding[] {
    return [...this.auditFindings.values()].filter(
      (f) => f.tenantId === tenantId && f.auditRunId === auditRunId && notDeleted(f),
    );
  }

  getAuditFinding(tenantId: string, idOrPublicId: string): MemAuditFinding | undefined {
    const f =
      this.auditFindings.get(idOrPublicId) ??
      [...this.auditFindings.values()].find((x) => x.publicId === idOrPublicId);
    if (!f || f.tenantId !== tenantId || !notDeleted(f)) return undefined;
    return f;
  }

  recordAuditDecision(
    input: Omit<MemAuditDecision, "id" | "createdAt"> & { id?: string },
  ): MemAuditDecision {
    const finding = this.auditFindings.get(input.auditFindingId);
    if (!finding || finding.tenantId !== input.tenantId) throw new Error("AUDIT_FINDING_NOT_FOUND");
    finding.status = input.status;
    finding.updatedAt = now();
    if (input.editedText != null) finding.suggestedText = input.editedText;

    const row: MemAuditDecision = {
      ...input,
      id: input.id ?? id(),
      createdAt: now(),
    };
    this.auditDecisions.set(row.id, row);
    return row;
  }

  /* ---- Mistake memory ---- */

  addMistakeMemoryRule(
    input: Omit<MemMistakeMemoryRule, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version"> & {
      id?: string;
    },
  ): MemMistakeMemoryRule {
    const existing = [...this.mistakeMemoryRules.values()].find((r) => r.publicId === input.publicId);
    if (existing) return existing;
    const row: MemMistakeMemoryRule = {
      ...input,
      id: input.id ?? id(),
      version: 1,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    this.mistakeMemoryRules.set(row.id, row);
    return row;
  }

  listMistakeMemoryRules(tenantId: string, applicationId: string): MemMistakeMemoryRule[] {
    return [...this.mistakeMemoryRules.values()].filter(
      (r) =>
        r.tenantId === tenantId &&
        r.applicationId === applicationId &&
        notDeleted(r) &&
        r.status === "active",
    );
  }

  /* ---- Evidence ---- */

  createEvidenceItem(
    input: Omit<MemEvidenceItem, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version"> & {
      id?: string;
    },
  ): MemEvidenceItem {
    const existing = [...this.evidenceItems.values()].find((e) => e.publicId === input.publicId);
    if (existing) return existing;
    const row: MemEvidenceItem = {
      ...input,
      id: input.id ?? id(),
      version: 1,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    this.evidenceItems.set(row.id, row);
    return row;
  }

  listEvidence(tenantId: string): MemEvidenceItem[] {
    return [...this.evidenceItems.values()].filter((e) => e.tenantId === tenantId && notDeleted(e));
  }

  getEvidence(tenantId: string, idOrPublicId: string): MemEvidenceItem | undefined {
    const e =
      this.evidenceItems.get(idOrPublicId) ??
      [...this.evidenceItems.values()].find((x) => x.publicId === idOrPublicId);
    if (!e || e.tenantId !== tenantId || !notDeleted(e)) return undefined;
    return e;
  }

  getEvidenceByPublicId(publicId: string): MemEvidenceItem | undefined {
    return [...this.evidenceItems.values()].find((e) => notDeleted(e) && e.publicId === publicId);
  }

  updateEvidence(
    tenantId: string,
    idOrPublicId: string,
    patch: Partial<MemEvidenceItem>,
  ): MemEvidenceItem {
    const e = this.getEvidence(tenantId, idOrPublicId);
    if (!e) throw new Error("EVIDENCE_NOT_FOUND");
    Object.assign(e, patch, {
      id: e.id,
      publicId: e.publicId,
      tenantId: e.tenantId,
      version: e.version + 1,
      updatedAt: now(),
    });
    return e;
  }

  softDeleteEvidence(tenantId: string, idOrPublicId: string): MemEvidenceItem {
    return this.updateEvidence(tenantId, idOrPublicId, { deletedAt: now() });
  }

  addEvidenceMetric(
    input: Omit<MemEvidenceMetric, "id" | "createdAt" | "updatedAt" | "deletedAt"> & { id?: string },
  ): MemEvidenceMetric {
    const row: MemEvidenceMetric = {
      ...input,
      id: input.id ?? id(),
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    this.evidenceMetrics.set(row.id, row);
    return row;
  }

  listEvidenceMetrics(tenantId: string, evidenceItemId: string): MemEvidenceMetric[] {
    return [...this.evidenceMetrics.values()].filter(
      (m) => m.tenantId === tenantId && m.evidenceItemId === evidenceItemId && notDeleted(m),
    );
  }

  matchEvidenceToApplication(
    input: Omit<MemEvidenceMatch, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version"> & {
      id?: string;
    },
  ): MemEvidenceMatch {
    const existing = [...this.evidenceMatches.values()].find(
      (m) =>
        m.evidenceItemId === input.evidenceItemId &&
        m.applicationId === input.applicationId &&
        m.requirement === input.requirement &&
        notDeleted(m),
    );
    if (existing) {
      Object.assign(existing, input, { version: existing.version + 1, updatedAt: now() });
      return existing;
    }
    const row: MemEvidenceMatch = {
      ...input,
      id: input.id ?? id(),
      version: 1,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    this.evidenceMatches.set(row.id, row);
    return row;
  }

  listEvidenceMatches(tenantId: string, applicationId: string): MemEvidenceMatch[] {
    return [...this.evidenceMatches.values()].filter(
      (m) => m.tenantId === tenantId && m.applicationId === applicationId && notDeleted(m),
    );
  }

  /* ---- Research ---- */

  createResearchRun(
    input: Omit<MemResearchRun, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version"> & {
      id?: string;
    },
  ): MemResearchRun {
    const row: MemResearchRun = {
      ...input,
      id: input.id ?? id(),
      version: 1,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    this.researchRuns.set(row.id, row);
    return row;
  }

  addResearchSource(
    input: Omit<MemResearchSource, "id" | "createdAt" | "updatedAt" | "deletedAt"> & { id?: string },
  ): MemResearchSource {
    const existing = [...this.researchSources.values()].find((s) => s.publicId === input.publicId);
    if (existing) return existing;
    const row: MemResearchSource = {
      ...input,
      id: input.id ?? id(),
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    this.researchSources.set(row.id, row);
    return row;
  }

  addResearchFinding(
    input: Omit<MemResearchFinding, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version"> & {
      id?: string;
    },
  ): MemResearchFinding {
    const existing = [...this.researchFindings.values()].find((f) => f.publicId === input.publicId);
    if (existing) return existing;
    const row: MemResearchFinding = {
      ...input,
      id: input.id ?? id(),
      version: 1,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    this.researchFindings.set(row.id, row);
    return row;
  }

  listResearchFindings(tenantId: string, applicationId: string): MemResearchFinding[] {
    return [...this.researchFindings.values()].filter(
      (f) => f.tenantId === tenantId && f.applicationId === applicationId && notDeleted(f),
    );
  }

  listResearchSources(tenantId: string, applicationId: string): MemResearchSource[] {
    return [...this.researchSources.values()].filter(
      (s) => s.tenantId === tenantId && s.applicationId === applicationId && notDeleted(s),
    );
  }

  /* ---- Final QA ---- */

  createFinalQaRun(
    input: Omit<MemFinalQaRun, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version"> & {
      id?: string;
    },
  ): MemFinalQaRun {
    const row: MemFinalQaRun = {
      ...input,
      id: input.id ?? id(),
      version: 1,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    this.finalQaRuns.set(row.id, row);
    return row;
  }

  addFinalQaCheck(
    input: Omit<MemFinalQaCheck, "id" | "createdAt"> & { id?: string },
  ): MemFinalQaCheck {
    const row: MemFinalQaCheck = {
      ...input,
      id: input.id ?? id(),
      createdAt: now(),
    };
    this.finalQaChecks.set(row.id, row);
    return row;
  }

  listFinalQaChecks(tenantId: string, finalQaRunId: string): MemFinalQaCheck[] {
    return [...this.finalQaChecks.values()].filter(
      (c) => c.tenantId === tenantId && c.finalQaRunId === finalQaRunId,
    );
  }

  /* ---- Interviews ---- */

  createInterviewSession(
    input: Omit<MemInterviewSession, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version"> & {
      id?: string;
    },
  ): MemInterviewSession {
    const row: MemInterviewSession = {
      ...input,
      id: input.id ?? id(),
      version: 1,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    this.interviewSessions.set(row.id, row);
    return row;
  }

  getInterviewSession(tenantId: string, idOrPublicId: string): MemInterviewSession | undefined {
    const s =
      this.interviewSessions.get(idOrPublicId) ??
      [...this.interviewSessions.values()].find((x) => x.publicId === idOrPublicId);
    if (!s || s.tenantId !== tenantId || !notDeleted(s)) return undefined;
    return s;
  }

  getInterviewByPublicId(publicId: string): MemInterviewSession | undefined {
    return [...this.interviewSessions.values()].find((s) => notDeleted(s) && s.publicId === publicId);
  }

  updateInterviewSession(
    tenantId: string,
    idOrPublicId: string,
    patch: Partial<MemInterviewSession>,
  ): MemInterviewSession {
    const s = this.getInterviewSession(tenantId, idOrPublicId);
    if (!s) throw new Error("INTERVIEW_SESSION_NOT_FOUND");
    Object.assign(s, patch, {
      id: s.id,
      publicId: s.publicId,
      tenantId: s.tenantId,
      version: s.version + 1,
      updatedAt: now(),
    });
    return s;
  }

  addInterviewQuestion(
    input: Omit<MemInterviewQuestion, "id" | "createdAt"> & { id?: string },
  ): MemInterviewQuestion {
    const row: MemInterviewQuestion = {
      ...input,
      id: input.id ?? id(),
      createdAt: now(),
    };
    this.interviewQuestions.set(row.id, row);
    return row;
  }

  addInterviewResponse(
    input: Omit<MemInterviewResponse, "id" | "createdAt"> & { id?: string },
  ): MemInterviewResponse {
    const row: MemInterviewResponse = {
      ...input,
      id: input.id ?? id(),
      createdAt: now(),
    };
    this.interviewResponses.set(row.id, row);
    return row;
  }

  setInterviewFeedback(
    input: Omit<MemInterviewFeedback, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ): MemInterviewFeedback {
    const existing = [...this.interviewFeedback.values()].find((f) => f.sessionId === input.sessionId);
    if (existing) {
      Object.assign(existing, input, { updatedAt: now() });
      return existing;
    }
    const row: MemInterviewFeedback = {
      ...input,
      id: input.id ?? id(),
      createdAt: now(),
      updatedAt: now(),
    };
    this.interviewFeedback.set(row.id, row);
    return row;
  }

  /* ---- Usage ledger (append-only + idempotency) ---- */

  appendUsage(
    input: Omit<MemUsageLedgerEntry, "id" | "createdAt" | "publicId"> & {
      id?: string;
      publicId?: string;
    },
  ): MemUsageLedgerEntry {
    const existing = [...this.usageLedger.values()].find(
      (u) => u.idempotencyKey === input.idempotencyKey,
    );
    if (existing) return existing;
    const row: MemUsageLedgerEntry = {
      id: input.id ?? id(),
      publicId: input.publicId ?? `usage_${id().slice(0, 8)}`,
      tenantId: input.tenantId,
      userId: input.userId,
      kind: input.kind,
      units: input.units,
      costCents: input.costCents,
      workflowRunId: input.workflowRunId,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? {},
      createdAt: now(),
    };
    this.usageLedger.set(row.id, row);
    return row;
  }

  listUsage(tenantId: string): MemUsageLedgerEntry[] {
    return [...this.usageLedger.values()]
      .filter((u) => u.tenantId === tenantId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /* ---- Stored files ---- */

  registerStoredFile(
    input: Omit<MemStoredFile, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version"> & {
      id?: string;
    },
  ): MemStoredFile {
    const existing = [...this.storedFiles.values()].find((f) => f.storageKey === input.storageKey);
    if (existing && notDeleted(existing)) return existing;
    const row: MemStoredFile = {
      ...input,
      id: input.id ?? id(),
      version: 1,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    this.storedFiles.set(row.id, row);
    return row;
  }

  getStoredFile(tenantId: string, idOrPublicId: string): MemStoredFile | undefined {
    const f =
      this.storedFiles.get(idOrPublicId) ??
      [...this.storedFiles.values()].find((x) => x.publicId === idOrPublicId);
    if (!f || f.tenantId !== tenantId || !notDeleted(f)) return undefined;
    return f;
  }

  softDeleteStoredFile(tenantId: string, idOrPublicId: string): MemStoredFile {
    const f = this.getStoredFile(tenantId, idOrPublicId);
    if (!f) throw new Error("STORED_FILE_NOT_FOUND");
    f.deletedAt = now();
    f.retentionState = "pending_delete";
    f.version += 1;
    f.updatedAt = now();
    return f;
  }

  /* ---- Notifications / audit logs / outbox / idempotency ---- */

  addNotification(
    input: Omit<MemNotification, "id" | "createdAt" | "deletedAt"> & { id?: string },
  ): MemNotification {
    const row: MemNotification = {
      ...input,
      id: input.id ?? id(),
      createdAt: now(),
      deletedAt: null,
    };
    this.notifications.set(row.id, row);
    return row;
  }

  listNotifications(tenantId: string, userId: string): MemNotification[] {
    return [...this.notifications.values()]
      .filter((n) => n.tenantId === tenantId && n.userId === userId && notDeleted(n))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  appendAuditLog(input: Omit<MemAuditLog, "id" | "createdAt" | "publicId"> & { id?: string; publicId?: string }): MemAuditLog {
    const row: MemAuditLog = {
      id: input.id ?? id(),
      publicId: input.publicId ?? `alog_${id().slice(0, 8)}`,
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      requestId: input.requestId,
      metadata: input.metadata ?? {},
      createdAt: now(),
    };
    this.auditLogs.set(row.id, row);
    return row;
  }

  enqueueOutbox(
    input: Omit<MemOutboxMessage, "id" | "createdAt" | "updatedAt" | "attempts" | "publishedAt" | "lastError" | "status" | "availableAt" | "publicId"> & {
      id?: string;
      publicId?: string;
      status?: MemOutboxMessage["status"];
      availableAt?: Date;
    },
  ): MemOutboxMessage {
    const row: MemOutboxMessage = {
      id: input.id ?? id(),
      publicId: input.publicId ?? `outbox_${id().slice(0, 8)}`,
      tenantId: input.tenantId,
      topic: input.topic,
      payload: input.payload,
      status: input.status ?? "pending",
      attempts: 0,
      availableAt: input.availableAt ?? now(),
      publishedAt: null,
      lastError: null,
      createdAt: now(),
      updatedAt: now(),
    };
    this.outboxMessages.set(row.id, row);
    return row;
  }

  putIdempotencyKey(
    input: Omit<MemIdempotencyKey, "id" | "createdAt" | "publicId"> & { id?: string; publicId?: string },
  ): MemIdempotencyKey {
    const existing = [...this.idempotencyKeys.values()].find(
      (k) => k.tenantId === input.tenantId && k.scope === input.scope && k.key === input.key,
    );
    if (existing) return existing;
    const row: MemIdempotencyKey = {
      id: input.id ?? id(),
      publicId: input.publicId ?? `idem_${id().slice(0, 8)}`,
      ...input,
      createdAt: now(),
    };
    this.idempotencyKeys.set(row.id, row);
    return row;
  }

  getIdempotencyKey(tenantId: string, scope: string, key: string): MemIdempotencyKey | undefined {
    const row = [...this.idempotencyKeys.values()].find(
      (k) => k.tenantId === tenantId && k.scope === scope && k.key === key,
    );
    if (!row) return undefined;
    if (row.expiresAt <= now()) return undefined;
    return row;
  }
}

let singleton: MemoryStore | null = null;

export function getMemoryStore(): MemoryStore {
  if (!singleton) singleton = new MemoryStore();
  return singleton;
}

export function resetMemoryStore(): MemoryStore {
  singleton = new MemoryStore();
  return singleton;
}
