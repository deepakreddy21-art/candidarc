import { AppError } from "../../domain/types";
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

/**
 * LinkedIn licensed / partner adapter.
 * DISABLED unless LINKEDIN_PARTNER_CREDENTIALS is set.
 * Demo fixtures are available via getLinkedInDemoListings() and are clearly labeled.
 */

const DEMO_ATTRIBUTION = "Demo fixture — not a live LinkedIn connection";

function hasCredentials(): boolean {
  return Boolean(process.env.LINKEDIN_PARTNER_CREDENTIALS?.trim());
}

/** Deterministic LinkedIn-shaped demo listings for local/demo use only. */
export function getLinkedInDemoListings(): JobSourceListing[] {
  const originally = new Date(Date.now() - 19 * 86_400_000).toISOString();
  const reposted = new Date(Date.now() - 42 * 60_000).toISOString();
  return [
    {
      sourceListingId: "li-demo-cisco-cx-ai-repost",
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
      applyUrl: "https://www.linkedin.com/jobs/view/demo-cisco-cx-ai",
      sourceUrl: "https://www.linkedin.com/jobs/view/demo-cisco-cx-ai",
      postedAt: reposted,
      postedPrecision: "EXACT_TIMESTAMP",
      updatedAt: reposted,
      remotePolicy: "hybrid",
      techStack: ["Python", "TypeScript", "LLMs", "AWS"],
      demoData: true,
      attribution: DEMO_ATTRIBUTION,
      raw: {
        originallyPostedAt: originally,
        repostIndicator: true,
        demoData: true,
      },
    },
  ];
}

export class LinkedInLicensedProvider implements JobSourceProvider {
  id = "linkedin-licensed";
  displayName = "LinkedIn (licensed / partner)";

  get enabled() {
    return hasCredentials();
  }

  get policy() {
    return basePolicy("linkedin-licensed", {
      accessMethod: hasCredentials() ? "partner_api" : "disabled_pending_license",
      termsUrl: "https://legal.linkedin.com/api-terms",
      licenseStatus: hasCredentials() ? "partner" : "disabled",
      enabled: hasCredentials(),
      attributionText: hasCredentials()
        ? "Via LinkedIn partner API"
        : DEMO_ATTRIBUTION,
      requestsPerMinute: 10,
      fullDescriptionAllowed: false,
      commercialUseAllowed: false,
      lastComplianceReview: "2026-09-01",
      notes:
        "Production access requires approved LinkedIn partnership credentials (LINKEDIN_PARTNER_CREDENTIALS).",
    });
  }

  private assertEnabled(): void {
    if (!hasCredentials()) {
      throw new AppError(
        "PROVIDER_DISABLED",
        "LinkedIn provider is disabled until LINKEDIN_PARTNER_CREDENTIALS are configured. Use getLinkedInDemoListings() for demo fixtures.",
        403,
        { demoData: true },
      );
    }
  }

  async fetchBoard(input: BoardFetchInput): Promise<JobSourceResult> {
    void input;
    this.assertEnabled();
    // Partner integration placeholder — no unauthorized scraping.
    throw new AppError(
      "PROVIDER_NOT_IMPLEMENTED",
      "LinkedIn partner fetch is not wired; credentials present but connector pending implementation.",
      501,
    );
  }

  async fetchListing(input: ListingFetchInput): Promise<JobSourceListing | null> {
    void input;
    this.assertEnabled();
    throw new AppError(
      "PROVIDER_NOT_IMPLEMENTED",
      "LinkedIn partner listing fetch is not wired.",
      501,
    );
  }

  async verifyListing(input: ListingVerificationInput): Promise<JobVerificationResult> {
    if (!hasCredentials()) {
      return {
        listingId: input.listingId,
        open: false,
        status: "error",
        checkedAt: new Date().toISOString(),
        message: "Provider disabled — no partner credentials",
      };
    }
    this.assertEnabled();
    throw new AppError("PROVIDER_NOT_IMPLEMENTED", "LinkedIn verify not wired", 501);
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      ok: hasCredentials(),
      enabled: this.enabled,
      message: hasCredentials()
        ? "Credentials present; partner fetch pending"
        : "Disabled — set LINKEDIN_PARTNER_CREDENTIALS. Demo fixtures via getLinkedInDemoListings().",
      checkedAt: new Date().toISOString(),
    };
  }
}

export const linkedInLicensedProvider = new LinkedInLicensedProvider();
