import { formatFreshnessLabel, resolveFreshnessTimestamp } from "./freshness";
import type { CanonicalJobCatalog } from "./catalog";
import type {
  CanonicalJob,
  JobHistoryEvent,
  JobSearchResult,
  JobSearchResultItem,
  JobSighting,
  MatchBreakdown,
  SourceCoverage,
} from "./types";

/** UI-facing Radar job card / detail shape (matches src/types/radar.ts). */
export type RadarJobView = {
  id: string;
  publicId: string;
  title: string;
  company: string;
  companyMark: string;
  location: string;
  remotePolicy: "remote" | "hybrid" | "onsite" | "unspecified";
  employmentType: string;
  seniority?: string;
  department?: string;
  compensation?: string;
  technologies: string[];
  classification: CanonicalJob["classification"];
  verificationState: CanonicalJob["verificationState"];
  companyDirect: boolean;
  timestampEstimated: boolean;
  possibleDuplicate: boolean;
  originalPostedAt?: string;
  originalPostedPrecision: CanonicalJob["originalPostedPrecision"];
  sourcePostedAt?: string;
  repostedAt?: string;
  firstSeenAt: string;
  lastVerifiedAt?: string;
  repostCount: number;
  matchScore: number;
  evidenceCoverage: number;
  matchBreakdown: MatchBreakdown;
  primarySource: {
    id: string;
    name: string;
    kind: string;
    companyDirect: boolean;
    demoData?: boolean;
    attribution?: string;
  };
  sources: Array<{
    id: string;
    name: string;
    kind: string;
    companyDirect: boolean;
    demoData?: boolean;
    attribution?: string;
  }>;
  sightings: Array<{
    id: string;
    sourceId: string;
    sourceName: string;
    postedAt?: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
    demoData?: boolean;
    attribution?: string;
  }>;
  applicationUrl?: string;
  companyCareersUrl?: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  preferred: string[];
  hiringSignals: string[];
  freshnessExplanation: string;
  repostExplanation?: string;
  saved?: boolean;
  hidden?: boolean;
  demoData?: boolean;
};

function sourceKind(sourceId: string): string {
  if (sourceId.includes("linkedin")) return "demo_fixture";
  if (["greenhouse", "lever", "ashby"].includes(sourceId)) return "ats";
  if (sourceId === "usajobs") return "public_api";
  return "other";
}

export function toRadarJobView(
  catalog: CanonicalJobCatalog,
  item: JobSearchResultItem | { job: CanonicalJob; match?: MatchBreakdown; saved?: boolean },
): RadarJobView {
  const job = item.job;
  const match = "match" in item ? item.match : undefined;
  const sightings = catalog.getSightingsForJob(job.id);
  const primary = ("primarySighting" in item ? item.primarySighting : undefined) ?? sightings[0];
  const source = catalog.sources.get(job.primarySourceId) ?? catalog.sources.get(primary?.sourceId ?? "");

  const sourceRefs = [...new Map(sightings.map((s) => [s.sourceId, s])).values()].map((s) => {
    const src = catalog.sources.get(s.sourceId);
    return {
      id: s.sourceId,
      name: src?.displayName ?? s.sourceId,
      kind: sourceKind(s.sourceId),
      companyDirect: ["greenhouse", "lever", "ashby"].includes(s.sourceId),
      demoData: s.demoData,
      attribution: s.attribution,
    };
  });

  const freshnessLabel =
    "freshnessLabel" in item && item.freshnessLabel
      ? item.freshnessLabel
      : formatFreshnessLabel(
          resolveFreshnessTimestamp(
            { ...job, sourcePostedAt: primary?.sourcePostedAt },
            "discovered",
          ),
          "EXACT_TIMESTAMP",
          new Date(),
          "discovered",
        );

  const originalAge =
    "originalAgeLabel" in item
      ? item.originalAgeLabel
      : job.originalPostedAt
        ? formatFreshnessLabel(
            new Date(job.originalPostedAt),
            job.originalPostedPrecision,
            new Date(),
            "originally_posted",
          )
        : undefined;

  let repostExplanation: string | undefined;
  if (job.classification === "REPOSTED") {
    repostExplanation = `Classified as reposted. ${originalAge ? `Employer originally posted (${originalAge.replace(/^Posted /, "")}).` : "Original age unknown."}`;
  } else if (job.classification === "REFRESHED") {
    repostExplanation = "Same listing ID with updated content (refreshed).";
  } else if (job.classification === "REOPENED") {
    repostExplanation = "Previously closed requisition became active again.";
  }

  const hiringSignals: string[] = [];
  if (job.classification === "REPOSTED") hiringSignals.push("Detected as a repost across sources");
  if (job.companyDirect) hiringSignals.push("Company-direct ATS source available");
  if (job.demoData) hiringSignals.push("Includes demo fixture sightings");

  return {
    id: job.publicId,
    publicId: job.publicId,
    title: job.title,
    company: job.companyName,
    companyMark: job.companyName.slice(0, 2).toUpperCase(),
    location: job.locations[0] ?? "Unknown",
    remotePolicy: job.remotePolicy === "unknown" ? "unspecified" : job.remotePolicy,
    employmentType: job.employmentType ?? "Full-time",
    seniority: job.seniority,
    department: job.department,
    compensation: job.compensation?.raw,
    technologies: job.techStack,
    classification: job.classification,
    verificationState: job.verificationState,
    companyDirect: job.companyDirect,
    timestampEstimated:
      job.originalPostedPrecision === "ESTIMATED" ||
      job.originalPostedPrecision === "UNKNOWN",
    possibleDuplicate: job.classification === "POSSIBLE_DUPLICATE",
    originalPostedAt: job.originalPostedAt ?? undefined,
    originalPostedPrecision: job.originalPostedPrecision,
    sourcePostedAt: primary?.sourcePostedAt ?? undefined,
    repostedAt: job.repostedAt ?? undefined,
    firstSeenAt: job.firstDiscoveredAt,
    lastVerifiedAt: job.lastVerifiedAt ?? undefined,
    repostCount: job.repostCount,
    matchScore: match?.overall ?? 0,
    evidenceCoverage: match?.evidence ?? 0,
    matchBreakdown: match ?? {
      overall: 0,
      skills: 0,
      evidence: 0,
      experience: 0,
      seniority: 0,
      location: 0,
      compensation: 0,
      eligibility: 0,
      career: 0,
      explanation: [],
      matchedSkills: [],
      missingSkills: [],
    },
    primarySource: sourceRefs[0] ?? {
      id: job.primarySourceId,
      name: source?.displayName ?? job.primarySourceId,
      kind: sourceKind(job.primarySourceId),
      companyDirect: job.companyDirect,
      demoData: job.demoData,
      attribution: source?.policy.attributionText,
    },
    sources: sourceRefs,
    sightings: sightings.map((s: JobSighting) => ({
      id: s.publicId,
      sourceId: s.sourceId,
      sourceName: catalog.sources.get(s.sourceId)?.displayName ?? s.sourceId,
      postedAt: s.sourcePostedAt,
      firstSeenAt: s.firstSeenAt,
      lastSeenAt: s.lastSeenAt,
      demoData: s.demoData,
      attribution: s.attribution,
    })),
    applicationUrl: job.canonicalApplicationUrl,
    companyCareersUrl: job.companyDirect ? job.canonicalApplicationUrl : undefined,
    description: job.description,
    responsibilities: [],
    requirements: job.requirements ? [job.requirements] : [],
    preferred: job.preferredQualifications ? [job.preferredQualifications] : [],
    hiringSignals,
    freshnessExplanation: freshnessLabel,
    repostExplanation,
    saved: "saved" in item ? item.saved : false,
    hidden: "hidden" in item ? item.hidden : false,
    demoData: job.demoData,
  };
}

export function toSearchApiResponse(catalog: CanonicalJobCatalog, result: JobSearchResult) {
  return {
    jobs: result.results.map((r) => toRadarJobView(catalog, r)),
    results: result.results,
    total: result.totalEstimate,
    totalEstimate: result.totalEstimate,
    nextCursor: result.nextCursor,
    appliedFilters: result.appliedFilters,
    facets: result.facets,
    executionMs: result.executionMs,
    indexedAt: result.indexedAt,
    usingDemoFixtures: result.results.some((r) => r.job.demoData),
  };
}

export function toHistoryApiEvents(history: JobHistoryEvent[]) {
  return history.map((e) => ({
    id: e.id,
    at: e.occurredAt,
    occurredAt: e.occurredAt,
    kind: e.type,
    type: e.type,
    title: e.type.replace(/_/g, " "),
    detail: e.message,
    message: e.message,
    sourceName: typeof e.metadata?.sourceName === "string" ? e.metadata.sourceName : undefined,
    demoData: Boolean(e.metadata?.demoData),
  }));
}

export function toCoverageApi(coverage: SourceCoverage[]) {
  const items = coverage.map((c) => ({
    id: c.sourceId,
    name: c.displayName,
    category: c.accessMethod,
    enabled: c.enabled,
    licenseStatus: c.demoOnly
      ? ("demo_only" as const)
      : c.licenseStatus === "disabled"
        ? ("disabled" as const)
        : c.licenseStatus === "partner"
          ? ("partner_pending" as const)
          : c.licenseStatus === "public"
            ? ("public_api" as const)
            : ("licensed" as const),
    statusLabel: c.enabled ? "Enabled" : c.demoOnly ? "Demo fixtures only" : "Disabled",
    honestNote: c.attribution,
    lastComplianceReview: undefined as string | undefined,
    rpmLimit: undefined as number | undefined,
  }));
  return {
    coverage,
    sources: coverage,
    items,
    enabledCount: coverage.filter((c) => c.enabled).length,
    demoOnlyCount: coverage.filter((c) => c.demoOnly).length,
  };
}

export function toSavedSearchView(s: {
  id: string;
  publicId: string;
  name: string;
  query: unknown;
  alertEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: s.publicId,
    publicId: s.publicId,
    name: s.name,
    query: s.query,
    alertEnabled: s.alertEnabled,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export function toAlertView(a: {
  id: string;
  publicId: string;
  name: string;
  savedSearchId?: string;
  query: unknown;
  cadence: string;
  enabled: boolean;
  lastEvaluatedAt?: string | null;
  createdAt: string;
}) {
  const cadenceMap: Record<string, string> = {
    immediate: "near_realtime",
    hourly: "hourly",
    daily: "daily",
    weekly: "weekly",
    paused: "paused",
  };
  return {
    id: a.publicId,
    publicId: a.publicId,
    name: a.name,
    savedSearchId: a.savedSearchId,
    query: a.query,
    cadence: cadenceMap[a.cadence] ?? a.cadence,
    channels: ["in_app"] as const,
    active: a.enabled,
    lastTriggeredAt: a.lastEvaluatedAt ?? undefined,
    createdAt: a.createdAt,
  };
}
