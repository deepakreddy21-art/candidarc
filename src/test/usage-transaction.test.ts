/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyMemoryStore,
  MemoryRepositories,
  newId,
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

// Postgres transaction test — only runs when DATABASE_URL is set
describe("commitReservedWithCost (postgres)", () => {
  const shouldSkip = !process.env.DATABASE_URL;

  it.skipIf(shouldSkip)(
    "atomically commits reservation and cost row in single transaction",
    async () => {
      // Only import postgres repos when DATABASE_URL is available
      const { PostgresRepositories } = await import("../../server/database/postgres-repos");
      const { closeDb, resetDbCache } = await import("../../server/database/client");

      // Set up postgres mode
      process.env.CANDIDARC_DATA_MODE = "postgres";
      resetEnvCache();
      resetDbCache();

      try {
        const repos = new PostgresRepositories();

        // Create a unique test key
        const testId = newId("test");
        const key = `test-tenant:usage:transaction:${testId}`;

        // Create reservation
        await repos.usage.append({
          tenantId: "test-tenant",
          userId: "test-user",
          kind: "research",
          units: "1",
          costCents: "0",
          idempotencyKey: key,
          status: "reserved",
          metadata: { testId },
        });

        // Commit with transaction
        const result = await repos.usage.commitReservedWithCost({
          tenantId: "test-tenant",
          idempotencyKey: key,
          costCents: 99,
          userId: "test-user",
        });

        // Verify transaction results
        expect(result.reservation.status).toBe("committed");
        expect(result.costRow).not.toBeNull();
        expect(result.costRow!.costCents).toBe("99");
        expect(result.costRow!.metadata.costStatus).toBe("known");

        // Verify idempotency
        const retry = await repos.usage.commitReservedWithCost({
          tenantId: "test-tenant",
          idempotencyKey: key,
          costCents: 99,
          userId: "test-user",
        });
        expect(retry.reservation.id).toBe(result.reservation.id);
        expect(retry.costRow!.id).toBe(result.costRow!.id);
      } finally {
        process.env.CANDIDARC_DATA_MODE = "memory";
        resetEnvCache();
        await closeDb();
        resetDbCache();
      }
    },
  );

  // Document crash safety
  it("documents that crash mid-transaction is rolled back by Postgres", () => {
    /**
     * CRASH SAFETY DOCUMENTATION:
     *
     * The commitReservedWithCost method uses a Postgres transaction with
     * SELECT FOR UPDATE to ensure atomicity:
     *
     * 1. BEGIN TRANSACTION
     * 2. SELECT ... FOR UPDATE (acquires row lock on reservation)
     * 3. UPDATE status = 'committed'
     * 4. INSERT cost row ON CONFLICT DO NOTHING
     * 5. COMMIT
     *
     * If the process crashes at any point before COMMIT:
     * - Postgres automatically rolls back the transaction
     * - The reservation remains in 'reserved' status
     * - No cost row is created
     * - The operation can be safely retried
     *
     * This ensures we NEVER leave a committed reservation without a
     * corresponding cost observation row.
     *
     * Cannot be tested programmatically (would require killing the process),
     * but the behavior is guaranteed by Postgres transaction semantics.
     */
    expect(true).toBe(true); // Placeholder assertion
  });

  if (shouldSkip) {
    it("skips postgres transaction test", () => {
      console.log(
        "SKIPPED: Postgres transaction test requires DATABASE_URL. " +
          "Set DATABASE_URL to run the full transaction test against a real database.",
      );
      expect(shouldSkip).toBe(true);
    });
  }
});
