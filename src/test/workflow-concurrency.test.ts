/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureDemoUser, DEMO_USER } from "../../server/auth/demo-auth";
import type { AuthContext } from "../../server/auth/guards";
import { createEmptyMemoryStore, newId, type Repositories, type WorkflowRunRecord } from "../../server/database/repositories";
import { MockGenerationProvider, resetGenerationProvider } from "../../server/ai";
import { CustomerGenerateService } from "../../server/modules/resumes/customer-generate";
import { mapInternalStageToCustomer } from "../../server/resumes/customer-status";
import { getStorage } from "../../server/storage";
import { DbWorkflowEngine } from "../../server/workflows/engine";
import { handleWorkflowJobExhausted } from "../../server/workflows/failure-handler";
import { InProcessQueueAdapter } from "../../server/workflows/queues";
import { ResumePipeline } from "../../server/workflows/resume-pipeline";
import { queueForStage, stageMatchesJobClaim } from "../../server/workflows/stages";
import type { WorkflowStage } from "../../server/domain/types";

const WORKFLOW_QUEUES = ["research", "evidence-matching", "resume-generation", "resume-audit"] as const;

function context(userId: string, tenantId: string, repos: Repositories): AuthContext {
  return {
    requestId: "workflow_concurrency_test",
    user: { id: userId, publicId: "customer", email: DEMO_USER.email, name: DEMO_USER.name },
    memberships: [{ tenantId, tenantPublicId: "tenant", role: "owner" }],
    activeTenantId: tenantId,
    repos: { applications: repos.applications, evidence: repos.evidence },
  };
}

async function seedOwnedEvidence(repos: Repositories, tenantId: string, userId: string) {
  await repos.evidence.create({
    id: newId("ev"),
    publicId: newId("evp"),
    tenantId,
    ownerUserId: userId,
    candidateProfileId: null,
    title: "Platform delivery",
    organization: "Acme",
    situation: "Scaled API platform",
    task: "Improve reliability",
    actions: ["Added caching"],
    result: "Reduced incidents",
    technologies: ["TypeScript", "Kubernetes"],
    confidence: "high",
    verificationStatus: "user_attested",
    privacyLevel: "share-safe",
    excludedFromApplicationIds: [],
    matchedApplicationIds: [],
    payload: {},
  });
}

async function setupWorkflowRuntime(startQueue = true) {
  const store = createEmptyMemoryStore();
  const { repos, userId, tenantId } = await ensureDemoUser(store);
  await seedOwnedEvidence(repos, tenantId, userId);
  const queue = new InProcessQueueAdapter();
  const engine = new DbWorkflowEngine(repos.workflows, queue);
  const pipeline = ResumePipeline.fromRepos(repos, engine, queue);

  queue.onExhaustedRetries(async (job, error) => {
    await handleWorkflowJobExhausted(repos, engine, job, error);
  });

  for (const q of WORKFLOW_QUEUES) {
    queue.registerHandler(q, async (job) => {
      const payload = job.payload as {
        workflowRunId?: string;
        tenantId?: string;
        workflowPublicId?: string;
        stage?: WorkflowStage;
      };
      let run: WorkflowRunRecord | null = null;
      if (payload.workflowRunId) {
        run = await repos.workflows.getById(payload.workflowRunId);
      } else if (payload.tenantId && payload.workflowPublicId) {
        run = await repos.workflows.getByPublicId(payload.tenantId, payload.workflowPublicId);
      }
      if (!run) return;
      if (payload.stage && !stageMatchesJobClaim(run.stage, payload.stage)) return;
      await pipeline.handleStage(run, payload.stage ?? run.stage);
    });
  }

  if (startQueue) await queue.start();
  return { repos, queue, engine, pipeline, userId, tenantId, store };
}

async function waitForStage(
  repos: Repositories,
  tenantId: string,
  workflowPublicId: string,
  predicate: (stage: string) => boolean,
  timeoutMs = 15_000,
) {
  const started = Date.now();
  let last: WorkflowRunRecord | null = null;
  while (Date.now() - started < timeoutMs) {
    last = await repos.workflows.getByPublicId(tenantId, workflowPublicId);
    if (last && predicate(last.stage)) return last;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Timed out waiting for workflow stage (last=${last?.stage ?? "missing"} status=${last?.status ?? "n/a"})`,
  );
}

describe("workflow concurrency", () => {
  afterEach(() => {
    MockGenerationProvider.resetCallCounts();
    resetGenerationProvider();
    vi.unstubAllEnvs();
  });

  it("queueForStage returns null for completed research and evidence stages", () => {
    expect(queueForStage("RESEARCH_COMPLETED")).toBeNull();
    expect(queueForStage("EVIDENCE_MATCHING_COMPLETED")).toBeNull();
    expect(queueForStage("RESEARCH_QUEUED")).toBe("research");
    expect(queueForStage("V0_GENERATING")).toBe("resume-generation");
  });

  it("duplicate queue deliveries produce one provider generation", async () => {
    vi.stubEnv("AI_MODE", "mock");
    vi.stubEnv("APP_MODE", "demo");
    const { repos, pipeline, userId, tenantId } = await setupWorkflowRuntime(false);
    const run = await repos.workflows.createRun({
      id: newId("wr"),
      publicId: newId("wrp"),
      tenantId,
      applicationId: newId("app"),
      applicationPublicId: "app-dup-test",
      stage: "RESEARCH_RUNNING",
      status: "running",
      attempt: 1,
      idempotencyKey: "dup-test",
      maxAttempts: 5,
      payload: { applicationPublicId: "app-dup-test" },
      startedAt: new Date().toISOString(),
    });
    await repos.applications.create({
      id: run.applicationId,
      publicId: "app-dup-test",
      tenantId,
      company: "Acme",
      companyMark: "AC",
      role: "Engineer",
      location: "Remote",
      employmentType: "Full-time",
      status: "researching",
      stage: "RESEARCH_RUNNING",
      workflowStage: "RESEARCH_RUNNING",
      resumeScore: 0,
      evidenceCoverage: 0,
      atsAlignment: 0,
      interviewStatus: "not-started",
      researchConfidence: 0,
      archived: false,
      roleFamily: "General",
      nextAction: "Research",
      ownerUserId: userId,
      metadata: { jobDescription: "Build systems with TypeScript and Kubernetes in production." },
    });

    MockGenerationProvider.resetCallCounts();
    await Promise.all([
      pipeline.handleStage(run, "RESEARCH_RUNNING"),
      pipeline.handleStage(run, "RESEARCH_RUNNING"),
    ]);
    // One research stage performs job-extraction + research-synthesis (2 calls).
    // A duplicate delivery must not double that.
    expect(MockGenerationProvider.structuredCallCount).toBe(2);
  });

  it("old stage jobs cannot run against a newer workflow stage", async () => {
    vi.stubEnv("AI_MODE", "mock");
    vi.stubEnv("APP_MODE", "demo");
    const { repos, pipeline, userId, tenantId } = await setupWorkflowRuntime(false);
    const run = await repos.workflows.createRun({
      id: newId("wr"),
      publicId: newId("wrp"),
      tenantId,
      applicationId: newId("app"),
      applicationPublicId: "app-stale",
      stage: "V1_GENERATING",
      status: "running",
      attempt: 1,
      idempotencyKey: "stale-test",
      maxAttempts: 5,
      payload: { applicationPublicId: "app-stale" },
      startedAt: new Date().toISOString(),
    });
    await repos.applications.create({
      id: run.applicationId,
      publicId: "app-stale",
      tenantId,
      company: "Acme",
      companyMark: "AC",
      role: "Engineer",
      location: "Remote",
      employmentType: "Full-time",
      status: "resume",
      stage: "V1_GENERATING",
      workflowStage: "V1_GENERATING",
      resumeScore: 0,
      evidenceCoverage: 0,
      atsAlignment: 0,
      interviewStatus: "not-started",
      researchConfidence: 0,
      archived: false,
      roleFamily: "General",
      nextAction: "Generate",
      ownerUserId: userId,
      metadata: { jobDescription: "Engineering role" },
    });

    MockGenerationProvider.resetCallCounts();
    await pipeline.handleStage(run, "RESEARCH_RUNNING");
    expect(MockGenerationProvider.structuredCallCount).toBe(0);
    const latest = await repos.workflows.getById(run.id);
    expect(latest?.stage).toBe("V1_GENERATING");
  });

  it("exhausted retries mark workflow failed for customer status", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    await seedOwnedEvidence(repos, tenantId, userId);
    const queue = new InProcessQueueAdapter({ research: { maxAttempts: 1, concurrency: 1, timeoutMs: 5_000, rateLimitPerMinute: 100, maxPayloadBytes: 64_000 } });
    const engine = new DbWorkflowEngine(repos.workflows, queue);
    queue.onExhaustedRetries(async (job, error) => {
      await handleWorkflowJobExhausted(repos, engine, job, error);
    });
    queue.registerHandler("research", async () => {
      throw new Error("QUEUE_JOB_FAILED");
    });
    await queue.start();

    const service = new CustomerGenerateService(repos, engine, getStorage());
    const ctx = context(userId, tenantId, repos);
    const created = await service.generate(ctx, {
      jobDescription: "Senior engineer building distributed systems with careful delivery and ownership.",
      idempotencyKey: "exhausted-retry",
    });

    await waitForStage(repos, tenantId, created.workflowId, (stage) => stage === "FAILED", 10_000);
    const status = await service.getCustomerWorkflow(ctx, created.workflowId);
    expect(status.status).toBe("failed");
    expect(mapInternalStageToCustomer("FAILED", { failed: true }).status).toBe("failed");
  });

  it("unsupported factual audit claim is rejected and pipeline continues", async () => {
    vi.stubEnv("AI_MODE", "mock");
    vi.stubEnv("APP_MODE", "demo");
    const { repos, pipeline, userId, tenantId } = await setupWorkflowRuntime(false);
    const run = await repos.workflows.createRun({
      id: newId("wr"),
      publicId: newId("wrp"),
      tenantId,
      applicationId: newId("app"),
      applicationPublicId: "app-audit-flow",
      stage: "HR_AUDIT_1_RUNNING",
      status: "running",
      attempt: 1,
      idempotencyKey: "audit-flow",
      maxAttempts: 5,
      payload: { applicationPublicId: "app-audit-flow", autoAdvanceAudits: true, customerFacing: true, cycleBase: 0 },
      startedAt: new Date().toISOString(),
    });
    await repos.applications.create({
      id: run.applicationId,
      publicId: "app-audit-flow",
      tenantId,
      company: "Acme",
      companyMark: "AC",
      role: "Engineer",
      location: "Remote",
      employmentType: "Full-time",
      status: "auditing",
      stage: "HR_AUDIT_1_RUNNING",
      workflowStage: "HR_AUDIT_1_RUNNING",
      resumeScore: 70,
      evidenceCoverage: 80,
      atsAlignment: 75,
      interviewStatus: "not-started",
      researchConfidence: 80,
      archived: false,
      roleFamily: "General",
      nextAction: "Audit",
      ownerUserId: userId,
      metadata: { jobDescription: "Engineering role", autoAdvanceAudits: true, customerFacing: true },
    });
    const resume = await repos.resumes.createResume({
      id: newId("res"),
      publicId: newId("resp"),
      tenantId,
      applicationId: run.applicationId,
      applicationPublicId: "app-audit-flow",
      title: "Resume",
      templateId: "alumni-clean",
      length: "one-page",
      currentVersionPublicId: null,
    });
    await repos.resumes.appendVersion({
      id: newId("rv"),
      publicId: "rvv0",
      tenantId,
      resumeId: resume.id,
      versionNumber: 0,
      versionLabel: "V0",
      score: 70,
      scoreBreakdown: {},
      notes: "seed",
      triggeredBy: "test",
      sections: [{ id: "s1", type: "summary", title: "Summary", bullets: [{ id: "b1", text: "Built systems" }] }],
      idempotencyKey: "rv0",
      promptVersion: "test",
    });
    await repos.audits.createRun({
      id: newId("ar"),
      publicId: newId("arp"),
      tenantId,
      applicationId: run.applicationId,
      applicationPublicId: "app-audit-flow",
      lens: "hr-1",
      label: "HR AUDIT 1",
      reviewsVersion: "V0",
      producesVersion: "V1",
      status: "in-progress",
      scoreBefore: 70,
      scoreAfter: 72,
      summary: "Review",
    });

    await pipeline.handleStage(run, "HR_AUDIT_1_RUNNING");
    const updated = await repos.workflows.getById(run.id);
    expect(updated?.stage).not.toBe("HR_AUDIT_1_REVIEW");
    expect(updated?.stage).toBe("V1_GENERATING");
    const app = await repos.applications.getByPublicId(tenantId, "app-audit-flow");
    expect(app?.workflowStage).toBe("V1_GENERATING");
  });

  it("full HR1/EM1/HR2/EM2 cycle produces resume versions V0-V4 once", async () => {
    vi.stubEnv("AI_MODE", "mock");
    vi.stubEnv("APP_MODE", "demo");
    const { repos, engine, userId, tenantId } = await setupWorkflowRuntime(true);
    const service = new CustomerGenerateService(repos, engine, getStorage());
    const ctx = context(userId, tenantId, repos);
    const created = await service.generate(ctx, {
      jobDescription: "Platform engineer role requiring Kubernetes, TypeScript, and distributed systems experience.",
      idempotencyKey: "full-cycle",
    });

    await waitForStage(
      repos,
      tenantId,
      created.workflowId,
      (stage) => ["V4_READY", "FINAL_QA_RUNNING", "FINAL_READY", "FINAL_QA_FAILED"].includes(stage),
      30_000,
    );
    const run = await repos.workflows.getByPublicId(tenantId, created.workflowId);
    expect(run?.stage).not.toBe("FAILED");

    const resume = await repos.resumes.getByApplication(tenantId, created.applicationId);
    const versions = resume ? await repos.resumes.listVersions(tenantId, resume.publicId) : [];
    const versionNumbers = versions.map((version) => version.versionNumber).sort((a, b) => a - b);
    expect(versionNumbers).toEqual([0, 1, 2, 3, 4]);
  }, 35_000);
});
