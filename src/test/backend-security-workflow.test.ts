/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  createEmptyMemoryStore,
  type Repositories,
  newId,
  nowIso,
} from "../../server/database/repositories";
import { ensureDemoUser, DEMO_USER } from "../../server/auth/demo-auth";
import { requireApplicationAccess, requireEvidenceAccess, type AuthContext } from "../../server/auth/guards";
import { AppError } from "../../server/domain/types";
import { assertAuditOrder, assertTransition } from "../../server/workflows/stages";
import { DbWorkflowEngine } from "../../server/workflows/engine";
import { InProcessQueueAdapter } from "../../server/workflows/queues";
import { ResumePipeline } from "../../server/workflows/resume-pipeline";
import { ApplicationsService } from "../../server/modules/applications/service";
import { UsageService } from "../../server/modules/usage/service";
import { hashPassword, verifyPassword } from "../../server/auth/password";
import { createSession, verifySession } from "../../server/auth/session";

function authCtx(userId: string, tenantId: string, repos: Repositories): AuthContext {
  return {
    requestId: "req_test",
    user: { id: userId, publicId: "user_deepak", email: DEMO_USER.email, name: DEMO_USER.name },
    memberships: [{ tenantId, tenantPublicId: "ten_deepak", role: "owner" }],
    activeTenantId: tenantId,
    repos: {
      applications: repos.applications,
      evidence: repos.evidence,
    },
  };
}

describe("tenant security", () => {
  it("rejects cross-tenant application access", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);

    const otherTenantId = newId("ten");
    store.tenants.set(otherTenantId, {
      id: otherTenantId,
      publicId: "ten_other",
      name: "Other",
      plan: "free",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    await repos.applications.create({
      id: newId("app"),
      publicId: "app-secret",
      tenantId: otherTenantId,
      company: "SecretCo",
      companyMark: "SE",
      role: "Engineer",
      location: "Remote",
      employmentType: "Full-time",
      status: "draft",
      stage: "APPLICATION_CREATED",
      workflowStage: "APPLICATION_CREATED",
      resumeScore: 0,
      evidenceCoverage: 0,
      atsAlignment: 0,
      interviewStatus: "not-started",
      researchConfidence: 0,
      archived: false,
      roleFamily: "General",
      nextAction: "Start",
      ownerUserId: newId("usr"),
    });

    const ctx = authCtx(userId, tenantId, repos);
    await expect(requireApplicationAccess(ctx, "app-secret")).rejects.toMatchObject({
      code: "FORBIDDEN_TENANT",
      status: 403,
    });

    const forged: AuthContext = { ...ctx, activeTenantId: otherTenantId };
    await expect(requireApplicationAccess(forged, "app-secret")).rejects.toBeInstanceOf(AppError);
  });

  it("rejects cross-tenant evidence access", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    await repos.evidence.create({
      id: newId("ev"),
      publicId: "ev-secret",
      tenantId: newId("ten"),
      ownerUserId: null,
      candidateProfileId: null,
      title: "Secret",
      organization: "X",
      situation: "s",
      task: "t",
      actions: [],
      result: "r",
      technologies: [],
      confidence: "high",
      verificationStatus: "verified",
      privacyLevel: "private",
      excludedFromApplicationIds: [],
      matchedApplicationIds: [],
      payload: {},
    });

    await expect(requireEvidenceAccess(authCtx(userId, tenantId, repos), "ev-secret")).rejects.toMatchObject({
      code: "FORBIDDEN_TENANT",
    });
  });
});

describe("workflow integrity", () => {
  it("enforces sequential audit version order", () => {
    expect(() => assertAuditOrder({ stage: "HR_AUDIT_1_RUNNING", reviewsVersion: 0, producesVersion: 1 })).not.toThrow();
    expect(() => assertAuditOrder({ stage: "EM_AUDIT_1_RUNNING", reviewsVersion: 1, producesVersion: 2 })).not.toThrow();
    expect(() => assertAuditOrder({ stage: "HR_AUDIT_2_RUNNING", reviewsVersion: 2, producesVersion: 3 })).not.toThrow();
    expect(() => assertAuditOrder({ stage: "EM_AUDIT_2_RUNNING", reviewsVersion: 3, producesVersion: 4 })).not.toThrow();
    expect(() => assertAuditOrder({ stage: "EM_AUDIT_1_RUNNING", reviewsVersion: 0 })).toThrow();
    expect(() => assertAuditOrder({ stage: "HR_AUDIT_2_RUNNING", reviewsVersion: 0 })).toThrow();
    expect(() => assertAuditOrder({ stage: "V4_GENERATING", reviewsVersion: 3, producesVersion: 4 })).not.toThrow();
    expect(() => assertAuditOrder({ stage: "V4_GENERATING", reviewsVersion: 0, producesVersion: 4 })).toThrow();
  });

  it("rejects illegal stage transitions", () => {
    expect(() => assertTransition("APPLICATION_CREATED", "RESEARCH_QUEUED")).not.toThrow();
    expect(() => assertTransition("V0_READY", "FINAL_READY")).toThrow();
    expect(() => assertTransition("HR_AUDIT_1_RUNNING", "EM_AUDIT_2_RUNNING")).toThrow();
  });

  it("idempotent workflow start does not duplicate runs", async () => {
    const store = createEmptyMemoryStore();
    const { repos, tenantId, userId } = await ensureDemoUser(store);
    const queue = new InProcessQueueAdapter();
    const engine = new DbWorkflowEngine(repos.workflows, queue);

    const app = await repos.applications.create({
      id: newId("app"),
      publicId: "app-idem",
      tenantId,
      company: "Acme",
      companyMark: "AC",
      role: "Engineer",
      location: "Remote",
      employmentType: "Full-time",
      status: "researching",
      stage: "APPLICATION_CREATED",
      workflowStage: "APPLICATION_CREATED",
      resumeScore: 0,
      evidenceCoverage: 0,
      atsAlignment: 0,
      interviewStatus: "not-started",
      researchConfidence: 0,
      archived: false,
      roleFamily: "AI",
      nextAction: "Research",
      ownerUserId: userId,
    });

    const a = await engine.start({
      tenantId,
      applicationId: app.id,
      applicationPublicId: app.publicId,
      stage: "RESEARCH_QUEUED",
      idempotencyKey: "create:app-idem",
    });
    const b = await engine.start({
      tenantId,
      applicationId: app.id,
      applicationPublicId: app.publicId,
      stage: "RESEARCH_QUEUED",
      idempotencyKey: "create:app-idem",
    });
    expect(a.id).toBe(b.id);
    expect([...store.workflowRuns.values()].filter((r) => r.applicationId === app.id)).toHaveLength(1);
  });

  it("retry does not duplicate usage charges", async () => {
    const store = createEmptyMemoryStore();
    const { repos, tenantId, userId } = await ensureDemoUser(store);
    const usage = new UsageService(repos.usage);
    const ctx = authCtx(userId, tenantId, repos);
    const key = "usage:research:app-x:1";
    await usage.reserveUsage(ctx, {
      kind: "research",
      units: 1,
      costCents: 25,
      idempotencyKey: key,
    });
    await usage.commitUsage(ctx, key);
    await usage.commitUsage(ctx, key);
    const entries = [...store.usageLedger.values()].filter((e) => e.idempotencyKey === key);
    expect(entries.length).toBe(1);
    expect(entries[0]?.status).toBe("committed");
  });

  it("pipeline research handle is safe to re-run without exploding version count", async () => {
    const store = createEmptyMemoryStore();
    const { repos, tenantId, userId } = await ensureDemoUser(store);
    const queue = new InProcessQueueAdapter();
    const engine = new DbWorkflowEngine(repos.workflows, queue);
    const pipeline = ResumePipeline.fromRepos(repos, engine);

    const app = await repos.applications.create({
      id: newId("app"),
      publicId: "app-pipe",
      tenantId,
      company: "Cisco",
      companyMark: "CI",
      role: "CX AI Software Engineer",
      location: "United States",
      employmentType: "Full-time",
      status: "researching",
      stage: "RESEARCH_QUEUED",
      workflowStage: "RESEARCH_QUEUED",
      resumeScore: 0,
      evidenceCoverage: 50,
      atsAlignment: 0,
      interviewStatus: "not-started",
      researchConfidence: 10,
      archived: false,
      roleFamily: "AI/ML Engineering",
      nextAction: "Research",
      ownerUserId: userId,
    });

    const run = await engine.start({
      tenantId,
      applicationId: app.id,
      applicationPublicId: app.publicId,
      stage: "RESEARCH_QUEUED",
      idempotencyKey: `research:${app.publicId}`,
    });

    await pipeline.handleStage(run);
    const mid = await repos.workflows.getById(run.id);
    if (mid) await pipeline.handleStage(mid);
    const v0s = [...store.resumeVersions.values()].filter((v) => v.versionNumber === 0);
    expect(v0s.length).toBeLessThanOrEqual(1);
  });
});

describe("auth primitives", () => {
  it("hashes passwords and issues verifiable sessions", async () => {
    const hash = await hashPassword("CandidArc!Demo1");
    expect(await verifyPassword("CandidArc!Demo1", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    const session = await createSession({ userId: "u1", sessionId: "s1" });
    const payload = await verifySession(session.token);
    expect(payload?.sub).toBe("u1");
    expect(payload?.sid).toBe("s1");
  });
});

describe("applications service", () => {
  it("creates application and queues research for tenant member", async () => {
    const store = createEmptyMemoryStore();
    const { repos, tenantId, userId } = await ensureDemoUser(store);
    const queue = new InProcessQueueAdapter();
    const engine = new DbWorkflowEngine(repos.workflows, queue);
    const apps = ApplicationsService.fromRepos(repos, engine);

    const result = await apps.create(authCtx(userId, tenantId, repos), {
      company: "Notion",
      role: "AI Engineer",
      researchDepth: "standard",
      idempotencyKey: "create-notion-1",
    });
    expect(result.application.company).toBe("Notion");
    expect(result.application.workflowStage).toBe("RESEARCH_QUEUED");
    expect(result.workflow.idempotencyKey).toBe("create-notion-1");
  });
});
