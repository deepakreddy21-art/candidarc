import type {
  BoardFetchInput,
  JobSourceListing,
  JobSourceProvider,
  JobSourceResult,
  JobVerificationResult,
  ListingFetchInput,
  ListingVerificationInput,
  ProviderHealth,
} from "./types";
import { basePolicy } from "./types";

const DEMO_FIXTURES: JobSourceListing[] = [
  {
    sourceListingId: "usajobs-data-scientist-gs13",
    sourceRequisitionId: "DE-2026-44102",
    sourceCompanyIdentifier: "usajobs",
    title: "Data Scientist, GS-13",
    companyName: "U.S. Department of Commerce",
    location: "Washington, DC",
    locations: ["Washington, DC"],
    description:
      "Apply statistical learning to public-sector datasets. Python, R, and federal data stewardship experience preferred.",
    employmentType: "Full-time",
    seniority: "Mid-Senior",
    department: "Analytics",
    applyUrl: "https://www.usajobs.gov/job/demo-44102",
    sourceUrl: "https://www.usajobs.gov/job/demo-44102",
    postedAt: new Date(Date.now() - 36 * 60 * 60_000).toISOString(),
    postedPrecision: "DATE_ONLY",
    remotePolicy: "hybrid",
    techStack: ["Python", "R", "SQL"],
    demoData: true,
    attribution: "USAJOBS demo fixture — not a live API result",
  },
];

function hasApiKey(): boolean {
  return Boolean(process.env.USAJOBS_API_KEY?.trim());
}

export class UsaJobsProvider implements JobSourceProvider {
  id = "usajobs";
  displayName = "USAJOBS API";

  get enabled() {
    return true; // always available; live vs demo based on key
  }

  get policy() {
    return basePolicy("usajobs", {
      accessMethod: "public_api",
      termsUrl: "https://developer.usajobs.gov/API-Reference",
      licenseStatus: hasApiKey() ? "public" : "demo_fixture",
      enabled: true,
      attributionText: hasApiKey()
        ? "Via USAJOBS API"
        : "USAJOBS demo fixture — not a live API result",
      requestsPerMinute: 20,
      commercialUseAllowed: false,
      lastComplianceReview: "2026-09-01",
      notes: hasApiKey()
        ? undefined
        : "Set USAJOBS_API_KEY to enable live search; fixtures used otherwise.",
    });
  }

  async fetchBoard(input: BoardFetchInput): Promise<JobSourceResult> {
    if (hasApiKey()) {
      try {
        const keyword = input.companyName ?? input.boardToken ?? "software";
        const url = new URL("https://data.usajobs.gov/api/search");
        url.searchParams.set("Keyword", keyword);
        url.searchParams.set("ResultsPerPage", String(input.limit ?? 10));
        const res = await fetch(url.toString(), {
          headers: {
            Host: "data.usajobs.gov",
            "User-Agent": process.env.USAJOBS_USER_AGENT ?? "CandidArcRadar/0.1",
            Authorization: `Bearer ${process.env.USAJOBS_API_KEY}`, // API key header per USAJOBS docs often uses Authorization-Key
            "Authorization-Key": process.env.USAJOBS_API_KEY!,
          },
        });
        if (res.ok) {
          const data = (await res.json()) as {
            SearchResult?: {
              SearchResultItems?: Array<{
                MatchedObjectId?: string;
                MatchedObjectDescriptor?: {
                  PositionTitle?: string;
                  PositionURI?: string;
                  OrganizationName?: string;
                  PositionLocationDisplay?: string;
                  UserArea?: { Details?: { JobSummary?: string } };
                  PublicationStartDate?: string;
                };
              }>;
            };
          };
          const listings: JobSourceListing[] = (data.SearchResult?.SearchResultItems ?? []).map(
            (item) => {
              const d = item.MatchedObjectDescriptor ?? {};
              return {
                sourceListingId: `usajobs-${item.MatchedObjectId ?? d.PositionURI}`,
                sourceRequisitionId: item.MatchedObjectId,
                sourceCompanyIdentifier: "usajobs",
                title: d.PositionTitle ?? "Federal position",
                companyName: d.OrganizationName ?? "U.S. Government",
                location: d.PositionLocationDisplay,
                description: d.UserArea?.Details?.JobSummary ?? "",
                applyUrl: d.PositionURI,
                sourceUrl: d.PositionURI ?? "",
                postedAt: d.PublicationStartDate ?? null,
                postedPrecision: d.PublicationStartDate ? "DATE_ONLY" : "UNKNOWN",
                attribution: "Via USAJOBS API",
              };
            },
          );
          return {
            listings,
            fetchedAt: new Date().toISOString(),
            attribution: "Via USAJOBS API",
          };
        }
      } catch {
        // fall through
      }
    }

    return {
      listings: DEMO_FIXTURES,
      fetchedAt: new Date().toISOString(),
      demoData: true,
      attribution: "USAJOBS demo fixture — not a live API result",
    };
  }

  async fetchListing(input: ListingFetchInput): Promise<JobSourceListing | null> {
    return DEMO_FIXTURES.find((l) => l.sourceListingId === input.listingId) ?? null;
  }

  async verifyListing(input: ListingVerificationInput): Promise<JobVerificationResult> {
    const found = DEMO_FIXTURES.some((l) => l.sourceListingId === input.listingId);
    return {
      listingId: input.listingId,
      open: found || hasApiKey(),
      status: found ? "open" : "unknown",
      checkedAt: new Date().toISOString(),
      message: hasApiKey() ? "Live key present" : "Demo fixtures only",
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      ok: true,
      enabled: this.enabled,
      message: hasApiKey()
        ? "USAJOBS live key configured"
        : "USAJOBS using demo fixtures (set USAJOBS_API_KEY for live)",
      checkedAt: new Date().toISOString(),
    };
  }
}

export const usaJobsProvider = new UsaJobsProvider();
