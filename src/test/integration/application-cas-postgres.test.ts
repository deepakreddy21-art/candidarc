/** @vitest-environment node */
/**
 * PostgreSQL atomic compare-and-swap for application candidateStatus updates.
 * Runs in CI via npm run test:integration and test:usage-postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { resetEnvCache } from "../../../server/config/env";
import { AppError } from "../../../server/domain/types";
import { newId } from "../../../server/database/repositories";
import type { AuthContext } from "../../../server/auth/guards";
import { ApplicationsService } from "../../../server/modules/applications/service";
import { DbWorkflowEngine } from "../../../server/workflows/engine";
import { InProcessQueueAdapter } from "../../../server/workflows/queues";

const databaseUrl = process.env.DATABASE_URL;
const requirePostgres =
  process.env.CANDIDARC_REQUIRE_USAGE_POSTGRES === "1" || process.env.CANDIDARC_REQUIRE_INFRA === "1";

describe("application status CAS (postgres)", () => {
  if (!databaseUrl) {
    it("requires DATABASE_URL when infra is required", () => {
      if (requirePostgres) throw new Error("DATABASE_URL is required for application CAS postgres tests");
      expect(process.env.VITEST).toBeTruthy();
    });
    return;
  }

  let repos: InstanceType<typeof import("../../../server/database/postgres-repos").PostgresRepositories>;
  let sql: import("postgres").Sql;
  let service: ApplicationsService;
  let tenantA: string;
  let tenantB: string;
  let userA: string;
  let userB: string;

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
    const queue = new InProcessQueueAdapter();
    const engine = new DbWorkflowEngine(repos.workflows, queue);
    service = ApplicationsService.fromRepos(repos, engine);

    tenantA = randomUUID();
    tenantB = randomUUID();
    userA = randomUUID();
    userB = randomUUID();
    await sql`
      insert into tenants (id, public_id, name, plan)
      values
        (${tenantA}::uuid, ${`ten_${tenantA.slice(0, 8)}`}, 'App CAS A', 'free'),
        (${tenantB}::uuid, ${`ten_${tenantB.slice(0, 8)}`}, 'App CAS B', 'free')
    `;
    await sql`
      insert into users (id, public_id, email, email_verified, password_hash, name)
      values
        (${userA}::uuid, ${`usr_${userA.slice(0, 8)}`}, ${`appcas-a-${userA.slice(0, 8)}@example.com`}, true, 'x', 'CAS A'),
        (${userB}::uuid, ${`usr_${userB.slice(0, 8)}`}, ${`appcas-b-${userB.slice(0, 8)}@example.com`}, true, 'x', 'CAS B')
    `;
    await sql`
      insert into tenant_memberships (id, tenant_id, user_id, role)
      values
        (${randomUUID()}::uuid, ${tenantA}::uuid, ${userA}::uuid, 'owner'),
        (${randomUUID()}::uuid, ${tenantB}::uuid, ${userB}::uuid, 'owner')
    `;
  }, 60_000);

  afterAll(async () => {
    try {
      await sql`delete from applications where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`;
      await sql`delete from workflow_runs where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`;
      await sql`delete from tenant_memberships where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`;
      await sql`delete from users where id in (${userA}::uuid, ${userB}::uuid)`;
      await sql`delete from tenants where id in (${tenantA}::uuid, ${tenantB}::uuid)`;
    } catch {
      /* ignore */
    }
    await sql.end({ timeout: 5 });
    const { closeDb, resetDbCache } = await import("../../../server/database/client");
    await closeDb().catch(() => undefined);
    resetDbCache();
    resetEnvCache();
  });

  function ctx(userId: string, tenantId: string): AuthContext {
    return {
      requestId: newId("req"),
      user: { id: userId, publicId: "usp", email: "cas@example.com", name: "CAS" },
      memberships: [{ tenantId, tenantPublicId: "tep", role: "owner" }],
      activeTenantId: tenantId,
      repos: { applications: repos.applications, evidence: repos.evidence },
    };
  }

  async function seedApp(tenantId: string, userId: string, publicId: string) {
    return repos.applications.create({
      id: randomUUID(),
      publicId,
      tenantId,
      company: "Acme",
      companyMark: "AC",
      role: "Engineer",
      location: "Remote",
      employmentType: "Full-time",
      status: "researching",
      stage: "APPLICATION_CREATED",
      workflowStage: "APPLICATION_CREATED",
      resumeScore: 0,
      evidenceCoverage: 0,
      atsAlignment: 0,
      interviewStatus: "not-started",
      researchConfidence: 0,
      archived: false,
      roleFamily: "General",
      nextAction: "Track",
      ownerUserId: userId,
      metadata: {},
    });
  }

  it("concurrent different statuses: exactly one wins and one gets 409", async () => {
    const publicId = `app-cas-diff-${newId("k")}`;
    const app = await seedApp(tenantA, userA, publicId);
    const auth = ctx(userA, tenantA);
    const v0 = app.version;

    const results = await Promise.allSettled([
      service.update(auth, publicId, { candidateStatus: "Applied", expectedVersion: v0 }),
      service.update(auth, publicId, { candidateStatus: "Interviewing", expectedVersion: v0 }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<
      Awaited<ReturnType<ApplicationsService["update"]>>
    >[];
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0]!.reason as AppError).code).toBe("APPLICATION_VERSION_CONFLICT");
    expect((rejected[0]!.reason as AppError).status).toBe(409);

    const final = await repos.applications.getByPublicId(tenantA, publicId);
    expect(final?.version).toBe(v0 + 1);
    expect(["Applied", "Interviewing"]).toContain(final?.metadata?.candidateStatus);
  });

  it("concurrent identical status: final correct without unnecessary second bump", async () => {
    const publicId = `app-cas-same-${newId("k")}`;
    const app = await seedApp(tenantA, userA, publicId);
    const auth = ctx(userA, tenantA);
    const first = await service.update(auth, publicId, {
      candidateStatus: "Applied",
      expectedVersion: app.version,
    });
    expect(first.metadata?.candidateStatus).toBe("Applied");
    const v1 = first.version;

    const results = await Promise.allSettled([
      service.update(auth, publicId, { candidateStatus: "Applied", expectedVersion: v1 }),
      service.update(auth, publicId, { candidateStatus: "Applied", expectedVersion: v1 }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBe(2);
    const final = await repos.applications.getByPublicId(tenantA, publicId);
    expect(final?.metadata?.candidateStatus).toBe("Applied");
    expect(final?.version).toBe(v1);
  });

  it("cross-tenant update fails and deleted application cannot be updated", async () => {
    const publicId = `app-cas-iso-${newId("k")}`;
    const app = await seedApp(tenantA, userA, publicId);
    const authB = ctx(userB, tenantB);
    await expect(
      service.update(authB, publicId, { candidateStatus: "Applied", expectedVersion: app.version }),
    ).rejects.toMatchObject({ code: "APPLICATION_NOT_FOUND", status: 404 });

    await repos.applications.softDelete(tenantA, publicId);
    const authA = ctx(userA, tenantA);
    await expect(
      service.update(authA, publicId, { candidateStatus: "Applied", expectedVersion: app.version }),
    ).rejects.toMatchObject({ code: "APPLICATION_NOT_FOUND", status: 404 });
  });
});
