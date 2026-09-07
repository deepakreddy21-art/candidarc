/** @vitest-environment node */
/**
 * PostgreSQL workflow stage-claim lease integration tests.
 * Must run with DATABASE_URL after migrations. Skips are failures in CI integration.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { resetEnvCache } from "../../../server/config/env";
import { newId } from "../../../server/database/repositories";

const databaseUrl = process.env.DATABASE_URL;
const requirePostgres =
  process.env.CANDIDARC_REQUIRE_USAGE_POSTGRES === "1" || process.env.CANDIDARC_REQUIRE_INFRA === "1";

describe("workflow stage claims (postgres integration)", () => {
  if (!databaseUrl) {
    it("requires DATABASE_URL when infra is required", () => {
      if (requirePostgres) throw new Error("DATABASE_URL is required for stage-claim postgres tests");
      expect(process.env.VITEST).toBeTruthy();
    });
    return;
  }

  let repos: InstanceType<typeof import("../../../server/database/postgres-repos").PostgresRepositories>;
  let sql: import("postgres").Sql;
  let tenantId: string;
  let otherTenantId: string;
  let userId: string;

  beforeAll(async () => {
    process.env.CANDIDARC_DATA_MODE = "postgres";
    process.env.APP_MODE = "demo";
    resetEnvCache();
    const { resetDbCache } = await import("../../../server/database/client");
    resetDbCache();
    const postgres = (await import("postgres")).default;
    sql = postgres(databaseUrl!, { max: 10 });
    const { PostgresRepositories } = await import("../../../server/database/postgres-repos");
    repos = new PostgresRepositories();

    tenantId = randomUUID();
    otherTenantId = randomUUID();
    userId = randomUUID();
    await sql`
      insert into tenants (id, public_id, name, plan)
      values
        (${tenantId}::uuid, ${`ten_${tenantId.slice(0, 8)}`}, 'Stage Claims', 'free'),
        (${otherTenantId}::uuid, ${`ten_${otherTenantId.slice(0, 8)}`}, 'Other Tenant', 'free')
    `;
    await sql`
      insert into users (id, public_id, email, email_verified, password_hash, name)
      values (
        ${userId}::uuid,
        ${`usr_${userId.slice(0, 8)}`},
        ${`claims-${userId.slice(0, 8)}@example.com`},
        true,
        'x',
        'Stage Claim Tester'
      )
    `;
  }, 60_000);

  afterAll(async () => {
    try {
      await sql`delete from applications where tenant_id in (${tenantId}::uuid, ${otherTenantId}::uuid)`;
      await sql`delete from users where id = ${userId}::uuid`;
      await sql`delete from tenants where id in (${tenantId}::uuid, ${otherTenantId}::uuid)`;
    } catch {
      /* ignore cleanup errors */
    }
    await sql.end({ timeout: 5 });
    const { closeDb, resetDbCache } = await import("../../../server/database/client");
    await closeDb().catch(() => undefined);
    resetDbCache();
    resetEnvCache();
  });

  async function createRun(payload: Record<string, unknown>, stage: "V0_GENERATING" | "RESEARCH_QUEUED" = "V0_GENERATING") {
    const applicationId = randomUUID();
    const app = await repos.applications.create({
      id: applicationId,
      publicId: `app_${applicationId.slice(0, 8)}_${newId("x")}`,
      tenantId,
      ownerUserId: userId,
      company: "Acme",
      companyMark: "AC",
      role: "Engineer",
      location: "Remote",
      employmentType: "Full-time",
      stage,
      workflowStage: stage,
      status: "generating",
      nextAction: "Continue",
      researchConfidence: 0,
      evidenceCoverage: 0,
      resumeScore: 0,
      atsAlignment: 0,
      interviewStatus: "not-started",
      archived: false,
      roleFamily: "General",
      metadata: {},
    });
    return repos.workflows.createRun({
      id: randomUUID(),
      publicId: newId("wfp"),
      tenantId,
      applicationId: app.id,
      applicationPublicId: app.publicId,
      stage,
      status: stage === "RESEARCH_QUEUED" ? "queued" : "running",
      attempt: 2,
      maxAttempts: 5,
      idempotencyKey: newId("stage-claim"),
      payload,
    });
  }

  it("does not steal an active object lease or cross tenant boundaries", async () => {
    const run = await createRun({
      untouched: "preserve-me",
      "claimed:V0_GENERATING": {
        at: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        attempt: 1,
      },
    });

    expect(await repos.workflows.claimStage(tenantId, run.id, "V0_GENERATING")).toBeNull();
    expect(await repos.workflows.claimStage(otherTenantId, run.id, "V0_GENERATING")).toBeNull();
    const stored = await repos.workflows.getById(run.id);
    expect(stored?.payload.untouched).toBe("preserve-me");
  });

  it("reclaims an expired object lease and patches only its claim key", async () => {
    const run = await createRun({
      untouched: { nested: true },
      "claimed:OTHER_STAGE": "leave-this-alone",
      "claimed:V0_GENERATING": {
        at: "2020-01-01T00:00:00.000Z",
        expiresAt: "2020-01-01T00:05:00.000Z",
        attempt: 1,
      },
    });

    const claimed = await repos.workflows.claimStage(tenantId, run.id, "V0_GENERATING");
    expect(claimed).not.toBeNull();
    expect(claimed?.payload.untouched).toEqual({ nested: true });
    expect(claimed?.payload["claimed:OTHER_STAGE"]).toBe("leave-this-alone");
    expect(claimed?.payload["claimed:V0_GENERATING"]).toMatchObject({ attempt: 2 });
  });

  it("reclaims expired legacy string leases and malformed timestamps without throwing", async () => {
    const legacy = await createRun({ "claimed:V0_GENERATING": "2020-01-01T00:00:00.000Z" });
    expect(await repos.workflows.claimStage(tenantId, legacy.id, "V0_GENERATING")).not.toBeNull();

    const malformedObject = await createRun({
      "claimed:V0_GENERATING": { expiresAt: "not-a-timestamp" },
    });
    await expect(
      repos.workflows.claimStage(tenantId, malformedObject.id, "V0_GENERATING"),
    ).resolves.not.toBeNull();

    const malformedString = await createRun({ "claimed:V0_GENERATING": "not-a-timestamp" });
    await expect(
      repos.workflows.claimStage(tenantId, malformedString.id, "V0_GENERATING"),
    ).resolves.not.toBeNull();
  });

  it("allows exactly one of eight concurrent claimers", async () => {
    const run = await createRun({ unrelated: 42 });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => repos.workflows.claimStage(tenantId, run.id, "V0_GENERATING")),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    const stored = await repos.workflows.getById(run.id);
    expect(stored?.payload.unrelated).toBe(42);
  });

  it("atomically advances a queued stage to its running counterpart", async () => {
    const run = await createRun({ keep: "value" }, "RESEARCH_QUEUED");
    const claimed = await repos.workflows.claimStage(tenantId, run.id, "RESEARCH_QUEUED");

    expect(claimed?.stage).toBe("RESEARCH_RUNNING");
    expect(claimed?.status).toBe("running");
    expect(claimed?.payload.keep).toBe("value");
    expect(claimed?.payload["claimed:RESEARCH_QUEUED"]).toMatchObject({ attempt: 2 });
  });
});
