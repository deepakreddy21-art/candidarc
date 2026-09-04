import { randomUUID } from "crypto";
import { AppError } from "../domain/types";
import {
  excludeOriginallyOlderThan,
  filterByFreshness,
  formatFreshnessLabel,
  resolveFreshnessTimestamp,
} from "./freshness";
import {
  classifySightingAgainstCanonical,
  contentHash,
  descriptionHash,
  normalizeCompany,
  normalizeTitle,
} from "./repost";
import type { JobSourceListing } from "./providers/types";
import { getLinkedInDemoListings } from "./providers/linkedin-licensed";
import { listProviders } from "./providers/registry";
import type {
  CandidateProfileForMatch,
  CanonicalJob,
  Company,
  CreateApplicationFromJobPayload,
  FreshnessTypeFilter,
  JobAlert,
  JobAlertDelivery,
  JobHistoryEvent,
  JobMatch,
  JobSearchFacets,
  JobSearchQuery,
  JobSearchResult,
  JobSighting,
  JobSnapshot,
  JobSource,
  JobSourcePolicy,
  MatchBreakdown,
  SavedJob,
  SavedSearch,
  HiddenJob,
  SourceCoverage,
} from "./types";

function newPublicId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Deterministic Deepak-relevant seed profile skills for match scoring. */
export const SEED_CANDIDATE_PROFILE: CandidateProfileForMatch = {
  skills: [
    "Python",
    "TypeScript",
    "React",
    "LLMs",
    "AWS",
    "Node.js",
    "RAG",
    "Kubernetes",
    "SQL",
    "Go",
  ],
  seniority: "Senior",
  preferredLocations: ["Remote US", "San Jose, CA", "San Francisco, CA", "Remote"],
  remoteOk: true,
  yearsExperience: 8,
  careerGoals: ["AI platform", "ML infrastructure", "CX AI", "product engineering"],
  visaNeeded: false,
  targetCompensationMin: 160000,
};

export class CanonicalJobCatalog {
  companies = new Map<string, Company>();
  sources = new Map<string, JobSource>();
  policies = new Map<string, JobSourcePolicy>();
  canonicalJobs = new Map<string, CanonicalJob>();
  sightings = new Map<string, JobSighting>();
  snapshots = new Map<string, JobSnapshot>();
  historyEvents: JobHistoryEvent[] = [];

  // tenant-scoped
  savedSearches = new Map<string, SavedSearch>();
  savedJobs = new Map<string, SavedJob>();
  hiddenJobs = new Map<string, HiddenJob>();
  jobMatches = new Map<string, JobMatch>();
  alerts = new Map<string, JobAlert>();
  alertDeliveries: JobAlertDelivery[] = [];

  private listingIndex = new Map<string, string>(); // sourceId:listingId -> sightingId
  private seeded = false;
  indexedAt = nowIso();

  constructor() {
    this.registerProvidersAsSources();
  }

  private registerProvidersAsSources() {
    for (const p of listProviders()) {
      const source: JobSource = {
        id: p.id,
        publicId: `src_${p.id}`,
        providerId: p.id,
        displayName: p.displayName,
        accessMethod: p.policy.accessMethod,
        enabled: p.enabled && p.policy.enabled,
        policy: p.policy,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      this.sources.set(source.id, source);
      this.policies.set(source.id, p.policy);
    }
  }

  upsertCompany(name: string, opts?: Partial<Company>): Company {
    const normalizedName = normalizeCompany(name);
    for (const c of this.companies.values()) {
      if (c.normalizedName === normalizedName) {
        return c;
      }
    }
    const company: Company = {
      id: newPublicId("co"),
      publicId: newPublicId("company"),
      name,
      normalizedName,
      domain: opts?.domain,
      careersUrl: opts?.careersUrl,
      aliases: opts?.aliases ?? [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.companies.set(company.id, company);
    return company;
  }

  /**
   * Ingest a listing into the shared catalog.
   * Idempotent on (sourceId, sourceListingId).
   */
  ingestListing(
    listing: JobSourceListing,
    sourceId: string,
  ): { job: CanonicalJob; sighting: JobSighting; created: boolean } {
    const source = this.sources.get(sourceId);
    if (!source) {
      throw new AppError("SOURCE_NOT_FOUND", `Unknown source ${sourceId}`, 404);
    }

    const listingKey = `${sourceId}:${listing.sourceListingId}`;
    const existingSightingId = this.listingIndex.get(listingKey);
    if (existingSightingId) {
      const sighting = this.sightings.get(existingSightingId)!;
      const job = this.canonicalJobs.get(sighting.canonicalJobId)!;
      // Refresh last_seen; do not duplicate
      const descHash = descriptionHash(listing.description);
      const cHash = contentHash({
        title: listing.title,
        description: listing.description,
        location: listing.location,
        requisitionId: listing.sourceRequisitionId,
      });
      const refreshed = cHash !== sighting.contentHash;
      sighting.lastSeenAt = nowIso();
      sighting.updatedAt = nowIso();
      if (listing.postedAt) sighting.sourcePostedAt = listing.postedAt;
      if (refreshed) {
        sighting.contentHash = cHash;
        sighting.descriptionHash = descHash;
        sighting.classification = "REFRESHED";
        job.classification = "REFRESHED";
        job.updatedAt = nowIso();
        this.pushHistory(job.id, sighting.id, "refreshed", "Listing content refreshed");
        this.addSnapshot(sighting, listing);
      }
      this.sightings.set(sighting.id, sighting);
      this.canonicalJobs.set(job.id, job);
      return { job, sighting, created: false };
    }

    const company = this.upsertCompany(listing.companyName, {
      domain: listing.sourceCompanyIdentifier
        ? `${listing.sourceCompanyIdentifier}.example`
        : undefined,
    });

    const descHash = descriptionHash(listing.description);
    const cHash = contentHash({
      title: listing.title,
      description: listing.description,
      location: listing.location,
      requisitionId: listing.sourceRequisitionId,
    });

    // Find candidate canonical by requisition or strong title+company
    const priorCandidates = [...this.canonicalJobs.values()].filter((j) => {
      if (j.companyId !== company.id) return false;
      if (
        listing.sourceRequisitionId &&
        j.employerRequisitionId &&
        j.employerRequisitionId.toLowerCase() === listing.sourceRequisitionId.toLowerCase()
      ) {
        return true;
      }
      return j.normalizedTitle === normalizeTitle(listing.title);
    });

    const prior = priorCandidates[0];
    const existingForPrior = prior
      ? [...this.sightings.values()].filter((s) => s.canonicalJobId === prior.id)
      : [];

    const classification = classifySightingAgainstCanonical(
      {
        sourceListingId: listing.sourceListingId,
        sourceRequisitionId: listing.sourceRequisitionId,
        sourceUrl: listing.sourceUrl,
        sourceTitle: listing.title,
        sourceLocation: listing.location,
        contentHash: cHash,
        descriptionHash: descHash,
        classification: "UNKNOWN",
        removedAt: null,
        sourceCompanyIdentifier: listing.sourceCompanyIdentifier,
        team: listing.team,
        department: listing.department,
        companyNormalized: company.normalizedName,
      },
      existingForPrior.map((s) => ({
        ...s,
        team: prior?.team,
        department: prior?.department,
        companyNormalized: company.normalizedName,
      })),
      prior
        ? {
            status: prior.status,
            employerRequisitionId: prior.employerRequisitionId,
            team: prior.team,
            department: prior.department,
            classification: prior.classification,
            companyNormalized: company.normalizedName,
          }
        : undefined,
    );

    const ts = nowIso();
    let job: CanonicalJob;

    const shouldMerge =
      classification.mergeRecommended &&
      prior &&
      classification.classification !== "NEW" &&
      classification.classification !== "POSSIBLE_DUPLICATE";

    if (shouldMerge && prior) {
      job = prior;
      job.classification = classification.classification;
      job.classificationConfidence = classification.confidence;
      job.updatedAt = ts;
      if (classification.classification === "REPOSTED") {
        job.repostedAt = listing.postedAt ?? ts;
        job.repostCount += 1;
      }
      if (classification.classification === "REOPENED") {
        job.reopenedAt = ts;
        job.status = "open";
        job.closedAt = null;
        job.verificationState = "VERIFIED_OPEN";
      }
      if (classification.classification === "REFRESHED") {
        // keep originalPostedAt
      }
      if (listing.applyUrl && job.companyDirect === false) {
        // prefer company-direct if source is ATS
        if (["greenhouse", "lever", "ashby"].includes(sourceId)) {
          job.canonicalApplicationUrl = listing.applyUrl;
          job.companyDirect = true;
        }
      }
      job.lastVerifiedAt = ts;
      job.verificationState = "VERIFIED_OPEN";
    } else {
      const originalFromRaw =
        listing.raw && typeof listing.raw.originallyPostedAt === "string"
          ? listing.raw.originallyPostedAt
          : listing.postedAt;

      job = {
        id: newPublicId("cjob"),
        publicId: newPublicId("job"),
        companyId: company.id,
        companyName: company.name,
        title: listing.title,
        normalizedTitle: normalizeTitle(listing.title),
        department: listing.department,
        team: listing.team,
        employmentType: listing.employmentType,
        seniority: listing.seniority,
        description: listing.description,
        locations: listing.locations ?? (listing.location ? [listing.location] : []),
        remotePolicy: listing.remotePolicy ?? "unknown",
        techStack: listing.techStack ?? [],
        canonicalApplicationUrl: listing.applyUrl ?? listing.sourceUrl,
        employerRequisitionId: listing.sourceRequisitionId,
        originalPostedAt: originalFromRaw ?? null,
        originalPostedPrecision: listing.postedPrecision,
        firstDiscoveredAt: ts,
        lastVerifiedAt: ts,
        lastVerifiedPrecision: "EXACT_TIMESTAMP",
        repostedAt:
          classification.classification === "REPOSTED" ? (listing.postedAt ?? ts) : null,
        status: "open",
        verificationState: "VERIFIED_OPEN",
        classification: classification.classification === "UNKNOWN" ? "NEW" : classification.classification,
        classificationConfidence: classification.confidence,
        confidence: classification.confidence,
        primarySourceId: sourceId,
        repostCount: classification.classification === "REPOSTED" ? 1 : 0,
        companyDirect: ["greenhouse", "lever", "ashby"].includes(sourceId),
        demoData: listing.demoData,
        createdAt: ts,
        updatedAt: ts,
      };
      this.canonicalJobs.set(job.id, job);
      this.pushHistory(job.id, undefined, "discovered", `Discovered via ${source.displayName}`);
    }

    const sighting: JobSighting = {
      id: newPublicId("sight"),
      publicId: newPublicId("js"),
      canonicalJobId: job.id,
      sourceId,
      sourceListingId: listing.sourceListingId,
      sourceCompanyIdentifier: listing.sourceCompanyIdentifier,
      sourceRequisitionId: listing.sourceRequisitionId,
      sourceUrl: listing.sourceUrl,
      sourceApplyUrl: listing.applyUrl,
      sourceTitle: listing.title,
      sourceLocation: listing.location,
      sourcePostedAt: listing.postedAt ?? null,
      sourcePostedPrecision: listing.postedPrecision,
      sourceUpdatedAt: listing.updatedAt ?? null,
      firstSeenAt: ts,
      lastSeenAt: ts,
      lastVerifiedAt: ts,
      removedAt: null,
      repostedAt:
        classification.classification === "REPOSTED" ? (listing.postedAt ?? ts) : null,
      validThrough: listing.validThrough ?? null,
      contentHash: cHash,
      descriptionHash: descHash,
      classification: job.classification,
      classificationConfidence: classification.confidence,
      demoData: listing.demoData,
      attribution: listing.attribution ?? source.policy.attributionText,
      createdAt: ts,
      updatedAt: ts,
    };

    this.sightings.set(sighting.id, sighting);
    this.listingIndex.set(listingKey, sighting.id);
    this.addSnapshot(sighting, listing);
    this.pushHistory(
      job.id,
      sighting.id,
      classification.classification === "REPOSTED"
        ? "reposted"
        : classification.classification === "REFRESHED"
          ? "refreshed"
          : classification.classification === "REOPENED"
            ? "reopened"
            : "sighted",
      classification.reasons.join("; ") || `Sighted on ${source.displayName}`,
      { classification: classification.classification, confidence: classification.confidence },
    );

    this.canonicalJobs.set(job.id, job);
    this.indexedAt = ts;
    return { job, sighting, created: true };
  }

  private addSnapshot(sighting: JobSighting, listing: JobSourceListing) {
    const snap: JobSnapshot = {
      id: newPublicId("snap"),
      sightingId: sighting.id,
      retrievedAt: nowIso(),
      contentHash: sighting.contentHash,
      title: listing.title,
      description: listing.description,
      location: listing.location,
      sourcePostedAt: listing.postedAt ?? null,
      applicationUrl: listing.applyUrl,
      status: "open",
      materialChangeSummary: undefined,
    };
    this.snapshots.set(snap.id, snap);
    sighting.rawSnapshotId = snap.id;
  }

  private pushHistory(
    canonicalJobId: string,
    sightingId: string | undefined,
    type: JobHistoryEvent["type"],
    message: string,
    metadata?: Record<string, unknown>,
  ) {
    this.historyEvents.push({
      id: newPublicId("hist"),
      canonicalJobId,
      sightingId,
      type,
      occurredAt: nowIso(),
      message,
      metadata,
    });
  }

  /** Public history hook for queue workers and verification flows. */
  recordHistory(
    canonicalJobId: string,
    sightingId: string | undefined,
    type: JobHistoryEvent["type"],
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.pushHistory(canonicalJobId, sightingId, type, message, metadata);
  }

  /** Seed coherent Deepak-relevant demo catalog. */
  seedDemoCatalog(now: Date = new Date()): void {
    if (this.seeded) return;
    this.seeded = true;

    const t = now.getTime();
    const iso = (msAgo: number) => new Date(t - msAgo).toISOString();

    // Cisco careers (Greenhouse) — originally ~19 days ago
    const ciscoCareers = this.ingestListing(
      {
        sourceListingId: "gh-cisco-cx-ai-swe",
        sourceRequisitionId: "REQ-CISCO-CX-AI-4421",
        sourceCompanyIdentifier: "cisco",
        title: "CX AI Software Engineer",
        companyName: "Cisco",
        location: "San Jose, CA / Remote US",
        locations: ["San Jose, CA", "Remote US"],
        description:
          "Build AI-assisted CX tooling for enterprise networking. Work with LLMs, Python, and TypeScript on production customer experience platforms. Collaborate with CX product and support engineering.",
        employmentType: "Full-time",
        seniority: "Mid-Senior",
        department: "Customer Experience",
        team: "CX AI Platform",
        applyUrl: "https://jobs.cisco.com/jobs/ProjectDetail/CX-AI-Software-Engineer/14421",
        sourceUrl: "https://boards.greenhouse.io/cisco/jobs/14421",
        postedAt: iso(19 * 86_400_000),
        postedPrecision: "EXACT_TIMESTAMP",
        remotePolicy: "hybrid",
        techStack: ["Python", "TypeScript", "LLMs", "AWS"],
        demoData: true,
        attribution: "Via Greenhouse Job Board API (demo fixture)",
      },
      "greenhouse",
    );

    // LinkedIn-shaped demo sighting — reposted ~42 minutes ago
    const liListings = getLinkedInDemoListings().map((l) => ({
      ...l,
      postedAt: iso(42 * 60_000),
      raw: {
        ...(l.raw ?? {}),
        originallyPostedAt: iso(19 * 86_400_000),
        demoData: true,
      },
    }));

    // Register a demo-only linkedin source for fixtures (policy remains disabled for live)
    if (!this.sources.has("linkedin-demo")) {
      const policy: JobSourcePolicy = {
        ...listProviders().find((p) => p.id === "linkedin-licensed")!.policy,
        sourceId: "linkedin-demo",
        licenseStatus: "demo_fixture",
        enabled: false,
        attributionText: "Demo fixture — not a live LinkedIn connection",
      };
      this.sources.set("linkedin-demo", {
        id: "linkedin-demo",
        publicId: "src_linkedin_demo",
        providerId: "linkedin-licensed",
        displayName: "LinkedIn (demo fixtures)",
        accessMethod: "disabled_pending_license",
        enabled: false,
        policy,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      this.policies.set("linkedin-demo", policy);
    }

    for (const listing of liListings) {
      this.ingestListing(listing, "linkedin-demo");
    }

    // Verify on careers 6 min ago
    const ciscoJob = this.canonicalJobs.get(ciscoCareers.job.id)!;
    ciscoJob.lastVerifiedAt = iso(6 * 60_000);
    ciscoJob.verificationState = "VERIFIED_OPEN";
    ciscoJob.classification = "REPOSTED";
    ciscoJob.repostCount = Math.max(1, ciscoJob.repostCount);
    ciscoJob.repostedAt = iso(42 * 60_000);
    ciscoJob.originalPostedAt = iso(19 * 86_400_000);
    ciscoJob.updatedAt = nowIso();
    this.canonicalJobs.set(ciscoJob.id, ciscoJob);
    this.pushHistory(
      ciscoJob.id,
      ciscoCareers.sighting.id,
      "verified",
      "Verified open on company careers 6 minutes ago",
    );

    // Superhuman — NEW, discovered recently (Ashby)
    this.ingestListing(
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
        postedAt: iso(2.5 * 60 * 60_000),
        postedPrecision: "EXACT_TIMESTAMP",
        remotePolicy: "remote",
        techStack: ["TypeScript", "React", "RAG", "Node.js"],
        demoData: true,
        attribution: "Ashby public job postings fixture",
      },
      "ashby",
    );

    // DoorDash ML Platform — REFRESHED
    const dd = this.ingestListing(
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
        postedAt: iso(5 * 86_400_000),
        postedPrecision: "EXACT_TIMESTAMP",
        remotePolicy: "hybrid",
        techStack: ["Python", "Kubernetes", "Feature Store", "PyTorch"],
        demoData: true,
        attribution: "Lever postings API fixture",
      },
      "lever",
    );

    // Second ingest with same listing ID + changed description → REFRESHED
    this.ingestListing(
      {
        sourceListingId: "lever-doordash-ml-platform",
        sourceRequisitionId: "REQ-DD-MLP-220",
        sourceCompanyIdentifier: "doordash",
        title: "Software Engineer, ML Platform",
        companyName: "DoorDash",
        location: "San Francisco, CA / Remote",
        locations: ["San Francisco, CA", "Remote"],
        description:
          "Own ML platform services powering logistics and personalization. Experience with Python, Kubernetes, feature stores, and model serving. Updated: also own online feature freshness SLAs.",
        employmentType: "Full-time",
        seniority: "Mid-Senior",
        department: "Engineering",
        team: "ML Platform",
        applyUrl: "https://jobs.lever.co/doordash/ml-platform-220",
        sourceUrl: "https://jobs.lever.co/doordash/ml-platform-220",
        postedAt: iso(5 * 86_400_000),
        updatedAt: iso(45 * 60_000),
        postedPrecision: "EXACT_TIMESTAMP",
        remotePolicy: "hybrid",
        techStack: ["Python", "Kubernetes", "Feature Store", "PyTorch"],
        demoData: true,
        attribution: "Lever postings API fixture",
      },
      "lever",
    );
    const ddJob = this.canonicalJobs.get(dd.job.id)!;
    ddJob.classification = "REFRESHED";
    this.canonicalJobs.set(ddJob.id, ddJob);

    // Extra roles for filters
    this.ingestListing(
      {
        sourceListingId: "lever-doordash-backend-jr",
        sourceRequisitionId: "REQ-DD-BE-118",
        sourceCompanyIdentifier: "doordash",
        title: "Software Engineer, Backend",
        companyName: "DoorDash",
        location: "Remote US",
        locations: ["Remote US"],
        description: "Build scalable backend services for merchant tooling. Go or Java.",
        employmentType: "Full-time",
        seniority: "Junior",
        department: "Engineering",
        team: "Merchant",
        applyUrl: "https://jobs.lever.co/doordash/backend-118",
        sourceUrl: "https://jobs.lever.co/doordash/backend-118",
        postedAt: iso(2 * 86_400_000),
        postedPrecision: "EXACT_TIMESTAMP",
        remotePolicy: "remote",
        techStack: ["Go", "PostgreSQL", "Kafka"],
        demoData: true,
        attribution: "Lever postings API fixture",
      },
      "lever",
    );

    this.ingestListing(
      {
        sourceListingId: "ashby-notion-infra",
        sourceRequisitionId: "REQ-NOTION-INFRA-55",
        sourceCompanyIdentifier: "notion",
        title: "Software Engineer, Infrastructure",
        companyName: "Notion",
        location: "San Francisco, CA",
        locations: ["San Francisco, CA"],
        description: "Scale Notion's storage and sync infrastructure. Distributed systems, Go/Rust.",
        employmentType: "Full-time",
        seniority: "Senior",
        department: "Engineering",
        team: "Infrastructure",
        applyUrl: "https://jobs.ashbyhq.com/notion/infra-55",
        sourceUrl: "https://jobs.ashbyhq.com/notion/infra-55",
        postedAt: iso(8 * 60 * 60_000),
        postedPrecision: "EXACT_TIMESTAMP",
        remotePolicy: "hybrid",
        techStack: ["Go", "Rust", "Kubernetes"],
        demoData: true,
        attribution: "Ashby public job postings fixture",
      },
      "ashby",
    );

    this.ingestListing(
      {
        sourceListingId: "usajobs-data-scientist-gs13",
        sourceRequisitionId: "DE-2026-44102",
        sourceCompanyIdentifier: "usajobs",
        title: "Data Scientist, GS-13",
        companyName: "U.S. Department of Commerce",
        location: "Washington, DC",
        locations: ["Washington, DC"],
        description: "Apply statistical learning to public-sector datasets. Python, R, SQL.",
        employmentType: "Full-time",
        seniority: "Mid-Senior",
        applyUrl: "https://www.usajobs.gov/job/demo-44102",
        sourceUrl: "https://www.usajobs.gov/job/demo-44102",
        postedAt: iso(36 * 60 * 60_000),
        postedPrecision: "DATE_ONLY",
        remotePolicy: "hybrid",
        techStack: ["Python", "R", "SQL"],
        demoData: true,
        attribution: "USAJOBS demo fixture — not a live API result",
      },
      "usajobs",
    );

    this.indexedAt = nowIso();
  }

  getJob(publicId: string): CanonicalJob | null {
    for (const j of this.canonicalJobs.values()) {
      if (j.publicId === publicId || j.id === publicId) return j;
    }
    return null;
  }

  getHistory(publicId: string): JobHistoryEvent[] {
    const job = this.getJob(publicId);
    if (!job) return [];
    return this.historyEvents
      .filter((e) => e.canonicalJobId === job.id)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  getSightingsForJob(jobId: string): JobSighting[] {
    return [...this.sightings.values()]
      .filter((s) => s.canonicalJobId === jobId)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }

  private matchesFreshnessType(job: CanonicalJob, filter?: FreshnessTypeFilter): boolean {
    if (!filter) return true;
    switch (filter) {
      case "genuinely_new":
        return job.classification === "NEW" && job.repostCount === 0;
      case "new_or_reposted":
        return job.classification === "NEW" || job.classification === "REPOSTED";
      case "reposted_only":
        return job.classification === "REPOSTED";
      case "refreshed":
        return job.classification === "REFRESHED";
      case "reopened":
        return job.classification === "REOPENED";
      default:
        return true;
    }
  }

  search(
    query: JobSearchQuery,
    opts?: { tenantId?: string; userId?: string; candidateProfile?: CandidateProfileForMatch },
  ): JobSearchResult {
    const started = Date.now();
    const profile = opts?.candidateProfile ?? {
      skills: [],
      remoteOk: true,
    };
    let jobs = [...this.canonicalJobs.values()].filter((j) => j.status === "open");

    // Hidden filter
    if (opts?.tenantId && opts?.userId) {
      const hiddenIds = new Set(
        [...this.hiddenJobs.values()]
          .filter((h) => h.tenantId === opts.tenantId && h.userId === opts.userId)
          .map((h) => h.canonicalJobId),
      );
      jobs = jobs.filter((j) => !hiddenIds.has(j.id));
    }

    if (query.keywords?.trim()) {
      const tokens = query.keywords.toLowerCase().split(/\s+/).filter(Boolean);
      jobs = jobs.filter((j) => {
        const hay = `${j.title} ${j.companyName} ${j.description} ${j.techStack.join(" ")}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      });
    }

    if (query.company?.trim()) {
      const c = query.company.toLowerCase();
      jobs = jobs.filter((j) => j.companyName.toLowerCase().includes(c));
    }

    if (query.location?.trim()) {
      const loc = query.location.toLowerCase();
      jobs = jobs.filter((j) => j.locations.some((l) => l.toLowerCase().includes(loc)));
    }

    if (query.remote === true) {
      jobs = jobs.filter((j) => j.remotePolicy === "remote" || j.remotePolicy === "hybrid");
    } else if (query.remote === false) {
      jobs = jobs.filter((j) => j.remotePolicy === "onsite");
    }

    if (query.employmentType) {
      const et = query.employmentType.toLowerCase();
      jobs = jobs.filter((j) => (j.employmentType ?? "").toLowerCase().includes(et));
    }

    if (query.seniority) {
      const s = query.seniority.toLowerCase();
      jobs = jobs.filter((j) => (j.seniority ?? "").toLowerCase().includes(s));
    }

    jobs = jobs.filter((j) => this.matchesFreshnessType(j, query.freshnessType));

    const basis = query.freshnessBasis ?? "discovered";
    if (query.freshnessPreset || query.freshnessCustomStart || query.freshnessCustomEnd) {
      jobs = filterByFreshness(
        jobs.map((j) => {
          const primary = this.getSightingsForJob(j.id)[0];
          return { ...j, sourcePostedAt: primary?.sourcePostedAt ?? j.originalPostedAt };
        }),
        {
          basis,
          preset: query.freshnessPreset,
          customStart: query.freshnessCustomStart,
          customEnd: query.freshnessCustomEnd,
          timezone: query.timezone,
        },
      );
    }

    if (query.excludeOriginalOlderThanDays != null) {
      jobs = excludeOriginallyOlderThan(jobs, query.excludeOriginalOlderThanDays);
    }

    if (query.maxRepostCount != null) {
      jobs = jobs.filter((j) => j.repostCount <= query.maxRepostCount!);
    }

    if (query.requireKnownOriginalDate) {
      jobs = jobs.filter((j) => Boolean(j.originalPostedAt));
    }

    if (query.companyDirectOnly) {
      jobs = jobs.filter((j) => j.companyDirect);
    }

    if (query.verifiedOpenOnly) {
      jobs = jobs.filter(
        (j) => j.verificationState === "VERIFIED_OPEN" || j.verificationState === "LIKELY_OPEN",
      );
    }

    // Match scores
    const withMatch = jobs.map((job) => {
      const breakdown = this.matchJob(job, profile);
      return { job, breakdown };
    });

    let filtered = withMatch;
    if (query.matchScoreMin != null) {
      filtered = withMatch.filter((x) => x.breakdown.overall >= query.matchScoreMin!);
    }

    const sort = query.sort ?? "freshness";
    const dir = query.sortDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sort) {
        case "match":
          cmp = a.breakdown.overall - b.breakdown.overall;
          break;
        case "company":
          cmp = a.job.companyName.localeCompare(b.job.companyName);
          break;
        case "title":
          cmp = a.job.title.localeCompare(b.job.title);
          break;
        case "original": {
          const ta = a.job.originalPostedAt ? new Date(a.job.originalPostedAt).getTime() : 0;
          const tb = b.job.originalPostedAt ? new Date(b.job.originalPostedAt).getTime() : 0;
          cmp = ta - tb;
          break;
        }
        case "discovered": {
          cmp =
            new Date(a.job.firstDiscoveredAt).getTime() -
            new Date(b.job.firstDiscoveredAt).getTime();
          break;
        }
        case "freshness":
        default: {
          const ta =
            resolveFreshnessTimestamp(
              {
                ...a.job,
                sourcePostedAt: this.getSightingsForJob(a.job.id)[0]?.sourcePostedAt,
              },
              basis,
            )?.getTime() ?? 0;
          const tb =
            resolveFreshnessTimestamp(
              {
                ...b.job,
                sourcePostedAt: this.getSightingsForJob(b.job.id)[0]?.sourcePostedAt,
              },
              basis,
            )?.getTime() ?? 0;
          cmp = ta - tb;
          break;
        }
      }
      return cmp * dir;
    });

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    let offset = 0;
    if (query.cursor) {
      const parsed = Number(Buffer.from(query.cursor, "base64url").toString("utf8"));
      if (!Number.isNaN(parsed)) offset = parsed;
    }
    const page = filtered.slice(offset, offset + limit);
    const nextOffset = offset + limit;
    const nextCursor =
      nextOffset < filtered.length
        ? Buffer.from(String(nextOffset), "utf8").toString("base64url")
        : null;

    const savedSet = new Set<string>();
    if (opts?.tenantId && opts?.userId) {
      for (const s of this.savedJobs.values()) {
        if (s.tenantId === opts.tenantId && s.userId === opts.userId) {
          savedSet.add(s.canonicalJobId);
        }
      }
    }

    const results = page.map(({ job, breakdown }) => {
      const sightings = this.getSightingsForJob(job.id);
      const primary = sightings[0];
      const ts = resolveFreshnessTimestamp(
        { ...job, sourcePostedAt: primary?.sourcePostedAt },
        basis,
      );
      const precision =
        basis === "originally_posted" || basis === "source_posted"
          ? job.originalPostedPrecision
          : "EXACT_TIMESTAMP";
      const freshnessLabel = formatFreshnessLabel(ts, precision, new Date(), basis);
      const originalAgeLabel = job.originalPostedAt
        ? formatFreshnessLabel(
            new Date(job.originalPostedAt),
            job.originalPostedPrecision,
            new Date(),
            "originally_posted",
          )
        : undefined;
      const attribution = [
        ...new Set(
          sightings
            .map((s) => s.attribution)
            .filter((a): a is string => Boolean(a)),
        ),
      ];
      return {
        job,
        match: breakdown,
        saved: savedSet.has(job.id),
        hidden: false,
        primarySighting: primary,
        freshnessLabel,
        originalAgeLabel,
        attribution,
      };
    });

    const facets = this.buildFacets(filtered.map((x) => x.job));

    return {
      results,
      nextCursor,
      totalEstimate: filtered.length,
      appliedFilters: query,
      facets,
      executionMs: Date.now() - started,
      indexedAt: this.indexedAt,
    };
  }

  private buildFacets(jobs: CanonicalJob[]): JobSearchFacets {
    const count = (vals: string[]) => {
      const m = new Map<string, number>();
      for (const v of vals) m.set(v, (m.get(v) ?? 0) + 1);
      return [...m.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
    };
    return {
      companies: count(jobs.map((j) => j.companyName)),
      locations: count(jobs.flatMap((j) => j.locations)),
      seniority: count(jobs.map((j) => j.seniority ?? "Unknown")),
      classifications: count(jobs.map((j) => j.classification)),
      sources: count(jobs.map((j) => j.primarySourceId)),
    };
  }

  matchJob(job: CanonicalJob, candidateProfile: CandidateProfileForMatch): MatchBreakdown {
    const profileSkills = candidateProfile.skills.map((s) => s.toLowerCase());
    const jobSkills = job.techStack.map((s) => s.toLowerCase());
    const matchedSkills = job.techStack.filter((s) =>
      profileSkills.includes(s.toLowerCase()),
    );
    const missingSkills = job.techStack.filter(
      (s) => !profileSkills.includes(s.toLowerCase()),
    );
    const skills =
      jobSkills.length === 0
        ? 55
        : Math.round((matchedSkills.length / Math.max(jobSkills.length, 1)) * 100);

    const desc = job.description.toLowerCase();
    const evidenceHits = candidateProfile.skills.filter((s) =>
      desc.includes(s.toLowerCase()),
    ).length;
    const evidence = Math.min(100, 40 + evidenceHits * 8);

    const expYears = candidateProfile.yearsExperience ?? 0;
    const experience = Math.min(100, Math.round(40 + Math.min(expYears, 12) * 5));

    const senProfile = (candidateProfile.seniority ?? "").toLowerCase();
    const senJob = (job.seniority ?? "").toLowerCase();
    let seniority = 60;
    if (senProfile && senJob) {
      if (senJob.includes(senProfile) || senProfile.includes("senior") && senJob.includes("senior")) {
        seniority = 90;
      } else if (senJob.includes("junior") && senProfile.includes("senior")) {
        seniority = 50;
      } else {
        seniority = 70;
      }
    }

    const locs = candidateProfile.preferredLocations?.map((l) => l.toLowerCase()) ?? [];
    let location = 50;
    if (job.remotePolicy === "remote" && candidateProfile.remoteOk) location = 95;
    else if (job.locations.some((l) => locs.some((p) => l.toLowerCase().includes(p)))) {
      location = 88;
    } else if (candidateProfile.remoteOk && job.remotePolicy === "hybrid") {
      location = 75;
    }

    const compensation = 70; // seed: no structured pay for most fixtures
    const eligibility =
      candidateProfile.visaNeeded && job.visaSponsorship === false ? 20 : 85;

    const goals = candidateProfile.careerGoals ?? [];
    const careerHits = goals.filter(
      (g) =>
        job.title.toLowerCase().includes(g.toLowerCase()) ||
        job.description.toLowerCase().includes(g.toLowerCase()) ||
        (job.team ?? "").toLowerCase().includes(g.toLowerCase()),
    ).length;
    const career = Math.min(100, 45 + careerHits * 15);

    const overall = Math.round(
      skills * 0.25 +
        evidence * 0.15 +
        experience * 0.1 +
        seniority * 0.1 +
        location * 0.15 +
        compensation * 0.05 +
        eligibility * 0.1 +
        career * 0.1,
    );

    const explanation: string[] = [];
    if (matchedSkills.length) {
      explanation.push(`Matched skills: ${matchedSkills.join(", ")}`);
    }
    if (missingSkills.length) {
      explanation.push(`Gaps: ${missingSkills.join(", ")}`);
    }
    if (job.classification === "REPOSTED") {
      explanation.push("This listing is a repost of an earlier opening");
    }
    if (job.remotePolicy === "remote") explanation.push("Remote-friendly role");

    return {
      overall,
      skills,
      evidence,
      experience,
      seniority,
      location,
      compensation,
      eligibility,
      career,
      explanation,
      matchedSkills,
      missingSkills,
    };
  }

  // --- user interactions ---

  private tenantKey(tenantId: string, userId: string, jobId: string) {
    return `${tenantId}:${userId}:${jobId}`;
  }

  saveJob(tenantId: string, userId: string, jobPublicId: string): SavedJob {
    const job = this.getJob(jobPublicId);
    if (!job) throw new AppError("JOB_NOT_FOUND", "Job not found", 404);
    const key = this.tenantKey(tenantId, userId, job.id);
    const existing = this.savedJobs.get(key);
    if (existing) return existing;
    const row: SavedJob = {
      id: newPublicId("saved"),
      tenantId,
      userId,
      canonicalJobId: job.id,
      createdAt: nowIso(),
    };
    this.savedJobs.set(key, row);
    return row;
  }

  unsaveJob(tenantId: string, userId: string, jobPublicId: string): void {
    const job = this.getJob(jobPublicId);
    if (!job) throw new AppError("JOB_NOT_FOUND", "Job not found", 404);
    this.savedJobs.delete(this.tenantKey(tenantId, userId, job.id));
  }

  hideJob(tenantId: string, userId: string, jobPublicId: string): HiddenJob {
    const job = this.getJob(jobPublicId);
    if (!job) throw new AppError("JOB_NOT_FOUND", "Job not found", 404);
    const key = this.tenantKey(tenantId, userId, job.id);
    const existing = this.hiddenJobs.get(key);
    if (existing) return existing;
    const row: HiddenJob = {
      id: newPublicId("hidden"),
      tenantId,
      userId,
      canonicalJobId: job.id,
      createdAt: nowIso(),
    };
    this.hiddenJobs.set(key, row);
    return row;
  }

  unhideJob(tenantId: string, userId: string, jobPublicId: string): void {
    const job = this.getJob(jobPublicId);
    if (!job) throw new AppError("JOB_NOT_FOUND", "Job not found", 404);
    this.hiddenJobs.delete(this.tenantKey(tenantId, userId, job.id));
  }

  listSavedSearches(tenantId: string, userId: string): SavedSearch[] {
    return [...this.savedSearches.values()].filter(
      (s) => s.tenantId === tenantId && s.userId === userId,
    );
  }

  createSavedSearch(
    tenantId: string,
    userId: string,
    input: { name: string; query: JobSearchQuery; alertEnabled?: boolean },
  ): SavedSearch {
    const row: SavedSearch = {
      id: newPublicId("ss"),
      publicId: newPublicId("savedsearch"),
      tenantId,
      userId,
      name: input.name,
      query: input.query,
      alertEnabled: Boolean(input.alertEnabled),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.savedSearches.set(row.id, row);
    return row;
  }

  updateSavedSearch(
    tenantId: string,
    userId: string,
    id: string,
    patch: Partial<Pick<SavedSearch, "name" | "query" | "alertEnabled">>,
  ): SavedSearch {
    const row = [...this.savedSearches.values()].find(
      (s) =>
        (s.id === id || s.publicId === id) && s.tenantId === tenantId && s.userId === userId,
    );
    if (!row) throw new AppError("SAVED_SEARCH_NOT_FOUND", "Saved search not found", 404);
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.query !== undefined) row.query = patch.query;
    if (patch.alertEnabled !== undefined) row.alertEnabled = patch.alertEnabled;
    row.updatedAt = nowIso();
    this.savedSearches.set(row.id, row);
    return row;
  }

  deleteSavedSearch(tenantId: string, userId: string, id: string): void {
    const row = [...this.savedSearches.values()].find(
      (s) =>
        (s.id === id || s.publicId === id) && s.tenantId === tenantId && s.userId === userId,
    );
    if (!row) throw new AppError("SAVED_SEARCH_NOT_FOUND", "Saved search not found", 404);
    this.savedSearches.delete(row.id);
  }

  listAlerts(tenantId: string, userId: string): JobAlert[] {
    return [...this.alerts.values()].filter(
      (a) => a.tenantId === tenantId && a.userId === userId,
    );
  }

  createAlert(
    tenantId: string,
    userId: string,
    input: {
      name: string;
      query: JobSearchQuery;
      cadence?: JobAlert["cadence"];
      includeReposts?: boolean;
      includeRefreshes?: boolean;
      savedSearchId?: string;
    },
  ): JobAlert {
    const row: JobAlert = {
      id: newPublicId("alert"),
      publicId: newPublicId("jobalert"),
      tenantId,
      userId,
      name: input.name,
      savedSearchId: input.savedSearchId,
      query: input.query,
      cadence: input.cadence ?? "immediate",
      enabled: true,
      includeReposts: input.includeReposts ?? true,
      includeRefreshes: input.includeRefreshes ?? false,
      lastEvaluatedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.alerts.set(row.id, row);
    return row;
  }

  updateAlert(
    tenantId: string,
    userId: string,
    id: string,
    patch: Partial<
      Pick<
        JobAlert,
        "name" | "query" | "cadence" | "enabled" | "includeReposts" | "includeRefreshes"
      >
    >,
  ): JobAlert {
    const row = [...this.alerts.values()].find(
      (a) =>
        (a.id === id || a.publicId === id) && a.tenantId === tenantId && a.userId === userId,
    );
    if (!row) throw new AppError("ALERT_NOT_FOUND", "Alert not found", 404);
    Object.assign(row, patch, { updatedAt: nowIso() });
    this.alerts.set(row.id, row);
    return row;
  }

  deleteAlert(tenantId: string, userId: string, id: string): void {
    const row = [...this.alerts.values()].find(
      (a) =>
        (a.id === id || a.publicId === id) && a.tenantId === tenantId && a.userId === userId,
    );
    if (!row) throw new AppError("ALERT_NOT_FOUND", "Alert not found", 404);
    this.alerts.delete(row.id);
  }

  /**
   * Evaluate alerts for a job. Dedupes deliveries.
   * Refresh does not create a "new job" alert unless includeRefreshes.
   * Repost alerts include original age.
   */
  evaluateAlertsForJob(job: CanonicalJob): JobAlertDelivery[] {
    const created: JobAlertDelivery[] = [];
    for (const alert of this.alerts.values()) {
      if (!alert.enabled || alert.cadence === "paused") continue;

      if (job.classification === "REFRESHED" && !alert.includeRefreshes) continue;
      if (job.classification === "REPOSTED" && !alert.includeReposts) continue;
      if (job.classification === "UNCHANGED") continue;

      const result = this.search(alert.query, {
        tenantId: alert.tenantId,
        userId: alert.userId,
      });
      const hit = result.results.find((r) => r.job.id === job.id);
      if (!hit) continue;

      const eventKey =
        job.classification === "REFRESHED"
          ? `refresh:${job.id}:${job.updatedAt}`
          : job.classification === "REPOSTED"
            ? `repost:${job.id}:${job.repostedAt ?? job.updatedAt}`
            : `new:${job.id}`;
      const dedupeKey = `${alert.id}:${eventKey}`;
      if (this.alertDeliveries.some((d) => d.dedupeKey === dedupeKey)) continue;

      let message = `New match: ${job.title} at ${job.companyName}`;
      if (job.classification === "REPOSTED") {
        const age = job.originalPostedAt
          ? formatFreshnessLabel(
              new Date(job.originalPostedAt),
              job.originalPostedPrecision,
              new Date(),
              "originally_posted",
            )
          : "original age unknown";
        message = `Repost: ${job.title} at ${job.companyName} (${age.replace(/^Posted /, "originally ")})`;
      } else if (job.classification === "REFRESHED") {
        message = `Listing refreshed: ${job.title} at ${job.companyName}`;
      } else if (job.classification === "REOPENED") {
        message = `Reopened: ${job.title} at ${job.companyName}`;
      }

      const delivery: JobAlertDelivery = {
        id: newPublicId("delivery"),
        alertId: alert.id,
        tenantId: alert.tenantId,
        userId: alert.userId,
        canonicalJobId: job.id,
        classification: job.classification,
        deliveredAt: nowIso(),
        channel: "in_app",
        message,
        dedupeKey,
      };
      this.alertDeliveries.push(delivery);
      created.push(delivery);
      alert.lastEvaluatedAt = nowIso();
      this.alerts.set(alert.id, alert);
    }
    return created;
  }

  createApplicationFromJob(
    jobPublicId: string,
    opts?: { sightingId?: string },
  ): CreateApplicationFromJobPayload {
    const job = this.getJob(jobPublicId);
    if (!job) throw new AppError("JOB_NOT_FOUND", "Job not found", 404);
    const sightings = this.getSightingsForJob(job.id);
    const sighting =
      (opts?.sightingId
        ? sightings.find((s) => s.id === opts.sightingId || s.publicId === opts.sightingId)
        : undefined) ?? sightings.find((s) => ["greenhouse", "lever", "ashby"].includes(s.sourceId)) ??
      sightings[0];

    return {
      company: job.companyName,
      role: job.title,
      location: job.locations[0],
      employmentType: job.employmentType,
      jobUrl: job.canonicalApplicationUrl ?? sighting?.sourceApplyUrl ?? sighting?.sourceUrl,
      jobDescriptionText: job.description,
      roleFamily: job.department ?? job.team ?? "Engineering",
      canonicalJobId: job.publicId,
      sightingId: sighting?.publicId,
      researchDepth: "standard",
      idempotencyKey: `radar-app:${job.publicId}:${sighting?.publicId ?? "none"}`,
    };
  }

  coverage(): SourceCoverage[] {
    const bySource = new Map<string, number>();
    for (const j of this.canonicalJobs.values()) {
      if (j.status !== "open") continue;
      bySource.set(j.primarySourceId, (bySource.get(j.primarySourceId) ?? 0) + 1);
    }
    return [...this.sources.values()].map((s) => ({
      sourceId: s.id,
      providerId: s.providerId,
      displayName: s.displayName,
      enabled: s.enabled,
      licenseStatus: s.policy.licenseStatus,
      accessMethod: s.accessMethod,
      companyCount: new Set(
        [...this.sightings.values()]
          .filter((x) => x.sourceId === s.id)
          .map((x) => x.sourceCompanyIdentifier ?? ""),
      ).size,
      openJobCount: bySource.get(s.id) ?? 0,
      lastIngestedAt: [...this.sightings.values()]
        .filter((x) => x.sourceId === s.id)
        .map((x) => x.lastSeenAt)
        .sort()
        .at(-1) ?? null,
      attribution: s.policy.attributionText,
      demoOnly:
        s.policy.licenseStatus === "demo_fixture" ||
        s.id === "linkedin-demo" ||
        !s.enabled,
    }));
  }
}

let sharedCatalog: CanonicalJobCatalog | null = null;

/**
 * Get the shared catalog instance.
 * PRODUCTION: Does NOT auto-seed. Catalog will be empty until jobs are ingested.
 * DEMO: Seeds demo catalog only when APP_MODE=demo.
 */
export function getSharedCatalog(): CanonicalJobCatalog {
  if (!sharedCatalog) {
    sharedCatalog = new CanonicalJobCatalog();
    // NOTE: Seeding is now handled explicitly in bootstrap.ts based on APP_MODE
    // Do NOT call seedDemoCatalog() unconditionally here
  }
  return sharedCatalog;
}

/**
 * Seed demo catalog data. Call this explicitly when APP_MODE=demo.
 * Never call in production.
 */
export function seedDemoCatalog(): void {
  getSharedCatalog().seedDemoCatalog();
}

export function resetSharedCatalogForTests(): void {
  sharedCatalog = null;
}
