/** @vitest-environment node */
/**
 * Crash-safe resume generation: fault injection at persistence boundaries.
 * Mocks the Python client (no paid providers) while exercising real memory repos + pipeline.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyMemoryStore, MemoryRepositories, newId, nowIso } from "../../server/database/repositories";
import { DbWorkflowEngine } from "../../server/workflows/engine";
import { InProcessQueueAdapter } from "../../server/workflows/queues";
import {
  ResumePipeline,
  setResumeGenerationFaultPoint,
  type ResumeGenFaultPoint,
} from "../../server/workflows/resume-pipeline";
import { resetEnvCache } from "../../server/config/env";
import { resetDbCache } from "../../server/database/client";
import * as pythonClient from "../../server/intelligence/python-client";

const TENANT = "ten_crash_recovery";
const USER = "user_crash_recovery";

const SCORE_BREAKDOWN = {
  atsCompatibility: 80,
  jobAlignment: 80,
  recruiterReadability: 80,
  impact: 80,
  quantification: 80,
  technicalDepth: 80,
  competencyCoverage: 80,
  evidenceConfidence: 80,
  writingQuality: 80,
  formatIntegrity: 80,
};

function mockBullet(id: string, text: string) {
  return {
    id,
    text,
    evidenceIds: ["ev_crash_1"],
    technologies: ["Python", "Kubernetes"],
    claimRisk: "low" as const,
    matchedRequirements: [] as string[],
    confidence: "high" as const,
    sourceVersion: "v0",
  };
}

function mockResumeDoc(notes = "grounded v0") {
  return {
    absoluteVersion: 0,
    cycleStep: 0,
    versionNumber: 0,
    score: 80,
    scoreBreakdown: SCORE_BREAKDOWN,
    notes,
    sections: [
      {
        type: "summary",
        title: "Summary",
        order: 0,
        bullets: [mockBullet("b1", "Built Python automation for Kubernetes deployments.")],
      },
      {
        type: "experience",
        title: "Experience",
        order: 1,
        items: [
          {
            id: "i1",
            company: "TechCorp",
            title: "Platform Engineer",
            heading: "Platform Engineer · TechCorp",
            bullets: [
              mockBullet("b2", "Reduced deployment time by 60% using Python and Kubernetes."),
            ],
          },
        ],
      },
      {
        type: "skills",
        title: "Skills",
        order: 2,
        bullets: [mockBullet("b3", "Python · Kubernetes")],
      },
    ],
  };
}

describe("resume generation crash recovery", () => {
  let generateCalls: number;
  let clientSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetEnvCache();
    resetDbCache();
    setResumeGenerationFaultPoint(null);
    delete process.env.CANDIDARC_FAULT_INJECT_RESUME;
    vi.stubEnv("APP_MODE", "demo");
    vi.stubEnv("AI_MODE", "mock");
    vi.stubEnv("CANDIDARC_DATA_MODE", "memory");
    vi.stubEnv("RESUME_INTELLIGENCE_BACKEND", "python");
    vi.stubEnv("PYTHON_BACKEND_URL", "http://python.test");
    vi.stubEnv("PYTHON_BACKEND_TOKEN", "dev-python-backend-token-change-me");
    resetEnvCache();
    generateCalls = 0;
    const fakeClient = {
      generateResume: async () => {
        generateCalls += 1;
        return {
          resume: mockResumeDoc(),
          provider: "mock",
          model: "mock-model",
          promptVersion: "python@v1",
          usage: { inputTokens: 10, outputTokens: 20, estimatedCostCents: 0 },
          latencyMs: 5,
        };
      },
      regenerateResume: async () => {
        generateCalls += 1;
        return {
          resume: mockResumeDoc("regenerated"),
          provider: "mock",
          model: "mock-model",
          promptVersion: "python@v1",
          usage: { inputTokens: 11, outputTokens: 21, estimatedCostCents: 0 },
          latencyMs: 6,
        };
      },
    };
    clientSpy = vi.spyOn(pythonClient, "getPythonIntelligenceClient").mockReturnValue(fakeClient as never);
  });

  afterEach(() => {
    setResumeGenerationFaultPoint(null);
    delete process.env.CANDIDARC_FAULT_INJECT_RESUME;
    clientSpy.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetEnvCache();
    resetDbCache();
  });

  async function seedV0Generating() {
    const store = createEmptyMemoryStore();
    const repos = new MemoryRepositories(store);
    store.tenants.set(TENANT, {
      id: TENANT,
      publicId: "tenp_crash",
      name: "Crash Recovery",
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
      publicId: "usr_crash",
      email: "crash@example.com",
      name: "Crash",
      passwordHash: "x",
      emailVerified: true,
    });
    const app = await repos.applications.create({
      id: newId("app"),
      publicId: "app_crash",
      tenantId: TENANT,
      ownerUserId: USER,
      company: "Acme",
      companyMark: "AC",
      role: "Platform Engineer",
      location: "Remote",
      employmentType: "Full-time",
      stage: "V0_GENERATING",
      workflowStage: "V0_GENERATING",
      status: "generating",
      nextAction: "Generate V0",
      researchConfidence: 0.5,
      evidenceCoverage: 0.9,
      resumeScore: 0,
      atsAlignment: 0,
      interviewStatus: "not-started",
      archived: false,
      roleFamily: "General",
      metadata: {
        jobDescription: "Platform engineer. Python and Kubernetes required.",
        customerFacing: true,
        autoAdvanceAudits: true,
      },
    });
    await repos.evidence.create({
      id: newId("ev"),
      publicId: "ev_crash_1",
      tenantId: TENANT,
      ownerUserId: USER,
      candidateProfileId: null,
      title: "Platform Engineer",
      organization: "TechCorp",
      situation: "Owned deployment platform",
      task: "Reduce release cycle time",
      actions: ["Implemented Python automation"],
      result: "Reduced deployment time by 60%",
      technologies: ["Python", "Kubernetes"],
      confidence: "high",
      sourceType: "employment",
      claimText: "Platform Engineer at TechCorp.",
      verificationStatus: "user_attested",
      candidateConfirmationStatus: "confirmed",
      privacyLevel: "standard",
      payload: {},
      excludedFromApplicationIds: [],
      matchedApplicationIds: [],
    });
    const run = await repos.workflows.createRun({
      id: newId("wf"),
      publicId: "wf_crash",
      tenantId: TENANT,
      applicationId: app.id,
      applicationPublicId: app.publicId,
      stage: "V0_GENERATING",
      status: "running",
      attempt: 1,
      maxAttempts: 3,
      idempotencyKey: `idem_crash_${Date.now()}`,
      payload: { customerFacing: true, autoAdvanceAudits: true, executionBackend: "python" },
      createdAt: nowIso(),
    });
    const queue = new InProcessQueueAdapter();
    const engine = new DbWorkflowEngine(repos.workflows, queue);
    const pipeline = ResumePipeline.fromRepos(repos, engine, queue);
    return { store, repos, app, run, pipeline, engine };
  }

  function usageRows(store: ReturnType<typeof createEmptyMemoryStore>, workflowId: string) {
    return [...store.usageLedger.values()].filter((row) => row.workflowRunId === workflowId);
  }

  async function assertRecovered(
    repos: MemoryRepositories,
    store: ReturnType<typeof createEmptyMemoryStore>,
    runId: string,
    appPublicId: string,
  ) {
    const resume = await repos.resumes.getByApplication(TENANT, appPublicId);
    expect(resume).toBeTruthy();
    const versions = await repos.resumes.listVersions(TENANT, resume!.publicId);
    expect(versions).toHaveLength(1);
    expect(resume!.currentVersionPublicId).toBe(versions[0]!.publicId);

    const latest = await repos.workflows.getById(runId);
    expect(latest?.stage).toBe("HR_AUDIT_1_RUNNING");
    expect(latest?.payload?.pendingResumeGeneration).toBeUndefined();

    const rows = usageRows(store, runId);
    const reservations = rows.filter(
      (r) => r.kind === "resume_generation" && !String(r.idempotencyKey).includes(":cost"),
    );
    const costRows = rows.filter((r) => String(r.idempotencyKey).endsWith(":cost"));
    const providerUsage = rows.filter((r) => String(r.idempotencyKey).endsWith(":provider-usage"));
    expect(reservations).toHaveLength(1);
    expect(reservations[0]!.status).toBe("committed");
    expect(costRows).toHaveLength(1);
    expect(providerUsage).toHaveLength(1);
  }

  const crashPoints: ResumeGenFaultPoint[] = [
    "after_provider",
    "after_append",
    "after_current",
    "before_transition",
  ];

  for (const point of crashPoints) {
    it(`recovers after crash at ${point} without duplicate version/cost/provider call`, async () => {
      const { store, repos, app, run, pipeline } = await seedV0Generating();
      setResumeGenerationFaultPoint(point);

      await expect(pipeline.handleStage(run, "V0_GENERATING")).rejects.toMatchObject({
        code: "FAULT_INJECTED",
      });
      expect(generateCalls).toBe(1);

      // Clear fault and retry the same stage (simulate worker restart clearing stale claim).
      setResumeGenerationFaultPoint(null);
      const mid = await repos.workflows.getById(run.id);
      expect(mid).toBeTruthy();
      const cleared = { ...(mid!.payload ?? {}) };
      for (const key of Object.keys(cleared)) {
        if (key.startsWith("claimed:")) delete cleared[key];
      }
      await repos.workflows.updateRun(run.id, { payload: cleared });
      const retryRun = await repos.workflows.getById(run.id);
      await pipeline.handleStage(retryRun!, "V0_GENERATING");

      await assertRecovered(repos, store, run.id, app.publicId);
      // Provider must not be billed/called again after after_provider (pending draft reuse).
      expect(generateCalls).toBe(1);
    });
  }

  it("appendAllocatedVersion is atomic for same operationKey under concurrency", async () => {
    const { repos, app } = await seedV0Generating();
    const resume = await repos.resumes.createResume({
      id: newId("res"),
      publicId: newId("resp"),
      tenantId: TENANT,
      applicationId: app.id,
      applicationPublicId: app.publicId,
      title: "Resume",
      templateId: "alumni-clean",
      length: "one-page",
      currentVersionPublicId: null,
    });
    const operationKey = `${app.publicId}:repair:v4-to-v4r1:attempt-1:hash`;
    const results = await Promise.all(
      Array.from({ length: 8 }, async (_, index) =>
        repos.resumes.appendAllocatedVersion!({
          tenantId: TENANT,
          resumePublicId: resume.publicId,
          operationKey,
          setAsCurrent: true,
          version: {
            id: newId("rv"),
            publicId: `rv_op_${index}_${newId("x")}`,
            tenantId: TENANT,
            resumeId: resume.id,
            versionLabel: "V4R1",
            score: 80,
            scoreBreakdown: SCORE_BREAKDOWN,
            notes: "repair",
            triggeredBy: "final-qa-repair",
            sections: [],
            idempotencyKey: index < 4 ? `same-idem:${TENANT}` : `alt-idem:${index}:${TENANT}`,
            operationKey,
          },
        }),
      ),
    );
    const ids = new Set(results.map((v) => v.publicId));
    expect(ids.size).toBe(1);
    const versions = await repos.resumes.listVersions(TENANT, resume.publicId);
    expect(versions).toHaveLength(1);
    const current = await repos.resumes.getByApplication(TENANT, app.publicId);
    expect(current?.currentVersionPublicId).toBe(results[0]!.publicId);
  });
});
