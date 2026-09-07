/** @vitest-environment node */
/**
 * Upgrade test: migration-0010-style unprefixed keys → 0011 normalization.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

const databaseUrl = process.env.DATABASE_URL;
const requirePostgres =
  process.env.CANDIDARC_REQUIRE_USAGE_POSTGRES === "1" || process.env.CANDIDARC_REQUIRE_INFRA === "1";

describe("migration 0011 upgrade from 0010-style keys", () => {
  if (!databaseUrl) {
    it("requires DATABASE_URL when infra is required", () => {
      if (requirePostgres) {
        throw new Error("DATABASE_URL is required for migration 0011 upgrade test");
      }
      expect(process.env.VITEST).toBeTruthy();
    });
    return;
  }

  let sql: import("postgres").Sql;
  let tenantA: string;
  let tenantB: string;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    const postgres = (await import("postgres")).default;
    sql = postgres(databaseUrl!, { max: 1 });
    tenantA = randomUUID();
    tenantB = randomUUID();
    userA = randomUUID();
    userB = randomUUID();
    await sql`
      insert into tenants (id, public_id, name, plan)
      values
        (${tenantA}::uuid, ${"ten_m_" + tenantA.slice(0, 8)}, 'Mig A', 'free'),
        (${tenantB}::uuid, ${"ten_m_" + tenantB.slice(0, 8)}, 'Mig B', 'free')
      on conflict (id) do nothing
    `;
    await sql`
      insert into users (id, public_id, email, email_verified, password_hash, name)
      values
        (${userA}::uuid, ${"usr_m_" + userA.slice(0, 8)}, ${`ma-${userA.slice(0, 8)}@example.com`}, true, 'x', 'A'),
        (${userB}::uuid, ${"usr_m_" + userB.slice(0, 8)}, ${`mb-${userB.slice(0, 8)}@example.com`}, true, 'x', 'B')
      on conflict (id) do nothing
    `;
  }, 60_000);

  afterAll(async () => {
    try {
      await sql`delete from usage_ledger where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`;
      await sql`delete from users where id in (${userA}::uuid, ${userB}::uuid)`;
      await sql`delete from tenants where id in (${tenantA}::uuid, ${tenantB}::uuid)`;
    } catch {
      /* ignore */
    }
    await sql.end({ timeout: 5 });
  });

  it("normalizes identical unprefixed keys for two tenants then supports unique global index", async () => {
    // Simulate 0010 world: drop global unique if present so unprefixed duplicates can exist.
    await sql.unsafe(`drop index if exists usage_ledger_idempotency_key_global_uidx`);

    const logicalKey = `shared-logical-key-${randomUUID().slice(0, 8)}`;
    await sql`
      insert into usage_ledger (public_id, tenant_id, user_id, kind, units, cost_cents, idempotency_key, status, metadata)
      values
        (${"ulp_" + randomUUID().slice(0, 8)}, ${tenantA}::uuid, ${userA}::uuid, 'research', '1', '0', ${logicalKey}, 'reserved', '{}'::jsonb),
        (${"ulp_" + randomUUID().slice(0, 8)}, ${tenantB}::uuid, ${userB}::uuid, 'research', '1', '0', ${logicalKey}, 'reserved', '{}'::jsonb)
    `;

    const migrationSql = readFileSync(
      resolve(process.cwd(), "server/database/migrations/0011_usage_ledger_idempotency_expand_contract.sql"),
      "utf8",
    );
    // Re-run migration body (idempotent) against populated unprefixed rows.
    await sql.unsafe(migrationSql);

    const rows = await sql<{ tenant_id: string; idempotency_key: string }[]>`
      select tenant_id::text, idempotency_key
      from usage_ledger
      where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)
        and idempotency_key like ${"%" + logicalKey}
      order by tenant_id
    `;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.idempotency_key).toBe(`${rows[0]!.tenant_id}:${logicalKey}`);
    expect(rows[1]!.idempotency_key).toBe(`${rows[1]!.tenant_id}:${logicalKey}`);
    expect(rows[0]!.idempotency_key).not.toBe(rows[1]!.idempotency_key);

    const [{ global_idx }] = await sql<{ global_idx: string | null }[]>`
      select to_regclass('public.usage_ledger_idempotency_key_global_uidx')::text as global_idx
    `;
    expect(global_idx).toContain("usage_ledger_idempotency_key_global_uidx");
  });
});
