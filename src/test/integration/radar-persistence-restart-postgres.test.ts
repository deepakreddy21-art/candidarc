/** @vitest-environment node */
/**
 * Radar postgres persistence survives process restart (hydrate + tenant isolation).
 * Runs in CI via npm run test:integration and test:usage-postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { resetEnvCache } from "../../../server/config/env";
import { newId } from "../../../server/database/repositories";
import type { AuthContext } from "../../../server/auth/guards";
import { CanonicalJobCatalog } from "../../../server/radar/catalog";
import { RadarService } from "../../../server/radar/service";
import { createPostgresRadarStore } from "../../../server/radar/persistence/postgres-store";
import type { PostgresRadarStore } from "../../../server/radar/persistence/postgres-store";
import type { CanonicalJob, Company, JobSighting, JobSource } from "../../../server/radar/types";

const databaseUrl = process.env.DATABASE_URL;
const requirePostgres =
  process.env.CANDIDARC_REQUIRE_USAGE_POSTGRES === "1" || process.env.CANDIDARC_REQUIRE_INFRA === "1";

describe("radar persistence restart (postgres)", () => {
  if (!databaseUrl) {
    it("requires DATABASE_URL when infra is required", () => {
      if (requirePostgres) {
        throw new Error("DATABASE_URL is required for radar persistence restart postgres tests");
      }
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
  let seededCompanyId: string;
  let seededSourceId: string;
  let seededJobId: string;
  let seededSightingId: string;

  beforeAll(async () => {
    process.env.CANDIDARC_DATA_MODE = "postgres";
    process.env.APP_MODE = "demo";
    process.env.AI_MODE = "mock";
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
        (${tenantA}::uuid, ${`ten_${tenantA.slice(0, 8)}`}, 'Radar Persist A', 'free'),
        (${tenantB}::uuid, ${`ten_${tenantB.slice(0, 8)}`}, 'Radar Persist B', 'free')
    `;
    await sql`
      insert into users (id, public_id, email, email_verified, password_hash, name)
      values
        (
          ${userA}::uuid,
          ${`usr_${userA.slice(0, 8)}`},
          ${`radar-a-${userA.slice(0, 8)}@example.com`},
          true,
          'x',
          'Radar User A'
        ),
        (
          ${userB}::uuid,
          ${`usr_${userB.slice(0, 8)}`},
          ${`radar-b-${userB.slice(0, 8)}@example.com`},
          true,
          'x',
          'Radar User B'
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
      await sql`delete from radar_opportunity_briefs where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`;
      await sql`delete from radar_job_interactions where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`;
      await sql`delete from radar_saved_jobs where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`;
      await sql`delete from radar_hidden_jobs where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`;
      await sql`delete from radar_saved_searches where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`;
      await sql`delete from radar_job_alerts where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`;
      if (seededSightingId) {
        await sql`delete from radar_job_sightings where id = ${seededSightingId}::uuid`;
      }
      if (seededJobId) {
        await sql`delete from radar_canonical_jobs where id = ${seededJobId}::uuid`;
      }
      if (seededSourceId) {
        await sql`delete from radar_job_sources where id = ${seededSourceId}::uuid`;
      }
      if (seededCompanyId) {
        await sql`delete from radar_companies where id = ${seededCompanyId}::uuid`;
      }
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
      requestId: "radar_persist_pg",
      user: { id: userId, publicId: "radar", email: "radar@example.com", name: "Radar" },
      memberships: [{ tenantId, tenantPublicId: "ten", role: "owner" }],
      activeTenantId: tenantId,
      repos: { applications: repos.applications, evidence: repos.evidence },
    };
  }

  async function seedProfile(
    tenantId: string,
    userId: string,
    skills: string[],
    seniority = "senior",
  ) {
    return repos.candidateProfiles.upsert({
      id: newId("cp"),
      publicId: newId("cpp"),
      tenantId,
      userId,
      fullName: "Radar Persist",
      preferredName: null,
      email: "radar@example.com",
      phone: null,
      location: null,
      linkedIn: null,
      github: null,
      portfolio: null,
      headline: null,
      summary: null,
      experienceLevel: seniority,
      yearsExperience: 5,
      targetRoleFamilies: ["Platform"],
      preferredResumeLength: "one-page",
      careerGoal: "AI platform",
      avatarInitials: "RP",
      remoteOk: true,
      preferredLocations: ["Remote"],
      workAuthorization: null,
      requiresSponsorship: null,
      targetCompanies: [],
      targetIndustries: [],
      jobTypes: [],
      workplaceModes: [],
      willingToRelocate: null,
      salaryPreference: null,
      seniority,
      onboardingStep: 3,
      onboardingCompletedAt: new Date().toISOString(),
      modelImprovementOptIn: false,
      sourceResumeFilePublicId: null,
      resumeImportStatus: "confirmed",
      resumeImportExtraction: {
        skills,
        employment: [],
        education: [],
        projects: [],
        certifications: [],
        evidence: [],
        rawText: "",
        parseWarnings: [],
      },
    });
  }

  function buildSeedEntities(): {
    company: Company;
    source: JobSource;
    job: CanonicalJob;
    sighting: JobSighting;
  } {
    const now = new Date().toISOString();
    seededCompanyId = randomUUID();
    seededSourceId = randomUUID();
    seededJobId = randomUUID();
    seededSightingId = randomUUID();

    const company: Company = {
      id: seededCompanyId,
      publicId: `company_${seededCompanyId.slice(0, 8)}`,
      name: "Radar Persist Co",
      normalizedName: "radar persist co",
      aliases: [],
      createdAt: now,
      updatedAt: now,
    };

    const source: JobSource = {
      id: seededSourceId,
      publicId: `src_${seededSourceId.slice(0, 8)}`,
      providerId: `persist-test-${seededSourceId.slice(0, 8)}`,
      displayName: "Persist Test Source",
      accessMethod: "public_api",
      enabled: true,
      policy: {
        sourceId: seededSourceId,
        accessMethod: "public_api",
        termsUrl: "",
        licenseStatus: "public",
        allowedFields: [],
        attributionRequired: false,
        attributionText: "",
        fullDescriptionAllowed: true,
        retentionDays: null,
        refreshLimitPerDay: null,
        requestsPerMinute: 30,
        removalRequired: false,
        commercialUseAllowed: false,
        lastComplianceReview: now,
        enabled: true,
      },
      createdAt: now,
      updatedAt: now,
    };

    const job: CanonicalJob = {
      id: seededJobId,
      publicId: `job_${seededJobId.slice(0, 8)}`,
      companyId: seededCompanyId,
      companyName: company.name,
      title: "Platform Engineer",
      normalizedTitle: "platform engineer",
      description: "Build AI platforms with Python and TypeScript.",
      locations: ["Remote"],
      remotePolicy: "remote",
      techStack: ["Python", "TypeScript", "React", "Go"],
      originalPostedAt: now,
      originalPostedPrecision: "EXACT_TIMESTAMP",
      firstDiscoveredAt: now,
      lastVerifiedAt: now,
      lastVerifiedPrecision: "EXACT_TIMESTAMP",
      repostedAt: null,
      closedAt: null,
      reopenedAt: null,
      status: "open",
      verificationState: "VERIFIED_OPEN",
      classification: "NEW",
      classificationConfidence: 1,
      confidence: 1,
      primarySourceId: seededSourceId,
      repostCount: 0,
      companyDirect: true,
      demoData: false,
      createdAt: now,
      updatedAt: now,
    };

    const sighting: JobSighting = {
      id: seededSightingId,
      publicId: `js_${seededSightingId.slice(0, 8)}`,
      canonicalJobId: seededJobId,
      sourceId: seededSourceId,
      sourceListingId: `listing-${seededJobId.slice(0, 8)}`,
      sourceUrl: "https://example.com/jobs/platform",
      sourceTitle: job.title,
      sourceLocation: "Remote",
      sourcePostedAt: now,
      sourcePostedPrecision: "EXACT_TIMESTAMP",
      sourceUpdatedAt: null,
      firstSeenAt: now,
      lastSeenAt: now,
      lastVerifiedAt: now,
      removedAt: null,
      repostedAt: null,
      validThrough: null,
      contentHash: "persist-test-hash",
      descriptionHash: "persist-test-desc",
      classification: "NEW",
      classificationConfidence: 1,
      demoData: false,
      createdAt: now,
      updatedAt: now,
    };

    return { company, source, job, sighting };
  }

  async function createSeededRadarService(): Promise<{
    catalog: CanonicalJobCatalog;
    store: PostgresRadarStore;
    service: RadarService;
    job: CanonicalJob;
  }> {
    const { getDb } = await import("../../../server/database/client");
    const db = getDb();
    if (!db) throw new Error("postgres db unavailable");

    const { company, source, job, sighting } = buildSeedEntities();
    const store = createPostgresRadarStore(db);
    await store.upsertCompany(company);
    await store.upsertSource(source);
    await store.upsertJob(job);
    await store.upsertSighting(sighting);

    const catalog = new CanonicalJobCatalog();
    catalog.applyHydratedSnapshot({
      companies: [company],
      sources: [source],
      jobs: [job],
      sightings: [sighting],
    });
    const service = new RadarService(catalog, undefined, repos, undefined, store);
    return { catalog, store, service, job };
  }

  async function restartFromPostgres(): Promise<{
    catalog: CanonicalJobCatalog;
    store: PostgresRadarStore;
    service: RadarService;
  }> {
    const { getDb } = await import("../../../server/database/client");
    const db = getDb();
    if (!db) throw new Error("postgres db unavailable");

    const catalog = new CanonicalJobCatalog();
    const store = createPostgresRadarStore(db);
    const hydrated = await store.hydrateCatalog();
    catalog.applyHydratedSnapshot(hydrated);
    const service = new RadarService(catalog, undefined, repos, undefined, store);
    service.index.reindexAll();
    return { catalog, store, service };
  }

  it("survives restart with tenant isolation and brief revision invalidation", async () => {
    await seedProfile(tenantA, userA, ["Python", "TypeScript", "React"]);
    await seedProfile(tenantB, userB, ["Go", "Rust"]);

    const initial = await createSeededRadarService();
    const job = initial.job;

    const ctxA = ctx(userA, tenantA);
    const ctxB = ctx(userB, tenantB);

    await initial.service.save(ctxA, job.publicId);
    await initial.service.hide(ctxA, job.publicId);
    const savedSearch = await initial.service.createSavedSearch(ctxA, {
      name: "Restart proof search",
      query: { keywords: "platform" },
      alertEnabled: true,
    });
    await initial.service.createAlert(ctxA, {
      name: "Restart proof alert",
      query: { keywords: "platform" },
      cadence: "daily",
    });
    await initial.service.recordInteraction(ctxA, job.publicId, "view", { source: "restart-test" });
    const briefBeforeRestart = await initial.service.getOpportunityBrief(ctxA, job.publicId);
    expect(briefBeforeRestart.cached).toBe(false);

    // Drop first instance — simulate process restart.
    void initial;

    const restarted = await restartFromPostgres();

    const savedJobs = await restarted.store.listSavedJobs(tenantA, userA);
    expect(savedJobs.some((s) => s.canonicalJobId === job.id)).toBe(true);

    const hiddenJobs = await restarted.store.listHiddenJobs(tenantA, userA);
    expect(hiddenJobs.some((h) => h.canonicalJobId === job.id)).toBe(true);

    const searches = restarted.service.listSavedSearches(ctxA);
    expect(searches.some((s) => s.id === savedSearch.id)).toBe(true);

    const alerts = restarted.service.listAlerts(ctxA);
    expect(alerts.some((a) => a.name === "Restart proof alert")).toBe(true);

    const interactions = await restarted.store.listInteractions(tenantA, userA, job.id);
    expect(interactions.some((i) => i.interactionType === "view")).toBe(true);

    const briefAfterRestart = await restarted.service.getOpportunityBrief(ctxA, job.publicId);
    expect(briefAfterRestart.cached).toBe(true);
    expect(briefAfterRestart.summary).toBe(briefBeforeRestart.summary);

    // Tenant B must not see tenant A state.
    expect(await restarted.store.getSavedJob(tenantB, userB, job.id)).toBeNull();
    expect(await restarted.store.getHiddenJob(tenantB, userB, job.id)).toBeNull();
    expect(restarted.service.listSavedSearches(ctxB)).toHaveLength(0);
    expect(restarted.service.listAlerts(ctxB)).toHaveLength(0);
    expect(await restarted.store.getBrief(tenantB, userB, job.id)).toBeNull();
    expect(await restarted.store.listInteractions(tenantB, userB, job.id)).toHaveLength(0);

    const briefForB = await restarted.service.getOpportunityBrief(ctxB, job.publicId);
    expect(briefForB.cached).toBe(false);

    // Profile revision change must invalidate cached brief for user A.
    const profileA = await repos.candidateProfiles.getByUser(tenantA, userA);
    expect(profileA).toBeTruthy();
    await repos.candidateProfiles.upsert({
      ...profileA!,
      resumeImportExtraction: {
        skills: ["COBOL", "Fortran"],
        employment: [],
        education: [],
        projects: [],
        certifications: [],
        evidence: [],
        rawText: "",
        parseWarnings: [],
      },
    });

    const briefAfterProfileChange = await restarted.service.getOpportunityBrief(ctxA, job.publicId);
    expect(briefAfterProfileChange.cached).toBe(false);
  }, 120_000);
});
