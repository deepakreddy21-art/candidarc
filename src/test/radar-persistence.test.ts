/**
 * Radar persistence — saved jobs tenant isolation (MemoryRadarStore).
 */

import { describe, expect, it, beforeEach } from "vitest";
import { CanonicalJobCatalog } from "../../server/radar/catalog";
import { createMemoryRadarStore } from "../../server/radar/persistence/memory-store";
import type { SavedJob } from "../../server/radar/types";

describe("Radar saved jobs persistence", () => {
  let catalog: CanonicalJobCatalog;
  const tenantA = "tenant-a";
  const tenantB = "tenant-b";
  const user1 = "user-1";
  const user2 = "user-2";

  beforeEach(() => {
    catalog = new CanonicalJobCatalog();
    catalog.seedDemoCatalog();
  });

  function firstJobId(): string {
    const job = [...catalog.canonicalJobs.values()][0];
    expect(job).toBeTruthy();
    return job!.id;
  }

  it("saveJob persists and getSavedJob returns tenant-scoped row", async () => {
    const store = createMemoryRadarStore(catalog);
    const jobId = firstJobId();
    const saved: SavedJob = {
      id: "saved_1",
      tenantId: tenantA,
      userId: user1,
      canonicalJobId: jobId,
      createdAt: new Date().toISOString(),
    };

    await store.saveJob(saved);

    expect(await store.getSavedJob(tenantA, user1, jobId)).toEqual(saved);
    expect(await store.getSavedJob(tenantB, user1, jobId)).toBeNull();
    expect(await store.getSavedJob(tenantA, user2, jobId)).toBeNull();
  });

  it("listSavedJobs only returns rows for tenant+user", async () => {
    const store = createMemoryRadarStore(catalog);
    const jobId = firstJobId();
    const ts = new Date().toISOString();

    await store.saveJob({
      id: "saved_a",
      tenantId: tenantA,
      userId: user1,
      canonicalJobId: jobId,
      createdAt: ts,
    });
    await store.saveJob({
      id: "saved_b",
      tenantId: tenantB,
      userId: user1,
      canonicalJobId: jobId,
      createdAt: ts,
    });

    const tenantAList = await store.listSavedJobs(tenantA, user1);
    expect(tenantAList).toHaveLength(1);
    expect(tenantAList[0]?.tenantId).toBe(tenantA);

    expect(await store.listSavedJobs(tenantA, user2)).toHaveLength(0);
    expect(await store.listSavedJobs(tenantB, user2)).toHaveLength(0);
  });

  it("unsaveJob removes only the matching tenant+user row", async () => {
    const store = createMemoryRadarStore(catalog);
    const jobId = firstJobId();
    const ts = new Date().toISOString();

    await store.saveJob({
      id: "saved_a",
      tenantId: tenantA,
      userId: user1,
      canonicalJobId: jobId,
      createdAt: ts,
    });
    await store.saveJob({
      id: "saved_b",
      tenantId: tenantB,
      userId: user1,
      canonicalJobId: jobId,
      createdAt: ts,
    });

    await store.unsaveJob(tenantA, user1, jobId);

    expect(await store.getSavedJob(tenantA, user1, jobId)).toBeNull();
    expect(await store.getSavedJob(tenantB, user1, jobId)).not.toBeNull();
  });
});
