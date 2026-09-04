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
 * Indeed partner adapter.
 * DISABLED unless INDEED_PARTNER_CREDENTIALS is set.
 */

const DEMO_ATTRIBUTION = "Demo fixture — not a live Indeed connection";

function hasCredentials(): boolean {
  return Boolean(process.env.INDEED_PARTNER_CREDENTIALS?.trim());
}

export function getIndeedDemoListings(): JobSourceListing[] {
  return [
    {
      sourceListingId: "indeed-demo-remote-fullstack",
      sourceRequisitionId: "REQ-DEMO-FS-1",
      sourceCompanyIdentifier: "demo-co",
      title: "Full Stack Engineer",
      companyName: "Demo Co",
      location: "Remote",
      description: "Indeed-shaped demo listing for filter UI tests.",
      employmentType: "Full-time",
      seniority: "Mid",
      applyUrl: "https://www.indeed.com/viewjob?jk=demo",
      sourceUrl: "https://www.indeed.com/viewjob?jk=demo",
      postedAt: new Date(Date.now() - 4 * 60 * 60_000).toISOString(),
      postedPrecision: "RELATIVE_HOURS",
      remotePolicy: "remote",
      techStack: ["TypeScript", "Node.js"],
      demoData: true,
      attribution: DEMO_ATTRIBUTION,
    },
  ];
}

export class IndeedPartnerProvider implements JobSourceProvider {
  id = "indeed-partner";
  displayName = "Indeed (partner)";

  get enabled() {
    return hasCredentials();
  }

  get policy() {
    return basePolicy("indeed-partner", {
      accessMethod: hasCredentials() ? "partner_api" : "disabled_pending_license",
      termsUrl: "https://www.indeed.com/legal",
      licenseStatus: hasCredentials() ? "partner" : "disabled",
      enabled: hasCredentials(),
      attributionText: hasCredentials() ? "Via Indeed partner API" : DEMO_ATTRIBUTION,
      requestsPerMinute: 10,
      fullDescriptionAllowed: false,
      commercialUseAllowed: false,
      lastComplianceReview: "2026-09-01",
      notes:
        "Production access requires Indeed partner credentials (INDEED_PARTNER_CREDENTIALS).",
    });
  }

  private assertEnabled(): void {
    if (!hasCredentials()) {
      throw new AppError(
        "PROVIDER_DISABLED",
        "Indeed provider is disabled until INDEED_PARTNER_CREDENTIALS are configured.",
        403,
        { demoData: true },
      );
    }
  }

  async fetchBoard(input: BoardFetchInput): Promise<JobSourceResult> {
    void input;
    this.assertEnabled();
    throw new AppError(
      "PROVIDER_NOT_IMPLEMENTED",
      "Indeed partner fetch is not wired; credentials present but connector pending.",
      501,
    );
  }

  async fetchListing(input: ListingFetchInput): Promise<JobSourceListing | null> {
    void input;
    this.assertEnabled();
    throw new AppError("PROVIDER_NOT_IMPLEMENTED", "Indeed listing fetch not wired", 501);
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
    throw new AppError("PROVIDER_NOT_IMPLEMENTED", "Indeed verify not wired", 501);
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      ok: hasCredentials(),
      enabled: this.enabled,
      message: hasCredentials()
        ? "Credentials present; partner fetch pending"
        : "Disabled — set INDEED_PARTNER_CREDENTIALS. Demo fixtures via getIndeedDemoListings().",
      checkedAt: new Date().toISOString(),
    };
  }
}

export const indeedPartnerProvider = new IndeedPartnerProvider();
