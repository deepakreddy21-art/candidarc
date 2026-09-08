/** @vitest-environment node */
/**
 * PostgreSQL coverage for Google identity uniqueness and atomic signup.
 */
import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetEnvCache } from "../../../server/config/env";
import { resetDbCache } from "../../../server/database/client";
import { hashPassword } from "../../../server/auth/password";
import { resolveGoogleSignIn } from "../../../server/auth/google-account";

const databaseUrl = process.env.DATABASE_URL;
const requirePostgres =
  process.env.CANDIDARC_REQUIRE_USAGE_POSTGRES === "1" || process.env.CANDIDARC_REQUIRE_INFRA === "1";

describe("Google auth identities (postgres)", () => {
  if (!databaseUrl) {
    it("requires DATABASE_URL when infra is required", () => {
      if (requirePostgres) {
        throw new Error("DATABASE_URL is required for Google auth postgres tests");
      }
      expect(process.env.VITEST).toBeTruthy();
    });
    return;
  }

  let repos: InstanceType<typeof import("../../../server/database/postgres-repos").PostgresRepositories>;
  let sql: import("postgres").Sql;
  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    process.env.CANDIDARC_DATA_MODE = "postgres";
    process.env.APP_MODE = "demo";
    resetEnvCache();
    resetDbCache();
    const postgres = (await import("postgres")).default;
    sql = postgres(databaseUrl!, { max: 5 });
    const { PostgresRepositories } = await import("../../../server/database/postgres-repos");
    repos = new PostgresRepositories();
  }, 60_000);

  afterAll(async () => {
    try {
      const users = await sql<{ id: string }[]>`
        select id from users where email like ${`%${suffix}@example.com`}
      `;
      const userIds = users.map((row) => row.id);
      if (userIds.length) {
        const tenants = await sql<{ tenant_id: string }[]>`
          select distinct tenant_id from tenant_memberships where user_id = any(${userIds}::uuid[])
        `;
        await sql`delete from users where id = any(${userIds}::uuid[])`;
        const tenantIds = tenants.map((row) => row.tenant_id);
        if (tenantIds.length) {
          await sql`delete from tenants where id = any(${tenantIds}::uuid[])`;
        }
      }
    } catch {
      /* ignore */
    }
    await sql.end({ timeout: 5 });
    const { closeDb } = await import("../../../server/database/client");
    await closeDb().catch(() => undefined);
    resetDbCache();
    resetEnvCache();
  });

  it("creates one identity and rejects password-email collisions", async () => {
    const created = await resolveGoogleSignIn(repos, {
      sub: `pg-google-${suffix}-a`,
      email: `google-${suffix}@example.com`,
      emailVerified: true,
      name: "PG Google",
    });
    expect(created.created).toBe(true);

    const again = await resolveGoogleSignIn(repos, {
      sub: `pg-google-${suffix}-a`,
      email: `google-${suffix}@example.com`,
      emailVerified: true,
      name: "PG Google",
    });
    expect(again.user.id).toBe(created.user.id);

    const passwordUser = await repos.users.create({
      publicId: randomUUID(),
      email: `password-${suffix}@example.com`,
      emailVerified: true,
      passwordHash: await hashPassword("Password!12345"),
      name: "Password PG",
    });
    expect(passwordUser.passwordHash).toBeTruthy();

    await expect(
      resolveGoogleSignIn(repos, {
        sub: `pg-google-${suffix}-b`,
        email: `password-${suffix}@example.com`,
        emailVerified: true,
        name: "Clash",
      }),
    ).rejects.toMatchObject({ code: "GOOGLE_ACCOUNT_LINK_REQUIRED" });

    const raced = await Promise.all([
      resolveGoogleSignIn(repos, {
        sub: `pg-google-${suffix}-race`,
        email: `race-${suffix}@example.com`,
        emailVerified: true,
        name: "Race",
      }),
      resolveGoogleSignIn(repos, {
        sub: `pg-google-${suffix}-race`,
        email: `race-${suffix}@example.com`,
        emailVerified: true,
        name: "Race",
      }),
    ]);
    expect(new Set(raced.map((item) => item.user.id)).size).toBe(1);
  });
});
