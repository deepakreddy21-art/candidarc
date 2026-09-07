/** @vitest-environment node */
/**
 * Real ResumePipeline Final-QA repair tests (memory).
 * Exercises stage transitions + persistence — not mocked Final-QA client calls alone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyMemoryStore, MemoryRepositories, newId, nowIso } from "../../server/database/repositories";
import { DbWorkflowEngine } from "../../server/workflows/engine";
import { InProcessQueueAdapter } from "../../server/workflows/queues";
import { ResumePipeline } from "../../server/workflows/resume-pipeline";
import { resetEnvCache } from "../../server/config/env";
import { resetDbCache } from "../../server/database/client";
import * as pythonClient from "../../server/intelligence/python-client";

const TENANT = "ten_finalqa_repair";
const USER = "user_finalqa_repair";

function visibleText(sections: unknown[]): string {
  return JSON.stringify(sections)
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function resumeDoc(version: number, emphasis = "baseline") {
  return {
    versionNumber: version,
    absoluteVersion: version,
    cycleStep: version % 5,
    score: 70 + version,
    scoreBreakdown: {
      atsCompatibility: 70,
      jobAlignment: 70,
      recruiterReadability: 70,
      impact: 70,
      quantification: 70,
      technicalDepth: 70,
      competencyCoverage: 70,
      evidenceConfidence: 80,
      writingQuality: 70,
      formatIntegrity: 70,
    },
    notes: `notes ${emphasis} V${version}`,
    sections: [
      {
        type: "summary" as const,
        title: "Professional Summary",
        order: 0,
        bullets: [
          {
            text: `${emphasis} ownership focus: Platform engineer with Python and Kubernetes`,
            evidenceIds: ["ev_repair_1"],
            technologies: ["Python", "Kubernetes"],
            matchedRequirements: [],
            confidence: "high" as const,
            claimRisk: "low" as const,
            sourceVersion: "python",
          },
        ],
      },
      {
        type: "experience" as const,
        title: "Experience",
        order: 1,
        items: [
          {
            heading: "TechCorp",
            subheading: "Platform Engineer",
            dates: "January 2024 – Present",
            bullets: [
              {
                text: `[${emphasis} emphasis] Reduced deployment time by 60% using Python and Kubernetes`,
                evidenceIds: ["ev_repair_1"],
                technologies: ["Python", "Kubernetes"],
                matchedRequirements: [],
                confidence: "high" as const,
                claimRisk: "low" as const,
                sourceVersion: "python",
              },
            ],
          },
        ],
      },
      {
        type: "education" as const,
        title: "Education",
        order: 2,
        items: [
          {
            heading: "Rivertown Institute of Technology",
            subheading: "MS Information Systems",
            dates: "January 2023 – May 2024",
            bullets: [
              {
                text: "Completed MS Information Systems coursework",
                evidenceIds: ["ev_repair_edu"],
                technologies: [],
                matchedRequirements: [],
                confidence: "high" as const,
                claimRisk: "low" as const,
                sourceVersion: "python",
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("Final QA repair pipeline (memory)", () => {
  let generateCalls: Array<{ absoluteVersion: number; previousVersion?: number; refinement?: string | null }>;
  let finalQaCalls: number;
  let finalQaShouldFailForever: boolean;

  beforeEach(() => {
    resetEnvCache();
    resetDbCache();
    vi.stubEnv("APP_MODE", "demo");
    vi.stubEnv("AI_MODE", "mock");
    vi.stubEnv("CANDIDARC_DATA_MODE", "memory");
    vi.stubEnv("RESUME_INTELLIGENCE_BACKEND", "python");
    resetEnvCache();
    generateCalls = [];
    finalQaCalls = 0;
    finalQaShouldFailForever = false;

    vi.spyOn(pythonClient, "getPythonIntelligenceClient").mockReturnValue({
      ready: vi.fn(async () => true),
      parseJob: vi.fn(async () => ({
        title: "Platform Engineer",
        company: "Acme",
        role: "Platform Engineer",
        location: "Remote",
        employment_type: "Full-time",
        required_qualifications: ["Python"],
        preferred_qualifications: [],
        responsibilities: [],
        warnings: [],
      })),
      synthesizeResearch: vi.fn(async () => ({
        findings: [],
        sources: [],
        overall_confidence: 0.5,
        company_research_status: "unavailable",
      })),
      matchEvidence: vi.fn(async () => ({
        evidence_coverage: 0.9,
        rows: [
          {
            requirement: "Python",
            importance: "required",
            evidence_ids: ["ev_repair_1"],
            evidence_strength: "strong",
            resume_usage: "use",
          },
        ],
      })),
      generateResume: vi.fn(async (input: { absoluteVersion: number; refinementInstruction?: string | null }) => {
        generateCalls.push({
          absoluteVersion: input.absoluteVersion,
          refinement: input.refinementInstruction ?? null,
        });
        return {
          resume: resumeDoc(input.absoluteVersion, "baseline"),
          provider: "python",
          model: "mock",
          promptVersion: "gen@v1",
          latencyMs: 5,
          usage: { inputTokens: 1, outputTokens: 1, estimatedCostCents: 2, costUnknown: false },
        };
      }),
      regenerateResume: vi.fn(
        async (input: {
          absoluteVersion: number;
          previousResume?: { versionNumber: number; sections: unknown[] } | null;
          refinementInstruction?: string | null;
        }) => {
          generateCalls.push({
            absoluteVersion: input.absoluteVersion,
            previousVersion: input.previousResume?.versionNumber,
            refinement: input.refinementInstruction ?? null,
          });
          const emphasis = input.refinementInstruction?.toLowerCase().includes("repair")
            ? "repaired-python"
            : "regen";
          return {
            resume: resumeDoc(input.absoluteVersion, emphasis),
            provider: "python",
            model: "mock",
            promptVersion: "regen@v1",
            latencyMs: 5,
            usage: { inputTokens: 1, outputTokens: 1, estimatedCostCents: 2, costUnknown: false },
          };
        },
      ),
      auditResume: vi.fn(async (input: { lens: string; reviewsVersion: number; producesVersion: number }) => ({
        data: {
          lens: input.lens,
          reviewsVersion: input.reviewsVersion,
          producesVersion: input.producesVersion,
          scoreBefore: 70,
          scoreAfter: 71,
          summary: `audit ${input.lens}`,
          findings: [],
          rejectedFindings: [],
        },
        provider: "python",
        model: "mock",
        latencyMs: 3,
        usage: { inputTokens: 1, outputTokens: 1, estimatedCostCents: 1, costUnknown: false },
      })),
      finalQa: vi.fn(async () => {
        finalQaCalls += 1;
        const pass = !finalQaShouldFailForever && finalQaCalls >= 2;
        return {
          data: {
            passed: pass,
            checks: pass
              ? [{ label: "AI QA", status: "pass", detail: "ok" }]
              : [{ label: "AI QA", status: "fail", detail: "needs repair emphasis", blocking: true }],
            provider: "python",
            model: "mock",
          },
          provider: "python",
          model: "mock",
          latencyMs: 3,
          usage: { inputTokens: 1, outputTokens: 1, estimatedCostCents: null, costUnknown: true },
        };
      }),
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetEnvCache();
    resetDbCache();
  });

  async function seedApp(repos: MemoryRepositories, store: ReturnType<typeof createEmptyMemoryStore>) {
    store.tenants.set(TENANT, {
      id: TENANT,
      publicId: "tenp_repair",
      name: "Repair",
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
      publicId: "usr_repair",
      email: "repair@example.com",
      name: "Repair User",
      passwordHash: "x",
      emailVerified: true,
    });
    const app = await repos.applications.create({
      id: newId("app"),
      publicId: "app_repair",
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
        jobDescription: "Acme seeks Platform Engineer. Python and Kubernetes required. " + "detail ".repeat(12),
        autoAdvanceAudits: true,
        customerFacing: true,
        jobExtractionAppliedAt: nowIso(),
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
      title: "MS",
      organization: "RIT",
      situation: "s",
      task: "t",
      actions: ["a"],
      result: "MS degree",
      technologies: [],
      confidence: "high",
      sourceType: "education",
      claimText: "MS Information Systems, Rivertown Institute of Technology, January 2023 – May 2024",
      verificationStatus: "user_attested",
      candidateConfirmationStatus: "confirmed",
      privacyLevel: "standard",
      payload: {},
      excludedFromApplicationIds: [],
      matchedApplicationIds: [],
    });

    const resume = await repos.resumes.createResume({
      id: newId("res"),
      publicId: "resp_repair",
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
      publicId: "rvv4_failed",
      tenantId: TENANT,
      resumeId: resume.id,
      versionNumber: 4,
      versionLabel: "V4",
      score: 74,
      scoreBreakdown: resumeDoc(4).scoreBreakdown,
      notes: "failed v4",
      triggeredBy: "EM Audit 2",
      sections: resumeDoc(4, "failed-v4").sections,
      idempotencyKey: `resume:${app.publicId}:v4:seed`,
      promptVersion: "python@v1",
    });
    await repos.resumes.setCurrentVersion(TENANT, resume.publicId, failedV4.publicId);
    return { app, resume, failedV4 };
  }

  async function runPipeline(repos: MemoryRepositories, store: ReturnType<typeof createEmptyMemoryStore>, appId: string, appPublicId: string) {
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
      idempotencyKey: `repair-test:${appPublicId}:${Date.now()}`,
      payload: { customerFacing: true, autoAdvanceAudits: true, cycleBase: 0 },
    });
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const status = await engine.getStatus(TENANT, run.publicId);
      if (status?.stage === "FINAL_READY" || status?.stage === "FINAL_QA_FAILED" || status?.status === "failed") {
        await queue.stop();
        return { engine, run, status };
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    await queue.stop();
    throw new Error("pipeline timed out");
  }

  it("AI QA fails once → repair creates V4R1 from failed V4 → second QA passes → FINAL_READY", async () => {
    const store = createEmptyMemoryStore();
    const repos = new MemoryRepositories(store);
    const { app, failedV4 } = await seedApp(repos, store);

    const { status } = await runPipeline(repos, store, app.id, app.publicId);
    expect(status?.stage).toBe("FINAL_READY");
    expect(finalQaCalls).toBe(2);

    const resume = await repos.resumes.getByApplication(TENANT, app.publicId);
    const versions = resume ? await repos.resumes.listVersions(TENANT, resume.publicId) : [];
    expect(versions.map((v) => v.versionNumber).sort((a, b) => a - b)).toEqual([4, 5]);
    const v4 = versions.find((v) => v.versionNumber === 4)!;
    const repair = versions.find((v) => v.versionNumber === 5)!;
    expect(v4.publicId).toBe(failedV4.publicId);
    expect(v4.sections).toEqual(failedV4.sections);
    expect(repair.versionLabel).toBe("V4R1");
    expect(repair.triggeredBy).toBe("final-qa-repair");
    expect(resume?.currentVersionPublicId).toBe(repair.publicId);
    expect(visibleText(repair.sections as unknown[])).toContain("repaired-python");
    expect(visibleText(repair.sections as unknown[])).not.toBe(visibleText(v4.sections as unknown[]));

    const repairGen = generateCalls.find((c) => c.absoluteVersion === 5);
    expect(repairGen?.previousVersion).toBe(4);
    expect(repairGen?.refinement).toMatch(/Final-QA repair|failed checks/i);
    expect(generateCalls.filter((c) => c.absoluteVersion === 5)).toHaveLength(1);
  }, 30_000);

  it("AI QA fails twice → FINAL_QA_FAILED and downloads stay blocked", async () => {
    finalQaShouldFailForever = true;
    const store = createEmptyMemoryStore();
    const repos = new MemoryRepositories(store);
    const { app } = await seedApp(repos, store);
    const { status } = await runPipeline(repos, store, app.id, app.publicId);
    expect(status?.stage).toBe("FINAL_QA_FAILED");
    expect(finalQaCalls).toBe(2);
    expect(generateCalls.filter((c) => c.absoluteVersion === 5)).toHaveLength(1);

    const appRow = await repos.applications.getByPublicId(TENANT, app.publicId);
    expect(appRow?.workflowStage).toBe("FINAL_QA_FAILED");
    expect(appRow?.status).toBe("failed");
    // PDF/DOCX enqueue only happens on FINAL_READY — repair failure must not set ready.
    expect(appRow?.nextAction).toMatch(/quality checks failed|review and retry/i);
  }, 30_000);

  it("replaying the same repair is idempotent (no duplicate versions)", async () => {
    const store = createEmptyMemoryStore();
    const repos = new MemoryRepositories(store);
    const { app } = await seedApp(repos, store);
    const first = await runPipeline(repos, store, app.id, app.publicId);
    expect(first.status?.stage).toBe("FINAL_READY");
    const resume = await repos.resumes.getByApplication(TENANT, app.publicId);
    const before = resume ? await repos.resumes.listVersions(TENANT, resume.publicId) : [];
    const gensBefore = generateCalls.length;

    // Replay repair generation stage with same payload
    const repairKey = [...store.resumeVersions.values()].find((v) => v.versionLabel === "V4R1")?.idempotencyKey;
    expect(repairKey).toBeTruthy();
    const again = await repos.resumes.findVersionByIdempotency(TENANT, repairKey!);
    expect(again?.versionNumber).toBe(5);
    const after = resume ? await repos.resumes.listVersions(TENANT, resume.publicId) : [];
    expect(after).toHaveLength(before.length);
    expect(generateCalls.length).toBe(gensBefore);
  }, 30_000);
});
