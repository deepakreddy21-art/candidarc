/** @vitest-environment node */
/**
 * PostgreSQL coverage for Google identity uniqueness, concurrency, and rollback.
 */
import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetEnvCache } from "../../../server/config/env";
import { resetDbCache } from "../../../server/database/client";
import { hashPassword } from "../../../server/auth/password";
import { resolveGoogleSignIn } from "../../../server/auth/google-account";
import { AppError } from "../../../server/domain/types";

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
    sql = postgres(databaseUrl!, { max: 8 });
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
        await sql`delete from auth_identities where user_id = any(${userIds}::uuid[])`;
        const tenants = await sql<{ tenant_id: string }[]>`
          select distinct tenant_id from tenant_memberships where user_id = any(${userIds}::uuid[])
        `;
        await sql`delete from tenant_memberships where user_id = any(${userIds}::uuid[])`;
        await sql`delete from users where id = any(${userIds}::uuid[])`;
        const tenantIds = tenants.map((row) => row.tenant_id);
        if (tenantIds.length) {
          await sql`delete from tenants where id = any(${tenantIds}::uuid[])`;
        }
      }
    } catch {
      /* ignore cleanup errors */
    }
    await sql.end({ timeout: 5 });
    const { closeDb } = await import("../../../server/database/client");
    await closeDb().catch(() => undefined);
    resetDbCache();
    resetEnvCache();
  });

  async function countsForEmail(email: string) {
    const users = await sql<{ c: string }[]>`select count(*)::text as c from users where email = ${email}`;
    const identities = await sql<{ c: string }[]>`
      select count(*)::text as c from auth_identities where email = ${email}
    `;
    const memberships = await sql<{ c: string }[]>`
      select count(*)::text as c
      from tenant_memberships tm
      join users u on u.id = tm.user_id
      where u.email = ${email}
    `;
    const tenants = await sql<{ c: string }[]>`
      select count(*)::text as c
      from tenants t
      join tenant_memberships tm on tm.tenant_id = t.id
      join users u on u.id = tm.user_id
      where u.email = ${email}
    `;
    return {
      users: Number(users[0]!.c),
      identities: Number(identities[0]!.c),
      memberships: Number(memberships[0]!.c),
      tenants: Number(tenants[0]!.c),
    };
  }

  it("creates exactly one user, tenant, membership, and identity", async () => {
    const email = `create-${suffix}@example.com`;
    const created = await resolveGoogleSignIn(repos, {
      sub: `pg-google-${suffix}-create`,
      email,
      emailVerified: true,
      name: "PG Create",
    });
    expect(created.created).toBe(true);
    expect(await countsForEmail(email)).toEqual({
      users: 1,
      identities: 1,
      memberships: 1,
      tenants: 1,
    });
    const identity = await sql<{ provider_subject: string; provider: string }[]>`
      select provider_subject, provider from auth_identities where email = ${email}
    `;
    expect(identity).toHaveLength(1);
    expect(identity[0]!.provider).toBe("google");
    expect(identity[0]!.provider_subject).toBe(`pg-google-${suffix}-create`);
  });

  it("same-sub concurrency leaves exactly one row of each kind", async () => {
    const email = `race-${suffix}@example.com`;
    const sub = `pg-google-${suffix}-race`;
    const claims = {
      sub,
      email,
      emailVerified: true as const,
      name: "Race",
    };
    await Promise.all([
      resolveGoogleSignIn(repos, claims),
      resolveGoogleSignIn(repos, claims),
      resolveGoogleSignIn(repos, claims),
      resolveGoogleSignIn(repos, claims),
    ]);
    expect(await countsForEmail(email)).toEqual({
      users: 1,
      identities: 1,
      memberships: 1,
      tenants: 1,
    });
    const subjects = await sql<{ c: string }[]>`
      select count(*)::text as c from auth_identities
      where provider = 'google' and provider_subject = ${sub}
    `;
    expect(Number(subjects[0]!.c)).toBe(1);
  });

  it("identity unique conflict rolls back without orphaned rows", async () => {
    const winnerEmail = `winner-${suffix}@example.com`;
    const loserEmail = `loser-${suffix}@example.com`;
    const sub = `pg-google-${suffix}-rollback`;
    await resolveGoogleSignIn(repos, {
      sub,
      email: winnerEmail,
      emailVerified: true,
      name: "Winner",
    });

    await expect(
      repos.authIdentities.createUserWithGoogleIdentity({
        provider: "google",
        providerSubject: sub,
        email: loserEmail,
        name: "Loser",
      }),
    ).rejects.toMatchObject({ code: "AUTH_IDENTITY_CONFLICT" });

    expect(await countsForEmail(loserEmail)).toEqual({
      users: 0,
      identities: 0,
      memberships: 0,
      tenants: 0,
    });
    expect(await countsForEmail(winnerEmail)).toEqual({
      users: 1,
      identities: 1,
      memberships: 1,
      tenants: 1,
    });
  });

  it("same email with different Google sub does not duplicate or silently link", async () => {
    const email = `shared-${suffix}@example.com`;
    await resolveGoogleSignIn(repos, {
      sub: `pg-google-${suffix}-shared-a`,
      email,
      emailVerified: true,
      name: "Shared A",
    });
    await expect(
      resolveGoogleSignIn(repos, {
        sub: `pg-google-${suffix}-shared-b`,
        email,
        emailVerified: true,
        name: "Shared B",
      }),
    ).rejects.toMatchObject({ code: "GOOGLE_ACCOUNT_LINK_REQUIRED" });

    expect(await countsForEmail(email)).toEqual({
      users: 1,
      identities: 1,
      memberships: 1,
      tenants: 1,
    });
    const subjects = await sql<{ provider_subject: string }[]>`
      select provider_subject from auth_identities where email = ${email}
    `;
    expect(subjects.map((row) => row.provider_subject)).toEqual([`pg-google-${suffix}-shared-a`]);
  });

  it("password-account collision preserves the password user and creates no google rows", async () => {
    const email = `password-${suffix}@example.com`;
    const passwordUser = await repos.users.create({
      publicId: randomUUID(),
      email,
      emailVerified: true,
      passwordHash: await hashPassword("Password!12345"),
      name: "Password PG",
    });

    await expect(
      resolveGoogleSignIn(repos, {
        sub: `pg-google-${suffix}-password-clash`,
        email,
        emailVerified: true,
        name: "Clash",
      }),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      resolveGoogleSignIn(repos, {
        sub: `pg-google-${suffix}-password-clash`,
        email,
        emailVerified: true,
        name: "Clash",
      }),
    ).rejects.toMatchObject({ code: "GOOGLE_ACCOUNT_LINK_REQUIRED" });

    const users = await sql<{ id: string; password_hash: string | null }[]>`
      select id, password_hash from users where email = ${email}
    `;
    expect(users).toHaveLength(1);
    expect(users[0]!.id).toBe(passwordUser.id);
    expect(users[0]!.password_hash).toBeTruthy();

    const identities = await sql<{ c: string }[]>`
      select count(*)::text as c from auth_identities where email = ${email}
    `;
    expect(Number(identities[0]!.c)).toBe(0);

    const memberships = await sql<{ c: string }[]>`
      select count(*)::text as c from tenant_memberships where user_id = ${passwordUser.id}
    `;
    expect(Number(memberships[0]!.c)).toBe(0);
  });
});
