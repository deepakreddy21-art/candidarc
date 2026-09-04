/** @vitest-environment node */
/**
 * PostgreSQL RLS tenant isolation integration test.
 *
 * Requires:
 * - DATABASE_URL pointing at a Postgres instance with migrations applied
 * - Connection role must NOT bypass RLS (not superuser / not BYPASSRLS)
 * - Run `npm run db:migrate` before executing when DATABASE_URL is set
 */
import { describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;

describe("postgres tenant RLS", () => {
  it.skipIf(!databaseUrl)("isolates tenant-owned rows when app.tenant_id is set per transaction", async () => {
    process.env.CANDIDARC_DATA_MODE = "postgres";
    const postgres = (await import("postgres")).default;
    const sql = postgres(databaseUrl!, { max: 1 });

    try {
      const [{ id: tenantA }] = await sql<{ id: string }[]>`
        insert into tenants (id, public_id, name, plan)
        values (gen_random_uuid(), ${`tenant-a-${Date.now()}`}, 'Tenant A', 'free')
        returning id
      `;
      const [{ id: tenantB }] = await sql<{ id: string }[]>`
        insert into tenants (id, public_id, name, plan)
        values (gen_random_uuid(), ${`tenant-b-${Date.now()}`}, 'Tenant B', 'free')
        returning id
      `;

      const appPublicId = `app-rls-${Date.now()}`;
      await sql.begin(async (tx) => {
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

      const visibleToA = await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenantA}, true)`;
        return tx<{ public_id: string }[]>`
          select public_id from applications where public_id = ${appPublicId}
        `;
      });
      expect(visibleToA).toHaveLength(1);

      const visibleToB = await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenantB}, true)`;
        return tx<{ public_id: string }[]>`
          select public_id from applications where public_id = ${appPublicId}
        `;
      });
      expect(visibleToB).toHaveLength(0);
    } finally {
      await sql.end({ timeout: 5 });
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
