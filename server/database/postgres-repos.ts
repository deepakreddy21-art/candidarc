import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "./client";
import * as s from "./schema";
import {
  MemoryRepositories,
  createEmptyMemoryStore,
  newId,
  type ApplicationRecord,
  type MembershipRecord,
  type SessionRecord,
  type TenantRecord,
  type UserRecord,
  type WorkflowEventRecord,
  type WorkflowRunRecord,
} from "./repositories";
import { AppError } from "../domain/types";

const iso = (value: Date | null | undefined) => value?.toISOString();

/**
 * PostgreSQL-backed identity, application and durable workflow repositories.
 * Remaining catalog-only repositories retain a process-local facade until their
 * dedicated release migration lands; production workflow state never uses it.
 */
export class PostgresRepositories extends MemoryRepositories {
  constructor() {
    super(createEmptyMemoryStore());
    const db = getDb();
    if (!db) throw new Error("PostgresRepositories requires CANDIDARC_DATA_MODE=postgres");

    Object.assign(this, {
      users: {
        findByEmail: async (email: string) => mapUser((await db.select().from(s.users).where(and(eq(s.users.email, email.toLowerCase()), isNull(s.users.deletedAt))).limit(1))[0]),
        findById: async (id: string) => mapUser((await db.select().from(s.users).where(eq(s.users.id, id)).limit(1))[0]),
        findByPublicId: async (publicId: string) => mapUser((await db.select().from(s.users).where(eq(s.users.publicId, publicId)).limit(1))[0]),
        create: async (input: Omit<UserRecord, "id" | "createdAt" | "updatedAt" | "deletedAt"> & { id?: string }) =>
          mapUser((await db.insert(s.users).values({ id: input.id, publicId: input.publicId, email: input.email.toLowerCase(), emailVerified: input.emailVerified, passwordHash: input.passwordHash, name: input.name }).returning())[0])!,
        listMemberships: async (userId: string) => {
          const rows = await db.select({ membership: s.tenantMemberships, tenant: s.tenants }).from(s.tenantMemberships).innerJoin(s.tenants, eq(s.tenantMemberships.tenantId, s.tenants.id)).where(eq(s.tenantMemberships.userId, userId));
          return rows.map(({ membership, tenant }) => ({ id: membership.id, tenantId: membership.tenantId, userId: membership.userId, role: membership.role, createdAt: membership.createdAt.toISOString(), tenant: mapTenant(tenant) }));
        },
        createTenant: async (input: Omit<TenantRecord, "id" | "createdAt" | "updatedAt"> & { id?: string }) =>
          mapTenant((await db.insert(s.tenants).values({ id: input.id, publicId: input.publicId, name: input.name, plan: input.plan as "free" | "pro" | "team" | "enterprise" }).returning())[0]),
        createMembership: async (input: Omit<MembershipRecord, "id" | "createdAt"> & { id?: string }) => {
          const row = (await db.insert(s.tenantMemberships).values({ id: input.id, tenantId: input.tenantId, userId: input.userId, role: input.role }).returning())[0]!;
          return { ...row, createdAt: row.createdAt.toISOString() };
        },
      },
      sessions: {
        create: async (input: Omit<SessionRecord, "createdAt" | "revokedAt"> & { createdAt?: string }) => mapSession((await db.insert(s.sessions).values({ id: input.id, userId: input.userId, tokenHash: input.tokenHash, expiresAt: new Date(input.expiresAt), createdAt: input.createdAt ? new Date(input.createdAt) : undefined }).returning())[0])!,
        findById: async (id: string) => mapSession((await db.select().from(s.sessions).where(eq(s.sessions.id, id)).limit(1))[0]),
        findByTokenHash: async (hash: string) => mapSession((await db.select().from(s.sessions).where(and(eq(s.sessions.tokenHash, hash), isNull(s.sessions.revokedAt))).limit(1))[0]),
        revoke: async (id: string) => { await db.update(s.sessions).set({ revokedAt: new Date() }).where(eq(s.sessions.id, id)); },
      },
      applications: {
        create: async (input: Omit<ApplicationRecord, "createdAt" | "updatedAt" | "deletedAt" | "version"> & { version?: number }) => mapApplication((await db.insert(s.applications).values(toApplicationValues(input)).returning())[0])!,
        list: async (tenantId: string, opts?: { includeArchived?: boolean }) => (await db.select().from(s.applications).where(and(eq(s.applications.tenantId, tenantId), isNull(s.applications.deletedAt), opts?.includeArchived ? undefined : eq(s.applications.archived, false))).orderBy(desc(s.applications.updatedAt))).map(mapApplicationNonNull),
        getByPublicId: async (tenantId: string, publicId: string) => mapApplication((await db.select().from(s.applications).where(and(eq(s.applications.tenantId, tenantId), eq(s.applications.publicId, publicId), isNull(s.applications.deletedAt))).limit(1))[0]),
        getByPublicIdGlobal: async (publicId: string) => mapApplication((await db.select().from(s.applications).where(and(eq(s.applications.publicId, publicId), isNull(s.applications.deletedAt))).limit(1))[0]),
        update: async (tenantId: string, publicId: string, patch: Partial<ApplicationRecord>) => {
          const row = (await db.update(s.applications).set(toApplicationPatch(patch)).where(and(eq(s.applications.tenantId, tenantId), eq(s.applications.publicId, publicId))).returning())[0];
          if (!row) throw new AppError("APPLICATION_NOT_FOUND", "Application not found", 404);
          return mapApplicationNonNull(row);
        },
        softDelete: async (tenantId: string, publicId: string) => { await db.update(s.applications).set({ deletedAt: new Date(), archived: true }).where(and(eq(s.applications.tenantId, tenantId), eq(s.applications.publicId, publicId))); },
      },
      workflows: {
        createRun: async (input: Omit<WorkflowRunRecord, "createdAt" | "updatedAt"> & { createdAt?: string }) => mapWorkflow((await db.insert(s.workflowRuns).values(toWorkflowValues(input)).returning())[0])!,
        findByIdempotency: async (tenantId: string, key: string) => mapWorkflow((await db.select().from(s.workflowRuns).where(and(eq(s.workflowRuns.tenantId, tenantId), eq(s.workflowRuns.idempotencyKey, key))).limit(1))[0]),
        getByPublicId: async (tenantId: string, publicId: string) => mapWorkflow((await db.select().from(s.workflowRuns).where(and(eq(s.workflowRuns.tenantId, tenantId), eq(s.workflowRuns.publicId, publicId))).limit(1))[0]),
        getById: async (id: string) => mapWorkflow((await db.select().from(s.workflowRuns).where(eq(s.workflowRuns.id, id)).limit(1))[0]),
        updateRun: async (id: string, patch: Partial<WorkflowRunRecord>) => {
          const row = (await db.update(s.workflowRuns).set(toWorkflowPatch(patch)).where(eq(s.workflowRuns.id, id)).returning())[0];
          if (!row) throw new AppError("WORKFLOW_NOT_FOUND", "Workflow not found", 404);
          return mapWorkflow(row)!;
        },
        appendEvent: async (input: Omit<WorkflowEventRecord, "id" | "publicId" | "seq" | "createdAt"> & { seq?: number }) => {
          const previous = await db.select({ seq: s.workflowEvents.seq }).from(s.workflowEvents).where(eq(s.workflowEvents.workflowRunId, input.workflowRunId)).orderBy(desc(s.workflowEvents.seq)).limit(1);
          const row = (await db.insert(s.workflowEvents).values({ publicId: newId("wep"), workflowRunId: input.workflowRunId, tenantId: input.tenantId, applicationId: input.applicationId, stage: input.stage, status: input.status, message: input.message, seq: input.seq ?? (previous[0]?.seq ?? 0) + 1, metadata: input.metadata }).returning())[0]!;
          return { ...row, workflowRunPublicId: input.workflowRunPublicId, applicationPublicId: input.applicationPublicId, message: row.message ?? "", createdAt: row.createdAt.toISOString() };
        },
        listEvents: async (tenantId: string, workflowPublicId: string, sinceSeq = 0) => {
          const run = (await db.select().from(s.workflowRuns).where(and(eq(s.workflowRuns.tenantId, tenantId), eq(s.workflowRuns.publicId, workflowPublicId))).limit(1))[0];
          if (!run) return [];
          const rows = await db.select().from(s.workflowEvents).where(eq(s.workflowEvents.workflowRunId, run.id)).orderBy(asc(s.workflowEvents.seq));
          return rows.filter((row) => row.seq > sinceSeq).map((row) => ({ ...row, workflowRunPublicId: run.publicId, applicationPublicId: "", message: row.message ?? "", createdAt: row.createdAt.toISOString() }));
        },
        listByApplication: async (tenantId: string, applicationPublicId: string) => {
          const app = (await db.select().from(s.applications).where(and(eq(s.applications.tenantId, tenantId), eq(s.applications.publicId, applicationPublicId))).limit(1))[0];
          return app ? (await db.select().from(s.workflowRuns).where(eq(s.workflowRuns.applicationId, app.id)).orderBy(asc(s.workflowRuns.createdAt))).map(mapWorkflowNonNull) : [];
        },
        listIncomplete: async (limit = 200) => {
          const rows = await db
            .select({ run: s.workflowRuns, applicationPublicId: s.applications.publicId })
            .from(s.workflowRuns)
            .innerJoin(s.applications, eq(s.applications.id, s.workflowRuns.applicationId))
            .where(inArray(s.workflowRuns.status, ["queued", "running", "retrying"]))
            .orderBy(asc(s.workflowRuns.updatedAt))
            .limit(limit);
          return rows
            .map(({ run, applicationPublicId }) => {
              const mapped = mapWorkflow(run);
              if (!mapped) return null;
              if (["FINAL_READY", "FAILED", "CANCELLED", "FINAL_QA_FAILED"].includes(mapped.stage)) return null;
              return { ...mapped, applicationPublicId: applicationPublicId || String(mapped.payload?.applicationPublicId ?? "") };
            })
            .filter((row): row is WorkflowRunRecord => Boolean(row));
        },
      },
    });
  }
}

function mapUser(row?: typeof s.users.$inferSelect): UserRecord | null { return row ? { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), deletedAt: iso(row.deletedAt) ?? null } : null; }
function mapTenant(row: typeof s.tenants.$inferSelect): TenantRecord { return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
function mapSession(row?: typeof s.sessions.$inferSelect): SessionRecord | null { return row ? { ...row, expiresAt: row.expiresAt.toISOString(), createdAt: row.createdAt.toISOString(), revokedAt: iso(row.revokedAt) ?? null } : null; }
function mapApplication(row?: typeof s.applications.$inferSelect): ApplicationRecord | null {
  return row ? { ...row, companyMark: row.companyMark ?? "", location: row.location ?? "", employmentType: row.employmentType ?? "", deadline: row.deadline ?? undefined, roleFamily: row.roleFamily ?? "", nextAction: row.nextAction ?? "", jobDescriptionPublicId: undefined, resumePublicId: undefined, ownerUserId: row.ownerUserId ?? "", metadata: row.metadata, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), deletedAt: iso(row.deletedAt) ?? null } : null;
}
const mapApplicationNonNull = (row: typeof s.applications.$inferSelect) => mapApplication(row)!;
function toApplicationValues(row: Omit<ApplicationRecord, "createdAt" | "updatedAt" | "deletedAt" | "version"> & { version?: number }) { return { id: row.id, publicId: row.publicId, tenantId: row.tenantId, company: row.company, companyMark: row.companyMark, role: row.role, location: row.location, employmentType: row.employmentType, status: row.status as typeof s.applications.$inferInsert.status, stage: row.stage, workflowStage: row.workflowStage, resumeScore: row.resumeScore, evidenceCoverage: row.evidenceCoverage, atsAlignment: row.atsAlignment, interviewStatus: row.interviewStatus as typeof s.applications.$inferInsert.interviewStatus, researchConfidence: row.researchConfidence, deadline: row.deadline, archived: row.archived, roleFamily: row.roleFamily, nextAction: row.nextAction, ownerUserId: row.ownerUserId, metadata: row.metadata ?? {}, version: row.version }; }
function toApplicationPatch(row: Partial<ApplicationRecord>) { const copy = { ...row } as Record<string, unknown>; delete copy.id; delete copy.publicId; delete copy.tenantId; delete copy.createdAt; delete copy.updatedAt; delete copy.deletedAt; delete copy.jobDescriptionPublicId; delete copy.resumePublicId; return copy; }
function mapWorkflow(row?: typeof s.workflowRuns.$inferSelect): WorkflowRunRecord | null { return row ? { ...row, applicationPublicId: "", inputVersion: row.inputVersion ?? undefined, outputVersion: row.outputVersion ?? undefined, provider: row.provider ?? undefined, model: row.model ?? undefined, promptVersion: row.promptVersion ?? undefined, tokenUsage: row.tokenUsage ?? undefined, estimatedCostCents: row.estimatedCostCents ?? undefined, errorClass: row.errorClass ?? undefined, retryStatus: row.retryStatus ?? undefined, maxAttempts: 5, traceId: row.traceId ?? undefined, startedAt: iso(row.startedAt), completedAt: iso(row.completedAt), payload: row.payload ?? {}, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() } : null; }
const mapWorkflowNonNull = (row: typeof s.workflowRuns.$inferSelect) => mapWorkflow(row)!;
function toWorkflowValues(row: Omit<WorkflowRunRecord, "createdAt" | "updatedAt"> & { createdAt?: string }) { return { id: row.id, publicId: row.publicId, tenantId: row.tenantId, applicationId: row.applicationId, stage: row.stage, status: row.status, attempt: row.attempt, idempotencyKey: row.idempotencyKey, inputVersion: row.inputVersion, outputVersion: row.outputVersion, provider: row.provider, model: row.model, promptVersion: row.promptVersion, tokenUsage: row.tokenUsage, estimatedCostCents: row.estimatedCostCents, errorClass: row.errorClass, retryStatus: row.retryStatus, traceId: row.traceId, startedAt: row.startedAt ? new Date(row.startedAt) : undefined, completedAt: row.completedAt ? new Date(row.completedAt) : undefined, payload: row.payload, createdAt: row.createdAt ? new Date(row.createdAt) : undefined }; }
function toWorkflowPatch(row: Partial<WorkflowRunRecord>) { const copy = { ...row } as Record<string, unknown>; for (const key of ["id", "publicId", "tenantId", "applicationId", "applicationPublicId", "createdAt", "updatedAt", "maxAttempts", "backoffMs", "nextRetryAt"]) delete copy[key]; if (typeof copy.startedAt === "string") copy.startedAt = new Date(copy.startedAt); if (typeof copy.completedAt === "string") copy.completedAt = new Date(copy.completedAt); return copy; }
