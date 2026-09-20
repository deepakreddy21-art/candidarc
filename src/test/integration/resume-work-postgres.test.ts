/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { resetEnvCache } from "../../../server/config/env";
import { ResumeWorkStore } from "../../../server/database/resume-work-store";
import { createEmptyMemoryStore } from "../../../server/database/repositories";
const url = process.env.DATABASE_URL;
const required = process.env.CANDIDARC_REQUIRE_USAGE_POSTGRES === "1" || process.env.CANDIDARC_REQUIRE_INFRA === "1";
const suite = url ? describe : describe.skip;
if (!url && required) throw new Error("DATABASE_URL required for durable resume work tests");
suite("durable work records", () => {
  const tenant = randomUUID(), owner = randomUUID();
  let sql: import("postgres").Sql;
  beforeAll(async () => {
    process.env.CANDIDARC_DATA_MODE = "postgres"; resetEnvCache();
    sql = (await import("postgres")).default(url!, { max: 2 });
    await sql`insert into tenants(id,public_id,name,plan) values(${tenant}::uuid,${`t-${tenant}`},'Work test','free')`;
    await sql`insert into users(id,public_id,email,name) values(${owner}::uuid,${`u-${owner}`},${`${owner}@example.com`},'Work test')`;
  });
  afterAll(async () => {
    await sql.begin(async tx => {
      await tx`select set_config('app.tenant_id',${tenant},true)`;
      await tx`delete from resume_work_records where tenant_id=${tenant}::uuid`;
      await tx`delete from users where id=${owner}::uuid`;
      await tx`delete from tenants where id=${tenant}::uuid`;
    });
    await sql.end();
    await (await import("../../../server/database/client")).closeDb();
    resetEnvCache();
  });
  it("keeps immutable snapshots across clients and fences concurrent local work", async () => {
    const first = new ResumeWorkStore({ store: createEmptyMemoryStore() }, tenant, owner);
    await first.put("profile", "revision", { value: "original" });
    await first.put("profile", "revision", { value: "overwrite" });
    const restarted = new ResumeWorkStore({ store: createEmptyMemoryStore() }, tenant, owner);
    expect((await restarted.get("profile", "revision"))?.data.value).toBe("original");
    expect(await new ResumeWorkStore({ store: createEmptyMemoryStore() }, tenant, randomUUID()).get("profile", "revision")).toBeNull();
    const tokens = await Promise.all(Array.from({ length: 12 }, () => restarted.claim("profile", "revision")));
    expect(tokens.filter(Boolean)).toHaveLength(1);
    expect(await first.patch("profile", "revision", { value: "bad" }, "incorrect-token")).toBe(false);
    await restarted.release("profile", "revision", tokens.find(Boolean)!);
    expect(await first.claim("profile", "revision")).toBeTruthy();
  });
});
