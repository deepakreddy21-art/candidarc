/** @vitest-environment node */
/**
 * PostgreSQL commitReservedWithCost integration tests.
 * Must run with DATABASE_URL after migrations. Skips are failures in CI integration.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { resetEnvCache } from "../../../server/config/env";
import { newId } from "../../../server/database/repositories";

const databaseUrl = process.env.DATABASE_URL;
const requirePostgres = process.env.CANDIDARC_REQUIRE_USAGE_POSTGRES === "1" || process.env.CANDIDARC_REQUIRE_INFRA === "1";

describe("commitReservedWithCost (postgres integration)", () => {
  if (!databaseUrl) {
    it("requires DATABASE_URL when infra is required", () => {
      if (requirePostgres) {
        throw new Error("DATABASE_URL is required for usage postgres tests");
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

  beforeAll(async () => {
    process.env.CANDIDARC_DATA_MODE = "postgres";
    process.env.APP_MODE = "demo";
    resetEnvCache();
    const { resetDbCache } = await import("../../../server/database/client");
    resetDbCache();
    const postgres = (await import("postgres")).default;
    sql = postgres(databaseUrl!, { max: 2 });
    const { PostgresRepositories } = await import("../../../server/database/postgres-repos");
    repos = new PostgresRepositories();

    tenantA = randomUUID();
    tenantB = randomUUID();
    userA = randomUUID();
    userB = randomUUID();

    await sql`
      insert into tenants (id, public_id, name, plan)
      values
        (${tenantA}::uuid, ${"ten_" + tenantA.slice(0, 8)}, 'Usage Tenant A', 'free'),
        (${tenantB}::uuid, ${"ten_" + tenantB.slice(0, 8)}, 'Usage Tenant B', 'free')
      on conflict (id) do nothing
    `;
    await sql`
      insert into users (id, public_id, email, email_verified, password_hash, name)
      values
        (${userA}::uuid, ${"usr_" + userA.slice(0, 8)}, ${`a-${userA.slice(0, 8)}@example.com`}, true, 'x', 'User A'),
        (${userB}::uuid, ${"usr_" + userB.slice(0, 8)}, ${`b-${userB.slice(0, 8)}@example.com`}, true, 'x', 'User B')
      on conflict (id) do nothing
    `;
  }, 60_000);

  afterAll(async () => {
    try {
      await sql`delete from usage_ledger where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`;
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

  it("commits known provider cost atomically", async () => {
    const key = `${tenantA}:usage:known:${newId("k")}`;
    await repos.usage.append({
      tenantId: tenantA,
      userId: userA,
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: key,
      status: "reserved",
      metadata: {},
    });
    const result = await repos.usage.commitReservedWithCost({
      tenantId: tenantA,
      idempotencyKey: key,
      costCents: 42,
      userId: userA,
    });
    expect(result.reservation.status).toBe("committed");
    expect(Number(result.costRow?.costCents)).toBe(42);
    expect(result.costRow?.metadata.costStatus).toBe("known");
  });

  it("commits known zero cost distinctly from unknown", async () => {
    const key = `${tenantA}:usage:zero:${newId("k")}`;
    await repos.usage.append({
      tenantId: tenantA,
      userId: userA,
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: key,
      status: "reserved",
      metadata: {},
    });
    const knownZero = await repos.usage.commitReservedWithCost({
      tenantId: tenantA,
      idempotencyKey: key,
      costCents: 0,
      userId: userA,
    });
    expect(knownZero.costRow?.idempotencyKey).toBe(`${key}:cost`);
    expect(knownZero.costRow?.metadata.billable).toBe(true);

    const key2 = `${tenantA}:usage:unknown:${newId("k")}`;
    await repos.usage.append({
      tenantId: tenantA,
      userId: userA,
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: key2,
      status: "reserved",
      metadata: {},
    });
    const unknown = await repos.usage.commitReservedWithCost({
      tenantId: tenantA,
      idempotencyKey: key2,
      costCents: null,
      userId: userA,
    });
    expect(unknown.costRow?.idempotencyKey).toBe(`${key2}:cost-unknown`);
    expect(unknown.costRow?.metadata.billable).toBe(false);
  });

  it("idempotent retry and concurrent commits create one cost row", async () => {
    const key = `${tenantA}:usage:concurrent:${newId("k")}`;
    await repos.usage.append({
      tenantId: tenantA,
      userId: userA,
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: key,
      status: "reserved",
      metadata: {},
    });
    const results = await Promise.all([
      repos.usage.commitReservedWithCost({ tenantId: tenantA, idempotencyKey: key, costCents: 7, userId: userA }),
      repos.usage.commitReservedWithCost({ tenantId: tenantA, idempotencyKey: key, costCents: 7, userId: userA }),
      repos.usage.commitReservedWithCost({ tenantId: tenantA, idempotencyKey: key, costCents: 7, userId: userA }),
    ]);
    for (const row of results) {
      expect(row.reservation.status).toBe("committed");
      expect(Number(row.costRow?.costCents)).toBe(7);
    }
    const [{ count }] = await sql<{ count: string }[]>`
      select count(*)::text as count from usage_ledger
      where tenant_id = ${tenantA}::uuid and idempotency_key = ${`${key}:cost`}
    `;
    expect(count).toBe("1");
  });

  it("cross-tenant commit fails and released reservation cannot commit", async () => {
    const key = `${tenantA}:usage:xtenant:${newId("k")}`;
    await repos.usage.append({
      tenantId: tenantA,
      userId: userA,
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: key,
      status: "reserved",
      metadata: {},
    });
    await expect(
      repos.usage.commitReservedWithCost({ tenantId: tenantB, idempotencyKey: key, costCents: 1, userId: userB }),
    ).rejects.toMatchObject({ code: "USAGE_NOT_FOUND" });

    const key2 = `${tenantA}:usage:released:${newId("k")}`;
    await repos.usage.append({
      tenantId: tenantA,
      userId: userA,
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: key2,
      status: "reserved",
      metadata: {},
    });
    await repos.usage.updateStatus(tenantA, key2, "released");
    await expect(
      repos.usage.commitReservedWithCost({ tenantId: tenantA, idempotencyKey: key2, costCents: 1, userId: userA }),
    ).rejects.toMatchObject({ code: "USAGE_ALREADY_RELEASED" });
  });

  it("rolls back reservation when cost insert fails inside the transaction", async () => {
    const key = `${tenantA}:usage:rollback:${newId("k")}`;
    await repos.usage.append({
      tenantId: tenantA,
      userId: userA,
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: key,
      status: "reserved",
      metadata: {},
    });

    await sql.unsafe(`
      create or replace function candidarc_test_fail_cost_insert() returns trigger as $$
      begin
        if NEW.kind = 'provider_cost' and NEW.idempotency_key like '%:cost' then
          raise exception 'candidarc_test_forced_cost_failure';
        end if;
        return NEW;
      end;
      $$ language plpgsql;
      drop trigger if exists candidarc_test_fail_cost_insert_trg on usage_ledger;
      create trigger candidarc_test_fail_cost_insert_trg
        before insert on usage_ledger
        for each row execute function candidarc_test_fail_cost_insert();
    `);

    try {
      await expect(
        repos.usage.commitReservedWithCost({
          tenantId: tenantA,
          idempotencyKey: key,
          costCents: 99,
          userId: userA,
        }),
      ).rejects.toBeTruthy();

      const [reservation] = await sql<{ status: string }[]>`
        select status from usage_ledger
        where tenant_id = ${tenantA}::uuid and idempotency_key = ${key}
      `;
      expect(reservation?.status).toBe("reserved");

      const costRows = await sql`
        select 1 from usage_ledger
        where tenant_id = ${tenantA}::uuid and idempotency_key = ${`${key}:cost`}
      `;
      expect(costRows).toHaveLength(0);
    } finally {
      await sql.unsafe(`
        drop trigger if exists candidarc_test_fail_cost_insert_trg on usage_ledger;
        drop function if exists candidarc_test_fail_cost_insert();
      `);
    }
  });

  it("provider-operation keys distinguish generate/repair/final-qa and stay tenant-isolated", async () => {
    const wf = newId("wf");
    const generateV4 = `${tenantA}:usage:${wf}:generate:v4:resume_generation`;
    const repair = `${tenantA}:usage:${wf}:repair:v4-to-v4r1:attempt-1:deadbeef:resume_generation`;
    const qaV4 = `${tenantA}:usage:${wf}:final-qa:v4:final_review`;
    const qaV5 = `${tenantA}:usage:${wf}:final-qa:v5:final_review`;

    for (const [key, kind, cost] of [
      [generateV4, "resume_generation", 11],
      [repair, "resume_generation", 12],
      [qaV4, "final_review", 3],
      [qaV5, "final_review", 4],
    ] as const) {
      await repos.usage.append({
        tenantId: tenantA,
        userId: userA,
        kind,
        units: "1",
        costCents: "0",
        idempotencyKey: key,
        status: "reserved",
        metadata: {},
      });
      await repos.usage.commitReservedWithCost({
        tenantId: tenantA,
        idempotencyKey: key,
        costCents: cost,
        userId: userA,
      });
    }

    // Concurrent replay of all four — still exactly one cost each
    await Promise.all(
      [generateV4, repair, qaV4, qaV5].flatMap((key) => [
        repos.usage.commitReservedWithCost({ tenantId: tenantA, idempotencyKey: key, costCents: 1, userId: userA }),
        repos.usage.commitReservedWithCost({ tenantId: tenantA, idempotencyKey: key, costCents: 1, userId: userA }),
      ]),
    );

    const [{ count }] = await sql<{ count: string }[]>`
      select count(*)::text as count from usage_ledger
      where tenant_id = ${tenantA}::uuid
        and kind = 'provider_cost'
        and idempotency_key in (
          ${`${generateV4}:cost`}, ${`${repair}:cost`}, ${`${qaV4}:cost`}, ${`${qaV5}:cost`}
        )
    `;
    expect(count).toBe("4");

    // Cross-tenant reuse of the same logical operation key cannot mutate tenant A
    await expect(
      repos.usage.commitReservedWithCost({
        tenantId: tenantB,
        idempotencyKey: generateV4,
        costCents: 99,
        userId: userB,
      }),
    ).rejects.toMatchObject({ code: "USAGE_NOT_FOUND" });
  });
});
