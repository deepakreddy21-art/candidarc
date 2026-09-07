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

  it("allocates unique V4R1 under concurrent attempts and reuses by operationKey", async () => {
    const operationKey = `app:repair:v4-to-v4r1:attempt-1:hash:${tenantId}`;
    const results = await Promise.all(
      Array.from({ length: 8 }, async (_, index) =>
        repos.resumes.appendAllocatedVersion!({
          tenantId,
          resumePublicId,
          operationKey,
          setAsCurrent: index % 2 === 0,
          version: {
            id: randomUUID(),
            publicId: `rv_repair_${index}_${newId("x")}`,
            tenantId,
            resumeId,
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
            // Mix same and different idempotency keys for the same repair intent.
            idempotencyKey: index < 4 ? `resume:app:repair:from4:a1:hash:${tenantId}` : `alt:${index}:${tenantId}`,
            operationKey,
            promptVersion: "python@v1",
          },
        }),
      ),
    );

    const versions = results.filter(Boolean);
    expect(versions.length).toBe(8);
    const publicIds = new Set(versions.map((v) => v.publicId));
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

    // Distinct legitimate operations still get unique sequential versions.
    const other = await repos.resumes.appendAllocatedVersion!({
      tenantId,
      resumePublicId,
      operationKey: `${operationKey}:other-op`,
      setAsCurrent: false,
      version: {
        id: randomUUID(),
        publicId: `rv_other_${newId("x")}`,
        tenantId,
        resumeId,
        versionLabel: "V5",
        score: 81,
        scoreBreakdown: versions[0]!.scoreBreakdown,
        notes: "other",
        triggeredBy: "generate",
        sections: [],
        idempotencyKey: `other:${tenantId}`,
        operationKey: `${operationKey}:other-op`,
        promptVersion: "python@v1",
      },
    });
    expect(other.versionNumber).toBe(versions[0]!.versionNumber + 1);
  });

  it("isolates identical external keys across tenants", async () => {
    const tenantB = randomUUID();
    const userB = randomUUID();
    const appB = randomUUID();
    const resumeB = randomUUID();
    const resumePublicB = `resp_${tenantB.slice(0, 8)}`;
    await sql`
      insert into tenants (id, public_id, name, plan)
      values (${tenantB}::uuid, ${`tenp_${tenantB.slice(0, 8)}`}, 'Tenant B', 'free')
    `;
    await sql`
      insert into users (id, public_id, email, name, password_hash, email_verified)
      values (${userB}::uuid, ${`usr_${userB.slice(0, 8)}`}, ${`b-${userB.slice(0, 8)}@example.com`}, 'B', 'x', true)
    `;
    await sql`
      insert into applications (
        id, public_id, tenant_id, owner_user_id, company, company_mark, role, location,
        employment_type, stage, workflow_stage, status, next_action, research_confidence,
        evidence_coverage, resume_score, ats_alignment, interview_status, archived, role_family, metadata
      ) values (
        ${appB}::uuid, ${`app_${tenantB.slice(0, 8)}`}, ${tenantB}::uuid, ${userB}::uuid,
        'Acme', 'AC', 'Engineer', 'Remote', 'Full-time', 'FINAL_QA_RUNNING', 'FINAL_QA_RUNNING',
        'final-qa', 'QA', 0.5, 0.9, 74, 70, 'not-started', false, 'General', '{}'::jsonb
      )
    `;
    await sql`
      insert into resumes (id, public_id, tenant_id, application_id, title, template_id, length)
      values (${resumeB}::uuid, ${resumePublicB}, ${tenantB}::uuid, ${appB}::uuid, 'Resume B', 'alumni-clean', 'one-page')
    `;

    const sharedExternal = "shared-external-operation-key";
    const a = await repos.resumes.appendAllocatedVersion!({
      tenantId,
      resumePublicId,
      operationKey: sharedExternal,
      version: {
        id: randomUUID(),
        publicId: `rv_a_${newId("x")}`,
        tenantId,
        resumeId,
        versionLabel: "Vx",
        score: 70,
        scoreBreakdown: {},
        notes: "a",
        triggeredBy: "t",
        sections: [],
        idempotencyKey: sharedExternal,
        operationKey: sharedExternal,
      },
    });
    const b = await repos.resumes.appendAllocatedVersion!({
      tenantId: tenantB,
      resumePublicId: resumePublicB,
      operationKey: sharedExternal,
      version: {
        id: randomUUID(),
        publicId: `rv_b_${newId("x")}`,
        tenantId: tenantB,
        resumeId: resumeB,
        versionLabel: "Vx",
        score: 70,
        scoreBreakdown: {},
        notes: "b",
        triggeredBy: "t",
        sections: [],
        idempotencyKey: sharedExternal,
        operationKey: sharedExternal,
      },
    });
    expect(a.publicId).not.toBe(b.publicId);
    expect(a.tenantId).toBe(tenantId);
    expect(b.tenantId).toBe(tenantB);

    await sql`delete from resume_versions where tenant_id = ${tenantB}::uuid`;
    await sql`delete from resumes where tenant_id = ${tenantB}::uuid`;
    await sql`delete from applications where tenant_id = ${tenantB}::uuid`;
    await sql`delete from users where id = ${userB}::uuid`;
    await sql`delete from tenants where id = ${tenantB}::uuid`;
  });
});
