/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyMemoryStore,
  MemoryRepositories,
} from "../../server/database/repositories";
import { resetEnvCache } from "../../server/config/env";

/**
 * Usage Transaction Tests
 *
 * Tests for the transactional commitReservedWithCost method that ensures
 * atomicity of usage reservation commit and cost observation row creation.
 *
 * CRASH SAFETY: If the process crashes mid-transaction, Postgres rolls back
 * the entire transaction. We can never leave a committed reservation without
 * a corresponding cost observation row. This is documented in migration
 * 0011_usage_ledger_idempotency_expand_contract.sql.
 */

describe("commitReservedWithCost (memory)", () => {
  let store: ReturnType<typeof createEmptyMemoryStore>;
  let repos: MemoryRepositories;

  beforeEach(() => {
    resetEnvCache();
    store = createEmptyMemoryStore();
    repos = new MemoryRepositories(store);
  });

  afterEach(() => {
    resetEnvCache();
    vi.restoreAllMocks();
  });

  it("commits reserved usage and creates known cost row atomically", async () => {
    // Reserve usage
    const key = "tenant-a:usage:wf:stage:research";
    await repos.usage.append({
      tenantId: "tenant-a",
      userId: "user-1",
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: key,
      status: "reserved",
      metadata: {},
    });

    // Commit with known cost
    const result = await repos.usage.commitReservedWithCost({
      tenantId: "tenant-a",
      idempotencyKey: key,
      costCents: 42,
      userId: "user-1",
    });

    // Reservation should be committed
    expect(result.reservation.status).toBe("committed");
    expect(result.reservation.idempotencyKey).toBe(key);

    // Cost row should exist with known cost
    expect(result.costRow).not.toBeNull();
    expect(result.costRow!.idempotencyKey).toBe(`${key}:cost`);
    expect(result.costRow!.costCents).toBe("42");
    expect(result.costRow!.metadata.costStatus).toBe("known");
    expect(result.costRow!.metadata.billable).toBe(true);
  });

  it("commits reserved usage and creates unknown cost row when costCents is null", async () => {
    const key = "tenant-a:usage:unknown-cost";
    await repos.usage.append({
      tenantId: "tenant-a",
      userId: "user-1",
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: key,
      status: "reserved",
      metadata: {},
    });

    // Commit with unknown cost (null)
    const result = await repos.usage.commitReservedWithCost({
      tenantId: "tenant-a",
      idempotencyKey: key,
      costCents: null, // unknown
      userId: "user-1",
    });

    expect(result.reservation.status).toBe("committed");
    expect(result.costRow).not.toBeNull();
    expect(result.costRow!.idempotencyKey).toBe(`${key}:cost-unknown`);
    expect(result.costRow!.costCents).toBe("0");
    expect(result.costRow!.metadata.costStatus).toBe("unknown");
    expect(result.costRow!.metadata.billable).toBe(false);
  });

  it("unknown cost is distinct from known zero cost", async () => {
    // Create reservation with unknown cost
    const keyUnknown = "tenant-a:usage:unknown";
    await repos.usage.append({
      tenantId: "tenant-a",
      userId: "user-1",
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: keyUnknown,
      status: "reserved",
      metadata: {},
    });
    const unknownResult = await repos.usage.commitReservedWithCost({
      tenantId: "tenant-a",
      idempotencyKey: keyUnknown,
      costCents: null,
      userId: "user-1",
    });

    // Create reservation with known zero cost
    const keyZero = "tenant-a:usage:zero";
    await repos.usage.append({
      tenantId: "tenant-a",
      userId: "user-1",
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: keyZero,
      status: "reserved",
      metadata: {},
    });
    const zeroResult = await repos.usage.commitReservedWithCost({
      tenantId: "tenant-a",
      idempotencyKey: keyZero,
      costCents: 0, // known zero
      userId: "user-1",
    });

    // Both should have cost rows
    expect(unknownResult.costRow).not.toBeNull();
    expect(zeroResult.costRow).not.toBeNull();

    // Unknown should use :cost-unknown key
    expect(unknownResult.costRow!.idempotencyKey).toBe(`${keyUnknown}:cost-unknown`);
    expect(unknownResult.costRow!.metadata.costStatus).toBe("unknown");
    expect(unknownResult.costRow!.metadata.billable).toBe(false);

    // Known zero should use :cost key
    expect(zeroResult.costRow!.idempotencyKey).toBe(`${keyZero}:cost`);
    expect(zeroResult.costRow!.metadata.costStatus).toBe("known");
    expect(zeroResult.costRow!.metadata.billable).toBe(true);
    expect(zeroResult.costRow!.costCents).toBe("0");
  });

  it("is idempotent — retry returns same result without duplicating cost row", async () => {
    const key = "tenant-a:usage:idempotent";
    await repos.usage.append({
      tenantId: "tenant-a",
      userId: "user-1",
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: key,
      status: "reserved",
      metadata: {},
    });

    // First commit
    const first = await repos.usage.commitReservedWithCost({
      tenantId: "tenant-a",
      idempotencyKey: key,
      costCents: 100,
      userId: "user-1",
    });

    // Retry commit (should be idempotent)
    const second = await repos.usage.commitReservedWithCost({
      tenantId: "tenant-a",
      idempotencyKey: key,
      costCents: 100,
      userId: "user-1",
    });

    // Both should return same reservation and cost row
    expect(first.reservation.id).toBe(second.reservation.id);
    expect(first.costRow!.id).toBe(second.costRow!.id);

    // Only one cost row should exist
    const costRows = [...store.usageLedger.values()].filter(
      (row) => row.tenantId === "tenant-a" && row.idempotencyKey === `${key}:cost`,
    );
    expect(costRows).toHaveLength(1);
  });

  it("concurrent commits produce exactly one cost row", async () => {
    const key = "tenant-a:usage:concurrent";
    await repos.usage.append({
      tenantId: "tenant-a",
      userId: "user-1",
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: key,
      status: "reserved",
      metadata: {},
    });

    // Simulate concurrent commits
    const results = await Promise.all([
      repos.usage.commitReservedWithCost({
        tenantId: "tenant-a",
        idempotencyKey: key,
        costCents: 50,
        userId: "user-1",
      }),
      repos.usage.commitReservedWithCost({
        tenantId: "tenant-a",
        idempotencyKey: key,
        costCents: 50,
        userId: "user-1",
      }),
      repos.usage.commitReservedWithCost({
        tenantId: "tenant-a",
        idempotencyKey: key,
        costCents: 50,
        userId: "user-1",
      }),
    ]);

    // All should succeed (idempotent)
    for (const result of results) {
      expect(result.reservation.status).toBe("committed");
      expect(result.costRow).not.toBeNull();
    }

    // Only one cost row should exist
    const costRows = [...store.usageLedger.values()].filter(
      (row) => row.tenantId === "tenant-a" && row.idempotencyKey === `${key}:cost`,
    );
    expect(costRows).toHaveLength(1);
    expect(costRows[0]!.costCents).toBe("50");
  });

  it("throws USAGE_NOT_FOUND if reservation does not exist", async () => {
    await expect(
      repos.usage.commitReservedWithCost({
        tenantId: "tenant-a",
        idempotencyKey: "nonexistent",
        costCents: 10,
        userId: "user-1",
      }),
    ).rejects.toMatchObject({ code: "USAGE_NOT_FOUND" });
  });

  it("throws USAGE_ALREADY_RELEASED if reservation is released", async () => {
    const key = "tenant-a:usage:released";
    await repos.usage.append({
      tenantId: "tenant-a",
      userId: "user-1",
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: key,
      status: "reserved",
      metadata: {},
    });

    // Release the reservation
    await repos.usage.updateStatus("tenant-a", key, "released");

    // Attempt to commit should fail
    await expect(
      repos.usage.commitReservedWithCost({
        tenantId: "tenant-a",
        idempotencyKey: key,
        costCents: 10,
        userId: "user-1",
      }),
    ).rejects.toMatchObject({ code: "USAGE_ALREADY_RELEASED" });
  });

  it("throws USAGE_FORBIDDEN when tenant mismatch", async () => {
    const key = "tenant-a:usage:cross-tenant";
    await repos.usage.append({
      tenantId: "tenant-a",
      userId: "user-1",
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: key,
      status: "reserved",
      metadata: {},
    });

    // Attempt to commit with wrong tenant
    // Note: The key lookup is scoped by tenant, so this will throw NOT_FOUND
    // because tenant-b won't find the key
    await expect(
      repos.usage.commitReservedWithCost({
        tenantId: "tenant-b",
        idempotencyKey: key,
        costCents: 10,
        userId: "user-1",
      }),
    ).rejects.toMatchObject({ code: "USAGE_NOT_FOUND" });
  });
});

describe("provider-operation usage identity", () => {
  let store: ReturnType<typeof createEmptyMemoryStore>;
  let repos: MemoryRepositories;

  beforeEach(() => {
    resetEnvCache();
    store = createEmptyMemoryStore();
    repos = new MemoryRepositories(store);
  });

  afterEach(() => {
    resetEnvCache();
  });

  async function reserveAndCommit(key: string, kind: string, costCents: number | null) {
    await repos.usage.append({
      tenantId: "tenant-a",
      userId: "user-1",
      kind,
      units: "1",
      costCents: "0",
      idempotencyKey: key,
      status: "reserved",
      metadata: { operationId: key },
    });
    return repos.usage.commitReservedWithCost({
      tenantId: "tenant-a",
      idempotencyKey: key,
      costCents,
      userId: "user-1",
    });
  }

  it("keeps V4 generate, V4R1 repair, and both Final QA calls on distinct ledger keys", async () => {
    const wf = "wf-idem-1";
    const generateV4 = `tenant-a:usage:${wf}:generate:v4:resume_generation`;
    const repairV4R1 = `tenant-a:usage:${wf}:repair:v4-to-v4r1:attempt-1:abc:resume_generation`;
    const finalQaV4 = `tenant-a:usage:${wf}:final-qa:v4:final_review`;
    const finalQaV5 = `tenant-a:usage:${wf}:final-qa:v5:final_review`;

    await reserveAndCommit(generateV4, "resume_generation", 11);
    await reserveAndCommit(repairV4R1, "resume_generation", 12);
    await reserveAndCommit(finalQaV4, "final_review", 3);
    await reserveAndCommit(finalQaV5, "final_review", 4);

    // Replay each operation — no duplicate cost rows
    await Promise.all([
      repos.usage.commitReservedWithCost({
        tenantId: "tenant-a",
        idempotencyKey: generateV4,
        costCents: 11,
        userId: "user-1",
      }),
      repos.usage.commitReservedWithCost({
        tenantId: "tenant-a",
        idempotencyKey: repairV4R1,
        costCents: 12,
        userId: "user-1",
      }),
      repos.usage.commitReservedWithCost({
        tenantId: "tenant-a",
        idempotencyKey: finalQaV4,
        costCents: 3,
        userId: "user-1",
      }),
      repos.usage.commitReservedWithCost({
        tenantId: "tenant-a",
        idempotencyKey: finalQaV5,
        costCents: 4,
        userId: "user-1",
      }),
    ]);

    const rows = [...store.usageLedger.values()].filter((row) => row.tenantId === "tenant-a");
    const reservations = rows.filter((row) => row.kind !== "provider_cost");
    const costs = rows.filter((row) => row.kind === "provider_cost");
    expect(reservations).toHaveLength(4);
    expect(costs).toHaveLength(4);
    expect(new Set(reservations.map((row) => row.idempotencyKey)).size).toBe(4);
  });
});

describe("tenant-prefixed key isolation", () => {
  it("tenant-prefixed keys ensure isolation even with global unique index", async () => {
    const store = createEmptyMemoryStore();
    const repos = new MemoryRepositories(store);

    // Two tenants using the same logical key concept
    const tenantAKey = "tenant-a:usage:wf:operation";
    const tenantBKey = "tenant-b:usage:wf:operation";

    // Create reservations
    await repos.usage.append({
      tenantId: "tenant-a",
      userId: "user-1",
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: tenantAKey,
      status: "reserved",
      metadata: {},
    });
    await repos.usage.append({
      tenantId: "tenant-b",
      userId: "user-2",
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: tenantBKey,
      status: "reserved",
      metadata: {},
    });

    // Commit both
    const resultA = await repos.usage.commitReservedWithCost({
      tenantId: "tenant-a",
      idempotencyKey: tenantAKey,
      costCents: 10,
      userId: "user-1",
    });
    const resultB = await repos.usage.commitReservedWithCost({
      tenantId: "tenant-b",
      idempotencyKey: tenantBKey,
      costCents: 20,
      userId: "user-2",
    });

    // Both should succeed independently
    expect(resultA.reservation.tenantId).toBe("tenant-a");
    expect(resultB.reservation.tenantId).toBe("tenant-b");
    expect(resultA.costRow!.costCents).toBe("10");
    expect(resultB.costRow!.costCents).toBe("20");

    // Each tenant has separate rows
    const tenantARows = [...store.usageLedger.values()].filter((r) => r.tenantId === "tenant-a");
    const tenantBRows = [...store.usageLedger.values()].filter((r) => r.tenantId === "tenant-b");
    expect(tenantARows).toHaveLength(2); // reservation + cost
    expect(tenantBRows).toHaveLength(2); // reservation + cost
  });
});

// PostgreSQL proof lives in src/test/integration/usage-transaction-postgres.test.ts
// (UUID fixtures + rollback trigger). Run via `npm run test:usage-postgres`.
describe("commitReservedWithCost (postgres proof location)", () => {
  it("points at the dedicated integration suite", async () => {
    const { access } = await import("fs/promises");
    const { resolve } = await import("path");
    await access(resolve(__dirname, "integration/usage-transaction-postgres.test.ts"));
    if (process.env.CANDIDARC_REQUIRE_USAGE_POSTGRES === "1" && !process.env.DATABASE_URL) {
      throw new Error(
        "CANDIDARC_REQUIRE_USAGE_POSTGRES=1 but DATABASE_URL is unset — run npm run test:usage-postgres after migrations",
      );
    }
  });
});
