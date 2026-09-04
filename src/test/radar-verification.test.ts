/**
 * Radar job verification — requires real source re-fetch before VERIFIED_OPEN.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { CanonicalJobCatalog } from "../../server/radar/catalog";
import { verifyJobFromSource } from "../../server/radar/verification";
import * as registry from "../../server/radar/providers/registry";
import type { JobSourceProvider } from "../../server/radar/providers/types";

function makeOpenProvider(): JobSourceProvider {
  return {
    id: "greenhouse",
    displayName: "Greenhouse",
    enabled: true,
    policy: {
      sourceId: "greenhouse",
      accessMethod: "ats_board_api",
      termsUrl: "https://example.com/terms",
      licenseStatus: "public",
      allowedFields: [],
      attributionRequired: true,
      attributionText: "Greenhouse",
      fullDescriptionAllowed: true,
      retentionDays: 90,
      refreshLimitPerDay: 500,
      requestsPerMinute: 30,
      removalRequired: true,
      commercialUseAllowed: true,
      lastComplianceReview: "2026-09-01",
      enabled: true,
    },
    fetchBoard: vi.fn(),
    verifyListing: vi.fn().mockResolvedValue({
      listingId: "gh-test-listing",
      open: true,
      status: "open",
      checkedAt: new Date().toISOString(),
      message: "Fixture listing present",
    }),
    healthCheck: vi.fn(),
  };
}

function makeClosedProvider(): JobSourceProvider {
  return {
    ...makeOpenProvider(),
    verifyListing: vi.fn().mockResolvedValue({
      listingId: "gh-test-listing",
      open: false,
      status: "closed",
      checkedAt: new Date().toISOString(),
      message: "Listing removed",
    }),
  };
}

describe("verifyJobFromSource", () => {
  let catalog: CanonicalJobCatalog;

  beforeEach(() => {
    catalog = new CanonicalJobCatalog();
    catalog.seedDemoCatalog();
    vi.restoreAllMocks();
  });

  it("marks VERIFIED_OPEN only after provider confirms listing is open", async () => {
    const job = [...catalog.canonicalJobs.values()][0];
    expect(job).toBeTruthy();

    job!.verificationState = "STALE";
    catalog.canonicalJobs.set(job!.id, job!);

    vi.spyOn(registry, "getProvider").mockReturnValue(makeOpenProvider());

    const outcome = await verifyJobFromSource(catalog, job!.publicId);
    expect(outcome).not.toBeNull();
    expect(outcome!.verified).toBe(true);
    expect(outcome!.job.verificationState).toBe("VERIFIED_OPEN");
    expect(outcome!.sourceChecked).toBe(true);
  });

  it("does not mark VERIFIED_OPEN when provider reports closed", async () => {
    const job = [...catalog.canonicalJobs.values()][0];
    expect(job).toBeTruthy();

    vi.spyOn(registry, "getProvider").mockReturnValue(makeClosedProvider());

    const outcome = await verifyJobFromSource(catalog, job!.publicId);
    expect(outcome).not.toBeNull();
    expect(outcome!.verified).toBe(false);
    expect(outcome!.job.verificationState).toBe("CLOSED");
    expect(outcome!.job.status).toBe("closed");
  });

  it("returns STALE when job has no sightings", async () => {
    const job = [...catalog.canonicalJobs.values()][0];
    expect(job).toBeTruthy();

    for (const [id, sighting] of catalog.sightings.entries()) {
      if (sighting.canonicalJobId === job!.id) {
        catalog.sightings.delete(id);
      }
    }

    const outcome = await verifyJobFromSource(catalog, job!.publicId);
    expect(outcome).not.toBeNull();
    expect(outcome!.verified).toBe(false);
    expect(outcome!.sourceChecked).toBe(false);
    expect(outcome!.job.verificationState).toBe("STALE");
  });
});
