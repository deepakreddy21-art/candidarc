import type { JobSourcePolicy, TimestampPrecision } from "../types";

export type CompanyDiscoveryInput = {
  query: string;
  limit?: number;
};

export type CompanyDiscoveryResult = {
  companies: Array<{
    name: string;
    domain?: string;
    boardToken?: string;
    confidence: number;
  }>;
};

export type BoardFetchInput = {
  boardToken: string;
  companyName?: string;
  cursor?: string;
  limit?: number;
};

export type ListingFetchInput = {
  boardToken?: string;
  listingId: string;
  url?: string;
};

export type ListingVerificationInput = {
  listingId: string;
  url?: string;
  boardToken?: string;
};

export type JobSourceListing = {
  sourceListingId: string;
  sourceRequisitionId?: string;
  sourceCompanyIdentifier?: string;
  title: string;
  companyName: string;
  location?: string;
  locations?: string[];
  description: string;
  employmentType?: string;
  seniority?: string;
  department?: string;
  team?: string;
  applyUrl?: string;
  sourceUrl: string;
  postedAt?: string | null;
  postedPrecision: TimestampPrecision;
  updatedAt?: string | null;
  validThrough?: string | null;
  remotePolicy?: "remote" | "hybrid" | "onsite" | "unknown";
  techStack?: string[];
  compensationRaw?: string;
  demoData?: boolean;
  attribution?: string;
  raw?: Record<string, unknown>;
};

export type JobSourceResult = {
  listings: JobSourceListing[];
  nextCursor?: string | null;
  fetchedAt: string;
  demoData?: boolean;
  attribution: string;
};

export type JobVerificationResult = {
  listingId: string;
  open: boolean;
  status: "open" | "closed" | "unknown" | "error";
  checkedAt: string;
  message?: string;
};

export type ProviderHealth = {
  ok: boolean;
  enabled: boolean;
  latencyMs?: number;
  message: string;
  checkedAt: string;
};

export interface JobSourceProvider {
  id: string;
  displayName: string;
  enabled: boolean;
  policy: JobSourcePolicy;
  discoverCompanies?(input: CompanyDiscoveryInput): Promise<CompanyDiscoveryResult>;
  fetchBoard(input: BoardFetchInput): Promise<JobSourceResult>;
  fetchListing?(input: ListingFetchInput): Promise<JobSourceListing | null>;
  verifyListing?(input: ListingVerificationInput): Promise<JobVerificationResult>;
  healthCheck(): Promise<ProviderHealth>;
}

export function basePolicy(
  sourceId: string,
  overrides: Partial<JobSourcePolicy> &
    Pick<
      JobSourcePolicy,
      "accessMethod" | "termsUrl" | "licenseStatus" | "enabled" | "attributionText"
    >,
): JobSourcePolicy {
  return {
    sourceId,
    allowedFields: [
      "title",
      "company",
      "location",
      "description",
      "apply_url",
      "posted_at",
      "requisition_id",
      "listing_id",
    ],
    attributionRequired: true,
    fullDescriptionAllowed: true,
    retentionDays: 90,
    refreshLimitPerDay: 500,
    requestsPerMinute: 30,
    removalRequired: true,
    commercialUseAllowed: true,
    lastComplianceReview: "2026-09-01",
    ...overrides,
  };
}
