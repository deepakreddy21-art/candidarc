/** @vitest-environment node */
/**
 * PostgreSQL Final-QA repair versioning under concurrency.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { resetEnvCache } from "../../../server/config/env";
import { newId, nowIso } from "../../../server/database/repositories";

const databaseUrl = process.env.DATABASE_URL;
const requirePostgres =
  process.env.CANDIDARC_REQUIRE_USAGE_POSTGRES === "1" || process.env.CANDIDARC_REQUIRE_INFRA === "1";

describe("Final-QA repair versioning (postgres)", () => {
  if (!databaseUrl) {
    it("requires DATABASE_URL when infra is required", () => {
      if (requirePostgres) {
        throw new Error("DATABASE_URL is required for Final-QA repair postgres tests");
      }
      expect(process.env.VITEST).toBeTruthy();
    });
    return;
  }

  let repos: InstanceType<typeof import("../../../server/database/postgres-repos").PostgresRepositories>;
  let sql: import("postgres").Sql;
  let tenantId: string;
  let userId: string;
  let resumeId: string;
  let resumePublicId: string;

  beforeAll(async () => {
    process.env.CANDIDARC_DATA_MODE = "postgres";
    process.env.APP_MODE = "demo";
    resetEnvCache();
    const { resetDbCache } = await import("../../../server/database/client");
    resetDbCache();
    const postgres = (await import("postgres")).default;
    sql = postgres(databaseUrl!, { max: 4 });
    const { PostgresRepositories } = await import("../../../server/database/postgres-repos");
    repos = new PostgresRepositories();

    tenantId = randomUUID();
    userId = randomUUID();
    const applicationId = randomUUID();
    resumeId = randomUUID();
    resumePublicId = `resp_${tenantId.slice(0, 8)}`;

    await sql`
      insert into tenants (id, public_id, name, plan)
      values (${tenantId}::uuid, ${"ten_" + tenantId.slice(0, 8)}, 'Repair PG', 'free')
      on conflict (id) do nothing
    `;
    await sql`
      insert into users (id, public_id, email, email_verified, password_hash, name)
      values (${userId}::uuid, ${"usr_" + userId.slice(0, 8)}, ${`r-${userId.slice(0, 8)}@example.com`}, true, 'x', 'Repair')
      on conflict (id) do nothing
    `;

    const app = await repos.applications.create({
      id: applicationId,
      publicId: `app_${applicationId.slice(0, 8)}`,
      tenantId,
      ownerUserId: userId,
      company: "Acme",
      companyMark: "AC",
      role: "Engineer",
      location: "Remote",
      employmentType: "Full-time",
      stage: "FINAL_QA_RUNNING",
      workflowStage: "FINAL_QA_RUNNING",
      status: "final-qa",
      nextAction: "Final QA",
      researchConfidence: 50,
      evidenceCoverage: 90,
      resumeScore: 70,
      atsAlignment: 70,
      interviewStatus: "not-started",
      archived: false,
      roleFamily: "General",
      metadata: {},
    });

    const resume = await repos.resumes.createResume({
      id: resumeId,
      publicId: resumePublicId,
      tenantId,
      applicationId: app.id,
      applicationPublicId: app.publicId,
      title: "Repair resume",
      templateId: "alumni-clean",
      length: "one-page",
      currentVersionPublicId: null,
    });
    resumeId = resume.id;

    const v4Id = randomUUID();
    await repos.resumes.appendVersion({
      id: v4Id,
      publicId: `rvv4_${v4Id.slice(0, 8)}`,
      tenantId,
      resumeId,
      versionNumber: 4,
      versionLabel: "V4",
      score: 74,
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
      notes: "failed v4",
      triggeredBy: "EM Audit 2",
      sections: [],
      idempotencyKey: `resume:app:v4:seed:${tenantId}`,
      promptVersion: "python@v1",
      createdAt: nowIso(),
    });
  }, 60_000);

  afterAll(async () => {
    try {
      await sql`delete from resume_sections where tenant_id = ${tenantId}::uuid`;
      await sql`delete from resume_versions where tenant_id = ${tenantId}::uuid`;
      await sql`delete from resumes where tenant_id = ${tenantId}::uuid`;
      await sql`delete from applications where tenant_id = ${tenantId}::uuid`;
      await sql`delete from users where id = ${userId}::uuid`;
      await sql`delete from tenants where id = ${tenantId}::uuid`;
    } catch {
      /* ignore */
    }
    await sql.end({ timeout: 5 });
    const { closeDb, resetDbCache } = await import("../../../server/database/client");
    await closeDb().catch(() => undefined);
    resetDbCache();
    resetEnvCache();
  });

  it("allocates unique V4R1 under concurrent attempts and reuses by idempotency", async () => {
    const idem = `resume:app:repair:from4:a1:hash:${tenantId}`;
    const results = await Promise.all(
      Array.from({ length: 8 }, async (_, index) => {
        const allocated = await repos.resumes.allocateNextVersionNumber!(tenantId, resumePublicId);
        try {
          return await repos.resumes.appendVersion({
            id: randomUUID(),
            publicId: `rv_repair_${index}_${newId("x")}`,
            tenantId,
            resumeId,
            versionNumber: allocated,
            versionLabel: "V4R1",
            score: 80,
            scoreBreakdown: {
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
            },
            notes: "repair",
            triggeredBy: "final-qa-repair",
            sections: [],
            idempotencyKey: idem,
            promptVersion: "python@v1",
          });
        } catch {
          return repos.resumes.findVersionByIdempotency(tenantId, idem);
        }
      }),
    );

    const versions = results.filter(Boolean);
    expect(versions.length).toBe(8);
    const publicIds = new Set(versions.map((v) => v!.publicId));
    expect(publicIds.size).toBe(1);
    expect(versions[0]!.versionNumber).toBeGreaterThan(4);
    expect(versions[0]!.versionLabel).toBe("V4R1");

    const [{ count }] = await sql<{ count: string }[]>`
      select count(*)::text as count from resume_versions
      where tenant_id = ${tenantId}::uuid and resume_id = ${resumeId}::uuid and version_label = 'V4R1'
    `;
    expect(count).toBe("1");

    const [{ v4_notes }] = await sql<{ v4_notes: string }[]>`
      select notes as v4_notes from resume_versions
      where tenant_id = ${tenantId}::uuid and resume_id = ${resumeId}::uuid and version_number = 4
    `;
    expect(v4_notes).toBe("failed v4");
  });
});
