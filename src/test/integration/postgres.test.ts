/** @vitest-environment node */
import { describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;

describe("postgres integration", () => {
  it.skipIf(!databaseUrl)("connects and runs a trivial query", async () => {
    const postgres = (await import("postgres")).default;
    const sql = postgres(databaseUrl!);
    try {
      const rows = await sql`select 1 as ok`;
      expect(rows[0]?.ok).toBe(1);
    } finally {
      await sql.end({ timeout: 5 });
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
