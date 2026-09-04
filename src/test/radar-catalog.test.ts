/** @vitest-environment node */
import { beforeEach, describe, expect, it } from "vitest";
import { getSharedCatalog, resetSharedCatalogForTests, seedDemoCatalog } from "../../server/radar/catalog";
import { RadarService } from "../../server/radar/service";
import { ensureDemoUser, DEMO_USER } from "../../server/auth/demo-auth";
import { createEmptyMemoryStore } from "../../server/database/repositories";
import type { AuthContext } from "../../server/auth/guards";
import { listProviders, getProvider } from "../../server/radar/providers/registry";
import { getLinkedInDemoListings } from "../../server/radar/providers/linkedin-licensed";

function ctx(userId: string, tenantId: string): AuthContext {
  return {
    requestId: "req_radar",
    user: { id: userId, publicId: "user_deepak", email: DEMO_USER.email, name: DEMO_USER.name },
    memberships: [{ tenantId, tenantPublicId: "ten_deepak", role: "owner" }],
    activeTenantId: tenantId,
  };
}

describe("radar catalog seed & search", () => {
  beforeEach(() => {
    resetSharedCatalogForTests();
    // Explicitly seed for demo tests
    seedDemoCatalog();
  });

  it("seeds Cisco as REPOSTED with labeled LinkedIn demo sighting", () => {
    const catalog = getSharedCatalog();
    const cisco = [...catalog.canonicalJobs.values()].find((j) =>
      j.title.toLowerCase().includes("cx ai"),
    );
    expect(cisco).toBeTruthy();
    expect(cisco!.classification).toBe("REPOSTED");
    const sightings = [...catalog.sightings.values()].filter((s) => s.canonicalJobId === cisco!.id);
    expect(sightings.some((s) => s.demoData === true)).toBe(true);
  });

  it("supports freshness type genuinely_new vs reposted_only", () => {
    const catalog = getSharedCatalog();
    const newOnly = catalog.search({ freshnessType: "genuinely_new", limit: 50 });
    const reposted = catalog.search({ freshnessType: "reposted_only", limit: 50 });
    expect(newOnly.results.every((r) => r.job.classification === "NEW")).toBe(true);
    expect(reposted.results.every((r) => r.job.classification === "REPOSTED")).toBe(true);
    expect(reposted.results.length).toBeGreaterThan(0);
    expect(newOnly.results.length).toBeGreaterThan(0);
  });

  it("filters by discovered freshness preset", () => {
    const catalog = getSharedCatalog();
    const recent = catalog.search({ freshnessBasis: "discovered", freshnessPreset: "30d", limit: 50 });
    expect(recent.results.length).toBeGreaterThan(0);
  });
});

describe("radar tenant isolation", () => {
  beforeEach(() => {
    resetSharedCatalogForTests();
    seedDemoCatalog();
  });

  it("saved and hidden jobs are user-specific", async () => {
    const store = createEmptyMemoryStore();
    const a = await ensureDemoUser(store);
    const catalog = getSharedCatalog();
    const service = new RadarService(catalog);
    const job = [...catalog.canonicalJobs.values()][0]!;
    const authA = ctx(a.userId, a.tenantId);
    const authB: AuthContext = {
      requestId: "req_b",
      user: { id: "usr_other", publicId: "user_other", email: "other@example.com", name: "Other" },
      memberships: [{ tenantId: a.tenantId, tenantPublicId: "ten_deepak", role: "member" }],
      activeTenantId: a.tenantId,
    };

    service.save(authA, job.publicId);
    expect([...catalog.savedJobs.values()].some((s) => s.userId === a.userId && s.canonicalJobId === job.id)).toBe(true);
    expect([...catalog.savedJobs.values()].some((s) => s.userId === "usr_other")).toBe(false);

    service.hide(authA, job.publicId);
    const searchA = await service.search(authA, { limit: 100 });
    const searchB = await service.search(authB, { limit: 100 });
    expect(searchA.results.find((r) => r.job.id === job.id)).toBeFalsy();
    expect(searchB.results.find((r) => r.job.id === job.id)).toBeTruthy();
  });

  it("saved searches stay tenant-isolated", async () => {
    const store = createEmptyMemoryStore();
    const { userId, tenantId } = await ensureDemoUser(store);
    const catalog = getSharedCatalog();
    const service = new RadarService(catalog);
    const auth = ctx(userId, tenantId);
    service.createSavedSearch(auth, {
      name: "AI last hour",
      query: { keywords: "AI", freshnessPreset: "1h", freshnessBasis: "discovered" },
    });
    const other: AuthContext = {
      requestId: "x",
      user: { id: "u2", publicId: "u2", email: "u2@x.com", name: "U2" },
      memberships: [{ tenantId: "ten_other", tenantPublicId: "ten_other", role: "owner" }],
      activeTenantId: "ten_other",
    };
    expect(service.listSavedSearches(auth).length).toBeGreaterThan(0);
    expect(service.listSavedSearches(other).length).toBe(0);
  });
});

describe("radar alerts", () => {
  beforeEach(() => {
    resetSharedCatalogForTests();
    seedDemoCatalog();
  });

  it("does not duplicate alert deliveries for the same job", async () => {
    const store = createEmptyMemoryStore();
    const { userId, tenantId } = await ensureDemoUser(store);
    const catalog = getSharedCatalog();
    const service = new RadarService(catalog);
    const auth = ctx(userId, tenantId);
    const job = [...catalog.canonicalJobs.values()].find((j) => j.classification === "NEW")!;
    service.createAlert(auth, {
      name: "New AI",
      cadence: "immediate",
      includeReposts: false,
      includeRefreshes: false,
      query: { freshnessType: "genuinely_new" },
    });
    catalog.evaluateAlertsForJob(job);
    catalog.evaluateAlertsForJob(job);
    const keys = new Set(catalog.alertDeliveries.map((d) => d.dedupeKey));
    expect(keys.size).toBe(catalog.alertDeliveries.length);
  });

  it("repost jobs retain original posting age", () => {
    const catalog = getSharedCatalog();
    const cisco = [...catalog.canonicalJobs.values()].find((j) => j.classification === "REPOSTED");
    expect(cisco).toBeTruthy();
    expect(cisco!.originalPostedAt).toBeTruthy();
  });
});

describe("provider compliance", () => {
  it("keeps LinkedIn and Indeed disabled without credentials", () => {
    expect(getProvider("linkedin-licensed")?.enabled).toBe(false);
    expect(getProvider("indeed-partner")?.enabled).toBe(false);
    expect(getLinkedInDemoListings().every((d) => d.demoData === true)).toBe(true);
    expect(listProviders().some((p) => p.id === "greenhouse" && p.enabled)).toBe(true);
  });
});
