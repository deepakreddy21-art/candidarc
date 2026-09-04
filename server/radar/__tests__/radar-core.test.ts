import { describe, expect, it } from "vitest";
import {
  classifySightingAgainstCanonical,
  descriptionHash,
  normalizeTitle,
  scoreSightingSimilarity,
} from "../repost";
import {
  excludeOriginallyOlderThan,
  filterByFreshness,
  formatFreshnessLabel,
  parseFreshnessPreset,
} from "../freshness";
import { CanonicalJobCatalog } from "../catalog";

describe("freshness", () => {
  it("parses presets", () => {
    expect(parseFreshnessPreset("30m").ms).toBe(30 * 60_000);
    expect(parseFreshnessPreset("7d").label).toContain("7 days");
  });

  it("never shows minute precision for DATE_ONLY", () => {
    const ts = new Date(Date.now() - 3 * 60_000);
    const label = formatFreshnessLabel(ts, "DATE_ONLY", new Date());
    expect(label).not.toMatch(/minute/);
    expect(label).toMatch(/today|Posted/i);
  });

  it("filters by discovered preset", () => {
    const now = new Date();
    const jobs = [
      {
        originalPostedAt: new Date(now.getTime() - 40 * 60_000).toISOString(),
        firstDiscoveredAt: new Date(now.getTime() - 20 * 60_000).toISOString(),
        repostedAt: null,
        lastVerifiedAt: null,
        updatedAt: now.toISOString(),
        originalPostedPrecision: "EXACT_TIMESTAMP" as const,
      },
      {
        originalPostedAt: new Date(now.getTime() - 2 * 86_400_000).toISOString(),
        firstDiscoveredAt: new Date(now.getTime() - 2 * 86_400_000).toISOString(),
        repostedAt: null,
        lastVerifiedAt: null,
        updatedAt: now.toISOString(),
        originalPostedPrecision: "EXACT_TIMESTAMP" as const,
      },
    ];
    const filtered = filterByFreshness(jobs, { basis: "discovered", preset: "1h" });
    expect(filtered).toHaveLength(1);
  });

  it("excludeOriginallyOlderThan", () => {
    const now = new Date();
    const jobs = [
      { originalPostedAt: new Date(now.getTime() - 5 * 86_400_000).toISOString() },
      { originalPostedAt: new Date(now.getTime() - 40 * 86_400_000).toISOString() },
    ];
    expect(excludeOriginallyOlderThan(jobs, 14)).toHaveLength(1);
  });
});

describe("repost classification", () => {
  it("same requisition + new listing → REPOSTED", () => {
    const result = classifySightingAgainstCanonical(
      {
        sourceListingId: "li-2",
        sourceRequisitionId: "REQ-1",
        sourceUrl: "https://example.com/li/2",
        sourceTitle: "CX AI Software Engineer",
        contentHash: "aaa",
        descriptionHash: descriptionHash("desc"),
        classification: "UNKNOWN",
        removedAt: null,
        companyNormalized: "cisco",
      },
      [
        {
          sourceListingId: "gh-1",
          sourceRequisitionId: "REQ-1",
          sourceUrl: "https://example.com/gh/1",
          sourceTitle: "CX AI Software Engineer",
          contentHash: "bbb",
          descriptionHash: descriptionHash("desc"),
          classification: "NEW",
          removedAt: null,
          companyNormalized: "cisco",
        },
      ],
    );
    expect(result.classification).toBe("REPOSTED");
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("same listing + content change → REFRESHED", () => {
    const result = classifySightingAgainstCanonical(
      {
        sourceListingId: "lever-1",
        sourceRequisitionId: "REQ-2",
        sourceUrl: "https://example.com/1",
        sourceTitle: "ML Platform",
        contentHash: "newhash",
        descriptionHash: descriptionHash("updated desc"),
        classification: "UNKNOWN",
        removedAt: null,
      },
      [
        {
          sourceListingId: "lever-1",
          sourceRequisitionId: "REQ-2",
          sourceUrl: "https://example.com/1",
          sourceTitle: "ML Platform",
          contentHash: "oldhash",
          descriptionHash: descriptionHash("old desc"),
          classification: "NEW",
          removedAt: null,
        },
      ],
    );
    expect(result.classification).toBe("REFRESHED");
  });

  it("closed + same requisition → REOPENED", () => {
    const result = classifySightingAgainstCanonical(
      {
        sourceListingId: "new-1",
        sourceRequisitionId: "REQ-3",
        sourceUrl: "https://example.com/n",
        sourceTitle: "Engineer",
        contentHash: "x",
        descriptionHash: "y",
        classification: "UNKNOWN",
        removedAt: null,
      },
      [
        {
          sourceListingId: "old-1",
          sourceRequisitionId: "REQ-3",
          sourceUrl: "https://example.com/o",
          sourceTitle: "Engineer",
          contentHash: "x",
          descriptionHash: "y",
          classification: "EXPIRED",
          removedAt: new Date().toISOString(),
        },
      ],
      { status: "closed", employerRequisitionId: "REQ-3", classification: "EXPIRED" },
    );
    expect(result.classification).toBe("REOPENED");
  });

  it("different team + requisition → NEW", () => {
    const result = classifySightingAgainstCanonical(
      {
        sourceListingId: "a",
        sourceRequisitionId: "REQ-A",
        sourceUrl: "https://example.com/a",
        sourceTitle: "Software Engineer",
        contentHash: "1",
        descriptionHash: "1",
        classification: "UNKNOWN",
        removedAt: null,
        team: "Platform",
        companyNormalized: "acme",
      },
      [
        {
          sourceListingId: "b",
          sourceRequisitionId: "REQ-B",
          sourceUrl: "https://example.com/b",
          sourceTitle: "Software Engineer",
          contentHash: "2",
          descriptionHash: "2",
          classification: "NEW",
          removedAt: null,
          team: "Growth",
          companyNormalized: "acme",
        },
      ],
    );
    expect(result.classification).toBe("NEW");
  });

  it("weak title-only → POSSIBLE_DUPLICATE", () => {
    const sim = scoreSightingSimilarity(
      {
        sourceListingId: "x1",
        sourceUrl: "https://a.example/1",
        sourceTitle: normalizeTitle("Senior Software Engineer"),
        contentHash: "a",
        descriptionHash: "a",
        classification: "UNKNOWN",
        removedAt: null,
        companyNormalized: "foo",
      },
      {
        sourceListingId: "x2",
        sourceUrl: "https://b.example/2",
        sourceTitle: normalizeTitle("Senior Software Engineer Backend"),
        contentHash: "b",
        descriptionHash: "b",
        classification: "NEW",
        removedAt: null,
        companyNormalized: "bar",
      },
    );
    expect(sim.score).toBeLessThan(0.72);
  });

  it("ingest is idempotent on listing id", () => {
    const catalog = new CanonicalJobCatalog();
    const listing = {
      sourceListingId: "idem-1",
      sourceRequisitionId: "REQ-IDEM",
      title: "Test Role",
      companyName: "Acme",
      description: "Build things with TypeScript",
      sourceUrl: "https://example.com/jobs/1",
      postedAt: new Date().toISOString(),
      postedPrecision: "EXACT_TIMESTAMP" as const,
    };
    const a = catalog.ingestListing(listing, "greenhouse");
    const b = catalog.ingestListing(listing, "greenhouse");
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect([...catalog.sightings.values()].filter((s) => s.sourceListingId === "idem-1")).toHaveLength(1);
  });
});
