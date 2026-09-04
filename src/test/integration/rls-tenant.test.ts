/** @vitest-environment node */
/**
 * PostgreSQL RLS tenant isolation integration test.
 *
 * Requires:
 * - DATABASE_URL pointing at a Postgres instance with migrations applied
 * - Tests create/use a non-superuser role without BYPASSRLS
 * - Run `npm run db:migrate` before executing when DATABASE_URL is set
 */
import { describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
const APP_ROLE = "candidarc_app";
const APP_PASSWORD = "candidarc_app";

function appRoleUrl(url: string): string {
  const parsed = new URL(url);
  parsed.username = APP_ROLE;
  parsed.password = APP_PASSWORD;
  return parsed.toString();
}

describe("postgres tenant RLS", () => {
  it.skipIf(!databaseUrl)("isolates tenant-owned rows when app.tenant_id is set per transaction", async () => {
    process.env.CANDIDARC_DATA_MODE = "postgres";
    const postgres = (await import("postgres")).default;
    const admin = postgres(databaseUrl!, { max: 1 });

    try {
      const [{ tenants }] = await admin<{ tenants: string | null }[]>`
        select to_regclass('public.tenants')::text as tenants
      `;
      if (!tenants) {
        throw new Error("Schema missing — run npm run db:migrate before integration tests");
      }

      await admin.unsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
            CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
          END IF;
        END
        $$;
        GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE};
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE};
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
          GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE};
      `);

      const stamp = Date.now();
      const [{ id: tenantA }] = await admin<{ id: string }[]>`
        insert into tenants (id, public_id, name, plan)
        values (gen_random_uuid(), ${`tenant-a-${stamp}`}, 'Tenant A', 'free')
        returning id
      `;
      const [{ id: tenantB }] = await admin<{ id: string }[]>`
        insert into tenants (id, public_id, name, plan)
        values (gen_random_uuid(), ${`tenant-b-${stamp}`}, 'Tenant B', 'free')
        returning id
      `;

      const app = postgres(appRoleUrl(databaseUrl!), { max: 1 });
      try {
        const appPublicId = `app-rls-${stamp}`;
        await app.begin(async (tx) => {
          await tx`select set_config('app.tenant_id', ${tenantA}, true)`;
          await tx`
            insert into applications (
              id, public_id, tenant_id, company, company_mark, role, location, employment_type,
              status, stage, workflow_stage, resume_score, evidence_coverage, ats_alignment,
              interview_status, research_confidence, archived, role_family, next_action
            ) values (
              gen_random_uuid(), ${appPublicId}, ${tenantA}, 'Acme', 'AC', 'Engineer', 'Remote', 'Full-time',
              'researching', 'RESEARCH_QUEUED', 'RESEARCH_QUEUED', 0, 0, 0,
              'not-started', 0, false, 'General', 'Test'
            )
          `;
        });

        const visibleToA = await app.begin(async (tx) => {
          await tx`select set_config('app.tenant_id', ${tenantA}, true)`;
          return tx<{ public_id: string }[]>`
            select public_id from applications where public_id = ${appPublicId}
          `;
        });
        expect(visibleToA).toHaveLength(1);

        const visibleToB = await app.begin(async (tx) => {
          await tx`select set_config('app.tenant_id', ${tenantB}, true)`;
          return tx<{ public_id: string }[]>`
            select public_id from applications where public_id = ${appPublicId}
          `;
        });
        expect(visibleToB).toHaveLength(0);

        await expect(
          app.begin(async (tx) => {
            await tx`select set_config('app.tenant_id', '', true)`;
            return tx`select public_id from applications where public_id = ${appPublicId}`;
          }),
        ).resolves.toHaveLength(0);
      } finally {
        await app.end({ timeout: 5 });
      }
    } finally {
      await admin.end({ timeout: 5 });
      delete process.env.CANDIDARC_DATA_MODE;
    }
  });

  it("skips clearly when DATABASE_URL is unset", () => {
    if (databaseUrl) {
      expect(databaseUrl.length).toBeGreaterThan(0);
      return;
    }
    expect(process.env.VITEST).toBeTruthy();
  });
});
