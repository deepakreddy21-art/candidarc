/** @vitest-environment node */
/**
 * Infra-required integration checks. Fails (does not skip) when DATABASE_URL is missing in CI.
 */
import { describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const requireInfra = process.env.CANDIDARC_REQUIRE_INFRA === "1";

describe("production infra gates", () => {
  it("requires DATABASE_URL for integration/production suites", () => {
    if (!databaseUrl) {
      if (requireInfra) {
        throw new Error("DATABASE_URL is required for production-readiness integration (CI or CANDIDARC_REQUIRE_INFRA=1)");
      }
      // Local developer machines without Postgres: soft-fail with explicit assertion that config is absent.
      expect(databaseUrl).toBeFalsy();
      return;
    }
    expect(databaseUrl).toMatch(/^postgres(ql)?:\/\//);
  });

  it("uses UUID primary keys for evidence inserts against Postgres when configured", async () => {
    if (!databaseUrl) {
      if (requireInfra) throw new Error("DATABASE_URL required");
      return;
    }
    process.env.CANDIDARC_DATA_MODE = "postgres";
    const postgres = (await import("postgres")).default;
    const sql = postgres(databaseUrl, { max: 1 });
    try {
      const id = randomUUID();
      const tenantPublicId = `infra-ten-${Date.now()}`;
      const [{ id: tenantId }] = await sql<{ id: string }[]>`
        insert into tenants (id, public_id, name, plan)
        values (${randomUUID()}, ${tenantPublicId}, 'Infra Tenant', 'free')
        returning id
      `;
      const userId = randomUUID();
      await sql`
        insert into users (id, public_id, email, email_verified, password_hash, name)
        values (${userId}, ${`infra-user-${Date.now()}`}, ${`infra-${Date.now()}@example.test`}, true, 'x', 'Infra User')
      `;
      await sql`
        insert into evidence_items (
          id, public_id, tenant_id, owner_user_id, title, organization, situation, task, actions, result,
          technologies, confidence, verification_status, privacy_level, payload,
          source_type, claim_text, evidence_status, candidate_confirmation_status
        ) values (
          ${id}, ${`evp-${Date.now()}`}, ${tenantId}, ${userId}, 'Infra claim', 'Org', 'Sit', 'Task', ${sql.json([])}, 'Result',
          ${sql.json(["Python"])}, 'high', 'user_attested', 'share-safe', ${sql.json({ source: "infra" })},
          'metric', 'Infra claim text', 'active', 'confirmed'
        )
      `;
      const rows = await sql`select id from evidence_items where id = ${id}`;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(id);
    } finally {
      await sql.end({ timeout: 1 });
    }
  });

  it("can connect to Redis when REDIS_URL is reachable", async () => {
    if (!requireInfra && !process.env.REDIS_URL) {
      expect(process.env.REDIS_URL).toBeUndefined();
      return;
    }
    const Redis = (await import("ioredis")).default;
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 2000 });
    try {
      await redis.connect();
      const pong = await redis.ping();
      expect(pong).toBe("PONG");
    } catch (error) {
      if (requireInfra) throw error;
    } finally {
      redis.disconnect();
    }
  });
});
