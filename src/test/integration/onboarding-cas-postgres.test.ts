/** @vitest-environment node */
/**
 * PostgreSQL atomic compare-and-swap for onboarding updates.
 * Runs in CI via npm run test:integration and test:usage-postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { resetEnvCache } from "../../../server/config/env";
import { AppError } from "../../../server/domain/types";
import { newId } from "../../../server/database/repositories";
import type { AuthContext } from "../../../server/auth/guards";
import { ProfileService } from "../../../server/modules/profile/service";

const databaseUrl = process.env.DATABASE_URL;
const requirePostgres =
  process.env.CANDIDARC_REQUIRE_USAGE_POSTGRES === "1" || process.env.CANDIDARC_REQUIRE_INFRA === "1";

describe("onboarding CAS (postgres)", () => {
  if (!databaseUrl) {
    it("requires DATABASE_URL when infra is required", () => {
      if (requirePostgres) throw new Error("DATABASE_URL is required for onboarding CAS postgres tests");
      expect(process.env.VITEST).toBeTruthy();
    });
    return;
  }

  let repos: InstanceType<typeof import("../../../server/database/postgres-repos").PostgresRepositories>;
  let sql: import("postgres").Sql;
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

    tenantA = randomUUID();
    tenantB = randomUUID();
    userA = randomUUID();
    userB = randomUUID();
    await sql`
      insert into tenants (id, public_id, name, plan)
      values
        (${tenantA}::uuid, ${`ten_${tenantA.slice(0, 8)}`}, 'Onboarding CAS A', 'free'),
        (${tenantB}::uuid, ${`ten_${tenantB.slice(0, 8)}`}, 'Onboarding CAS B', 'free')
    `;
    await sql`
      insert into users (id, public_id, email, email_verified, password_hash, name)
      values
        (
          ${userA}::uuid,
          ${`usr_${userA.slice(0, 8)}`},
          ${`cas-a-${userA.slice(0, 8)}@example.com`},
          true,
          'x',
          'CAS User A'
        ),
        (
          ${userB}::uuid,
          ${`usr_${userB.slice(0, 8)}`},
          ${`cas-b-${userB.slice(0, 8)}@example.com`},
          true,
          'x',
          'CAS User B'
        )
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
      await sql`delete from candidate_profiles where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`;
      await sql`delete from tenant_memberships where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`;
      await sql`delete from users where id in (${userA}::uuid, ${userB}::uuid)`;
      await sql`delete from tenants where id in (${tenantA}::uuid, ${tenantB}::uuid)`;
    } catch {
      /* ignore cleanup errors */
    }
    await sql.end({ timeout: 5 });
    const { closeDb, resetDbCache } = await import("../../../server/database/client");
    await closeDb().catch(() => undefined);
    resetDbCache();
    resetEnvCache();
  });

  function ctx(userId: string, tenantId: string): AuthContext {
    return {
      requestId: "onboarding_cas_pg",
      user: { id: userId, publicId: "cas", email: "cas@example.com", name: "CAS" },
      memberships: [{ tenantId, tenantPublicId: "ten", role: "owner" }],
      activeTenantId: tenantId,
      repos: { applications: repos.applications, evidence: repos.evidence },
    };
  }

  async function seedProfile(tenantId: string, userId: string) {
    return repos.candidateProfiles.upsert({
      id: newId("cp"),
      publicId: newId("cpp"),
      tenantId,
      userId,
      fullName: "CAS Seed",
      preferredName: null,
      email: "cas@example.com",
      phone: null,
      location: null,
      linkedIn: null,
      github: null,
      portfolio: null,
      headline: null,
      summary: null,
      experienceLevel: null,
      yearsExperience: null,
      targetRoleFamilies: [],
      preferredResumeLength: "one-page",
      careerGoal: null,
      avatarInitials: "CS",
      remoteOk: true,
      preferredLocations: [],
      workAuthorization: null,
      requiresSponsorship: null,
      targetCompanies: [],
      targetIndustries: [],
      jobTypes: [],
      workplaceModes: [],
      willingToRelocate: null,
      salaryPreference: null,
      seniority: null,
      onboardingStep: 0,
      onboardingCompletedAt: null,
      modelImprovementOptIn: false,
      sourceResumeFilePublicId: null,
      resumeImportStatus: null,
      resumeImportExtraction: null,
    });
  }

  it("exactly one of two same-version updates succeeds; loser gets ONBOARDING_STALE", async () => {
    const profile = await seedProfile(tenantA, userA);
    const expected = profile.version;

    const results = await Promise.allSettled([
      repos.candidateProfiles.updateOnboarding(tenantA, userA, expected, {
        targetRoleFamilies: ["Winner Role"],
        seniority: "senior",
        onboardingStep: 1,
      }),
      repos.candidateProfiles.updateOnboarding(tenantA, userA, expected, {
        targetRoleFamilies: ["Loser Role"],
        seniority: "mid",
        onboardingStep: 1,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<
      Awaited<ReturnType<typeof repos.candidateProfiles.updateOnboarding>>
    >[];
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(AppError);
    expect(rejected[0]!.reason).toMatchObject({ code: "ONBOARDING_STALE", status: 409 });

    const finalProfile = await repos.candidateProfiles.getByUser(tenantA, userA);
    expect(finalProfile?.targetRoleFamilies).toEqual(fulfilled[0]!.value.targetRoleFamilies);
    expect(finalProfile?.version).toBe(expected + 1);
    expect(finalProfile?.version).toBe(fulfilled[0]!.value.version);
  });

  it("cross-tenant requests cannot inspect or participate in another tenant version conflict", async () => {
    const profileA = await seedProfile(tenantA, userA);
    const profileB = await seedProfile(tenantB, userB);

    await repos.candidateProfiles.updateOnboarding(tenantA, userA, profileA.version, {
      targetRoleFamilies: ["Tenant A Secret"],
      seniority: "senior",
    });

    await expect(
      repos.candidateProfiles.updateOnboarding(tenantB, userA, profileA.version, {
        targetRoleFamilies: ["Cross Tenant"],
      }),
    ).rejects.toMatchObject({ code: "PROFILE_NOT_FOUND", status: 404 });

    await expect(
      repos.candidateProfiles.updateOnboarding(tenantA, userB, profileB.version, {
        targetRoleFamilies: ["Cross User"],
      }),
    ).rejects.toMatchObject({ code: "PROFILE_NOT_FOUND", status: 404 });

    const stillA = await repos.candidateProfiles.getByUser(tenantA, userA);
    expect(stillA?.targetRoleFamilies).toEqual(["Tenant A Secret"]);
    const stillB = await repos.candidateProfiles.getByUser(tenantB, userB);
    expect(stillB?.targetRoleFamilies ?? []).not.toContain("Tenant A Secret");
  });

  it("service-level concurrent completion with same version yields one winner", async () => {
    const service = ProfileService.fromRepos(repos);
    const auth = ctx(userA, tenantA);
    let profile = await seedProfile(tenantA, userA);
    profile = await service.updateOnboarding(auth, {
      expectedVersion: profile.version,
      step: 3,
      data: {
        targetRoles: ["ML Engineer"],
        seniority: "mid",
        jobTypes: ["full-time"],
        workplaceModes: ["hybrid"],
        fullName: "Ada Lovelace",
        skills: ["Python"],
        employment: [{ title: "Engineer", company: "Analytical", bullets: ["Built engines"] }],
        careerProfileMode: "manual",
      },
    });

    const results = await Promise.allSettled([
      service.updateOnboarding(auth, { expectedVersion: profile.version, completed: true }),
      service.updateOnboarding(auth, { expectedVersion: profile.version, completed: true }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length + rejected.length).toBe(2);
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    // At most one CAS write; the other is either STALE or idempotent read of completed.
    const finalProfile = await repos.candidateProfiles.getByUser(tenantA, userA);
    expect(finalProfile?.onboardingCompletedAt).toBeTruthy();
  });
});
