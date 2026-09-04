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
    sourceListingId: "lever-doordash-ml-platform",
    sourceRequisitionId: "REQ-DD-MLP-220",
    sourceCompanyIdentifier: "doordash",
    title: "Software Engineer, ML Platform",
    companyName: "DoorDash",
    location: "San Francisco, CA / Remote",
    locations: ["San Francisco, CA", "Remote"],
    description:
      "Own ML platform services powering logistics and personalization. Experience with Python, Kubernetes, feature stores, and model serving.",
    employmentType: "Full-time",
    seniority: "Mid-Senior",
    department: "Engineering",
    team: "ML Platform",
    applyUrl: "https://jobs.lever.co/doordash/ml-platform-220",
    sourceUrl: "https://jobs.lever.co/doordash/ml-platform-220",
    postedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    postedPrecision: "EXACT_TIMESTAMP",
    updatedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
    remotePolicy: "hybrid",
    techStack: ["Python", "Kubernetes", "Feature Store", "PyTorch"],
    demoData: true,
    attribution: "Lever postings API fixture",
  },
  {
    sourceListingId: "lever-doordash-backend-jr",
    sourceRequisitionId: "REQ-DD-BE-118",
    sourceCompanyIdentifier: "doordash",
    title: "Software Engineer, Backend",
    companyName: "DoorDash",
    location: "Remote US",
    locations: ["Remote US"],
    description:
      "Build scalable backend services for merchant tooling. Go or Java, distributed systems fundamentals.",
    employmentType: "Full-time",
    seniority: "Junior",
    department: "Engineering",
    team: "Merchant",
    applyUrl: "https://jobs.lever.co/doordash/backend-118",
    sourceUrl: "https://jobs.lever.co/doordash/backend-118",
    postedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    postedPrecision: "EXACT_TIMESTAMP",
    remotePolicy: "remote",
    techStack: ["Go", "PostgreSQL", "Kafka"],
    demoData: true,
    attribution: "Lever postings API fixture",
  },
];

export class LeverProvider implements JobSourceProvider {
  id = "lever";
  displayName = "Lever Postings API";
  enabled = true;
  policy = basePolicy("lever", {
    accessMethod: "ats_board_api",
    termsUrl: "https://github.com/lever/postings-api",
    licenseStatus: "public",
    enabled: true,
    attributionText: "Via Lever Postings API",
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
      attribution: "Lever demo fixtures (not a live board pull)",
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
      status: found ? "open" : "closed",
      checkedAt: new Date().toISOString(),
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      ok: true,
      enabled: this.enabled,
      message: "Lever provider ready (fixtures)",
      checkedAt: new Date().toISOString(),
    };
  }
}

export const leverProvider = new LeverProvider();
