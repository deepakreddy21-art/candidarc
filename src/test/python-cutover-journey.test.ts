/** @vitest-environment node */
/**
 * Orchestration-level Python cutover journey (mocked FastAPI client shapes).
 *
 * Real TypeScript→FastAPI HTTP pipeline coverage is in
 * `src/test/python-mode-pipeline-journey.test.ts` via `npm run test:python-mode`.
 * Playwright e2e + `npm run smoke:docker` cover authenticated UI and stack boundaries.
 *
 * Verifies:
 * - Full V0→V4→FINAL_QA orchestration with executionBackend=python metadata
 * - TypeScript getProviderForRole is never called
 * - Mid-run worker stop/recover does not duplicate version numbers
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyMemoryStore, MemoryRepositories, newId, nowIso } from "../../server/database/repositories";
import { DbWorkflowEngine } from "../../server/workflows/engine";
import { InProcessQueueAdapter } from "../../server/workflows/queues";
import { ResumePipeline } from "../../server/workflows/resume-pipeline";
import { resetEnvCache } from "../../server/config/env";
import { resetDbCache } from "../../server/database/client";
import * as aiIndex from "../../server/ai";
import { installMockPythonIntelligence } from "./helpers/mock-python-intelligence";

const TENANT = "ten_cutover_journey";
const USER = "user_cutover_journey";

describe("python cutover application journey", () => {
  let providerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetEnvCache();
    resetDbCache();
    vi.stubEnv("APP_MODE", "demo");
    vi.stubEnv("AI_MODE", "mock");
    vi.stubEnv("CANDIDARC_DATA_MODE", "memory");
    vi.stubEnv("RESUME_INTELLIGENCE_BACKEND", "python");
    resetEnvCache();
    installMockPythonIntelligence({ evidenceId: "ev_cutover_1" });
    providerSpy = vi.spyOn(aiIndex, "getProviderForRole") as ReturnType<typeof vi.spyOn>;
  });

  afterEach(() => {
    providerSpy.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetEnvCache();
    resetDbCache();
  });

  it("runs parse/research/match/generate/audits/final-qa via Python without TypeScript AI", async () => {
    const store = createEmptyMemoryStore();
    const repos = new MemoryRepositories(store);
    store.tenants.set(TENANT, {
      id: TENANT,
      publicId: "tenp_cutover",
      name: "Cutover",
      plan: "free",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    store.memberships.push({
      id: newId("tm"),
      tenantId: TENANT,
      userId: USER,
      role: "owner",
      createdAt: nowIso(),
    });
    await repos.users.create({
      id: USER,
      publicId: "usr_cutover",
      email: "cutover@example.com",
      name: "Cutover Candidate",
      passwordHash: "x",
      emailVerified: true,
    });
    const app = await repos.applications.create({
      id: newId("app"),
      publicId: "app_cutover",
      tenantId: TENANT,
      ownerUserId: USER,
      company: "Acme Cloud",
      companyMark: "AC",
      role: "Platform Engineer",
      location: "Remote",
      employmentType: "Full-time",
      stage: "RESEARCH_QUEUED",
      workflowStage: "RESEARCH_QUEUED",
      status: "researching",
      nextAction: "Research",
      researchConfidence: 0,
      evidenceCoverage: 0,
      resumeScore: 0,
      atsAlignment: 0,
      interviewStatus: "not-started",
      archived: false,
      roleFamily: "General",
      metadata: {
        jobDescription:
          "Acme Cloud seeks a Platform Engineer. Python and Kubernetes required. " + "detail ".repeat(12),
        jobUrl: "",
        autoAdvanceAudits: true,
        customerFacing: true,
      },
    });
    await repos.evidence.create({
      id: newId("ev"),
      publicId: "ev_cutover_1",
      tenantId: TENANT,
      ownerUserId: USER,
      candidateProfileId: null,
      title: "Platform Engineer",
      organization: "TechCorp",
      situation: "s",
      task: "t",
      actions: ["a"],
      result: "Reduced deployment time by 60% using Python and Kubernetes",
      technologies: ["Python", "Kubernetes"],
      confidence: "high",
      sourceType: "employment",
      claimText: "Platform Engineer at TechCorp, January 2024 – Present. Reduced deployment time by 60%.",
      verificationStatus: "user_attested",
      candidateConfirmationStatus: "confirmed",
      privacyLevel: "standard",
      payload: { metrics: ["60%"] },
      excludedFromApplicationIds: [],
      matchedApplicationIds: [],
    });

    const queue = new InProcessQueueAdapter();
    const engine = new DbWorkflowEngine(repos.workflows, queue);
    const pipeline = new ResumePipeline({
      engine,
      workflows: repos.workflows,
      applications: repos.applications,
      research: repos.research,
      resumes: repos.resumes,
      audits: repos.audits,
      usage: repos.usage,
      evidence: repos.evidence,
      store,
      queue,
    });
    for (const q of ["research", "evidence-matching", "resume-generation", "resume-audit"] as const) {
      queue.registerHandler(q, async (job) => {
        const payload = job.payload as {
          workflowRunId?: string;
          tenantId?: string;
          workflowPublicId?: string;
          stage?: string;
        };
        let run = payload.workflowRunId ? await repos.workflows.getById(payload.workflowRunId) : null;
        if (!run && payload.tenantId && payload.workflowPublicId) {
          run = await repos.workflows.getByPublicId(payload.tenantId, payload.workflowPublicId);
        }
        if (!run) return;
        await pipeline.handleStage(run, (payload.stage as never) ?? run.stage);
      });
    }
    await queue.start();

    const run = await engine.start({
      tenantId: TENANT,
      applicationId: app.id,
      applicationPublicId: app.publicId,
      stage: "RESEARCH_QUEUED",
      idempotencyKey: `cutover:${app.publicId}:${Date.now()}`,
      payload: { customerFacing: true, autoAdvanceAudits: true },
    });

    await new Promise((r) => setTimeout(r, 40));
    await queue.stop();
    await engine.recoverIncomplete();
    await queue.start();

    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      const status = await engine.getStatus(TENANT, run.publicId);
      if (status?.stage === "FINAL_READY" || status?.status === "completed") break;
      if (status?.status === "failed") {
        throw new Error(`failed: ${status.errorClass} ${JSON.stringify(status.payload)}`);
      }
      await new Promise((r) => setTimeout(r, 40));
    }

    const final = await engine.getStatus(TENANT, run.publicId);
    expect(final?.stage).toBe("FINAL_READY");
    expect(providerSpy).not.toHaveBeenCalled();

    const events = await repos.workflows.listEvents(TENANT, run.publicId);
    const metaOps = events
      .map((e) => e.metadata)
      .filter((m): m is { executionBackend: string; operation: string } =>
        Boolean(m && typeof m.executionBackend === "string" && typeof m.operation === "string"),
      );
    expect(metaOps.some((m) => m.operation === "parse" && m.executionBackend === "python")).toBe(true);
    expect(metaOps.some((m) => m.operation === "research" && m.executionBackend === "python")).toBe(true);
    expect(metaOps.some((m) => m.operation === "match" && m.executionBackend === "python")).toBe(true);
    expect(metaOps.some((m) => m.operation === "generate" && m.executionBackend === "python")).toBe(true);
    expect(metaOps.some((m) => m.operation === "audit" && m.executionBackend === "python")).toBe(true);
    expect(metaOps.some((m) => m.operation === "final-qa" && m.executionBackend === "python")).toBe(true);

    const resume = await repos.resumes.getByApplication(TENANT, app.publicId);
    const versions = resume ? await repos.resumes.listVersions(TENANT, resume.publicId) : [];
    const nums = versions.map((v) => v.versionNumber);
    expect(nums).toEqual([...new Set(nums)].sort((a, b) => a - b));
    expect(Math.max(...nums)).toBeGreaterThanOrEqual(4);

    await queue.stop();
  }, 60_000);
});
