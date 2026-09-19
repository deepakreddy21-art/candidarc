import { fetchPublicBoard, fetchPublicListing, shouldFetchLiveBoard } from "./public-board";
import type {
  BoardFetchInput,
  CompanyDiscoveryInput,
  JobSourceListing,
  JobSourceProvider,
  JobSourceResult,
  JobVerificationResult,
  ListingFetchInput,
  ListingVerificationInput,
  ProviderHealth,
} from "./types";
import { basePolicy } from "./types";

const FIXTURES: JobSourceListing[] = [
  {
    sourceListingId: "gh-cisco-cx-ai-swe",
    sourceRequisitionId: "REQ-CISCO-CX-AI-4421",
    sourceCompanyIdentifier: "cisco",
    title: "CX AI Software Engineer",
    companyName: "Cisco",
    location: "San Jose, CA / Remote US",
    locations: ["San Jose, CA", "Remote US"],
    description:
      "Build AI-assisted CX tooling for enterprise networking. Work with LLMs, Python, and TypeScript on production customer experience platforms.",
    employmentType: "Full-time",
    seniority: "Mid-Senior",
    department: "Customer Experience",
    team: "CX AI Platform",
    applyUrl: "https://jobs.cisco.com/jobs/ProjectDetail/CX-AI-Software-Engineer/14421",
    sourceUrl: "https://boards.greenhouse.io/cisco/jobs/14421",
    postedAt: new Date(Date.now() - 19 * 86_400_000).toISOString(),
    postedPrecision: "EXACT_TIMESTAMP",
    remotePolicy: "hybrid",
    techStack: ["Python", "TypeScript", "LLMs", "AWS"],
    demoData: true,
    attribution: "Greenhouse public board fixture",
  },
  {
    sourceListingId: "gh-superhuman-sse-ai",
    sourceRequisitionId: "REQ-SH-SSE-AI-901",
    sourceCompanyIdentifier: "superhuman",
    title: "Senior Software Engineer, AI",
    companyName: "Superhuman",
    location: "Remote US",
    locations: ["Remote US"],
    description:
      "Ship AI features for the Superhuman email client. Strong TypeScript, product sense, and experience with retrieval-augmented generation.",
    employmentType: "Full-time",
    seniority: "Senior",
    department: "Engineering",
    team: "AI",
    applyUrl: "https://jobs.ashbyhq.com/superhuman/placeholder",
    sourceUrl: "https://boards.greenhouse.io/superhuman/jobs/901",
    postedAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
    postedPrecision: "EXACT_TIMESTAMP",
    remotePolicy: "remote",
    techStack: ["TypeScript", "React", "RAG", "Node.js"],
    demoData: true,
    attribution: "Greenhouse public board fixture",
  },
];

export class GreenhouseProvider implements JobSourceProvider {
  id = "greenhouse";
  displayName = "Greenhouse Job Board API";
  enabled = true;
  policy = basePolicy("greenhouse", {
    accessMethod: "ats_board_api",
    termsUrl: "https://developers.greenhouse.io/job-board.html",
    licenseStatus: "public",
    enabled: true,
    attributionText: "Via Greenhouse Job Board API",
    requestsPerMinute: 60,
    lastComplianceReview: "2026-09-01",
  });

  async discoverCompanies(input: CompanyDiscoveryInput) {
    if (shouldFetchLiveBoard("greenhouse")) return { companies: [] }; // No global company-discovery API.
    const q = input.query.toLowerCase();
    const known = [
      { name: "Cisco", domain: "cisco.com", boardToken: "cisco", confidence: 0.95 },
      { name: "Superhuman", domain: "superhuman.com", boardToken: "superhuman", confidence: 0.9 },
    ].filter((c) => c.name.toLowerCase().includes(q) || c.boardToken.includes(q));
    return { companies: known.slice(0, input.limit ?? 10) };
  }

  async fetchBoard(input: BoardFetchInput): Promise<JobSourceResult> {
    if (shouldFetchLiveBoard("greenhouse")) return fetchPublicBoard("greenhouse", input);
    const filtered = FIXTURES.filter(
      (l) =>
        !input.boardToken ||
        l.sourceCompanyIdentifier === input.boardToken ||
        input.boardToken === "demo",
    );
    return {
      listings: filtered,
      fetchedAt: new Date().toISOString(),
      demoData: true,
      attribution: "Greenhouse demo fixtures (not a live board pull)",
    };
  }

  async fetchListing(input: ListingFetchInput): Promise<JobSourceListing | null> {
    if (shouldFetchLiveBoard("greenhouse")) return fetchPublicListing("greenhouse", input);
    return FIXTURES.find((l) => l.sourceListingId === input.listingId) ?? null;
  }

  async verifyListing(input: ListingVerificationInput): Promise<JobVerificationResult> {
    if (shouldFetchLiveBoard("greenhouse")) {
      try {
        const listing = await fetchPublicListing("greenhouse", input);
        return { listingId: input.listingId, open: Boolean(listing), status: listing ? "open" : "closed", checkedAt: new Date().toISOString() };
      } catch {
        return { listingId: input.listingId, open: false, status: "error", checkedAt: new Date().toISOString(), message: "Source verification unavailable" };
      }
    }
    const found = FIXTURES.some((l) => l.sourceListingId === input.listingId);
    return {
      listingId: input.listingId,
      open: found,
      status: found ? "open" : "unknown",
      checkedAt: new Date().toISOString(),
      message: found ? "Fixture listing present" : "Not in local fixtures",
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (shouldFetchLiveBoard("greenhouse")) return { ok: true, enabled: this.enabled, message: "Live public-board adapter configured; connectivity is checked when a board is fetched", checkedAt: new Date().toISOString() };
    return {
      ok: true,
      enabled: this.enabled,
      message: "Greenhouse provider ready (fixtures default)",
      checkedAt: new Date().toISOString(),
    };
  }
}

export const greenhouseProvider = new GreenhouseProvider();
