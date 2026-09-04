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

const FIXTURES: JobSourceListing[] = [
  {
    sourceListingId: "ashby-superhuman-sse-ai",
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
    applyUrl: "https://jobs.ashbyhq.com/superhuman/sse-ai-901",
    sourceUrl: "https://jobs.ashbyhq.com/superhuman/sse-ai-901",
    postedAt: new Date(Date.now() - 2.5 * 60 * 60_000).toISOString(),
    postedPrecision: "EXACT_TIMESTAMP",
    remotePolicy: "remote",
    techStack: ["TypeScript", "React", "RAG", "Node.js"],
    demoData: true,
    attribution: "Ashby public job postings fixture",
  },
  {
    sourceListingId: "ashby-notion-infra",
    sourceRequisitionId: "REQ-NOTION-INFRA-55",
    sourceCompanyIdentifier: "notion",
    title: "Software Engineer, Infrastructure",
    companyName: "Notion",
    location: "San Francisco, CA",
    locations: ["San Francisco, CA"],
    description:
      "Scale Notion's storage and sync infrastructure. Distributed systems, Go/Rust, and observability.",
    employmentType: "Full-time",
    seniority: "Senior",
    department: "Engineering",
    team: "Infrastructure",
    applyUrl: "https://jobs.ashbyhq.com/notion/infra-55",
    sourceUrl: "https://jobs.ashbyhq.com/notion/infra-55",
    postedAt: new Date(Date.now() - 8 * 60 * 60_000).toISOString(),
    postedPrecision: "EXACT_TIMESTAMP",
    remotePolicy: "hybrid",
    techStack: ["Go", "Rust", "Kubernetes"],
    demoData: true,
    attribution: "Ashby public job postings fixture",
  },
];

export class AshbyProvider implements JobSourceProvider {
  id = "ashby";
  displayName = "Ashby Public Job Postings API";
  enabled = true;
  policy = basePolicy("ashby", {
    accessMethod: "ats_board_api",
    termsUrl: "https://developers.ashbyhq.com/",
    licenseStatus: "public",
    enabled: true,
    attributionText: "Via Ashby public job postings",
    requestsPerMinute: 30,
    lastComplianceReview: "2026-09-01",
  });

  async fetchBoard(input: BoardFetchInput): Promise<JobSourceResult> {
    const filtered = FIXTURES.filter(
      (l) =>
        !input.boardToken ||
        input.boardToken === "demo" ||
        l.sourceCompanyIdentifier === input.boardToken,
    );
    return {
      listings: filtered,
      fetchedAt: new Date().toISOString(),
      demoData: true,
      attribution: "Ashby demo fixtures (not a live board pull)",
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
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      ok: true,
      enabled: this.enabled,
      message: "Ashby provider ready (fixtures)",
      checkedAt: new Date().toISOString(),
    };
  }
}

export const ashbyProvider = new AshbyProvider();
