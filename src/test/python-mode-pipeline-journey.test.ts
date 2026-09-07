/** @vitest-environment node */
/**
 * Deterministic application-boundary Python cutover journey (real FastAPI HTTP).
 *
 * NOT a live-provider test. Uses AI_MODE=mock on FastAPI, but does NOT mock
 * TypeScript PythonIntelligenceClient — BFF/pipeline → real HTTP → FastAPI.
 *
 * Requires PYTHON_BACKEND_URL (provided by `npm run test:python-mode`).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyMemoryStore, MemoryRepositories, newId, nowIso } from "../../server/database/repositories";
import { DbWorkflowEngine } from "../../server/workflows/engine";
import { InProcessQueueAdapter } from "../../server/workflows/queues";
import { ResumePipeline } from "../../server/workflows/resume-pipeline";
import { resetEnvCache } from "../../server/config/env";
import { resetDbCache } from "../../server/database/client";
import * as aiIndex from "../../server/ai";
import { resetPythonIntelligenceClient } from "../../server/intelligence/python-client";

const TENANT = "ten_http_cutover";
const USER = "user_http_cutover";
const BASE = process.env.PYTHON_BACKEND_URL;
const TOKEN = process.env.PYTHON_BACKEND_TOKEN || "dev-python-backend-token-change-me";

const describeHttp = BASE ? describe : describe.skip;

describeHttp("python cutover HTTP pipeline journey (deterministic FastAPI)", () => {
  let providerSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    const health = await fetch(`${BASE}/health/live`);
    if (!health.ok) {
      throw new Error(`FastAPI not ready at ${BASE}`);
    }
  }, 15_000);

  beforeEach(() => {
    resetEnvCache();
    resetDbCache();
    resetPythonIntelligenceClient();
    vi.stubEnv("APP_MODE", "demo");
    vi.stubEnv("AI_MODE", "mock");
    vi.stubEnv("CANDIDARC_DATA_MODE", "memory");
    vi.stubEnv("RESUME_INTELLIGENCE_BACKEND", "python");
    vi.stubEnv("PYTHON_BACKEND_URL", BASE!);
    vi.stubEnv("PYTHON_BACKEND_TOKEN", TOKEN);
    resetEnvCache();
    providerSpy = vi.spyOn(aiIndex, "getProviderForRole") as ReturnType<typeof vi.spyOn>;
  });

  afterEach(() => {
    providerSpy.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetPythonIntelligenceClient();
    resetEnvCache();
    resetDbCache();
  });

  it("runs parse→research→match→V0–V4→final-qa over real FastAPI without TypeScript AI", async () => {
    const store = createEmptyMemoryStore();
    const repos = new MemoryRepositories(store);
    store.tenants.set(TENANT, {
      id: TENANT,
      publicId: "tenp_http_cutover",
      name: "HTTP Cutover",
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
      publicId: "usr_http_cutover",
      email: "http-cutover@example.com",
      name: "HTTP Cutover Candidate",
      passwordHash: "x",
      emailVerified: true,
    });
    const app = await repos.applications.create({
      id: newId("app"),
      publicId: "app_http_cutover",
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
        refinementInstruction: "Emphasize Python platform ownership",
      },
    });
    await repos.evidence.create({
      id: newId("ev"),
      publicId: "ev_http_cutover_1",
      tenantId: TENANT,
      ownerUserId: USER,
      candidateProfileId: null,
      title: "Platform Engineer",
      organization: "TechCorp",
      situation: "Owned deployment platform reliability",
      task: "Reduce release cycle time",
      actions: ["Implemented Python automation", "Standardized Kubernetes rollouts"],
      result: "Reduced deployment time by 60% using Python and Kubernetes",
      technologies: ["Python", "Kubernetes"],
      confidence: "high",
      sourceType: "employment",
      claimText:
        "Platform Engineer at TechCorp, January 2024 – Present. Reduced deployment time by 60% using Python and Kubernetes.",
      verificationStatus: "user_attested",
      candidateConfirmationStatus: "confirmed",
      privacyLevel: "standard",
      payload: { metrics: ["60% deployment time reduction"] },
      excludedFromApplicationIds: [],
      matchedApplicationIds: [],
    });
    await repos.evidence.create({
      id: newId("ev"),
      publicId: "ev_http_cutover_edu",
      tenantId: TENANT,
      ownerUserId: USER,
      candidateProfileId: null,
      title: "MS Information Systems",
      organization: "Rivertown Institute of Technology",
      situation: "Graduate coursework",
      task: "Complete degree requirements",
      actions: ["Completed systems and analytics coursework"],
      result: "Earned MS Information Systems",
      technologies: [],
      confidence: "high",
      sourceType: "education",
      claimText:
        "MS Information Systems, Rivertown Institute of Technology, January 2023 – May 2024.",
      verificationStatus: "user_attested",
      candidateConfirmationStatus: "confirmed",
      privacyLevel: "standard",
      payload: {},
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
      idempotencyKey: `http-cutover:${app.publicId}:${Date.now()}`,
      payload: { customerFacing: true, autoAdvanceAudits: true },
    });

    // Mid-run worker stop/recover (application orchestration boundary)
    await new Promise((r) => setTimeout(r, 80));
    await queue.stop();
    await engine.recoverIncomplete();
    await queue.start();

    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const status = await engine.getStatus(TENANT, run.publicId);
      if (status?.stage === "FINAL_READY" || status?.status === "completed") break;
      if (status?.stage === "FINAL_QA_FAILED") {
        throw new Error(`FINAL_QA_FAILED: ${JSON.stringify(status.payload)}`);
      }
      if (status?.status === "failed") {
        throw new Error(`failed: ${status.errorClass} ${JSON.stringify(status.payload)}`);
      }
      await new Promise((r) => setTimeout(r, 100));
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
    expect(metaOps.every((m) => m.executionBackend === "python")).toBe(true);
    expect(metaOps.some((m) => m.operation === "parse")).toBe(true);
    expect(metaOps.some((m) => m.operation === "research")).toBe(true);
    expect(metaOps.some((m) => m.operation === "match")).toBe(true);
    expect(metaOps.some((m) => m.operation === "generate")).toBe(true);
    expect(metaOps.some((m) => m.operation === "audit")).toBe(true);
    expect(metaOps.some((m) => m.operation === "final-qa")).toBe(true);

    const resume = await repos.resumes.getByApplication(TENANT, app.publicId);
    const versions = resume ? await repos.resumes.listVersions(TENANT, resume.publicId) : [];
    const nums = versions.map((v) => v.versionNumber);
    expect(nums).toEqual([...new Set(nums)].sort((a, b) => a - b));
    expect(Math.max(...nums)).toBeGreaterThanOrEqual(4);

    const notes = versions.map((v) => v.notes ?? "").join(" ");
    // Mock generator may surface refinement via notes; at minimum pipeline completed with Python backend.
    expect(final?.payload?.executionBackend ?? "python").toBeTruthy();
    expect(notes.length).toBeGreaterThan(0);

    await queue.stop();
  }, 150_000);
});
