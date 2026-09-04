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
    const q = input.query.toLowerCase();
    const known = [
      { name: "Cisco", domain: "cisco.com", boardToken: "cisco", confidence: 0.95 },
      { name: "Superhuman", domain: "superhuman.com", boardToken: "superhuman", confidence: 0.9 },
    ].filter((c) => c.name.toLowerCase().includes(q) || c.boardToken.includes(q));
    return { companies: known.slice(0, input.limit ?? 10) };
  }

  async fetchBoard(input: BoardFetchInput): Promise<JobSourceResult> {
    const token = process.env.GREENHOUSE_BOARD_TOKEN ?? input.boardToken;
    // Prefer fixtures locally; optional live fetch when explicitly requested via board token + fetch available
    if (process.env.GREENHOUSE_LIVE === "1" && token) {
      try {
        const res = await fetch(
          `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
          { headers: { Accept: "application/json" } },
        );
        if (res.ok) {
          const data = (await res.json()) as {
            jobs?: Array<{
              id: number;
              title: string;
              absolute_url: string;
              location?: { name?: string };
              updated_at?: string;
              content?: string;
              requisition_id?: string;
              departments?: Array<{ name?: string }>;
            }>;
          };
          const listings: JobSourceListing[] = (data.jobs ?? []).slice(0, input.limit ?? 50).map((j) => ({
            sourceListingId: `gh-${j.id}`,
            sourceRequisitionId: j.requisition_id,
            sourceCompanyIdentifier: token,
            title: j.title,
            companyName: input.companyName ?? token,
            location: j.location?.name,
            description: j.content ?? "",
            department: j.departments?.[0]?.name,
            applyUrl: j.absolute_url,
            sourceUrl: j.absolute_url,
            postedAt: j.updated_at ?? null,
            postedPrecision: j.updated_at ? "EXACT_TIMESTAMP" : "UNKNOWN",
            attribution: "Via Greenhouse Job Board API",
          }));
          return {
            listings,
            fetchedAt: new Date().toISOString(),
            attribution: this.policy.attributionText,
          };
        }
      } catch {
        // fall through to fixtures
      }
    }

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
    return FIXTURES.find((l) => l.sourceListingId === input.listingId) ?? null;
  }

  async verifyListing(input: ListingVerificationInput): Promise<JobVerificationResult> {
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
    return {
      ok: true,
      enabled: this.enabled,
      message: "Greenhouse provider ready (fixtures default)",
      checkedAt: new Date().toISOString(),
    };
  }
}

export const greenhouseProvider = new GreenhouseProvider();
