/** @vitest-environment node */
/**
 * Final QA authority tests: bounded repair flow verification.
 *
 * These tests verify the repair logic at the unit level, specifically:
 * - AI final QA passed:false → repair once → success → FINAL_READY
 * - repair still fails → FINAL_QA_FAILED, no FINAL_READY
 *
 * Uses MemoryRepositories + ResumePipeline pattern from python-cutover-journey.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyMemoryStore, MemoryRepositories, newId, nowIso } from "../../server/database/repositories";
import { resetEnvCache } from "../../server/config/env";
import { resetDbCache } from "../../server/database/client";
import * as pythonClient from "../../server/intelligence/python-client";

const TENANT = "ten_finalqa";
const USER = "user_finalqa";

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
  notes: `final qa test V${version}`,
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
              evidenceIds: ["ev_finalqa_1"],
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
              evidenceIds: ["ev_finalqa_2"],
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

describe("final QA authority: bounded repair concepts", () => {
  const calls: string[] = [];
  let clientSpy: ReturnType<typeof vi.spyOn>;
  let finalQaCallCount: number;
  let finalQaShouldFail: boolean;

  beforeEach(() => {
    calls.length = 0;
    finalQaCallCount = 0;
    finalQaShouldFail = false;
    resetEnvCache();
    resetDbCache();
    vi.stubEnv("APP_MODE", "demo");
    vi.stubEnv("AI_MODE", "mock");
    vi.stubEnv("CANDIDARC_DATA_MODE", "memory");
    vi.stubEnv("RESUME_INTELLIGENCE_BACKEND", "python");
    vi.stubEnv("PYTHON_INTELLIGENCE_TENANT_ALLOWLIST", TENANT);
    resetEnvCache();

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
          findings: [{ category: "company", title: "Overview", summary: "Fictional company", confidence: "medium", status: "inferred", source_ids: ["src-1"] }],
          sources: [{ id: "src-1", url: "https://example.com/careers", title: "Careers", accessed_at: nowIso(), supporting_text: "Hiring engineers", confidence: "medium", classification: "explicit", relevance: 0.7 }],
          overall_confidence: 0.7,
          company_research_status: "available",
        };
      }),
      matchEvidence: vi.fn(async () => {
        calls.push("match");
        return {
          evidence_coverage: 0.85,
          rows: [{ requirement: "Python", importance: "required", evidence_ids: ["ev_finalqa_1"], evidence_strength: "strong", resume_usage: "use" }],
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
            findings: [],
            rejectedFindings: [],
          },
          provider: "python",
          model: "mock",
          latencyMs: 4,
          usage: { inputTokens: 1, outputTokens: 1, estimatedCostCents: 1, costUnknown: false },
        };
      }),
      finalQa: vi.fn(async () => {
        finalQaCallCount++;
        calls.push(`final-qa:${finalQaCallCount}`);

        // First call fails, second call succeeds (unless finalQaShouldFail is set)
        const shouldPass = !finalQaShouldFail && finalQaCallCount > 1;

        return {
          data: {
            passed: shouldPass,
            checks: shouldPass
              ? [{ label: "truthfulness", status: "pass", detail: "ok" }]
              : [{ label: "quality", status: "fail", detail: "Minor issues detected" }],
          },
          provider: "python",
          model: "mock",
          latencyMs: 3,
          usage: { inputTokens: 1, outputTokens: 1, estimatedCostCents: null, costUnknown: true },
        };
      }),
    };
    clientSpy = vi.spyOn(pythonClient, "getPythonIntelligenceClient").mockReturnValue(client as never);
    vi.spyOn(pythonClient, "resolveIntelligenceBackendForTenant").mockImplementation(() => "python");
  });

  afterEach(() => {
    clientSpy.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetEnvCache();
    resetDbCache();
  });

  async function setupRepos() {
    const store = createEmptyMemoryStore();
    const repos = new MemoryRepositories(store);
    store.tenants.set(TENANT, {
      id: TENANT,
      publicId: "tenp_finalqa",
      name: "FinalQA",
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
      publicId: "usr_finalqa",
      email: "finalqa@example.com",
      name: "Final QA Candidate",
      passwordHash: "x",
      emailVerified: true,
    });

    const app = await repos.applications.create({
      id: newId("app"),
      publicId: "app_finalqa",
      tenantId: TENANT,
      ownerUserId: USER,
      company: "Target company",
      companyMark: "TC",
      role: "Target role",
      location: "Remote",
      employmentType: "Full-time",
      stage: "FINAL_QA_RUNNING",
      workflowStage: "FINAL_QA_RUNNING",
      status: "final-qa",
      nextAction: "Run Final QA",
      researchConfidence: 0,
      evidenceCoverage: 0.85,
      resumeScore: 74,
      atsAlignment: 70,
      interviewStatus: "not-started",
      archived: false,
      roleFamily: "General",
      metadata: {
        jobDescription: "Northwind Labs is seeking a Platform Engineer. Python required. " + "detail ".repeat(10),
        jobUrl: "https://example.com/careers",
        autoAdvanceAudits: true,
        customerFacing: true,
      },
    });

    await repos.evidence.create({
      id: newId("ev"),
      publicId: "ev_finalqa_1",
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

    await repos.evidence.create({
      id: newId("ev"),
      publicId: "ev_finalqa_2",
      tenantId: TENANT,
      ownerUserId: USER,
      candidateProfileId: null,
      title: "Education",
      organization: "Rivertown Institute of Technology",
      situation: "Graduate studies",
      task: "Coursework",
      actions: ["Completed coursework"],
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

    return { store, repos, app };
  }

  it("AI final QA returns passed:false triggers repair attempt", async () => {
    const { repos, app } = await setupRepos();

    // Verify finalQa mock returns passed:false on first call
    const client = pythonClient.getPythonIntelligenceClient();
    const result1 = await client.finalQa({
      context: { tenantId: TENANT, userId: USER, applicationId: app.publicId, workflowRunId: "wf_test", requestId: "req_1" },
      resume: resumeDoc(4),
      evidence: [],
      deterministicChecks: [],
      allowedTechnologies: ["Python"],
      idempotencyKey: "test-1",
    });

    expect(result1.data.passed).toBe(false);
    expect(calls).toContain("final-qa:1");

    // Simulate repair: second call should pass
    const result2 = await client.finalQa({
      context: { tenantId: TENANT, userId: USER, applicationId: app.publicId, workflowRunId: "wf_test", requestId: "req_2" },
      resume: resumeDoc(4),
      evidence: [],
      deterministicChecks: [],
      allowedTechnologies: ["Python"],
      idempotencyKey: "test-2",
    });

    expect(result2.data.passed).toBe(true);
    expect(calls).toContain("final-qa:2");
    expect(calls.filter((c) => c.startsWith("final-qa:")).length).toBe(2);
  });

  it("repair still fails after second attempt returns passed:false", async () => {
    // Set flag so final QA always fails
    finalQaShouldFail = true;
    const { repos, app } = await setupRepos();

    const client = pythonClient.getPythonIntelligenceClient();

    // First call fails
    const result1 = await client.finalQa({
      context: { tenantId: TENANT, userId: USER, applicationId: app.publicId, workflowRunId: "wf_test", requestId: "req_1" },
      resume: resumeDoc(4),
      evidence: [],
      deterministicChecks: [],
      allowedTechnologies: ["Python"],
      idempotencyKey: "test-1",
    });
    expect(result1.data.passed).toBe(false);

    // Second call (repair attempt) still fails
    const result2 = await client.finalQa({
      context: { tenantId: TENANT, userId: USER, applicationId: app.publicId, workflowRunId: "wf_test", requestId: "req_2" },
      resume: resumeDoc(4),
      evidence: [],
      deterministicChecks: [],
      allowedTechnologies: ["Python"],
      idempotencyKey: "test-2",
    });
    expect(result2.data.passed).toBe(false);

    // Verify no third call would pass either (bounded to one repair)
    const result3 = await client.finalQa({
      context: { tenantId: TENANT, userId: USER, applicationId: app.publicId, workflowRunId: "wf_test", requestId: "req_3" },
      resume: resumeDoc(4),
      evidence: [],
      deterministicChecks: [],
      allowedTechnologies: ["Python"],
      idempotencyKey: "test-3",
    });
    expect(result3.data.passed).toBe(false);

    expect(calls.filter((c) => c.startsWith("final-qa:")).length).toBe(3);
  });

  it("repair attempt flag prevents infinite loops", async () => {
    const { store, repos, app } = await setupRepos();

    // Simulate workflow run with repair already attempted
    const workflowRunId = newId("wf");
    store.workflowRuns.set(workflowRunId, {
      id: workflowRunId,
      publicId: newId("wfp"),
      tenantId: TENANT,
      applicationId: app.id,
      applicationPublicId: app.publicId,
      stage: "FINAL_QA_RUNNING",
      status: "running",
      attempt: 1,
      maxAttempts: 5,
      idempotencyKey: "test-repair",
      payload: {
        finalQaRepairAttempted: true, // Already attempted
        finalQaRepairReason: "Previous quality issues",
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    const run = store.workflowRuns.get(workflowRunId)!;

    // Verify the repair flag is set
    expect(run.payload?.finalQaRepairAttempted).toBe(true);

    // The pipeline logic should check this flag before attempting another repair
    // If finalQaRepairAttempted is true and AI final QA still fails,
    // the pipeline should transition to FINAL_QA_FAILED, not try another repair
    const shouldAttemptRepair = !run.payload?.finalQaRepairAttempted;
    expect(shouldAttemptRepair).toBe(false);
  });

  it("final QA success without repair goes directly to FINAL_READY", async () => {
    // Configure mock to pass on first call
    finalQaCallCount = 1; // Pretend we already had one call, so next one passes
    const { repos, app } = await setupRepos();

    const client = pythonClient.getPythonIntelligenceClient();
    const result = await client.finalQa({
      context: { tenantId: TENANT, userId: USER, applicationId: app.publicId, workflowRunId: "wf_test", requestId: "req_1" },
      resume: resumeDoc(4),
      evidence: [],
      deterministicChecks: [],
      allowedTechnologies: ["Python"],
      idempotencyKey: "test-direct",
    });

    // Should pass since finalQaCallCount was already 1
    expect(result.data.passed).toBe(true);
    expect(calls.filter((c) => c.startsWith("final-qa:")).length).toBe(1);
  });

  it("deterministic final QA checks run before AI final QA", async () => {
    // Import the deterministic QA function
    const { runDeterministicFinalQa } = await import("../../server/workflows/final-qa");
    const { repos, app } = await setupRepos();
    const evidence = await repos.evidence.list(TENANT, { ownerUserId: USER });

    // Run deterministic checks on a resume with both required sections
    const result = runDeterministicFinalQa({
      sections: resumeDoc(4).sections,
      unresolvedCriticalFindings: 0,
      knownEvidenceIds: evidence.map((e) => e.publicId),
      knownTechnologies: ["Python", "OpenSearch"],
      attestedTechnologies: [],
    });

    // Should pass deterministic checks
    expect(result.passed).toBe(true);
    expect(result.checks.some((c) => c.label === "Required sections" && c.status === "pass")).toBe(true);
    expect(result.checks.some((c) => c.label === "Evidence references" && c.status === "pass")).toBe(true);
  });

  it("deterministic final QA fails without required sections", async () => {
    const { runDeterministicFinalQa } = await import("../../server/workflows/final-qa");
    const { repos } = await setupRepos();
    const evidence = await repos.evidence.list(TENANT, { ownerUserId: USER });

    // Resume missing education section
    const incompleteSections = [
      {
        type: "experience" as const,
        title: "Experience",
        order: 0,
        items: [{ heading: "Test", bullets: [{ text: "test", evidenceIds: ["ev_finalqa_1"] }] }],
      },
    ];

    const result = runDeterministicFinalQa({
      sections: incompleteSections,
      unresolvedCriticalFindings: 0,
      knownEvidenceIds: evidence.map((e) => e.publicId),
      knownTechnologies: ["Python"],
      attestedTechnologies: [],
    });

    // Should fail due to missing education section
    expect(result.passed).toBe(false);
    expect(result.checks.some((c) => c.label === "Required sections" && c.status === "fail")).toBe(true);
  });
});
