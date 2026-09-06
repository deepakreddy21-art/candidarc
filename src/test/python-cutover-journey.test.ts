/** @vitest-environment node */
/**
 * Application-boundary Python cutover proof with mocked FastAPI client.
 * Complements docker smoke + production-readiness PDF/DOCX coverage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyMemoryStore, MemoryRepositories, newId, nowIso } from "../../server/database/repositories";
import { DbWorkflowEngine } from "../../server/workflows/engine";
import { InProcessQueueAdapter } from "../../server/workflows/queues";
import { ResumePipeline } from "../../server/workflows/resume-pipeline";
import { resetEnvCache } from "../../server/config/env";
import { resetDbCache } from "../../server/database/client";
import * as aiIndex from "../../server/ai";
import * as pythonClient from "../../server/intelligence/python-client";

const TENANT = "ten_cutover";
const USER = "user_cutover";

const resumeDoc = (version: number) => ({
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
  notes: `python cutover V${version}`,
  sections: [
    {
      type: "experience" as const,
      title: "Experience",
      order: 0,
      items: [
        {
          heading: "Northwind Labs",
          subheading: "Software Engineer",
          dates: "January 2024 – Present",
          bullets: [
            {
              text: "Improved search latency by 35% using Python and OpenSearch",
              evidenceIds: ["ev_cutover_1"],
              technologies: ["Python", "OpenSearch"],
              matchedRequirements: [] as string[],
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
      order: 1,
      items: [
        {
          heading: "Rivertown Institute of Technology",
          subheading: "MS Information Systems",
          dates: "January 2023 – May 2024",
          bullets: [
            {
              text: "Completed MS Information Systems coursework",
              evidenceIds: ["ev_cutover_1"],
              technologies: [] as string[],
              matchedRequirements: [] as string[],
              confidence: "high" as const,
              claimRisk: "low" as const,
              sourceVersion: "python",
            },
          ],
        },
      ],
    },
  ],
});

describe("python cutover application boundary", () => {
  const calls: string[] = [];
  let providerSpy: ReturnType<typeof vi.spyOn>;
  let clientSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    calls.length = 0;
    resetEnvCache();
    resetDbCache();
    vi.stubEnv("APP_MODE", "demo");
    vi.stubEnv("AI_MODE", "mock");
    vi.stubEnv("CANDIDARC_DATA_MODE", "memory");
    vi.stubEnv("RESUME_INTELLIGENCE_BACKEND", "python");
    vi.stubEnv("PYTHON_INTELLIGENCE_TENANT_ALLOWLIST", TENANT);
    resetEnvCache();

    providerSpy = vi.spyOn(aiIndex, "getProviderForRole") as ReturnType<typeof vi.spyOn>;
    const client = {
      parseJob: vi.fn(async () => {
        calls.push("parse");
        return {
          company: "Northwind Labs",
          role: "Platform Engineer",
          title: "Platform Engineer",
          location: "Remote",
          employment_type: "Full-time",
          required_qualifications: ["Python platform experience"],
          preferred_qualifications: [],
          responsibilities: ["Build platforms"],
          target_technologies: ["Python", "OpenSearch"],
        };
      }),
      synthesizeResearch: vi.fn(async () => {
        calls.push("research");
        return {
          findings: [
            {
              category: "company",
              title: "Overview",
              summary: "Fictional company",
              confidence: "medium",
              status: "inferred",
              source_ids: ["src-1"],
            },
          ],
          sources: [
            {
              id: "src-1",
              url: "https://example.com/careers",
              title: "Careers",
              accessed_at: nowIso(),
              supporting_text: "Hiring engineers",
              confidence: "medium",
              classification: "explicit",
              relevance: 0.7,
            },
          ],
          overall_confidence: 0.7,
          company_research_status: "available",
        };
      }),
      matchEvidence: vi.fn(async () => {
        calls.push("match");
        return {
          evidence_coverage: 0.85,
          rows: [
            {
              requirement: "Python",
              importance: "required",
              evidence_ids: ["ev_cutover_1"],
              evidence_strength: "strong",
              resume_usage: "use",
            },
          ],
        };
      }),
      generateResume: vi.fn(async () => {
        calls.push("generate");
        return {
          resume: resumeDoc(0),
          provider: "python",
          model: "mock",
          promptVersion: "gen@v1",
          latencyMs: 5,
          usage: { inputTokens: 1, outputTokens: 1, estimatedCostCents: 2, costUnknown: false },
        };
      }),
      regenerateResume: vi.fn(async (input: { absoluteVersion: number }) => {
        calls.push(`regenerate:${input.absoluteVersion}`);
        return {
          resume: resumeDoc(input.absoluteVersion),
          provider: "python",
          model: "mock",
          promptVersion: "regen@v1",
          latencyMs: 5,
          usage: { inputTokens: 1, outputTokens: 1, estimatedCostCents: 2, costUnknown: false },
        };
      }),
      auditResume: vi.fn(async (input: { lens: string; reviewsVersion: number; producesVersion: number }) => {
        calls.push(`audit:${input.lens}`);
        return {
          data: {
            lens: input.lens,
            reviewsVersion: input.reviewsVersion,
            producesVersion: input.producesVersion,
            scoreBefore: 70,
            scoreAfter: 71,
            summary: `audit ${input.lens}`,
            findings: [
              {
                severity: "suggestion",
                section: "experience",
                title: "Keep metric",
                explanation: "ok",
                beforeText: "",
                suggestedText: "Improved search latency by 35% using Python and OpenSearch",
                expectedScoreImpact: 0,
                evidenceSource: "ev_cutover_1",
              },
            ],
            rejectedFindings: [],
          },
          provider: "python",
          model: "mock",
          latencyMs: 4,
          usage: { inputTokens: 1, outputTokens: 1, estimatedCostCents: 1, costUnknown: false },
        };
      }),
      finalQa: vi.fn(async () => {
        calls.push("final-qa");
        return {
          data: { passed: true, checks: [{ label: "truthfulness", status: "pass", detail: "ok" }] },
          provider: "python",
          model: "mock",
          latencyMs: 3,
          usage: { inputTokens: 1, outputTokens: 1, estimatedCostCents: null, costUnknown: true },
        };
      }),
    };
    clientSpy = vi.spyOn(pythonClient, "getPythonIntelligenceClient").mockReturnValue(client as never);
    vi.spyOn(pythonClient, "resolveIntelligenceBackendForTenant").mockImplementation(({ tenantId }) =>
      tenantId === TENANT ? "python" : "typescript",
    );
  });

  afterEach(() => {
    providerSpy.mockRestore();
    clientSpy.mockRestore();
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
      company: "Target company",
      companyMark: "TC",
      role: "Target role",
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
          "Northwind Labs is seeking a Platform Engineer. Python required. " + "detail ".repeat(10),
        jobUrl: "https://example.com/careers",
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
      title: "Northwind",
      organization: "Northwind Labs",
      situation: "s",
      task: "t",
      actions: ["a"],
      result: "Improved search latency by 35%",
      technologies: ["Python", "OpenSearch"],
      confidence: "high",
      sourceType: "employment",
      claimText: "Software Engineer at Northwind Labs. Improved search latency by 35% using Python and OpenSearch.",
      verificationStatus: "user_attested",
      candidateConfirmationStatus: "confirmed",
      privacyLevel: "standard",
      payload: { metrics: ["35%"] },
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
    const workflowQueues = ["research", "evidence-matching", "resume-generation", "resume-audit"] as const;
    for (const q of workflowQueues) {
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
      stage: "RESEARCH_QUEUED" as const,
      idempotencyKey: `cutover:${app.publicId}`,
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
    expect(calls).toEqual(
      expect.arrayContaining(["parse", "research", "match", "generate", "final-qa"]),
    );
    expect(calls.filter((c) => c.startsWith("audit:")).length).toBeGreaterThanOrEqual(4);
    expect(calls.filter((c) => c.startsWith("regenerate:")).length).toBeGreaterThanOrEqual(4);

    const events = await repos.workflows.listEvents(TENANT, run.publicId);
    const metaOps = events
      .map((e) => e.metadata)
      .filter((m): m is { executionBackend: string; operation: string } =>
        Boolean(m && typeof m.executionBackend === "string" && typeof m.operation === "string"),
      );
    expect(metaOps.some((m) => m.operation === "parse" && m.executionBackend === "python")).toBe(true);
    expect(metaOps.some((m) => m.operation === "research" && m.executionBackend === "python")).toBe(true);
    expect(metaOps.some((m) => m.operation === "match" && m.executionBackend === "python")).toBe(true);
    expect(metaOps.some((m) => m.operation === "audit" && m.executionBackend === "python")).toBe(true);
    expect(metaOps.some((m) => m.operation === "final-qa" && m.executionBackend === "python")).toBe(true);

    const resume = await repos.resumes.getByApplication(TENANT, app.publicId);
    const versions = resume ? await repos.resumes.listVersions(TENANT, resume.publicId) : [];
    const nums = versions.map((v) => v.versionNumber);
    expect(nums).toEqual([...new Set(nums)].sort((a, b) => a - b));
    expect(Math.max(...nums)).toBeGreaterThanOrEqual(4);

    const costs = [...store.usageLedger.values()].filter((u) => u.kind === "provider_cost");
    expect(costs.every((c) => c.tenantId === TENANT)).toBe(true);
    expect(costs.some((c) => c.idempotencyKey.endsWith(":cost-unknown"))).toBe(true);

    await queue.stop();
  }, 60_000);
});
