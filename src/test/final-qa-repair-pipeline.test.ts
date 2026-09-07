/** @vitest-environment node */
/**
 * Final-QA repair through the real TypeScript→FastAPI boundary.
 *
 * When PYTHON_BACKEND_URL is set (npm run test:python-mode), this suite:
 * - does NOT mock getPythonIntelligenceClient / regenerateResume
 * - requires CANDIDARC_MOCK_FINAL_QA_FORCE=fail_until_repair on FastAPI
 * - proves structured final_qa_repair produces V4R1 and reaches FINAL_READY
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

const TENANT = "ten_finalqa_repair_http";
const USER = "user_finalqa_repair_http";
const BASE = process.env.PYTHON_BACKEND_URL;
const TOKEN = process.env.PYTHON_BACKEND_TOKEN || "dev-python-backend-token-change-me";
const FORCE = process.env.CANDIDARC_MOCK_FINAL_QA_FORCE;

const describeHttp = BASE && FORCE === "fail_until_repair" ? describe : describe.skip;

describeHttp("Final QA repair via real FastAPI (structured directive)", () => {
  let providerSpy: ReturnType<typeof vi.spyOn>;
  let regenerateBodies: Array<Record<string, unknown>>;

  beforeAll(async () => {
    const health = await fetch(`${BASE}/health/live`);
    if (!health.ok) throw new Error(`FastAPI not ready at ${BASE}`);
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
    regenerateBodies = [];

    const client = getPythonIntelligenceClient();
    const original = client.regenerateResume.bind(client);
    vi.spyOn(client, "regenerateResume").mockImplementation(async (input) => {
      regenerateBodies.push({
        refinementInstruction: input.refinementInstruction ?? null,
        finalQaRepair: input.finalQaRepair ?? null,
        absoluteVersion: input.absoluteVersion,
        previousVersion: input.previousResume
          ? Number((input.previousResume as { versionNumber?: number }).versionNumber)
          : null,
      });
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

  async function seed(repos: MemoryRepositories, store: ReturnType<typeof createEmptyMemoryStore>) {
    store.tenants.set(TENANT, {
      id: TENANT,
      publicId: "tenp_repair_http",
      name: "Repair HTTP",
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
      publicId: "usr_repair_http",
      email: "repair-http@example.com",
      name: "Repair HTTP",
      passwordHash: "x",
      emailVerified: true,
    });
    const app = await repos.applications.create({
      id: newId("app"),
      publicId: "app_repair_http",
      tenantId: TENANT,
      ownerUserId: USER,
      company: "Acme",
      companyMark: "AC",
      role: "Platform Engineer",
      location: "Remote",
      employmentType: "Full-time",
      stage: "FINAL_QA_RUNNING",
      workflowStage: "FINAL_QA_RUNNING",
      status: "final-qa",
      nextAction: "Final QA",
      researchConfidence: 0.5,
      evidenceCoverage: 0.9,
      resumeScore: 74,
      atsAlignment: 70,
      interviewStatus: "not-started",
      archived: false,
      roleFamily: "General",
      metadata: {
        jobDescription: "Platform engineer. Python and Kubernetes required. " + "detail ".repeat(12),
        customerFacing: true,
        autoAdvanceAudits: true,
      },
    });
    await repos.evidence.create({
      id: newId("ev"),
      publicId: "ev_repair_1",
      tenantId: TENANT,
      ownerUserId: USER,
      candidateProfileId: null,
      title: "Platform Engineer",
      organization: "TechCorp",
      situation: "Owned deployment platform",
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
      publicId: "ev_repair_edu",
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

    // Seed a Python-grounded V4 so repair validation matches production evidence rules.
    const client = getPythonIntelligenceClient();
    const grounded = await client.generateResume({
      context: {
        tenantId: TENANT,
        userId: USER,
        applicationId: app.publicId,
        workflowRunId: "wf_repair_seed",
        requestId: "req_repair_seed",
      },
      absoluteVersion: 4,
      cycleStep: 4,
      jobDescription: String(app.metadata?.jobDescription ?? ""),
      evidence: [
        {
          id: "ev_repair_1",
          tenantId: TENANT,
          ownerUserId: USER,
          title: "Platform Engineer",
          organization: "TechCorp",
          situation: "Owned deployment platform",
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
          metrics: ["60% deployment time reduction"],
        },
        {
          id: "ev_repair_edu",
          tenantId: TENANT,
          ownerUserId: USER,
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
        },
      ],
      allowedTechnologies: ["Python", "Kubernetes", "OpenSearch"],
      previousResume: null,
      acceptedFindings: [],
      rejectedFindings: [],
      researchFindings: [],
      mistakeMemory: [],
      refinementInstruction: null,
      finalQaRepair: null,
      jobRequirements: ["Python", "Kubernetes"],
      evidenceMatches: [],
      userConfirmations: [],
      idempotencyKey: `seed-v4:${app.publicId}`,
    });

    const resume = await repos.resumes.createResume({
      id: newId("res"),
      publicId: "resp_repair_http",
      tenantId: TENANT,
      applicationId: app.id,
      applicationPublicId: app.publicId,
      title: "Repair resume",
      templateId: "alumni-clean",
      length: "one-page",
      currentVersionPublicId: null,
    });
    const failedV4 = await repos.resumes.appendVersion({
      id: newId("rv"),
      publicId: "rvv4_failed_http",
      tenantId: TENANT,
      resumeId: resume.id,
      versionNumber: 4,
      versionLabel: "V4",
      score: grounded.resume.score,
      scoreBreakdown: grounded.resume.scoreBreakdown,
      notes: grounded.resume.notes || "failed v4",
      triggeredBy: "EM Audit 2",
      sections: grounded.resume.sections as never,
      idempotencyKey: `resume:${app.publicId}:v4:seed`,
      promptVersion: grounded.promptVersion || "python@v1",
    });
    await repos.resumes.setCurrentVersion(TENANT, resume.publicId, failedV4.publicId);
    return { app, resume, failedV4 };
  }

  async function runFromFinalQa(repos: MemoryRepositories, store: ReturnType<typeof createEmptyMemoryStore>, appId: string, appPublicId: string) {
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
      applicationId: appId,
      applicationPublicId: appPublicId,
      stage: "FINAL_QA_RUNNING",
      idempotencyKey: `repair-http:${appPublicId}:${Date.now()}`,
      payload: { customerFacing: true, autoAdvanceAudits: true, cycleBase: 0 },
    });
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const status = await engine.getStatus(TENANT, run.publicId);
      if (status?.stage === "FINAL_READY" || status?.stage === "FINAL_QA_FAILED" || status?.status === "failed") {
        await queue.stop();
        return { engine, run, status, pipeline, queue };
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    await queue.stop();
    throw new Error("pipeline timed out");
  }

  it("AI QA fails → structured FastAPI repair → V4R1 → FINAL_READY with distinct usage keys", async () => {
    const store = createEmptyMemoryStore();
    const repos = new MemoryRepositories(store);
    const { app, failedV4 } = await seed(repos, store);

    const { status, run } = await runFromFinalQa(repos, store, app.id, app.publicId);
    expect(status?.stage).toBe("FINAL_READY");
    expect(providerSpy).not.toHaveBeenCalled();

    expect(regenerateBodies).toHaveLength(1);
    expect(regenerateBodies[0]?.refinementInstruction).toBeNull();
    expect(regenerateBodies[0]?.finalQaRepair).toMatchObject({
      repairType: "final_qa_repair",
      sourceVersion: 4,
      attempt: 1,
    });
    expect(regenerateBodies[0]?.previousVersion).toBe(4);

    const resume = await repos.resumes.getByApplication(TENANT, app.publicId);
    const versions = resume ? await repos.resumes.listVersions(TENANT, resume.publicId) : [];
    expect(versions.map((v) => v.versionNumber).sort((a, b) => a - b)).toEqual([4, 5]);
    const v4 = versions.find((v) => v.versionNumber === 4)!;
    const repair = versions.find((v) => v.versionNumber === 5)!;
    expect(v4.publicId).toBe(failedV4.publicId);
    expect(JSON.stringify(v4.sections)).toBe(JSON.stringify(failedV4.sections));
    expect(repair.versionLabel).toBe("V4R1");
    expect(repair.triggeredBy).toBe("final-qa-repair");
    expect(resume?.currentVersionPublicId).toBe(repair.publicId);
    expect(JSON.stringify(repair.sections).toLowerCase()).not.toContain("ownership focus");

    const usageKeys = [...store.usageLedger.values()]
      .filter((row) => row.tenantId === TENANT && row.kind !== "provider_cost")
      .map((row) => row.idempotencyKey);
    const genKeys = usageKeys.filter((key) => key.includes(":resume_generation"));
    const qaKeys = usageKeys.filter((key) => key.includes(":final_review"));
    expect(genKeys.some((key) => key.includes("repair:v4-to-v4r1"))).toBe(true);
    expect(qaKeys.some((key) => key.includes("final-qa:v4:"))).toBe(true);
    expect(qaKeys.some((key) => key.includes("final-qa:v5:"))).toBe(true);
    expect(new Set(qaKeys).size).toBeGreaterThanOrEqual(2);

    // Real workflow replay of repair generation is idempotent
    const gensBefore = regenerateBodies.length;
    const versionsBefore = versions.length;
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
    const live = await repos.workflows.getByPublicId(TENANT, run.publicId);
    expect(live?.stage).toBe("FINAL_READY");
    // Force re-entry of V4_GENERATING with the same repair payload (idempotent)
    const repairPayload = withExpiredClaims({
      ...(live?.payload ?? {}),
      finalQaRepairAttempted: true,
      finalQaRepairAttempt: 1,
      finalQaRepairSourceVersion: 4,
      finalQaRepairChecksHash: String(live?.payload?.finalQaRepairChecksHash ?? "na"),
      finalQaRepairDirective: live?.payload?.finalQaRepairDirective,
    });
    await repos.workflows.updateRun(live!.id, {
      stage: "V4_GENERATING",
      status: "running",
      payload: repairPayload,
    });
    await pipeline.handleStage(
      { ...live!, stage: "V4_GENERATING", payload: repairPayload },
      "V4_GENERATING",
    );
    const after = resume ? await repos.resumes.listVersions(TENANT, resume.publicId) : [];
    expect(after).toHaveLength(versionsBefore);
    expect(regenerateBodies.length).toBe(gensBefore);
    const again = await repos.workflows.getById(live!.id);
    expect(again?.stage === "FINAL_READY" || again?.stage === "FINAL_QA_RUNNING" || again?.stage === "V4_READY").toBe(
      true,
    );
  }, 90_000);
});

function withExpiredClaims(payload: Record<string, unknown>) {
  const next = { ...payload };
  for (const key of Object.keys(next)) {
    if (!key.startsWith("claimed:")) continue;
    const claim = next[key];
    next[key] = {
      ...(typeof claim === "object" && claim ? claim : {}),
      expiresAt: "1970-01-01T00:00:00.000Z",
    };
  }
  return next;
}
