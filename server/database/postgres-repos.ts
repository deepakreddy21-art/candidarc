import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "./client";
import * as s from "./schema";
import {
  createEmptyMemoryStore,
  newId,
  type Repositories,
  type InterviewSessionRecord,
  type MembershipRecord,
  type WorkflowEventRecord,
  type WorkflowRunRecord,
} from "./repositories";
import { AppError } from "../domain/types";
import {
  buildEvidenceMatchMap,
  mapApplication,
  mapAuditFinding,
  mapAuditRun,
  mapCandidateProfile,
  mapEvidence,
  mapResearchRun,
  mapResume,
  mapResumeVersion,
  mapSession,
  mapStoredFile,
  mapTenant,
  mapUsage,
  mapUser,
  mapWorkflow,
  sectionFromRow,
  toApplicationPatch,
  toApplicationValues,
  toCandidateProfilePatch,
  toCandidateProfileValues,
  toStoredFilePatch,
  toStoredFileValues,
  toWorkflowPatch,
  toWorkflowValues,
} from "./postgres-mappers";

type Db = NonNullable<ReturnType<typeof getDb>>;

/**
 * PostgreSQL-backed repositories for all durable catalog domains.
 * Does not inherit memory implementations — production never falls back to in-memory state.
 */
export class PostgresRepositories implements Repositories {
  readonly users: Repositories["users"];
  readonly sessions: Repositories["sessions"];
  readonly applications: Repositories["applications"];
  readonly evidence: Repositories["evidence"];
  readonly resumes: Repositories["resumes"];
  readonly audits: Repositories["audits"];
  readonly research: Repositories["research"];
  readonly workflows: Repositories["workflows"];
  readonly usage: Repositories["usage"];
  readonly files: Repositories["files"];
  readonly interviews: Repositories["interviews"];
  readonly candidateProfiles: Repositories["candidateProfiles"];
  readonly store: Repositories["store"];

  constructor() {
    const db = getDb();
    if (!db) throw new Error("PostgresRepositories requires CANDIDARC_DATA_MODE=postgres");

    this.store = createEmptyMemoryStore();

    this.users = {
      findByEmail: async (email) =>
        mapUser(
          (
            await db
              .select()
              .from(s.users)
              .where(and(eq(s.users.email, email.toLowerCase()), isNull(s.users.deletedAt)))
              .limit(1)
          )[0],
        ),
      findById: async (id) => mapUser((await db.select().from(s.users).where(eq(s.users.id, id)).limit(1))[0]),
      findByPublicId: async (publicId) =>
        mapUser((await db.select().from(s.users).where(eq(s.users.publicId, publicId)).limit(1))[0]),
      create: async (input) =>
        mapUser(
          (
            await db
              .insert(s.users)
              .values({
                id: input.id,
                publicId: input.publicId,
                email: input.email.toLowerCase(),
                emailVerified: input.emailVerified,
                passwordHash: input.passwordHash,
                name: input.name,
              })
              .returning()
          )[0],
        )!,
      listMemberships: async (userId) => {
        const rows = await db
          .select({ membership: s.tenantMemberships, tenant: s.tenants })
          .from(s.tenantMemberships)
          .innerJoin(s.tenants, eq(s.tenantMemberships.tenantId, s.tenants.id))
          .where(eq(s.tenantMemberships.userId, userId));
        return rows.map(({ membership, tenant }) => ({
          id: membership.id,
          tenantId: membership.tenantId,
          userId: membership.userId,
          role: membership.role,
          createdAt: membership.createdAt.toISOString(),
          tenant: mapTenant(tenant),
        }));
      },
      createTenant: async (input) =>
        mapTenant(
          (
            await db
              .insert(s.tenants)
              .values({
                id: input.id,
                publicId: input.publicId,
                name: input.name,
                plan: input.plan as "free" | "pro" | "team" | "enterprise",
              })
              .returning()
          )[0],
        ),
      createMembership: async (input) => {
        const row = (
          await db
            .insert(s.tenantMemberships)
            .values({ id: input.id, tenantId: input.tenantId, userId: input.userId, role: input.role })
            .returning()
        )[0]!;
        return { ...row, createdAt: row.createdAt.toISOString() } satisfies MembershipRecord;
      },
    };

    this.sessions = {
      create: async (input) =>
        mapSession(
          (
            await db
              .insert(s.sessions)
              .values({
                id: input.id,
                userId: input.userId,
                tokenHash: input.tokenHash,
                expiresAt: new Date(input.expiresAt),
                createdAt: input.createdAt ? new Date(input.createdAt) : undefined,
              })
              .returning()
          )[0],
        )!,
      findById: async (id) => mapSession((await db.select().from(s.sessions).where(eq(s.sessions.id, id)).limit(1))[0]),
      findByTokenHash: async (hash) =>
        mapSession(
          (
            await db
              .select()
              .from(s.sessions)
              .where(and(eq(s.sessions.tokenHash, hash), isNull(s.sessions.revokedAt)))
              .limit(1)
          )[0],
        ),
      revoke: async (id) => {
        await db.update(s.sessions).set({ revokedAt: new Date() }).where(eq(s.sessions.id, id));
      },
    };

    this.applications = {
      create: async (input) =>
        mapApplication((await db.insert(s.applications).values(toApplicationValues(input)).returning())[0])!,
      list: async (tenantId, opts) =>
        (
          await db
            .select()
            .from(s.applications)
            .where(
              and(
                eq(s.applications.tenantId, tenantId),
                isNull(s.applications.deletedAt),
                opts?.includeArchived ? undefined : eq(s.applications.archived, false),
              ),
            )
            .orderBy(desc(s.applications.updatedAt))
        ).map((row) => mapApplication(row)!),
      getByPublicId: async (tenantId, publicId) =>
        mapApplication(
          (
            await db
              .select()
              .from(s.applications)
              .where(
                and(
                  eq(s.applications.tenantId, tenantId),
                  eq(s.applications.publicId, publicId),
                  isNull(s.applications.deletedAt),
                ),
              )
              .limit(1)
          )[0],
        ),
      getByPublicIdGlobal: async (publicId) =>
        mapApplication(
          (
            await db
              .select()
              .from(s.applications)
              .where(and(eq(s.applications.publicId, publicId), isNull(s.applications.deletedAt)))
              .limit(1)
          )[0],
        ),
      update: async (tenantId, publicId, patch) => {
        const row = (
          await db
            .update(s.applications)
            .set(toApplicationPatch(patch))
            .where(and(eq(s.applications.tenantId, tenantId), eq(s.applications.publicId, publicId)))
            .returning()
        )[0];
        if (!row) throw new AppError("APPLICATION_NOT_FOUND", "Application not found", 404);
        return mapApplication(row)!;
      },
      softDelete: async (tenantId, publicId) => {
        await db
          .update(s.applications)
          .set({ deletedAt: new Date(), archived: true })
          .where(and(eq(s.applications.tenantId, tenantId), eq(s.applications.publicId, publicId)));
      },
    };

    this.evidence = createEvidenceRepository(db);
    this.resumes = createResumeRepository(db);
    this.audits = createAuditRepository(db);
    this.research = createResearchRepository(db);
    this.workflows = createWorkflowRepository(db);
    this.usage = createUsageRepository(db);
    this.files = createFileRepository(db);
    this.interviews = createInterviewRepository();
    this.candidateProfiles = createCandidateProfileRepository(db);
  }
}

function createEvidenceRepository(db: Db): Repositories["evidence"] {
  async function loadMatchMap(tenantId: string, evidenceIds?: string[]) {
    const rows = await db
      .select({
        evidenceItemId: s.evidenceApplicationMatches.evidenceItemId,
        applicationPublicId: s.applications.publicId,
        excluded: s.evidenceApplicationMatches.excluded,
      })
      .from(s.evidenceApplicationMatches)
      .innerJoin(s.applications, eq(s.evidenceApplicationMatches.applicationId, s.applications.id))
      .where(
        and(
          eq(s.evidenceApplicationMatches.tenantId, tenantId),
          isNull(s.evidenceApplicationMatches.deletedAt),
          evidenceIds?.length ? inArray(s.evidenceApplicationMatches.evidenceItemId, evidenceIds) : undefined,
        ),
      );
    return buildEvidenceMatchMap(rows);
  }

  async function syncMatches(
    tenantId: string,
    evidenceItemId: string,
    matchedApplicationIds: string[],
    excludedFromApplicationIds: string[],
  ) {
    const apps = await db
      .select({ id: s.applications.id, publicId: s.applications.publicId })
      .from(s.applications)
      .where(and(eq(s.applications.tenantId, tenantId), isNull(s.applications.deletedAt)));
    const byPublicId = new Map(apps.map((app) => [app.publicId, app.id]));

    await db
      .delete(s.evidenceApplicationMatches)
      .where(and(eq(s.evidenceApplicationMatches.tenantId, tenantId), eq(s.evidenceApplicationMatches.evidenceItemId, evidenceItemId)));

    const inserts: Array<typeof s.evidenceApplicationMatches.$inferInsert> = [];
    for (const publicId of matchedApplicationIds) {
      const applicationId = byPublicId.get(publicId);
      if (!applicationId) continue;
      inserts.push({
        publicId: newId("eam"),
        tenantId,
        evidenceItemId,
        applicationId,
        excluded: false,
      });
    }
    for (const publicId of excludedFromApplicationIds) {
      const applicationId = byPublicId.get(publicId);
      if (!applicationId) continue;
      inserts.push({
        publicId: newId("eam"),
        tenantId,
        evidenceItemId,
        applicationId,
        excluded: true,
      });
    }
    if (inserts.length) await db.insert(s.evidenceApplicationMatches).values(inserts);
  }

  return {
    list: async (tenantId) => {
      const rows = await db
        .select()
        .from(s.evidenceItems)
        .where(and(eq(s.evidenceItems.tenantId, tenantId), isNull(s.evidenceItems.deletedAt)));
      const matchMap = await loadMatchMap(
        tenantId,
        rows.map((row) => row.id),
      );
      return rows.map((row) => mapEvidence(row, matchMap.get(row.id)));
    },
    getByPublicId: async (tenantId, publicId) => {
      const row = (
        await db
          .select()
          .from(s.evidenceItems)
          .where(
            and(
              eq(s.evidenceItems.tenantId, tenantId),
              eq(s.evidenceItems.publicId, publicId),
              isNull(s.evidenceItems.deletedAt),
            ),
          )
          .limit(1)
      )[0];
      if (!row) return null;
      const matchMap = await loadMatchMap(tenantId, [row.id]);
      return mapEvidence(row, matchMap.get(row.id));
    },
    getByPublicIdGlobal: async (publicId) => {
      const row = (
        await db
          .select()
          .from(s.evidenceItems)
          .where(and(eq(s.evidenceItems.publicId, publicId), isNull(s.evidenceItems.deletedAt)))
          .limit(1)
      )[0];
      if (!row) return null;
      const matchMap = await loadMatchMap(row.tenantId, [row.id]);
      return mapEvidence(row, matchMap.get(row.id));
    },
    create: async (item) => {
      const row = (
        await db
          .insert(s.evidenceItems)
          .values({
            id: item.id,
            publicId: item.publicId,
            tenantId: item.tenantId,
            title: item.title,
            organization: item.organization,
            situation: item.situation,
            task: item.task,
            actions: item.actions,
            result: item.result,
            technologies: item.technologies,
            confidence: item.confidence as typeof s.evidenceItems.$inferInsert.confidence,
            verificationStatus: item.verificationStatus as typeof s.evidenceItems.$inferInsert.verificationStatus,
            privacyLevel: item.privacyLevel as typeof s.evidenceItems.$inferInsert.privacyLevel,
            payload: item.payload ?? {},
            version: item.version ?? 1,
          })
          .returning()
      )[0]!;
      if (item.matchedApplicationIds.length || item.excludedFromApplicationIds.length) {
        await syncMatches(item.tenantId, row.id, item.matchedApplicationIds, item.excludedFromApplicationIds);
      }
      const matchMap = await loadMatchMap(item.tenantId, [row.id]);
      return mapEvidence(row, matchMap.get(row.id));
    },
    update: async (tenantId, publicId, patch) => {
      const existing = (
        await db
          .select()
          .from(s.evidenceItems)
          .where(
            and(
              eq(s.evidenceItems.tenantId, tenantId),
              eq(s.evidenceItems.publicId, publicId),
              isNull(s.evidenceItems.deletedAt),
            ),
          )
          .limit(1)
      )[0];
      if (!existing) throw new AppError("EVIDENCE_NOT_FOUND", "Evidence not found", 404);

      const { matchedApplicationIds, excludedFromApplicationIds, ...rest } = patch;
      const itemPatch: Record<string, unknown> = {};
      for (const key of [
        "title",
        "organization",
        "situation",
        "task",
        "actions",
        "result",
        "technologies",
        "confidence",
        "verificationStatus",
        "privacyLevel",
        "payload",
      ] as const) {
        if (rest[key] !== undefined) itemPatch[key] = rest[key];
      }
      const row = (
        await db
          .update(s.evidenceItems)
          .set({
            ...itemPatch,
            version: existing.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(s.evidenceItems.id, existing.id))
          .returning()
      )[0]!;

      if (matchedApplicationIds !== undefined || excludedFromApplicationIds !== undefined) {
        const matchMap = await loadMatchMap(tenantId, [existing.id]);
        const current = matchMap.get(existing.id) ?? { matched: [], excluded: [] };
        await syncMatches(
          tenantId,
          existing.id,
          matchedApplicationIds ?? current.matched,
          excludedFromApplicationIds ?? current.excluded,
        );
      }

      const matchMap = await loadMatchMap(tenantId, [row.id]);
      return mapEvidence(row, matchMap.get(row.id));
    },
    softDelete: async (tenantId, publicId) => {
      const existing = (
        await db
          .select()
          .from(s.evidenceItems)
          .where(
            and(
              eq(s.evidenceItems.tenantId, tenantId),
              eq(s.evidenceItems.publicId, publicId),
              isNull(s.evidenceItems.deletedAt),
            ),
          )
          .limit(1)
      )[0];
      if (!existing) throw new AppError("EVIDENCE_NOT_FOUND", "Evidence not found", 404);
      await db
        .update(s.evidenceItems)
        .set({ deletedAt: new Date(), version: existing.version + 1 })
        .where(eq(s.evidenceItems.id, existing.id));
    },
  };
}

function createResumeRepository(db: Db): Repositories["resumes"] {
  async function loadSections(versionId: string) {
    const rows = await db
      .select()
      .from(s.resumeSections)
      .where(eq(s.resumeSections.resumeVersionId, versionId))
      .orderBy(asc(s.resumeSections.order));
    return rows.map(sectionFromRow);
  }

  async function resolveApplicationPublicId(tenantId: string, applicationId: string) {
    const app = (
      await db
        .select({ publicId: s.applications.publicId })
        .from(s.applications)
        .where(and(eq(s.applications.tenantId, tenantId), eq(s.applications.id, applicationId)))
        .limit(1)
    )[0];
    return app?.publicId ?? "";
  }

  async function resolveCurrentVersionPublicId(resume: typeof s.resumes.$inferSelect) {
    if (!resume.currentVersionId) return null;
    const version = (
      await db
        .select({ publicId: s.resumeVersions.publicId })
        .from(s.resumeVersions)
        .where(eq(s.resumeVersions.id, resume.currentVersionId))
        .limit(1)
    )[0];
    return version?.publicId ?? null;
  }

  return {
    getByApplication: async (tenantId, applicationPublicId) => {
      const app = (
        await db
          .select({ id: s.applications.id })
          .from(s.applications)
          .where(
            and(
              eq(s.applications.tenantId, tenantId),
              eq(s.applications.publicId, applicationPublicId),
              isNull(s.applications.deletedAt),
            ),
          )
          .limit(1)
      )[0];
      if (!app) return null;
      const row = (
        await db
          .select()
          .from(s.resumes)
          .where(and(eq(s.resumes.tenantId, tenantId), eq(s.resumes.applicationId, app.id), isNull(s.resumes.deletedAt)))
          .limit(1)
      )[0];
      if (!row) return null;
      return mapResume(row, applicationPublicId, await resolveCurrentVersionPublicId(row));
    },
    listVersions: async (tenantId, resumePublicId) => {
      const resume = (
        await db
          .select()
          .from(s.resumes)
          .where(and(eq(s.resumes.tenantId, tenantId), eq(s.resumes.publicId, resumePublicId), isNull(s.resumes.deletedAt)))
          .limit(1)
      )[0];
      if (!resume) return [];
      const versions = await db
        .select()
        .from(s.resumeVersions)
        .where(and(eq(s.resumeVersions.resumeId, resume.id), eq(s.resumeVersions.tenantId, tenantId)))
        .orderBy(asc(s.resumeVersions.versionNumber));
      return Promise.all(
        versions.map(async (version) => mapResumeVersion(version, await loadSections(version.id))),
      );
    },
    getVersion: async (tenantId, versionPublicId) => {
      const version = (
        await db
          .select()
          .from(s.resumeVersions)
          .where(and(eq(s.resumeVersions.tenantId, tenantId), eq(s.resumeVersions.publicId, versionPublicId)))
          .limit(1)
      )[0];
      if (!version) return null;
      return mapResumeVersion(version, await loadSections(version.id));
    },
    findVersionByIdempotency: async (tenantId, idempotencyKey) => {
      const version = (
        await db
          .select()
          .from(s.resumeVersions)
          .where(and(eq(s.resumeVersions.tenantId, tenantId), eq(s.resumeVersions.idempotencyKey, idempotencyKey)))
          .limit(1)
      )[0];
      if (!version) return null;
      return mapResumeVersion(version, await loadSections(version.id));
    },
    createResume: async (resume) => {
      const row = (
        await db
          .insert(s.resumes)
          .values({
            id: resume.id,
            publicId: resume.publicId,
            tenantId: resume.tenantId,
            applicationId: resume.applicationId,
            title: resume.title,
            templateId: resume.templateId,
            length: resume.length,
          })
          .returning()
      )[0]!;
      return mapResume(row, resume.applicationPublicId, resume.currentVersionPublicId);
    },
    appendVersion: async (version) => {
      const existing = (
        await db
          .select()
          .from(s.resumeVersions)
          .where(
            and(eq(s.resumeVersions.tenantId, version.tenantId), eq(s.resumeVersions.idempotencyKey, version.idempotencyKey)),
          )
          .limit(1)
      )[0];
      if (existing) return mapResumeVersion(existing, await loadSections(existing.id));

      const row = (
        await db
          .insert(s.resumeVersions)
          .values({
            id: version.id,
            publicId: version.publicId,
            tenantId: version.tenantId,
            resumeId: version.resumeId,
            versionNumber: version.versionNumber,
            versionLabel: version.versionLabel,
            score: version.score,
            scoreBreakdown: version.scoreBreakdown,
            notes: version.notes,
            triggeredBy: version.triggeredBy,
            idempotencyKey: version.idempotencyKey,
            promptVersion: version.promptVersion,
          })
          .returning()
      )[0]!;

      const sections = Array.isArray(version.sections) ? version.sections : [];
      if (sections.length) {
        await db.insert(s.resumeSections).values(
          sections.map((section, index) => {
            const payload = section as Record<string, unknown>;
            return {
              publicId: String(payload.id ?? newId("rs")),
              tenantId: version.tenantId,
              resumeVersionId: row.id,
              type: String(payload.type ?? "summary"),
              title: String(payload.title ?? "Section"),
              order: typeof payload.order === "number" ? payload.order : index,
              payload,
            };
          }),
        );
      }

      return mapResumeVersion(row, sections);
    },
    setCurrentVersion: async (tenantId, resumePublicId, versionPublicId) => {
      const resume = (
        await db
          .select()
          .from(s.resumes)
          .where(and(eq(s.resumes.tenantId, tenantId), eq(s.resumes.publicId, resumePublicId), isNull(s.resumes.deletedAt)))
          .limit(1)
      )[0];
      if (!resume) throw new AppError("RESUME_NOT_FOUND", "Resume not found", 404);
      const version = (
        await db
          .select()
          .from(s.resumeVersions)
          .where(and(eq(s.resumeVersions.tenantId, tenantId), eq(s.resumeVersions.publicId, versionPublicId)))
          .limit(1)
      )[0];
      if (!version) throw new AppError("RESUME_VERSION_NOT_FOUND", "Resume version not found", 404);
      const row = (
        await db
          .update(s.resumes)
          .set({ currentVersionId: version.id, updatedAt: new Date() })
          .where(eq(s.resumes.id, resume.id))
          .returning()
      )[0]!;
      const applicationPublicId = await resolveApplicationPublicId(tenantId, row.applicationId);
      return mapResume(row, applicationPublicId, versionPublicId);
    },
  };
}

function createAuditRepository(db: Db): Repositories["audits"] {
  async function resolveRunPublicId(auditRunId: string) {
    const run = (
      await db.select({ publicId: s.auditRuns.publicId }).from(s.auditRuns).where(eq(s.auditRuns.id, auditRunId)).limit(1)
    )[0];
    return run?.publicId ?? "";
  }

  return {
    listRuns: async (tenantId, applicationPublicId) => {
      const app = (
        await db
          .select({ id: s.applications.id })
          .from(s.applications)
          .where(
            and(
              eq(s.applications.tenantId, tenantId),
              eq(s.applications.publicId, applicationPublicId),
              isNull(s.applications.deletedAt),
            ),
          )
          .limit(1)
      )[0];
      if (!app) return [];
      const rows = await db
        .select()
        .from(s.auditRuns)
        .where(and(eq(s.auditRuns.tenantId, tenantId), eq(s.auditRuns.applicationId, app.id), isNull(s.auditRuns.deletedAt)))
        .orderBy(asc(s.auditRuns.createdAt));
      return rows.map((row) => mapAuditRun(row, applicationPublicId));
    },
    listFindings: async (tenantId, auditRunPublicId) => {
      const run = (
        await db
          .select()
          .from(s.auditRuns)
          .where(and(eq(s.auditRuns.tenantId, tenantId), eq(s.auditRuns.publicId, auditRunPublicId)))
          .limit(1)
      )[0];
      if (!run) return [];
      const rows = await db
        .select()
        .from(s.auditFindings)
        .where(and(eq(s.auditFindings.tenantId, tenantId), eq(s.auditFindings.auditRunId, run.id), isNull(s.auditFindings.deletedAt)));
      return rows.map((row) => mapAuditFinding(row, auditRunPublicId));
    },
    getFinding: async (tenantId, findingPublicId) => {
      const row = (
        await db
          .select()
          .from(s.auditFindings)
          .where(and(eq(s.auditFindings.tenantId, tenantId), eq(s.auditFindings.publicId, findingPublicId)))
          .limit(1)
      )[0];
      if (!row) return null;
      return mapAuditFinding(row, await resolveRunPublicId(row.auditRunId));
    },
    updateFindingDecision: async (tenantId, findingPublicId, decision, editedText) => {
      const finding = (
        await db
          .select()
          .from(s.auditFindings)
          .where(and(eq(s.auditFindings.tenantId, tenantId), eq(s.auditFindings.publicId, findingPublicId)))
          .limit(1)
      )[0];
      if (!finding) throw new AppError("FINDING_NOT_FOUND", "Audit finding not found", 404);
      const row = (
        await db
          .update(s.auditFindings)
          .set({
            status: decision,
            suggestedText: decision === "edited" && editedText ? editedText : finding.suggestedText,
            editedText: decision === "edited" ? editedText : finding.editedText,
            updatedAt: new Date(),
          })
          .where(eq(s.auditFindings.id, finding.id))
          .returning()
      )[0]!;
      return mapAuditFinding(row, await resolveRunPublicId(row.auditRunId));
    },
    createRun: async (run) => {
      const row = (
        await db
          .insert(s.auditRuns)
          .values({
            id: run.id,
            publicId: run.publicId,
            tenantId: run.tenantId,
            applicationId: run.applicationId,
            lens: run.lens as typeof s.auditRuns.$inferInsert.lens,
            label: run.label,
            reviewsVersion: run.reviewsVersion,
            producesVersion: run.producesVersion,
            status: run.status,
            scoreBefore: run.scoreBefore,
            scoreAfter: run.scoreAfter,
            summary: run.summary,
            completedAt: run.completedAt ? new Date(run.completedAt) : undefined,
            createdAt: run.createdAt ? new Date(run.createdAt) : undefined,
          })
          .returning()
      )[0]!;
      return mapAuditRun(row, run.applicationPublicId);
    },
    createFindings: async (findings) => {
      if (!findings.length) return [];
      const rows = await db
        .insert(s.auditFindings)
        .values(
          findings.map((finding) => ({
            id: finding.id,
            publicId: finding.publicId,
            tenantId: finding.tenantId,
            auditRunId: finding.auditRunId,
            severity: finding.severity as typeof s.auditFindings.$inferInsert.severity,
            status: finding.status as typeof s.auditFindings.$inferInsert.status,
            section: finding.section,
            title: finding.title,
            explanation: finding.explanation,
            beforeText: finding.beforeText,
            suggestedText: finding.suggestedText,
            evidenceSource: finding.evidenceSource,
            expectedScoreImpact: finding.expectedScoreImpact,
          })),
        )
        .returning();
      return rows.map((row) =>
        mapAuditFinding(
          row,
          findings.find((finding) => finding.auditRunId === row.auditRunId)?.auditRunPublicId ?? "",
        ),
      );
    },
  };
}

async function persistResearchArtifacts(
  db: Db,
  input: {
    tenantId: string;
    applicationId: string;
    researchRunId: string;
    findings: unknown[];
    sources: unknown[];
  },
) {
  await db
    .delete(s.researchFindings)
    .where(and(eq(s.researchFindings.tenantId, input.tenantId), eq(s.researchFindings.researchRunId, input.researchRunId)));
  await db
    .delete(s.researchSources)
    .where(and(eq(s.researchSources.tenantId, input.tenantId), eq(s.researchSources.researchRunId, input.researchRunId)));

  const sourceRows = (Array.isArray(input.sources) ? input.sources : []).map((source) => {
    const payload = source as Record<string, unknown>;
    return {
      publicId: String(payload.id ?? newId("rsrc")),
      tenantId: input.tenantId,
      researchRunId: input.researchRunId,
      applicationId: input.applicationId,
      title: String(payload.title ?? "Source"),
      url: typeof payload.url === "string" ? payload.url : undefined,
      accessedAt: payload.accessedAt ? new Date(String(payload.accessedAt)) : undefined,
      type: String(payload.type ?? "job-posting"),
      rawSnippet: typeof payload.supportingText === "string" ? payload.supportingText : undefined,
    };
  });
  if (sourceRows.length) await db.insert(s.researchSources).values(sourceRows);

  const findingRows = (Array.isArray(input.findings) ? input.findings : []).map((finding) => {
    const payload = finding as Record<string, unknown>;
    return {
      publicId: newId("rf"),
      tenantId: input.tenantId,
      researchRunId: input.researchRunId,
      applicationId: input.applicationId,
      category: String(payload.category ?? "role"),
      title: String(payload.title ?? "Finding"),
      summary: String(payload.summary ?? ""),
      confidence: String(payload.confidence ?? "medium") as typeof s.researchFindings.$inferInsert.confidence,
      status: String(payload.status ?? "inferred") as typeof s.researchFindings.$inferInsert.status,
      sourceIds: Array.isArray(payload.sourceIds) ? (payload.sourceIds as string[]) : [],
    };
  });
  if (findingRows.length) await db.insert(s.researchFindings).values(findingRows);
}

async function loadResearchArtifacts(db: Db, tenantId: string, researchRunId: string) {
  const sources = await db
    .select()
    .from(s.researchSources)
    .where(and(eq(s.researchSources.tenantId, tenantId), eq(s.researchSources.researchRunId, researchRunId), isNull(s.researchSources.deletedAt)));
  const findings = await db
    .select()
    .from(s.researchFindings)
    .where(and(eq(s.researchFindings.tenantId, tenantId), eq(s.researchFindings.researchRunId, researchRunId), isNull(s.researchFindings.deletedAt)));

  return {
    sources: sources.map((row) => ({
      id: row.publicId,
      url: row.url ?? "",
      title: row.title,
      accessedAt: row.accessedAt?.toISOString() ?? new Date().toISOString(),
      supportingText: row.rawSnippet ?? "",
      confidence: "medium",
      classification: "inferred",
      relevance: row.type,
    })),
    findings: findings.map((row) => ({
      category: row.category,
      title: row.title,
      summary: row.summary,
      confidence: row.confidence,
      status: row.status,
      sourceIds: row.sourceIds ?? [],
    })),
  };
}

function createResearchRepository(db: Db): Repositories["research"] {
  return {
    createRun: async (run) => {
      const row = (
        await db
          .insert(s.researchRuns)
          .values({
            id: run.id,
            publicId: run.publicId,
            tenantId: run.tenantId,
            applicationId: run.applicationId,
            status: run.status,
            depth: run.depth,
            confidence: run.confidence,
            completedAt: run.completedAt ? new Date(run.completedAt) : undefined,
            createdAt: run.createdAt ? new Date(run.createdAt) : undefined,
          })
          .returning()
      )[0]!;
      await persistResearchArtifacts(db, {
        tenantId: run.tenantId,
        applicationId: run.applicationId,
        researchRunId: row.id,
        findings: run.findings,
        sources: run.sources,
      });
      const artifacts = await loadResearchArtifacts(db, run.tenantId, row.id);
      return mapResearchRun(row, run.applicationPublicId, artifacts.findings, artifacts.sources);
    },
    getLatest: async (tenantId, applicationPublicId) => {
      const app = (
        await db
          .select({ id: s.applications.id })
          .from(s.applications)
          .where(
            and(
              eq(s.applications.tenantId, tenantId),
              eq(s.applications.publicId, applicationPublicId),
              isNull(s.applications.deletedAt),
            ),
          )
          .limit(1)
      )[0];
      if (!app) return null;
      const row = (
        await db
          .select()
          .from(s.researchRuns)
          .where(
            and(
              eq(s.researchRuns.tenantId, tenantId),
              eq(s.researchRuns.applicationId, app.id),
              isNull(s.researchRuns.deletedAt),
            ),
          )
          .orderBy(desc(s.researchRuns.createdAt))
          .limit(1)
      )[0];
      if (!row) return null;
      const artifacts = await loadResearchArtifacts(db, tenantId, row.id);
      return mapResearchRun(row, applicationPublicId, artifacts.findings, artifacts.sources);
    },
    updateRun: async (tenantId, publicId, patch) => {
      const existing = (
        await db
          .select()
          .from(s.researchRuns)
          .where(and(eq(s.researchRuns.tenantId, tenantId), eq(s.researchRuns.publicId, publicId)))
          .limit(1)
      )[0];
      if (!existing) throw new AppError("RESEARCH_NOT_FOUND", "Research run not found", 404);

      const {
        findings,
        sources,
        applicationPublicId: patchApplicationPublicId,
        completedAt,
      } = patch;
      const row = (
        await db
          .update(s.researchRuns)
          .set({
            status: patch.status,
            depth: patch.depth,
            confidence: patch.confidence,
            completedAt: completedAt ? new Date(completedAt) : undefined,
            updatedAt: new Date(),
          })
          .where(eq(s.researchRuns.id, existing.id))
          .returning()
      )[0]!;

      if (findings !== undefined || sources !== undefined) {
        const artifacts = await loadResearchArtifacts(db, tenantId, existing.id);
        await persistResearchArtifacts(db, {
          tenantId,
          applicationId: existing.applicationId,
          researchRunId: existing.id,
          findings: findings ?? artifacts.findings,
          sources: sources ?? artifacts.sources,
        });
      }

      const appPublicId =
        patchApplicationPublicId ??
        (
          await db
            .select({ publicId: s.applications.publicId })
            .from(s.applications)
            .where(eq(s.applications.id, existing.applicationId))
            .limit(1)
        )[0]?.publicId ??
        "";
      const artifacts = await loadResearchArtifacts(db, tenantId, row.id);
      return mapResearchRun(row, appPublicId, artifacts.findings, artifacts.sources);
    },
  };
}

function createWorkflowRepository(db: Db): Repositories["workflows"] {
  return {
    createRun: async (input) =>
      mapWorkflow(
        (await db.insert(s.workflowRuns).values(toWorkflowValues(input)).returning())[0],
        input.applicationPublicId,
      )!,
    findByIdempotency: async (tenantId, key) => {
      const row = (
        await db
          .select({ run: s.workflowRuns, applicationPublicId: s.applications.publicId })
          .from(s.workflowRuns)
          .innerJoin(s.applications, eq(s.applications.id, s.workflowRuns.applicationId))
          .where(and(eq(s.workflowRuns.tenantId, tenantId), eq(s.workflowRuns.idempotencyKey, key)))
          .limit(1)
      )[0];
      return row ? mapWorkflow(row.run, row.applicationPublicId) : null;
    },
    getByPublicId: async (tenantId, publicId) => {
      const row = (
        await db
          .select({ run: s.workflowRuns, applicationPublicId: s.applications.publicId })
          .from(s.workflowRuns)
          .innerJoin(s.applications, eq(s.applications.id, s.workflowRuns.applicationId))
          .where(and(eq(s.workflowRuns.tenantId, tenantId), eq(s.workflowRuns.publicId, publicId)))
          .limit(1)
      )[0];
      return row ? mapWorkflow(row.run, row.applicationPublicId) : null;
    },
    getById: async (id) => {
      const row = (
        await db
          .select({ run: s.workflowRuns, applicationPublicId: s.applications.publicId })
          .from(s.workflowRuns)
          .innerJoin(s.applications, eq(s.applications.id, s.workflowRuns.applicationId))
          .where(eq(s.workflowRuns.id, id))
          .limit(1)
      )[0];
      return row ? mapWorkflow(row.run, row.applicationPublicId) : null;
    },
    updateRun: async (id, patch) => {
      const row = (await db.update(s.workflowRuns).set(toWorkflowPatch(patch)).where(eq(s.workflowRuns.id, id)).returning())[0];
      if (!row) throw new AppError("WORKFLOW_NOT_FOUND", "Workflow not found", 404);
      const app = (
        await db
          .select({ publicId: s.applications.publicId })
          .from(s.applications)
          .where(eq(s.applications.id, row.applicationId))
          .limit(1)
      )[0];
      return mapWorkflow(row, app?.publicId ?? "")!;
    },
    appendEvent: async (input) => {
      const previous = await db
        .select({ seq: s.workflowEvents.seq })
        .from(s.workflowEvents)
        .where(eq(s.workflowEvents.workflowRunId, input.workflowRunId))
        .orderBy(desc(s.workflowEvents.seq))
        .limit(1);
      const row = (
        await db
          .insert(s.workflowEvents)
          .values({
            publicId: newId("wep"),
            workflowRunId: input.workflowRunId,
            tenantId: input.tenantId,
            applicationId: input.applicationId,
            stage: input.stage,
            status: input.status,
            message: input.message,
            seq: input.seq ?? (previous[0]?.seq ?? 0) + 1,
            metadata: input.metadata,
          })
          .returning()
      )[0]!;
      return {
        ...row,
        workflowRunPublicId: input.workflowRunPublicId,
        applicationPublicId: input.applicationPublicId,
        message: row.message ?? "",
        metadata: row.metadata ?? {},
        createdAt: row.createdAt.toISOString(),
      } satisfies WorkflowEventRecord;
    },
    listEvents: async (tenantId, workflowPublicId, sinceSeq = 0) => {
      const run = (
        await db
          .select()
          .from(s.workflowRuns)
          .where(and(eq(s.workflowRuns.tenantId, tenantId), eq(s.workflowRuns.publicId, workflowPublicId)))
          .limit(1)
      )[0];
      if (!run) return [];
      const app = (
        await db.select({ publicId: s.applications.publicId }).from(s.applications).where(eq(s.applications.id, run.applicationId)).limit(1)
      )[0];
      const rows = await db
        .select()
        .from(s.workflowEvents)
        .where(eq(s.workflowEvents.workflowRunId, run.id))
        .orderBy(asc(s.workflowEvents.seq));
      return rows
        .filter((row) => row.seq > sinceSeq)
        .map((row) => ({
          ...row,
          workflowRunPublicId: run.publicId,
          applicationPublicId: app?.publicId ?? "",
          message: row.message ?? "",
          metadata: row.metadata ?? {},
          createdAt: row.createdAt.toISOString(),
        }));
    },
    listByApplication: async (tenantId, applicationPublicId) => {
      const app = (
        await db
          .select({ id: s.applications.id })
          .from(s.applications)
          .where(
            and(
              eq(s.applications.tenantId, tenantId),
              eq(s.applications.publicId, applicationPublicId),
              isNull(s.applications.deletedAt),
            ),
          )
          .limit(1)
      )[0];
      if (!app) return [];
      const rows = await db
        .select({ run: s.workflowRuns, applicationPublicId: s.applications.publicId })
        .from(s.workflowRuns)
        .innerJoin(s.applications, eq(s.applications.id, s.workflowRuns.applicationId))
        .where(eq(s.workflowRuns.applicationId, app.id))
        .orderBy(asc(s.workflowRuns.createdAt));
      return rows.map(({ run, applicationPublicId: pubId }) => mapWorkflow(run, pubId)!);
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
          const mapped = mapWorkflow(run, applicationPublicId);
          if (!mapped) return null;
          if (["FINAL_READY", "FAILED", "CANCELLED", "FINAL_QA_FAILED"].includes(mapped.stage)) return null;
          return mapped;
        })
        .filter((row): row is WorkflowRunRecord => Boolean(row));
    },
  };
}

function createUsageRepository(db: Db): Repositories["usage"] {
  return {
    findByIdempotency: async (idempotencyKey) => {
      const row = (
        await db.select().from(s.usageLedger).where(eq(s.usageLedger.idempotencyKey, idempotencyKey)).limit(1)
      )[0];
      return row ? mapUsage(row) : null;
    },
    append: async (entry) => {
      const existing = (
        await db.select().from(s.usageLedger).where(eq(s.usageLedger.idempotencyKey, entry.idempotencyKey)).limit(1)
      )[0];
      if (existing) return mapUsage(existing);
      const row = (
        await db
          .insert(s.usageLedger)
          .values({
            id: entry.id,
            publicId: entry.publicId ?? newId("ulp"),
            tenantId: entry.tenantId,
            userId: entry.userId,
            kind: entry.kind as typeof s.usageLedger.$inferInsert.kind,
            units: String(entry.units),
            costCents: String(entry.costCents),
            workflowRunId: entry.workflowRunId,
            idempotencyKey: entry.idempotencyKey,
            status: entry.status,
            metadata: entry.metadata ?? {},
          })
          .returning()
      )[0]!;
      return mapUsage(row);
    },
    updateStatus: async (idempotencyKey, status) => {
      const row = (
        await db
          .update(s.usageLedger)
          .set({ status })
          .where(eq(s.usageLedger.idempotencyKey, idempotencyKey))
          .returning()
      )[0];
      if (!row) throw new AppError("USAGE_NOT_FOUND", "Usage ledger entry not found", 404);
      return mapUsage(row);
    },
  };
}

function createFileRepository(db: Db): Repositories["files"] {
  return {
    create: async (input) => mapStoredFile((await db.insert(s.storedFiles).values(toStoredFileValues(input)).returning())[0])!,
    getByPublicId: async (tenantId, publicId) =>
      mapStoredFile(
        (
          await db
            .select()
            .from(s.storedFiles)
            .where(
              and(eq(s.storedFiles.tenantId, tenantId), eq(s.storedFiles.publicId, publicId), isNull(s.storedFiles.deletedAt)),
            )
            .limit(1)
        )[0],
      ),
    update: async (tenantId, publicId, patch) => {
      const row = (
        await db
          .update(s.storedFiles)
          .set(toStoredFilePatch(patch))
          .where(and(eq(s.storedFiles.tenantId, tenantId), eq(s.storedFiles.publicId, publicId)))
          .returning()
      )[0];
      if (!row) throw new AppError("FILE_NOT_FOUND", "File not found", 404);
      return mapStoredFile(row)!;
    },
    softDelete: async (tenantId, publicId, physicalDeleteAt) => {
      const row = (
        await db
          .update(s.storedFiles)
          .set({
            deletedAt: new Date(),
            retentionState: "pending_delete",
            physicalDeleteAt: new Date(physicalDeleteAt),
          })
          .where(and(eq(s.storedFiles.tenantId, tenantId), eq(s.storedFiles.publicId, publicId)))
          .returning()
      )[0];
      if (!row) throw new AppError("FILE_NOT_FOUND", "File not found", 404);
      return mapStoredFile(row)!;
    },
  };
}

function createInterviewRepository(): Repositories["interviews"] {
  return {
    create: async () => {
      throw new AppError("INTERVIEW_REMOVED", "Interview sessions are no longer available", 410);
    },
    list: async () => [] as InterviewSessionRecord[],
    getByPublicId: async () => null,
    getByPublicIdGlobal: async () => null,
    update: async () => {
      throw new AppError("INTERVIEW_REMOVED", "Interview sessions are no longer available", 501);
    },
  };
}

function createCandidateProfileRepository(db: Db): Repositories["candidateProfiles"] {
  return {
    getByUser: async (tenantId, userId) =>
      mapCandidateProfile(
        (
          await db
            .select()
            .from(s.candidateProfiles)
            .where(
              and(
                eq(s.candidateProfiles.tenantId, tenantId),
                eq(s.candidateProfiles.userId, userId),
                isNull(s.candidateProfiles.deletedAt),
              ),
            )
            .limit(1)
        )[0],
      ),
    findBySourceResumeFile: async (tenantId, filePublicId) =>
      mapCandidateProfile(
        (
          await db
            .select()
            .from(s.candidateProfiles)
            .where(
              and(
                eq(s.candidateProfiles.tenantId, tenantId),
                eq(s.candidateProfiles.sourceResumeFilePublicId, filePublicId),
                isNull(s.candidateProfiles.deletedAt),
              ),
            )
            .limit(1)
        )[0],
      ),
    upsert: async (input) => {
      const existing = (
        await db
          .select()
          .from(s.candidateProfiles)
          .where(
            and(
              eq(s.candidateProfiles.tenantId, input.tenantId),
              eq(s.candidateProfiles.userId, input.userId ?? ""),
              isNull(s.candidateProfiles.deletedAt),
            ),
          )
          .limit(1)
      )[0];
      if (existing) {
        const row = (
          await db
            .update(s.candidateProfiles)
            .set(toCandidateProfilePatch(input))
            .where(eq(s.candidateProfiles.id, existing.id))
            .returning()
        )[0]!;
        return mapCandidateProfile(row)!;
      }
      const row = (await db.insert(s.candidateProfiles).values(toCandidateProfileValues(input)).returning())[0]!;
      return mapCandidateProfile(row)!;
    },
    updateOnboarding: async (tenantId, userId, patch) => {
      const row = (
        await db
          .update(s.candidateProfiles)
          .set(toCandidateProfilePatch(patch))
          .where(
            and(
              eq(s.candidateProfiles.tenantId, tenantId),
              eq(s.candidateProfiles.userId, userId),
              isNull(s.candidateProfiles.deletedAt),
            ),
          )
          .returning()
      )[0];
      if (!row) throw new AppError("PROFILE_NOT_FOUND", "Candidate profile not found", 404);
      return mapCandidateProfile(row)!;
    },
    update: async (tenantId, userId, patch) => {
      const row = (
        await db
          .update(s.candidateProfiles)
          .set(toCandidateProfilePatch(patch))
          .where(
            and(
              eq(s.candidateProfiles.tenantId, tenantId),
              eq(s.candidateProfiles.userId, userId),
              isNull(s.candidateProfiles.deletedAt),
            ),
          )
          .returning()
      )[0];
      if (!row) throw new AppError("PROFILE_NOT_FOUND", "Candidate profile not found", 404);
      return mapCandidateProfile(row)!;
    },
  };
}

/** Returns true when repositories still use the in-memory implementation. */
export function isMemoryBackedRepository(repos: Repositories): boolean {
  return repos.constructor.name === "MemoryRepositories";
}
