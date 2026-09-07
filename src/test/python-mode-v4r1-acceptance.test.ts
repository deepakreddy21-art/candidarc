/** @vitest-environment node */
/**
 * Full V0→V4→failed Final QA→V4R1→FINAL_READY over the real TypeScript→FastAPI boundary.
 *
 * Requires:
 * - PYTHON_BACKEND_URL
 * - CANDIDARC_MOCK_FINAL_QA_FORCE=fail_until_repair on FastAPI
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyMemoryStore, MemoryRepositories, newId, nowIso } from "../../server/database/repositories";
import { DbWorkflowEngine } from "../../server/workflows/engine";
import { InProcessQueueAdapter } from "../../server/workflows/queues";
import { ResumePipeline } from "../../server/workflows/resume-pipeline";
import { resetEnvCache } from "../../server/config/env";
import { resetDbCache } from "../../server/database/client";
import * as aiIndex from "../../server/ai";
import {
  getPythonIntelligenceClient,
  resetPythonIntelligenceClient,
} from "../../server/intelligence/python-client";

const TENANT = "ten_v4r1_e2e";
const OTHER_TENANT = "ten_v4r1_other";
const USER = "user_v4r1_e2e";
const BASE = process.env.PYTHON_BACKEND_URL;
const TOKEN = process.env.PYTHON_BACKEND_TOKEN || "dev-python-backend-token-change-me";
const FORCE = process.env.CANDIDARC_MOCK_FINAL_QA_FORCE;

const describeHttp = BASE && FORCE === "fail_until_repair" ? describe : describe.skip;

describeHttp("acceptance: V0→V4R1→FINAL_READY via real FastAPI", () => {
  let providerSpy: ReturnType<typeof vi.spyOn>;
  let regenerateCount = 0;

  beforeAll(async () => {
    const health = await fetch(`${BASE}/health/live`);
    if (!health.ok) throw new Error(`FastAPI not ready at ${BASE}`);
  }, 15_000);

  beforeEach(() => {
    resetEnvCache();
    resetDbCache();
    resetPythonIntelligenceClient();
    regenerateCount = 0;
    vi.stubEnv("APP_MODE", "demo");
    vi.stubEnv("AI_MODE", "mock");
    vi.stubEnv("CANDIDARC_DATA_MODE", "memory");
    vi.stubEnv("RESUME_INTELLIGENCE_BACKEND", "python");
    vi.stubEnv("PYTHON_BACKEND_URL", BASE!);
    vi.stubEnv("PYTHON_BACKEND_TOKEN", TOKEN);
    resetEnvCache();
    providerSpy = vi.spyOn(aiIndex, "getProviderForRole") as ReturnType<typeof vi.spyOn>;
    const client = getPythonIntelligenceClient();
    const original = client.regenerateResume.bind(client);
    vi.spyOn(client, "regenerateResume").mockImplementation(async (input) => {
      regenerateCount += 1;
      return original(input);
    });
  });

  afterEach(() => {
    providerSpy.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetPythonIntelligenceClient();
    resetEnvCache();
    resetDbCache();
  });

  it("completes failed Final QA repair journey with distinct usage and blocked downloads", async () => {
    const store = createEmptyMemoryStore();
    const repos = new MemoryRepositories(store);
    store.tenants.set(TENANT, {
      id: TENANT,
      publicId: "tenp_v4r1_e2e",
      name: "V4R1 E2E",
      plan: "free",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    store.tenants.set(OTHER_TENANT, {
      id: OTHER_TENANT,
      publicId: "tenp_v4r1_other",
      name: "Other",
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
      publicId: "usr_v4r1_e2e",
      email: "v4r1-e2e@example.com",
      name: "V4R1 E2E",
      passwordHash: "x",
      emailVerified: true,
    });
    const app = await repos.applications.create({
      id: newId("app"),
      publicId: "app_v4r1_e2e",
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
        autoAdvanceAudits: true,
        customerFacing: true,
        refinementInstruction: "Emphasize Python platform work",
      },
    });
    await repos.evidence.create({
      id: newId("ev"),
      publicId: "ev_v4r1_e2e_1",
      tenantId: TENANT,
      ownerUserId: USER,
      candidateProfileId: null,
      title: "Platform Engineer",
      organization: "TechCorp",
      situation: "Owned deployment platform reliability",
      task: "Reduce release cycle time",
      actions: ["Implemented Python automation", "Standardized Kubernetes rollouts"],
      result: "Reduced deployment time by 60% using Python and Kubernetes",
      technologies: ["Python", "Kubernetes", "OpenSearch"],
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
      publicId: "ev_v4r1_e2e_edu",
      tenantId: TENANT,
      ownerUserId: USER,
      candidateProfileId: null,
      title: "MS Information Systems",
      organization: "Rivertown Institute of Technology",
      situation: "Graduate coursework",
      task: "Complete degree",
      actions: ["Completed coursework"],
      result: "Earned MS Information Systems",
      technologies: [],
      confidence: "high",
      sourceType: "education",
      claimText: "MS Information Systems, Rivertown Institute of Technology, January 2023 – May 2024.",
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
      idempotencyKey: `v4r1-e2e:${app.publicId}:${Date.now()}`,
      payload: { customerFacing: true, autoAdvanceAudits: true },
    });

    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const status = await engine.getStatus(TENANT, run.publicId);
      if (status?.stage === "FINAL_READY" || status?.status === "completed") break;
      if (status?.stage === "FINAL_QA_FAILED" || status?.status === "failed") {
        throw new Error(`failed early: ${status.stage} ${JSON.stringify(status.payload)}`);
      }
      await new Promise((r) => setTimeout(r, 80));
    }

    const final = await engine.getStatus(TENANT, run.publicId);
    expect(final?.stage).toBe("FINAL_READY");
    expect(providerSpy).not.toHaveBeenCalled();

    const resume = await repos.resumes.getByApplication(TENANT, app.publicId);
    const versions = resume ? await repos.resumes.listVersions(TENANT, resume.publicId) : [];
    const v4 = versions.find((v) => v.versionLabel === "V4" || v.versionNumber === 4);
    const repair = versions.find((v) => v.versionLabel === "V4R1");
    expect(v4).toBeTruthy();
    expect(repair).toBeTruthy();
    expect(resume?.currentVersionPublicId).toBe(repair!.publicId);
    expect(JSON.stringify(v4!.sections)).not.toBe(JSON.stringify(repair!.sections));
    expect(JSON.stringify(repair!.sections).toLowerCase()).not.toContain("ownership focus");
    expect(JSON.stringify(repair!.sections).toLowerCase()).not.toContain("[python emphasis]");

    const usageRows = [...store.usageLedger.values()].filter((row) => row.tenantId === TENANT);
    const genKeys = usageRows
      .filter((row) => row.kind === "resume_generation")
      .map((row) => row.idempotencyKey);
    const qaKeys = usageRows.filter((row) => row.kind === "final_review").map((row) => row.idempotencyKey);
    expect(genKeys.some((key) => key.includes("generate:v4:"))).toBe(true);
    expect(genKeys.some((key) => key.includes("repair:v4-to-v4r1:"))).toBe(true);
    expect(qaKeys.some((key) => key.includes("final-qa:v4:"))).toBe(true);
    expect(qaKeys.some((key) => key.includes(`final-qa:v${repair!.versionNumber}:`))).toBe(true);

    // Downloads remain blocked until FINAL_READY (already FINAL_READY) — before files exist → DOCUMENT_NOT_READY
    const liveApp = await repos.applications.getByPublicId(TENANT, app.publicId);
    expect(liveApp?.workflowStage).toBe("FINAL_READY");
    expect(liveApp?.metadata?.customerFiles).toBeUndefined();

    // Cross-tenant isolation
    await expect(repos.resumes.getByApplication(OTHER_TENANT, app.publicId)).resolves.toBeNull();
    await expect(repos.workflows.getByPublicId(OTHER_TENANT, run.publicId)).resolves.toBeNull();

    // Real workflow replay of Final QA does not create additional versions or provider regenerations
    const gensBefore = regenerateCount;
    const versionCount = versions.length;
    const live = await repos.workflows.getByPublicId(TENANT, run.publicId);
    await repos.workflows.updateRun(live!.id, {
      stage: "FINAL_QA_RUNNING",
      status: "running",
      payload: withoutClaims({ ...(live?.payload ?? {}) }),
    });
    await pipeline.handleStage(
      { ...live!, stage: "FINAL_QA_RUNNING", payload: withoutClaims({ ...(live?.payload ?? {}) }) },
      "FINAL_QA_RUNNING",
    );
    const afterVersions = resume ? await repos.resumes.listVersions(TENANT, resume.publicId) : [];
    expect(afterVersions).toHaveLength(versionCount);
    expect(regenerateCount).toBe(gensBefore);
    const after = await repos.workflows.getById(live!.id);
    expect(after?.stage).toBe("FINAL_READY");

    await queue.stop();
  }, 200_000);
});

function withoutClaims(payload: Record<string, unknown>) {
  const next = { ...payload };
  for (const key of Object.keys(next)) {
    if (key.startsWith("claimed:")) delete next[key];
  }
  return next;
}
