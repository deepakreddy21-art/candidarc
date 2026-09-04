import { randomUUID } from "crypto";
import type { FindingDecision, TenantRole, WorkflowStage } from "../domain/types";
import { AppError } from "../domain/types";

export type Id = string;

export type UserRecord = {
  id: Id;
  publicId: string;
  email: string;
  emailVerified: boolean;
  passwordHash: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type TenantRecord = {
  id: Id;
  publicId: string;
  name: string;
  plan: string;
  createdAt: string;
  updatedAt: string;
};

export type MembershipRecord = {
  id: Id;
  tenantId: Id;
  userId: Id;
  role: TenantRole;
  createdAt: string;
};

export type SessionRecord = {
  id: Id;
  userId: Id;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
};

export type ApplicationRecord = {
  id: Id;
  publicId: string;
  tenantId: Id;
  company: string;
  companyMark: string;
  role: string;
  location: string;
  employmentType: string;
  status: string;
  stage: WorkflowStage;
  workflowStage: WorkflowStage;
  resumeScore: number;
  evidenceCoverage: number;
  atsAlignment: number;
  interviewStatus: string;
  researchConfidence: number;
  deadline?: string;
  archived: boolean;
  roleFamily: string;
  nextAction: string;
  jobDescriptionPublicId?: string;
  resumePublicId?: string;
  ownerUserId: Id;
  metadata?: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type EvidenceRecord = {
  id: Id;
  publicId: string;
  tenantId: Id;
  title: string;
  organization: string;
  situation: string;
  task: string;
  actions: string[];
  result: string;
  technologies: string[];
  confidence: string;
  verificationStatus: string;
  privacyLevel: string;
  excludedFromApplicationIds: string[];
  matchedApplicationIds: string[];
  payload: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ResumeRecord = {
  id: Id;
  publicId: string;
  tenantId: Id;
  applicationId: Id;
  applicationPublicId: string;
  title: string;
  templateId: string;
  length: string;
  currentVersionPublicId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ResumeVersionRecord = {
  id: Id;
  publicId: string;
  tenantId: Id;
  resumeId: Id;
  versionNumber: number;
  versionLabel: string;
  score: number;
  scoreBreakdown: Record<string, number>;
  notes: string;
  triggeredBy: string;
  sections: unknown[];
  idempotencyKey: string;
  promptVersion?: string;
  createdAt: string;
};

export type AuditRunRecord = {
  id: Id;
  publicId: string;
  tenantId: Id;
  applicationId: Id;
  applicationPublicId: string;
  lens: string;
  label: string;
  reviewsVersion: string;
  producesVersion?: string;
  status: string;
  scoreBefore: number;
  scoreAfter?: number;
  summary: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type AuditFindingRecord = {
  id: Id;
  publicId: string;
  tenantId: Id;
  auditRunId: Id;
  auditRunPublicId: string;
  severity: string;
  status: string;
  section: string;
  title: string;
  explanation: string;
  beforeText: string;
  suggestedText: string;
  evidenceSource?: string;
  expectedScoreImpact: number;
  editedText?: string;
};

export type ResearchRunRecord = {
  id: Id;
  publicId: string;
  tenantId: Id;
  applicationId: Id;
  applicationPublicId: string;
  status: string;
  depth: string;
  confidence: number;
  findings: unknown[];
  sources: unknown[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type MistakeMemoryRuleRecord = {
  id: Id;
  publicId: string;
  tenantId: Id;
  applicationId: Id;
  originatingAudit: string;
  affectedVersion: string;
  category: string;
  rule: string;
  severity: string;
  status: string;
  userOverride: boolean;
  appliedIn: string[];
  createdAt: string;
  updatedAt: string;
};

export type WorkflowRunRecord = {
  id: Id;
  publicId: string;
  tenantId: Id;
  applicationId: Id;
  applicationPublicId: string;
  stage: WorkflowStage;
  status: "queued" | "running" | "waiting_review" | "completed" | "failed" | "cancelled" | "retrying";
  attempt: number;
  idempotencyKey: string;
  inputVersion?: string;
  outputVersion?: string;
  provider?: string;
  model?: string;
  promptVersion?: string;
  tokenUsage?: { input?: number; output?: number; total?: number };
  estimatedCostCents?: string;
  errorClass?: string;
  retryStatus?: string;
  backoffMs?: number;
  nextRetryAt?: string;
  maxAttempts: number;
  traceId?: string;
  startedAt?: string;
  completedAt?: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowEventRecord = {
  id: Id;
  publicId: string;
  workflowRunId: Id;
  workflowRunPublicId: string;
  tenantId: Id;
  applicationId: Id;
  applicationPublicId: string;
  stage: WorkflowStage;
  status: string;
  message: string;
  seq: number;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type UsageLedgerRecord = {
  id: Id;
  publicId: string;
  tenantId: Id;
  userId?: Id;
  kind: string;
  units: string;
  costCents: string;
  workflowRunId?: Id;
  idempotencyKey: string;
  status: "reserved" | "committed" | "released";
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type StoredFileRecord = {
  id: Id;
  publicId: string;
  tenantId: Id;
  ownerUserId: Id;
  purpose: string;
  storageKey: string;
  mimeType: string;
  size: number;
  checksum?: string;
  scanStatus: string;
  retentionState: string;
  physicalDeleteAt?: string;
  createdAt: string;
  deletedAt: string | null;
};

export type InterviewSessionRecord = {
  id: Id;
  publicId: string;
  tenantId: Id;
  applicationId: Id;
  applicationPublicId: string;
  mode: string;
  status: "setup" | "active" | "paused" | "ended";
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type CandidateProfileRecord = {
  id: Id;
  publicId: string;
  tenantId: Id;
  userId: Id | null;
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
  remoteOk: boolean;
  preferredLocations: string[];
  workAuthorization: string | null;
  requiresSponsorship: boolean | null;
  onboardingStep: number;
  onboardingCompletedAt: string | null;
  modelImprovementOptIn: boolean;
  sourceResumeFilePublicId: string | null;
  resumeImportStatus: string | null;
  resumeImportExtraction: Record<string, unknown> | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

/**
 * MemoryStore-shaped dependency. Implemented by `memory-store.ts` (sibling)
 * or any compatible in-memory store for tests.
 */
export interface MemoryStoreLike {
  users: Map<string, UserRecord>;
  tenants: Map<string, TenantRecord>;
  memberships: MembershipRecord[];
  sessions: Map<string, SessionRecord>;
  applications: Map<string, ApplicationRecord>;
  evidence: Map<string, EvidenceRecord>;
  resumes: Map<string, ResumeRecord>;
  resumeVersions: Map<string, ResumeVersionRecord>;
  auditRuns: Map<string, AuditRunRecord>;
  auditFindings: Map<string, AuditFindingRecord>;
  mistakeMemoryRules: Map<string, MistakeMemoryRuleRecord>;
  researchRuns: Map<string, ResearchRunRecord>;
  workflowRuns: Map<string, WorkflowRunRecord>;
  workflowEvents: WorkflowEventRecord[];
  usageLedger: Map<string, UsageLedgerRecord>;
  storedFiles: Map<string, StoredFileRecord>;
  interviews: Map<string, InterviewSessionRecord>;
  candidateProfiles: Map<string, CandidateProfileRecord>;
  /** optional helpers some stores expose */
  getTenantIdForUser?(userId: string): string | null;
  ensureSeeded?(): Promise<void> | void;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/* -------------------------------------------------------------------------- */
/* Repository interfaces                                                      */
/* -------------------------------------------------------------------------- */

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  findByPublicId(publicId: string): Promise<UserRecord | null>;
  create(user: Omit<UserRecord, "id" | "createdAt" | "updatedAt" | "deletedAt"> & { id?: string }): Promise<UserRecord>;
  listMemberships(userId: string): Promise<Array<MembershipRecord & { tenant: TenantRecord }>>;
  createTenant(tenant: Omit<TenantRecord, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<TenantRecord>;
  createMembership(membership: Omit<MembershipRecord, "id" | "createdAt"> & { id?: string }): Promise<MembershipRecord>;
}

export interface SessionRepository {
  create(session: Omit<SessionRecord, "createdAt" | "revokedAt"> & { createdAt?: string }): Promise<SessionRecord>;
  findById(id: string): Promise<SessionRecord | null>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  revoke(id: string): Promise<void>;
}

export interface ApplicationRepository {
  create(app: Omit<ApplicationRecord, "createdAt" | "updatedAt" | "deletedAt" | "version"> & { version?: number }): Promise<ApplicationRecord>;
  list(tenantId: string, opts?: { includeArchived?: boolean }): Promise<ApplicationRecord[]>;
  getByPublicId(tenantId: string, publicId: string): Promise<ApplicationRecord | null>;
  getByPublicIdGlobal(publicId: string): Promise<ApplicationRecord | null>;
  update(tenantId: string, publicId: string, patch: Partial<ApplicationRecord>): Promise<ApplicationRecord>;
  softDelete(tenantId: string, publicId: string): Promise<void>;
}

export interface EvidenceRepository {
  list(tenantId: string): Promise<EvidenceRecord[]>;
  getByPublicId(tenantId: string, publicId: string): Promise<EvidenceRecord | null>;
  getByPublicIdGlobal(publicId: string): Promise<EvidenceRecord | null>;
  create(item: Omit<EvidenceRecord, "createdAt" | "updatedAt" | "deletedAt" | "version"> & { version?: number }): Promise<EvidenceRecord>;
  update(tenantId: string, publicId: string, patch: Partial<EvidenceRecord>): Promise<EvidenceRecord>;
  softDelete(tenantId: string, publicId: string): Promise<void>;
}

export interface ResumeRepository {
  getByApplication(tenantId: string, applicationPublicId: string): Promise<ResumeRecord | null>;
  listVersions(tenantId: string, resumePublicId: string): Promise<ResumeVersionRecord[]>;
  getVersion(tenantId: string, versionPublicId: string): Promise<ResumeVersionRecord | null>;
  findVersionByIdempotency(tenantId: string, idempotencyKey: string): Promise<ResumeVersionRecord | null>;
  createResume(resume: Omit<ResumeRecord, "createdAt" | "updatedAt" | "deletedAt">): Promise<ResumeRecord>;
  appendVersion(version: Omit<ResumeVersionRecord, "createdAt"> & { createdAt?: string }): Promise<ResumeVersionRecord>;
  setCurrentVersion(tenantId: string, resumePublicId: string, versionPublicId: string): Promise<ResumeRecord>;
}

export interface AuditRepository {
  listRuns(tenantId: string, applicationPublicId: string): Promise<AuditRunRecord[]>;
  listFindings(tenantId: string, auditRunPublicId: string): Promise<AuditFindingRecord[]>;
  getFinding(tenantId: string, findingPublicId: string): Promise<AuditFindingRecord | null>;
  updateFindingDecision(
    tenantId: string,
    findingPublicId: string,
    decision: FindingDecision,
    editedText?: string,
  ): Promise<AuditFindingRecord>;
  createRun(run: Omit<AuditRunRecord, "createdAt" | "updatedAt"> & { createdAt?: string }): Promise<AuditRunRecord>;
  createFindings(findings: Array<Omit<AuditFindingRecord, "id"> & { id?: string }>): Promise<AuditFindingRecord[]>;
}

export interface ResearchRepository {
  createRun(run: Omit<ResearchRunRecord, "createdAt" | "updatedAt"> & { createdAt?: string }): Promise<ResearchRunRecord>;
  getLatest(tenantId: string, applicationPublicId: string): Promise<ResearchRunRecord | null>;
  updateRun(tenantId: string, publicId: string, patch: Partial<ResearchRunRecord>): Promise<ResearchRunRecord>;
}

export interface WorkflowRepository {
  createRun(run: Omit<WorkflowRunRecord, "createdAt" | "updatedAt"> & { createdAt?: string }): Promise<WorkflowRunRecord>;
  findByIdempotency(tenantId: string, idempotencyKey: string): Promise<WorkflowRunRecord | null>;
  getByPublicId(tenantId: string, publicId: string): Promise<WorkflowRunRecord | null>;
  getById(id: string): Promise<WorkflowRunRecord | null>;
  updateRun(id: string, patch: Partial<WorkflowRunRecord>): Promise<WorkflowRunRecord>;
  appendEvent(event: Omit<WorkflowEventRecord, "id" | "publicId" | "seq" | "createdAt"> & { seq?: number }): Promise<WorkflowEventRecord>;
  listEvents(tenantId: string, workflowPublicId: string, sinceSeq?: number): Promise<WorkflowEventRecord[]>;
  listByApplication(tenantId: string, applicationPublicId: string): Promise<WorkflowRunRecord[]>;
  /** Non-terminal runs that should be re-enqueued after a worker/process restart. */
  listIncomplete(limit?: number): Promise<WorkflowRunRecord[]>;
}

export interface UsageRepository {
  findByIdempotency(idempotencyKey: string): Promise<UsageLedgerRecord | null>;
  append(entry: Omit<UsageLedgerRecord, "id" | "publicId" | "createdAt"> & { id?: string; publicId?: string }): Promise<UsageLedgerRecord>;
  updateStatus(idempotencyKey: string, status: UsageLedgerRecord["status"]): Promise<UsageLedgerRecord>;
}

export interface FileRepository {
  create(file: Omit<StoredFileRecord, "createdAt" | "deletedAt"> & { createdAt?: string }): Promise<StoredFileRecord>;
  getByPublicId(tenantId: string, publicId: string): Promise<StoredFileRecord | null>;
  update(tenantId: string, publicId: string, patch: Partial<StoredFileRecord>): Promise<StoredFileRecord>;
  softDelete(tenantId: string, publicId: string, physicalDeleteAt: string): Promise<StoredFileRecord>;
}

export interface CandidateProfileRepository {
  getByUser(tenantId: string, userId: string): Promise<CandidateProfileRecord | null>;
  findBySourceResumeFile(tenantId: string, filePublicId: string): Promise<CandidateProfileRecord | null>;
  upsert(
    input: Omit<CandidateProfileRecord, "createdAt" | "updatedAt" | "deletedAt" | "version"> & {
      version?: number;
    },
  ): Promise<CandidateProfileRecord>;
  updateOnboarding(
    tenantId: string,
    userId: string,
    patch: Partial<
      Pick<
        CandidateProfileRecord,
        | "onboardingStep"
        | "onboardingCompletedAt"
        | "careerGoal"
        | "fullName"
        | "email"
        | "phone"
        | "location"
        | "github"
        | "portfolio"
        | "experienceLevel"
        | "yearsExperience"
        | "targetRoleFamilies"
        | "preferredResumeLength"
        | "remoteOk"
        | "preferredLocations"
        | "workAuthorization"
        | "requiresSponsorship"
        | "modelImprovementOptIn"
      >
    >,
  ): Promise<CandidateProfileRecord>;
  update(
    tenantId: string,
    userId: string,
    patch: Partial<Omit<CandidateProfileRecord, "id" | "publicId" | "tenantId" | "userId" | "createdAt">>,
  ): Promise<CandidateProfileRecord>;
}

export interface InterviewRepository {
  create(session: Omit<InterviewSessionRecord, "createdAt" | "updatedAt" | "deletedAt">): Promise<InterviewSessionRecord>;
  list(tenantId: string): Promise<InterviewSessionRecord[]>;
  getByPublicId(tenantId: string, publicId: string): Promise<InterviewSessionRecord | null>;
  getByPublicIdGlobal(publicId: string): Promise<InterviewSessionRecord | null>;
  update(tenantId: string, publicId: string, patch: Partial<InterviewSessionRecord>): Promise<InterviewSessionRecord>;
}

export type Repositories = {
  users: UserRepository;
  sessions: SessionRepository;
  applications: ApplicationRepository;
  evidence: EvidenceRepository;
  resumes: ResumeRepository;
  audits: AuditRepository;
  research: ResearchRepository;
  workflows: WorkflowRepository;
  usage: UsageRepository;
  files: FileRepository;
  interviews: InterviewRepository;
  candidateProfiles: CandidateProfileRepository;
  store: MemoryStoreLike;
};

/* -------------------------------------------------------------------------- */
/* Memory implementation                                                      */
/* -------------------------------------------------------------------------- */

export class MemoryRepositories implements Repositories {
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly applications: ApplicationRepository;
  readonly evidence: EvidenceRepository;
  readonly resumes: ResumeRepository;
  readonly audits: AuditRepository;
  readonly research: ResearchRepository;
  readonly workflows: WorkflowRepository;
  readonly usage: UsageRepository;
  readonly files: FileRepository;
  readonly interviews: InterviewRepository;
  readonly candidateProfiles: CandidateProfileRepository;

  constructor(public readonly store: MemoryStoreLike) {
    this.users = {
      async findByEmail(email) {
        for (const u of store.users.values()) {
          if (u.email.toLowerCase() === email.toLowerCase() && !u.deletedAt) return u;
        }
        return null;
      },
      async findById(id) {
        return store.users.get(id) ?? null;
      },
      async findByPublicId(publicId) {
        for (const u of store.users.values()) {
          if (u.publicId === publicId && !u.deletedAt) return u;
        }
        return null;
      },
      async create(input) {
        const id = input.id ?? newId("usr");
        const record: UserRecord = {
          ...input,
          id,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          deletedAt: null,
        };
        store.users.set(id, record);
        return record;
      },
      async listMemberships(userId) {
        return store.memberships
          .filter((m) => m.userId === userId)
          .map((m) => {
            const tenant = store.tenants.get(m.tenantId);
            if (!tenant) throw new AppError("TENANT_NOT_FOUND", "Tenant missing for membership", 500);
            return { ...m, tenant };
          });
      },
      async createTenant(input) {
        const record: TenantRecord = {
          ...input,
          id: input.id ?? newId("ten"),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        store.tenants.set(record.id, record);
        return record;
      },
      async createMembership(input) {
        const record: MembershipRecord = {
          ...input,
          id: input.id ?? newId("mem"),
          createdAt: nowIso(),
        };
        store.memberships.push(record);
        return record;
      },
    };

    this.sessions = {
      async create(session) {
        const record: SessionRecord = {
          ...session,
          createdAt: session.createdAt ?? nowIso(),
          revokedAt: null,
        };
        store.sessions.set(record.id, record);
        return record;
      },
      async findById(id) {
        return store.sessions.get(id) ?? null;
      },
      async findByTokenHash(tokenHash) {
        for (const s of store.sessions.values()) {
          if (s.tokenHash === tokenHash && !s.revokedAt) return s;
        }
        return null;
      },
      async revoke(id) {
        const s = store.sessions.get(id);
        if (s) store.sessions.set(id, { ...s, revokedAt: nowIso() });
      },
    };

    this.applications = {
      async create(app) {
        const record: ApplicationRecord = {
          ...app,
          version: app.version ?? 1,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          deletedAt: null,
        };
        store.applications.set(record.id, record);
        return record;
      },
      async list(tenantId, opts) {
        return [...store.applications.values()].filter(
          (a) =>
            a.tenantId === tenantId &&
            !a.deletedAt &&
            (opts?.includeArchived ? true : !a.archived),
        );
      },
      async getByPublicId(tenantId, publicId) {
        for (const a of store.applications.values()) {
          if (a.tenantId === tenantId && a.publicId === publicId && !a.deletedAt) return a;
        }
        return null;
      },
      async getByPublicIdGlobal(publicId) {
        for (const a of store.applications.values()) {
          if (a.publicId === publicId && !a.deletedAt) return a;
        }
        return null;
      },
      async update(tenantId, publicId, patch) {
        let existing: ApplicationRecord | null = null;
        for (const a of store.applications.values()) {
          if (a.tenantId === tenantId && a.publicId === publicId && !a.deletedAt) {
            existing = a;
            break;
          }
        }
        if (!existing) throw new AppError("APPLICATION_NOT_FOUND", "Application not found", 404);
        const updated: ApplicationRecord = {
          ...existing,
          ...patch,
          id: existing.id,
          publicId: existing.publicId,
          tenantId: existing.tenantId,
          version: existing.version + 1,
          updatedAt: nowIso(),
        };
        store.applications.set(existing.id, updated);
        return updated;
      },
      async softDelete(tenantId, publicId) {
        let existing: ApplicationRecord | null = null;
        for (const a of store.applications.values()) {
          if (a.tenantId === tenantId && a.publicId === publicId && !a.deletedAt) {
            existing = a;
            break;
          }
        }
        if (!existing) throw new AppError("APPLICATION_NOT_FOUND", "Application not found", 404);
        store.applications.set(existing.id, {
          ...existing,
          deletedAt: nowIso(),
          archived: true,
          status: "archived",
          version: existing.version + 1,
          updatedAt: nowIso(),
        });
      },
    };

    this.evidence = {
      async list(tenantId) {
        return [...store.evidence.values()].filter((e) => e.tenantId === tenantId && !e.deletedAt);
      },
      async getByPublicId(tenantId, publicId) {
        for (const e of store.evidence.values()) {
          if (e.tenantId === tenantId && e.publicId === publicId && !e.deletedAt) return e;
        }
        return null;
      },
      async getByPublicIdGlobal(publicId) {
        for (const e of store.evidence.values()) {
          if (e.publicId === publicId && !e.deletedAt) return e;
        }
        return null;
      },
      async create(item) {
        const record: EvidenceRecord = {
          ...item,
          version: item.version ?? 1,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          deletedAt: null,
        };
        store.evidence.set(record.id, record);
        return record;
      },
      async update(tenantId, publicId, patch) {
        let existing: EvidenceRecord | null = null;
        for (const e of store.evidence.values()) {
          if (e.tenantId === tenantId && e.publicId === publicId && !e.deletedAt) {
            existing = e;
            break;
          }
        }
        if (!existing) throw new AppError("EVIDENCE_NOT_FOUND", "Evidence not found", 404);
        const updated = { ...existing, ...patch, version: existing.version + 1, updatedAt: nowIso() };
        store.evidence.set(existing.id, updated);
        return updated;
      },
      async softDelete(tenantId, publicId) {
        let existing: EvidenceRecord | null = null;
        for (const e of store.evidence.values()) {
          if (e.tenantId === tenantId && e.publicId === publicId && !e.deletedAt) {
            existing = e;
            break;
          }
        }
        if (!existing) throw new AppError("EVIDENCE_NOT_FOUND", "Evidence not found", 404);
        store.evidence.set(existing.id, {
          ...existing,
          deletedAt: nowIso(),
          version: existing.version + 1,
          updatedAt: nowIso(),
        });
      },
    };

    this.resumes = {
      async getByApplication(tenantId, applicationPublicId) {
        for (const r of store.resumes.values()) {
          if (r.tenantId === tenantId && r.applicationPublicId === applicationPublicId && !r.deletedAt) return r;
        }
        return null;
      },
      async listVersions(tenantId, resumePublicId) {
        const resume = [...store.resumes.values()].find((r) => r.tenantId === tenantId && r.publicId === resumePublicId);
        if (!resume) return [];
        return [...store.resumeVersions.values()]
          .filter((v) => v.resumeId === resume.id && v.tenantId === tenantId)
          .sort((a, b) => a.versionNumber - b.versionNumber);
      },
      async getVersion(tenantId, versionPublicId) {
        for (const v of store.resumeVersions.values()) {
          if (v.tenantId === tenantId && v.publicId === versionPublicId) return v;
        }
        return null;
      },
      async findVersionByIdempotency(tenantId, idempotencyKey) {
        for (const v of store.resumeVersions.values()) {
          if (v.tenantId === tenantId && v.idempotencyKey === idempotencyKey) return v;
        }
        return null;
      },
      async createResume(resume) {
        const record: ResumeRecord = {
          ...resume,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          deletedAt: null,
        };
        store.resumes.set(record.id, record);
        return record;
      },
      async appendVersion(version) {
        const existing = [...store.resumeVersions.values()].find(
          (v) => v.tenantId === version.tenantId && v.idempotencyKey === version.idempotencyKey,
        );
        if (existing) return existing;
        const record: ResumeVersionRecord = {
          ...version,
          scoreBreakdown: structuredClone(version.scoreBreakdown),
          sections: structuredClone(version.sections),
          createdAt: version.createdAt ?? nowIso(),
        };
        store.resumeVersions.set(record.id, record);
        return record;
      },
      async setCurrentVersion(tenantId, resumePublicId, versionPublicId) {
        const resume = [...store.resumes.values()].find((r) => r.tenantId === tenantId && r.publicId === resumePublicId);
        if (!resume) throw new AppError("RESUME_NOT_FOUND", "Resume not found", 404);
        const updated = { ...resume, currentVersionPublicId: versionPublicId, updatedAt: nowIso() };
        store.resumes.set(resume.id, updated);
        return updated;
      },
    };

    this.audits = {
      async listRuns(tenantId, applicationPublicId) {
        return [...store.auditRuns.values()].filter(
          (r) => r.tenantId === tenantId && r.applicationPublicId === applicationPublicId,
        );
      },
      async listFindings(tenantId, auditRunPublicId) {
        return [...store.auditFindings.values()].filter(
          (finding) => finding.tenantId === tenantId && finding.auditRunPublicId === auditRunPublicId,
        );
      },
      async getFinding(tenantId, findingPublicId) {
        for (const f of store.auditFindings.values()) {
          if (f.tenantId === tenantId && f.publicId === findingPublicId) return f;
        }
        return null;
      },
      async updateFindingDecision(tenantId, findingPublicId, decision, editedText) {
        let finding: AuditFindingRecord | null = null;
        for (const f of store.auditFindings.values()) {
          if (f.tenantId === tenantId && f.publicId === findingPublicId) {
            finding = f;
            break;
          }
        }
        if (!finding) throw new AppError("FINDING_NOT_FOUND", "Audit finding not found", 404);
        const updated: AuditFindingRecord = {
          ...finding,
          status: decision,
          suggestedText: decision === "edited" && editedText ? editedText : finding.suggestedText,
          editedText: decision === "edited" ? editedText : finding.editedText,
        };
        store.auditFindings.set(finding.id, updated);
        return updated;
      },
      async createRun(run) {
        const record: AuditRunRecord = { ...run, createdAt: run.createdAt ?? nowIso(), updatedAt: nowIso() };
        store.auditRuns.set(record.id, record);
        return record;
      },
      async createFindings(findings) {
        return findings.map((f) => {
          const record: AuditFindingRecord = { ...f, id: f.id ?? newId("af") };
          store.auditFindings.set(record.id, record);
          return record;
        });
      },
    };

    this.research = {
      async createRun(run) {
        const record: ResearchRunRecord = { ...run, createdAt: run.createdAt ?? nowIso(), updatedAt: nowIso() };
        store.researchRuns.set(record.id, record);
        return record;
      },
      async getLatest(tenantId, applicationPublicId) {
        const runs = [...store.researchRuns.values()]
          .filter((r) => r.tenantId === tenantId && r.applicationPublicId === applicationPublicId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return runs[0] ?? null;
      },
      async updateRun(tenantId, publicId, patch) {
        const existing = [...store.researchRuns.values()].find((r) => r.tenantId === tenantId && r.publicId === publicId);
        if (!existing) throw new AppError("RESEARCH_NOT_FOUND", "Research run not found", 404);
        const updated = { ...existing, ...patch, updatedAt: nowIso() };
        store.researchRuns.set(existing.id, updated);
        return updated;
      },
    };

    this.workflows = {
      async createRun(run) {
        const record: WorkflowRunRecord = { ...run, createdAt: run.createdAt ?? nowIso(), updatedAt: nowIso() };
        store.workflowRuns.set(record.id, record);
        return record;
      },
      async findByIdempotency(tenantId, idempotencyKey) {
        for (const r of store.workflowRuns.values()) {
          if (r.tenantId === tenantId && r.idempotencyKey === idempotencyKey) return r;
        }
        return null;
      },
      async getByPublicId(tenantId, publicId) {
        for (const r of store.workflowRuns.values()) {
          if (r.tenantId === tenantId && r.publicId === publicId) return r;
        }
        return null;
      },
      async getById(id) {
        return store.workflowRuns.get(id) ?? null;
      },
      async updateRun(id, patch) {
        const existing = store.workflowRuns.get(id);
        if (!existing) throw new AppError("WORKFLOW_NOT_FOUND", "Workflow run not found", 404);
        const updated = { ...existing, ...patch, updatedAt: nowIso() };
        store.workflowRuns.set(id, updated);
        return updated;
      },
      async appendEvent(event) {
        const existingSeq = store.workflowEvents
          .filter((e) => e.workflowRunId === event.workflowRunId)
          .reduce((max, e) => Math.max(max, e.seq), 0);
        const record: WorkflowEventRecord = {
          ...event,
          id: newId("we"),
          publicId: newId("wep"),
          seq: event.seq ?? existingSeq + 1,
          createdAt: nowIso(),
        };
        store.workflowEvents.push(record);
        return record;
      },
      async listEvents(tenantId, workflowPublicId, sinceSeq = 0) {
        let run: WorkflowRunRecord | null = null;
        for (const r of store.workflowRuns.values()) {
          if (r.tenantId === tenantId && r.publicId === workflowPublicId) {
            run = r;
            break;
          }
        }
        if (!run) return [];
        return store.workflowEvents
          .filter((e) => e.workflowRunId === run!.id && e.seq > sinceSeq)
          .sort((a, b) => a.seq - b.seq);
      },
      async listByApplication(tenantId, applicationPublicId) {
        return [...store.workflowRuns.values()].filter(
          (r) => r.tenantId === tenantId && r.applicationPublicId === applicationPublicId,
        );
      },
      async listIncomplete(limit = 200) {
        const active = new Set(["queued", "running", "retrying"]);
        return [...store.workflowRuns.values()]
          .filter((r) => active.has(r.status) && !["FINAL_READY", "FAILED", "CANCELLED", "FINAL_QA_FAILED"].includes(r.stage))
          .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
          .slice(0, limit);
      },
    };

    this.usage = {
      async findByIdempotency(idempotencyKey) {
        for (const u of store.usageLedger.values()) {
          if (u.idempotencyKey === idempotencyKey) return u;
        }
        return null;
      },
      async append(entry) {
        for (const u of store.usageLedger.values()) {
          if (u.idempotencyKey === entry.idempotencyKey) return u;
        }
        const record: UsageLedgerRecord = {
          ...entry,
          id: entry.id ?? newId("ul"),
          publicId: entry.publicId ?? newId("ulp"),
          createdAt: nowIso(),
        };
        store.usageLedger.set(record.id, record);
        return record;
      },
      async updateStatus(idempotencyKey, status) {
        let existing: UsageLedgerRecord | null = null;
        for (const u of store.usageLedger.values()) {
          if (u.idempotencyKey === idempotencyKey) {
            existing = u;
            break;
          }
        }
        if (!existing) throw new AppError("USAGE_NOT_FOUND", "Usage ledger entry not found", 404);
        const updated = { ...existing, status };
        store.usageLedger.set(existing.id, updated);
        return updated;
      },
    };

    this.files = {
      async create(file) {
        const record: StoredFileRecord = {
          ...file,
          createdAt: file.createdAt ?? nowIso(),
          deletedAt: null,
        };
        store.storedFiles.set(record.id, record);
        return record;
      },
      async getByPublicId(tenantId, publicId) {
        for (const f of store.storedFiles.values()) {
          if (f.tenantId === tenantId && f.publicId === publicId && !f.deletedAt) return f;
        }
        return null;
      },
      async update(tenantId, publicId, patch) {
        let existing: StoredFileRecord | null = null;
        for (const f of store.storedFiles.values()) {
          if (f.tenantId === tenantId && f.publicId === publicId && !f.deletedAt) {
            existing = f;
            break;
          }
        }
        if (!existing) throw new AppError("FILE_NOT_FOUND", "File not found", 404);
        const updated = { ...existing, ...patch };
        store.storedFiles.set(existing.id, updated);
        return updated;
      },
      async softDelete(tenantId, publicId, physicalDeleteAt) {
        let existing: StoredFileRecord | null = null;
        for (const f of store.storedFiles.values()) {
          if (f.tenantId === tenantId && f.publicId === publicId && !f.deletedAt) {
            existing = f;
            break;
          }
        }
        if (!existing) throw new AppError("FILE_NOT_FOUND", "File not found", 404);
        const updated = { ...existing, deletedAt: nowIso(), physicalDeleteAt, retentionState: "pending_delete" };
        store.storedFiles.set(existing.id, updated);
        return updated;
      },
    };

    this.interviews = {
      async create(session) {
        const record: InterviewSessionRecord = {
          ...session,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          deletedAt: null,
        };
        store.interviews.set(record.id, record);
        return record;
      },
      async list(tenantId) {
        return [...store.interviews.values()].filter((s) => s.tenantId === tenantId && !s.deletedAt);
      },
      async getByPublicId(tenantId, publicId) {
        for (const s of store.interviews.values()) {
          if (s.tenantId === tenantId && s.publicId === publicId && !s.deletedAt) return s;
        }
        return null;
      },
      async getByPublicIdGlobal(publicId) {
        for (const s of store.interviews.values()) {
          if (s.publicId === publicId && !s.deletedAt) return s;
        }
        return null;
      },
      async update(tenantId, publicId, patch) {
        let existing: InterviewSessionRecord | null = null;
        for (const s of store.interviews.values()) {
          if (s.tenantId === tenantId && s.publicId === publicId && !s.deletedAt) {
            existing = s;
            break;
          }
        }
        if (!existing) throw new AppError("INTERVIEW_NOT_FOUND", "Interview session not found", 404);
        const updated = { ...existing, ...patch, updatedAt: nowIso() };
        store.interviews.set(existing.id, updated);
        return updated;
      },
    };

    this.candidateProfiles = {
      async getByUser(tenantId, userId) {
        for (const p of store.candidateProfiles.values()) {
          if (p.tenantId === tenantId && p.userId === userId && !p.deletedAt) return p;
        }
        return null;
      },
      async findBySourceResumeFile(tenantId, filePublicId) {
        for (const p of store.candidateProfiles.values()) {
          if (
            p.tenantId === tenantId &&
            p.sourceResumeFilePublicId === filePublicId &&
            !p.deletedAt
          ) {
            return p;
          }
        }
        return null;
      },
      async upsert(input) {
        let existing: CandidateProfileRecord | null = null;
        for (const p of store.candidateProfiles.values()) {
          if (
            p.tenantId === input.tenantId &&
            p.userId === input.userId &&
            !p.deletedAt
          ) {
            existing = p;
            break;
          }
        }
        if (existing) {
          const updated: CandidateProfileRecord = {
            ...existing,
            ...input,
            id: existing.id,
            publicId: existing.publicId,
            tenantId: existing.tenantId,
            userId: existing.userId,
            targetRoleFamilies: input.targetRoleFamilies ?? existing.targetRoleFamilies,
            preferredLocations: input.preferredLocations ?? existing.preferredLocations,
            version: existing.version + 1,
            updatedAt: nowIso(),
          };
          store.candidateProfiles.set(existing.id, updated);
          return updated;
        }
        const record: CandidateProfileRecord = {
          ...input,
          id: input.id ?? newId("cp"),
          version: input.version ?? 1,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          deletedAt: null,
        };
        store.candidateProfiles.set(record.id, record);
        return record;
      },
      async updateOnboarding(tenantId, userId, patch) {
        let existing: CandidateProfileRecord | null = null;
        for (const p of store.candidateProfiles.values()) {
          if (p.tenantId === tenantId && p.userId === userId && !p.deletedAt) {
            existing = p;
            break;
          }
        }
        if (!existing) throw new AppError("PROFILE_NOT_FOUND", "Candidate profile not found", 404);
        const updated: CandidateProfileRecord = {
          ...existing,
          ...patch,
          version: existing.version + 1,
          updatedAt: nowIso(),
        };
        store.candidateProfiles.set(existing.id, updated);
        return updated;
      },
      async update(tenantId, userId, patch) {
        let existing: CandidateProfileRecord | null = null;
        for (const p of store.candidateProfiles.values()) {
          if (p.tenantId === tenantId && p.userId === userId && !p.deletedAt) {
            existing = p;
            break;
          }
        }
        if (!existing) throw new AppError("PROFILE_NOT_FOUND", "Candidate profile not found", 404);
        const updated: CandidateProfileRecord = {
          ...existing,
          ...patch,
          id: existing.id,
          publicId: existing.publicId,
          tenantId: existing.tenantId,
          userId: existing.userId,
          version: existing.version + 1,
          updatedAt: nowIso(),
        };
        store.candidateProfiles.set(existing.id, updated);
        return updated;
      },
    };
  }
}

export function createEmptyMemoryStore(): MemoryStoreLike {
  return {
    users: new Map(),
    tenants: new Map(),
    memberships: [],
    sessions: new Map(),
    applications: new Map(),
    evidence: new Map(),
    resumes: new Map(),
    resumeVersions: new Map(),
    auditRuns: new Map(),
    auditFindings: new Map(),
    mistakeMemoryRules: new Map(),
    researchRuns: new Map(),
    workflowRuns: new Map(),
    workflowEvents: [],
    usageLedger: new Map(),
    storedFiles: new Map(),
    interviews: new Map(),
    candidateProfiles: new Map(),
  };
}
