/** @vitest-environment node */
/**
 * PostgreSQL crash recovery for ResumePipeline V0 generation.
 * The Python client is mocked; all persistence and stage claims use real repositories.
 */
import { randomUUID } from "crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "../../../server/config/env";
import { resetDbCache } from "../../../server/database/client";
import { newId, nowIso } from "../../../server/database/repositories";
import * as pythonClient from "../../../server/intelligence/python-client";
import { DbWorkflowEngine } from "../../../server/workflows/engine";
import { InProcessQueueAdapter } from "../../../server/workflows/queues";
import {
  ResumePipeline,
  setResumeGenerationFaultPoint,
  type ResumeGenFaultPoint,
} from "../../../server/workflows/resume-pipeline";

const databaseUrl = process.env.DATABASE_URL;
const requirePostgres =
  process.env.CANDIDARC_REQUIRE_USAGE_POSTGRES === "1" || process.env.CANDIDARC_REQUIRE_INFRA === "1";

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

function mockResumeDoc(evidenceId: string) {
  const bullet = (text: string) => ({
    text,
    evidenceIds: [evidenceId],
    technologies: ["Python", "Kubernetes"],
    claimRisk: "low" as const,
    matchedRequirements: [] as string[],
    confidence: "high" as const,
    sourceVersion: "career-evidence",
  });
  return {
    absoluteVersion: 0,
    cycleStep: 0,
    versionNumber: 0,
    score: 80,
    scoreBreakdown: SCORE_BREAKDOWN,
    notes: "grounded postgres v0",
    sections: [
      { type: "summary" as const, title: "Summary", order: 0, bullets: [bullet("Python platform engineer.")] },
      {
        type: "experience" as const,
        title: "Experience",
        order: 1,
        items: [{
          heading: "Platform Engineer · TechCorp",
          bullets: [bullet("Reduced deployment time by 60% using Python and Kubernetes.")],
        }],
      },
      { type: "skills" as const, title: "Skills", order: 2, bullets: [bullet("Python · Kubernetes")] },
    ],
  };
}

describe("ResumePipeline generation crash recovery (postgres)", () => {
  if (!databaseUrl) {
    it("requires DATABASE_URL when infra is required", () => {
      if (requirePostgres) {
        throw new Error("DATABASE_URL is required for resume-generation crash postgres tests");
      }
      expect(process.env.VITEST).toBeTruthy();
    });
    return;
  }

  let repos: InstanceType<typeof import("../../../server/database/postgres-repos").PostgresRepositories>;
  let sql: import("postgres").Sql;
  let tenantId: string;
  let otherTenantId: string;
  let userId: string;
  let otherUserId: string;
  let otherApplicationPublicId: string;
  let generateCalls = 0;
  let clientSpy: ReturnType<typeof vi.spyOn>;
  let unknownCost = false;

  beforeAll(async () => {
    process.env.CANDIDARC_DATA_MODE = "postgres";
    process.env.APP_MODE = "demo";
    process.env.AI_MODE = "mock";
    process.env.RESUME_INTELLIGENCE_BACKEND = "python";
    resetEnvCache();
    resetDbCache();

    const postgres = (await import("postgres")).default;
    sql = postgres(databaseUrl!, { max: 10 });
    const { PostgresRepositories } = await import("../../../server/database/postgres-repos");
    repos = new PostgresRepositories();

    tenantId = randomUUID();
    otherTenantId = randomUUID();
    userId = randomUUID();
    otherUserId = randomUUID();
    otherApplicationPublicId = `app_other_${newId("x")}`;
    await sql`
      insert into tenants (id, public_id, name, plan)
      values
        (${tenantId}::uuid, ${`ten_${tenantId.slice(0, 8)}`}, 'Crash PG', 'free'),
        (${otherTenantId}::uuid, ${`ten_${otherTenantId.slice(0, 8)}`}, 'Crash PG Other', 'free')
    `;
    await sql`
      insert into users (id, public_id, email, email_verified, password_hash, name)
      values
        (${userId}::uuid, ${`usr_${userId.slice(0, 8)}`}, ${`crash-${userId.slice(0, 8)}@example.com`}, true, 'x', 'Crash'),
        (${otherUserId}::uuid, ${`usr_${otherUserId.slice(0, 8)}`}, ${`other-${otherUserId.slice(0, 8)}@example.com`}, true, 'x', 'Other')
    `;
    await repos.applications.create({
      id: randomUUID(),
      publicId: otherApplicationPublicId,
      tenantId: otherTenantId,
      ownerUserId: otherUserId,
      company: "Other Co",
      companyMark: "OC",
      role: "Untouched",
      location: "Remote",
      employmentType: "Full-time",
      stage: "RESEARCH_QUEUED",
      workflowStage: "RESEARCH_QUEUED",
      status: "researching",
      nextAction: "Untouched",
      researchConfidence: 0,
      evidenceCoverage: 0,
      resumeScore: 0,
      atsAlignment: 0,
      interviewStatus: "not-started",
      archived: false,
      roleFamily: "General",
      metadata: { sentinel: "preserve" },
    });
  }, 60_000);

  beforeEach(() => {
    generateCalls = 0;
    unknownCost = false;
    setResumeGenerationFaultPoint(null);
    const fakeClient = {
      generateResume: async (input: { evidence: Array<{ publicId?: string; id?: string }> }) => {
        generateCalls += 1;
        return {
          resume: mockResumeDoc(String(input.evidence[0]?.publicId ?? input.evidence[0]?.id)),
          provider: "deterministic",
          model: "internal",
          promptVersion: "resume-generation@python-v2",
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            estimatedCostCents: unknownCost ? null : 0,
            costUnknown: unknownCost,
          },
          latencyMs: 1,
        };
      },
      regenerateResume: async () => {
        throw new Error("regenerateResume must not run for V0");
      },
    };
    clientSpy = vi.spyOn(pythonClient, "getPythonIntelligenceClient").mockReturnValue(fakeClient as never);
  });

  afterEach(() => {
    setResumeGenerationFaultPoint(null);
    clientSpy.mockRestore();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      await sql`delete from resume_sections where tenant_id in (${tenantId}::uuid, ${otherTenantId}::uuid)`;
      await sql`delete from resume_versions where tenant_id in (${tenantId}::uuid, ${otherTenantId}::uuid)`;
      await sql`delete from resumes where tenant_id in (${tenantId}::uuid, ${otherTenantId}::uuid)`;
      await sql`delete from usage_ledger where tenant_id in (${tenantId}::uuid, ${otherTenantId}::uuid)`;
      await sql`delete from workflow_runs where tenant_id in (${tenantId}::uuid, ${otherTenantId}::uuid)`;
      await sql`delete from evidence_items where tenant_id in (${tenantId}::uuid, ${otherTenantId}::uuid)`;
      await sql`delete from applications where tenant_id in (${tenantId}::uuid, ${otherTenantId}::uuid)`;
      await sql`delete from users where id in (${userId}::uuid, ${otherUserId}::uuid)`;
      await sql`delete from tenants where id in (${tenantId}::uuid, ${otherTenantId}::uuid)`;
    } catch {
      /* ignore cleanup errors */
    }
    await sql.end({ timeout: 5 });
    const { closeDb } = await import("../../../server/database/client");
    await closeDb().catch(() => undefined);
    resetDbCache();
    resetEnvCache();
  });

  async function seedV0Generating() {
    const applicationId = randomUUID();
    const applicationPublicId = `app_crash_${newId("x")}`;
    const app = await repos.applications.create({
      id: applicationId,
      publicId: applicationPublicId,
      tenantId,
      ownerUserId: userId,
      company: "Acme",
      companyMark: "AC",
      role: "Platform Engineer",
      location: "Remote",
      employmentType: "Full-time",
      stage: "V0_GENERATING",
      workflowStage: "V0_GENERATING",
      status: "resume",
      nextAction: "Generate V0",
      researchConfidence: 50,
      evidenceCoverage: 90,
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
    const evidencePublicId = `ev_crash_pg_${newId("x")}`;
    await repos.evidence.create({
      id: randomUUID(),
      publicId: evidencePublicId,
      tenantId,
      ownerUserId: userId,
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
      privacyLevel: "share-safe",
      payload: {},
      excludedFromApplicationIds: [],
      matchedApplicationIds: [],
    });
    const run = await repos.workflows.createRun({
      id: randomUUID(),
      publicId: `wf_crash_${newId("x")}`,
      tenantId,
      applicationId: app.id,
      applicationPublicId: app.publicId,
      stage: "V0_GENERATING",
      status: "running",
      attempt: 1,
      maxAttempts: 3,
      idempotencyKey: `idem_crash_${randomUUID()}`,
      payload: { customerFacing: true, autoAdvanceAudits: true, executionBackend: "python" },
      createdAt: nowIso(),
    });
    const queue = new InProcessQueueAdapter();
    const engine = new DbWorkflowEngine(repos.workflows, queue);
    return { app, run, pipeline: ResumePipeline.fromRepos(repos, engine, queue) };
  }

  async function expireLease(runId: string) {
    const current = await repos.workflows.getById(runId);
    const claimKey = "claimed:V0_GENERATING";
    const claim = current?.payload[claimKey];
    await repos.workflows.updateRun(runId, {
      payload: {
        ...current?.payload,
        [claimKey]: {
          ...(typeof claim === "object" && claim ? claim : {}),
          expiresAt: "1970-01-01T00:00:00.000Z",
        },
      },
    });
    const persisted = await repos.workflows.getById(runId);
    expect(persisted?.payload[claimKey]).toBeTruthy();
    return persisted!;
  }

  async function assertRecovered(runId: string, applicationPublicId: string, expectUnknown = false) {
    const resume = await repos.resumes.getByApplication(tenantId, applicationPublicId);
    expect(resume).toBeTruthy();
    const versions = await repos.resumes.listVersions(tenantId, resume!.publicId);
    expect(versions).toHaveLength(1);
    expect(resume!.currentVersionPublicId).toBe(versions[0]!.publicId);

    const latest = await repos.workflows.getById(runId);
    expect(latest?.stage).toBe("HR_AUDIT_1_RUNNING");
    expect(latest?.payload.pendingResumeGeneration).toBeUndefined();

    const rows = await sql<{
      kind: string;
      idempotency_key: string;
      cost_cents: string;
      status: string;
      metadata: Record<string, unknown>;
    }[]>`
      select kind, idempotency_key, cost_cents::text, status, metadata
      from usage_ledger
      where tenant_id = ${tenantId}::uuid and workflow_run_id = ${runId}::uuid
    `;
    const reservations = rows.filter((row) => row.kind === "resume_generation");
    expect(reservations).toHaveLength(1);
    expect(reservations[0]!.status).toBe("committed");
    const costs = rows.filter((row) => row.kind === "provider_cost");
    expect(costs.length).toBeLessThanOrEqual(1);
    if (expectUnknown) {
      expect(costs).toHaveLength(1);
      expect(costs[0]!.idempotency_key.endsWith(":cost-unknown")).toBe(true);
      expect(costs[0]!.metadata.billable).toBe(false);
    }

    const other = await repos.applications.getByPublicId(otherTenantId, otherApplicationPublicId);
    expect(other?.stage).toBe("RESEARCH_QUEUED");
    expect(other?.metadata?.sentinel).toBe("preserve");
  }

  const faultPoints: ResumeGenFaultPoint[] = [
    "after_provider",
    "after_append",
    "after_current",
    "after_usage",
    "before_transition",
  ];

  for (const point of faultPoints) {
    it(`recovers ${point} after claim expiry without duplicate side effects`, async () => {
      const { app, run, pipeline } = await seedV0Generating();
      setResumeGenerationFaultPoint(point);
      await expect(pipeline.handleStage(run, "V0_GENERATING")).rejects.toMatchObject({ code: "FAULT_INJECTED" });
      expect(generateCalls).toBe(1);

      const retryRun = await expireLease(run.id);
      await pipeline.handleStage(retryRun, "V0_GENERATING");

      expect(generateCalls).toBe(1);
      await assertRecovered(run.id, app.publicId);
    });
  }

  it("preserves unknown cost as unknown and non-billable across replay", async () => {
    unknownCost = true;
    const { app, run, pipeline } = await seedV0Generating();
    setResumeGenerationFaultPoint("before_transition");
    await expect(pipeline.handleStage(run, "V0_GENERATING")).rejects.toMatchObject({ code: "FAULT_INJECTED" });

    const retryRun = await expireLease(run.id);
    await pipeline.handleStage(retryRun, "V0_GENERATING");

    expect(generateCalls).toBe(1);
    await assertRecovered(run.id, app.publicId, true);
  });

  it("rejects steal of an active stage claim", async () => {
    const { run, pipeline } = await seedV0Generating();
    setResumeGenerationFaultPoint("after_provider");
    const first = pipeline.handleStage(run, "V0_GENERATING");
    await expect(first).rejects.toMatchObject({ code: "FAULT_INJECTED" });

    const active = await repos.workflows.getById(run.id);
    const claimKey = "claimed:V0_GENERATING";
    expect(active?.payload[claimKey]).toBeTruthy();
    const steal = await pipeline.handleStage(active!, "V0_GENERATING");
    expect(steal).toBeUndefined();
    expect(generateCalls).toBe(1);
    const still = await repos.workflows.getById(run.id);
    expect(still?.stage).toBe("V0_GENERATING");
  });
});
