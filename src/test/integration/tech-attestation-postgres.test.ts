/** @vitest-environment node */
import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetEnvCache } from "../../../server/config/env";

const databaseUrl = process.env.DATABASE_URL;
const requirePostgres =
  process.env.CANDIDARC_REQUIRE_USAGE_POSTGRES === "1" ||
  process.env.CANDIDARC_REQUIRE_INFRA === "1";

describe("technology attestation lifecycle (postgres integration)", () => {
  if (!databaseUrl) {
    it("requires DATABASE_URL when postgres integration is required", () => {
      if (requirePostgres) throw new Error("DATABASE_URL is required for technology attestation tests");
      expect(process.env.VITEST).toBeTruthy();
    });
    return;
  }

  let repos: InstanceType<typeof import("../../../server/database/postgres-repos").PostgresRepositories>;
  let sql: import("postgres").Sql;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const ownerA = randomUUID();
  const peerA = randomUUID();
  const ownerB = randomUUID();
  const appA1 = randomUUID();
  const appA2 = randomUUID();
  const appB = randomUUID();
  const appA1Public = `app_${appA1.slice(0, 8)}`;
  const appA2Public = `app_${appA2.slice(0, 8)}`;
  const appBPublic = `app_${appB.slice(0, 8)}`;

  beforeAll(async () => {
    process.env.CANDIDARC_DATA_MODE = "postgres";
    process.env.APP_MODE = "demo";
    resetEnvCache();
    const { resetDbCache } = await import("../../../server/database/client");
    resetDbCache();
    const postgres = (await import("postgres")).default;
    sql = postgres(databaseUrl!, { max: 6 });
    const { PostgresRepositories } = await import("../../../server/database/postgres-repos");
    repos = new PostgresRepositories();

    await sql`
      insert into tenants (id, public_id, name, plan) values
        (${tenantA}::uuid, ${`ten_${tenantA.slice(0, 8)}`}, 'Tech Tenant A', 'free'),
        (${tenantB}::uuid, ${`ten_${tenantB.slice(0, 8)}`}, 'Tech Tenant B', 'free')
    `;
    await sql`
      insert into users (id, public_id, email, email_verified, password_hash, name) values
        (${ownerA}::uuid, ${`usr_${ownerA.slice(0, 8)}`}, ${`${ownerA}@example.com`}, true, 'x', 'Owner A'),
        (${peerA}::uuid, ${`usr_${peerA.slice(0, 8)}`}, ${`${peerA}@example.com`}, true, 'x', 'Peer A'),
        (${ownerB}::uuid, ${`usr_${ownerB.slice(0, 8)}`}, ${`${ownerB}@example.com`}, true, 'x', 'Owner B')
    `;
    await sql`
      insert into applications
        (id, public_id, tenant_id, company, role, status, stage, workflow_stage, owner_user_id)
      values
        (${appA1}::uuid, ${appA1Public}, ${tenantA}::uuid, 'Acme', 'Engineer', 'draft', 'APPLICATION_CREATED', 'APPLICATION_CREATED', ${ownerA}::uuid),
        (${appA2}::uuid, ${appA2Public}, ${tenantA}::uuid, 'Beta', 'Engineer', 'draft', 'APPLICATION_CREATED', 'APPLICATION_CREATED', ${ownerA}::uuid),
        (${appB}::uuid, ${appBPublic}, ${tenantB}::uuid, 'Other', 'Engineer', 'draft', 'APPLICATION_CREATED', 'APPLICATION_CREATED', ${ownerB}::uuid)
    `;
  }, 60_000);

  afterAll(async () => {
    try {
      await sql`delete from evidence_application_matches where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`;
      await sql`delete from evidence_items where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`;
      await sql`delete from applications where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`;
      await sql`delete from users where id in (${ownerA}::uuid, ${peerA}::uuid, ${ownerB}::uuid)`;
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

  function attestation(input: {
    tenantId: string;
    ownerUserId: string;
    applicationId: string;
    applicationPublicId: string;
    evidence: string;
  }) {
    const id = randomUUID();
    return {
      id,
      publicId: randomUUID(),
      tenantId: input.tenantId,
      ownerUserId: input.ownerUserId,
      candidateProfileId: null,
      attestationApplicationId: input.applicationId,
      normalizedTechnology: "kubernetes",
      title: "Kubernetes experience (self-attested)",
      organization: "Self-attested",
      situation: input.evidence,
      task: "Confirm Kubernetes experience",
      actions: [input.evidence],
      result: "Candidate attested during technology confirmation",
      technologies: ["Kubernetes"],
      confidence: "medium",
      verificationStatus: "user_attested",
      privacyLevel: "share-safe",
      excludedFromApplicationIds: [],
      matchedApplicationIds: [input.applicationPublicId],
      payload: {
        source: "tech_confirmation",
        techConfirmationKey: `tech-attest:${input.applicationPublicId}:kubernetes`,
      },
      sourceType: "user_confirmation",
      evidenceStatus: "active",
      candidateConfirmationStatus: "confirmed",
    };
  }

  it("serializes concurrent answers and scopes evidence by tenant, owner, and application", async () => {
    const writes = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        repos.evidence.upsertTechAttestation(attestation({
          tenantId: tenantA,
          ownerUserId: ownerA,
          applicationId: appA1,
          applicationPublicId: appA1Public,
          evidence: `Concurrent answer ${index}`,
        })),
      ),
    );
    expect(new Set(writes.map((item) => item.id)).size).toBe(1);

    await repos.evidence.upsertTechAttestation(attestation({
      tenantId: tenantA,
      ownerUserId: peerA,
      applicationId: appA1,
      applicationPublicId: appA1Public,
      evidence: "Peer answer",
    }));
    await repos.evidence.upsertTechAttestation(attestation({
      tenantId: tenantA,
      ownerUserId: ownerA,
      applicationId: appA2,
      applicationPublicId: appA2Public,
      evidence: "Other application answer",
    }));
    await repos.evidence.upsertTechAttestation(attestation({
      tenantId: tenantB,
      ownerUserId: ownerB,
      applicationId: appB,
      applicationPublicId: appBPublic,
      evidence: "Other tenant answer",
    }));

    const appA1Evidence = await repos.evidence.list(tenantA, {
      ownerUserId: ownerA,
      applicationPublicId: appA1Public,
    });
    expect(appA1Evidence).toHaveLength(1);
    expect(appA1Evidence[0]).toMatchObject({
      tenantId: tenantA,
      ownerUserId: ownerA,
      attestationApplicationId: appA1,
    });
    expect(await repos.evidence.list(tenantB, {
      ownerUserId: ownerA,
      applicationPublicId: appA1Public,
    })).toHaveLength(0);
    expect(await repos.evidence.list(tenantA, {
      ownerUserId: ownerA,
      applicationPublicId: appA2Public,
    })).toHaveLength(1);
  });

  it("excludes revoked attestations from pipeline evidence lists and reactivates the same row", async () => {
    const before = (await repos.evidence.list(tenantA, {
      ownerUserId: ownerA,
      applicationPublicId: appA1Public,
    }))[0]!;
    await repos.evidence.revokeTechAttestation(tenantA, ownerA, appA1, "kubernetes");
    expect(await repos.evidence.list(tenantA, {
      ownerUserId: ownerA,
      applicationPublicId: appA1Public,
    })).toHaveLength(0);

    const reactivated = await repos.evidence.upsertTechAttestation(attestation({
      tenantId: tenantA,
      ownerUserId: ownerA,
      applicationId: appA1,
      applicationPublicId: appA1Public,
      evidence: "Latest supporting information",
    }));
    expect(reactivated).toMatchObject({
      id: before.id,
      evidenceStatus: "active",
      situation: "Latest supporting information",
    });

    const [{ activeCount }] = await sql<{ activeCount: string }[]>`
      select count(*)::text as "activeCount"
      from evidence_items
      where tenant_id = ${tenantA}::uuid
        and owner_user_id = ${ownerA}::uuid
        and attestation_application_id = ${appA1}::uuid
        and normalized_technology = 'kubernetes'
        and evidence_status = 'active'
        and deleted_at is null
    `;
    expect(activeCount).toBe("1");
  });
});
