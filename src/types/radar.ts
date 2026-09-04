/** Lightweight UI shapes for CandidArc Radar (mapped from /api/v1 jobs APIs). */

export type TimestampPrecision =
  | "EXACT_TIMESTAMP"
  | "DATE_ONLY"
  | "RELATIVE_HOURS"
  | "RELATIVE_DAYS"
  | "ESTIMATED"
  | "FIRST_SEEN_ONLY"
  | "UNKNOWN";

export type JobClassification =
  | "NEW"
  | "REPOSTED"
  | "REFRESHED"
  | "REOPENED"
  | "DUPLICATE"
  | "POSSIBLE_DUPLICATE"
  | "UNCHANGED"
  | "EXPIRED"
  | "UNKNOWN";

export type VerificationState =
  | "VERIFIED_OPEN"
  | "LIKELY_OPEN"
  | "STALE"
  | "LIKELY_CLOSED"
  | "CLOSED"
  | "VERIFICATION_FAILED";

export type FreshnessBasis =
  | "originally_posted"
  | "source_posted"
  | "reposted"
  | "discovered"
  | "last_verified";

export type FreshnessTypeFilter =
  | "genuinely_new"
  | "new_or_reposted"
  | "reposted_only"
  | "refreshed"
  | "reopened";

export type FreshnessPreset =
  | "30m"
  | "1h"
  | "2h"
  | "3h"
  | "6h"
  | "12h"
  | "24h"
  | "48h"
  | "3d"
  | "7d"
  | "14d"
  | "30d"
  | "custom";

export type RemotePolicy = "remote" | "hybrid" | "onsite" | "unspecified";

export type JobSort =
  | "best_match"
  | "genuinely_newest"
  | "recently_discovered"
  | "recently_reposted"
  | "recently_verified"
  | "highest_compensation"
  | "company_direct_first";

export type AlertCadence =
  | "immediate"
  | "near_realtime"
  | "every_15m"
  | "hourly"
  | "every_3h"
  | "daily"
  | "weekly"
  | "paused";

export type AlertChannel = "in_app" | "email" | "push";

/** Human-readable match label */
export type MatchLabel =
  | "Strong match"
  | "Good match"
  | "Stretch opportunity"
  | "Not recommended";

/** Match label UI tone */
export type MatchTone = "success" | "accent" | "warning" | "neutral";

export interface MatchBreakdown {
  overall: number;
  skills: number;
  evidence: number;
  experience: number;
  seniority: number;
  location: number;
  compensation: number;
  eligibility: number;
  careerDirection: number;
  notes?: string[];
}

export interface RadarJobSourceRef {
  id: string;
  name: string;
  kind: "company_careers" | "ats" | "licensed_board" | "demo_fixture" | "public_api";
  companyDirect: boolean;
  demoData?: boolean;
  attribution?: string;
}

export interface RadarJobSighting {
  id: string;
  sourceId: string;
  sourceName: string;
  url?: string;
  postedAt?: string;
  repostedAt?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  demoData?: boolean;
  attribution?: string;
}

export interface RadarHistoryEvent {
  id: string;
  jobId: string;
  at: string;
  type:
    | "discovered"
    | "source_sighting"
    | "repost_detected"
    | "refreshed"
    | "reopened"
    | "verified"
    | "closed"
    | "merged"
    | "note";
  title: string;
  detail: string;
  sourceName?: string;
  demoData?: boolean;
}

export interface RadarJob {
  id: string;
  publicId: string;
  title: string;
  company: string;
  companyMark: string;
  location: string;
  remotePolicy: RemotePolicy;
  employmentType: string;
  seniority?: string;
  department?: string;
  compensation?: string;
  technologies: string[];
  classification: JobClassification;
  verificationState: VerificationState;
  companyDirect: boolean;
  timestampEstimated: boolean;
  possibleDuplicate: boolean;
  originalPostedAt?: string;
  originalPostedPrecision: TimestampPrecision;
  sourcePostedAt?: string;
  repostedAt?: string;
  firstSeenAt: string;
  lastVerifiedAt?: string;
  repostCount: number;
  matchScore: number;
  evidenceCoverage: number;
  matchBreakdown: MatchBreakdown;
  /** Human-readable match label */
  matchLabel?: MatchLabel;
  /** UI tone for match label */
  matchTone?: MatchTone;
  /** Evidence-backed match reasons citing profile skills */
  matchReasons?: string[];
  primarySource: RadarJobSourceRef;
  sources: RadarJobSourceRef[];
  sightings: RadarJobSighting[];
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
  linkedApplicationId?: string;
  demoData?: boolean;
}

export interface RadarSearchParams {
  q?: string;
  location?: string;
  company?: string;
  excludeCompanies?: string;
  excludedCompanies?: string;
  remote?: RemotePolicy | "any";
  remotePolicy?: RemotePolicy | "any";
  employmentType?: string;
  seniority?: string;
  freshnessPreset?: FreshnessPreset;
  freshnessBasis?: FreshnessBasis;
  freshnessType?: FreshnessTypeFilter | "any";
  customStart?: string;
  customEnd?: string;
  timezone?: string;
  excludeOriginalOlderThanDays?: number;
  maxRepostCount?: number;
  requireKnownOriginalDate?: boolean;
  companyDirectOnly?: boolean;
  verifiedOpenOnly?: boolean;
  hidePossibleDuplicates?: boolean;
  includeReposts?: boolean;
  matchScoreMin?: number;
  compensationMin?: number;
  savedOnly?: boolean;
  sort?: JobSort;
  cursor?: string;
  limit?: number;
}

export interface RadarSearchResult {
  jobs: RadarJob[];
  total: number;
  nextCursor?: string;
  usingDemoFixtures?: boolean;
}

export interface RadarHomeSummary {
  strongMatches: number;
  genuinelyNew: number;
  reposted: number;
  uncertainDates: number;
  windowLabel: string;
}

export interface SavedSearch {
  id: string;
  name: string;
  query: RadarSearchParams;
  createdAt: string;
  updatedAt: string;
  alertEnabled?: boolean;
}

export interface JobAlert {
  id: string;
  name: string;
  savedSearchId?: string;
  query: RadarSearchParams;
  cadence: AlertCadence;
  channels: AlertChannel[];
  active: boolean;
  lastTriggeredAt?: string;
  createdAt: string;
}

export interface SourceCoverageItem {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  licenseStatus: "licensed" | "public_api" | "partner_pending" | "disabled" | "demo_only";
  statusLabel: string;
  honestNote: string;
  lastComplianceReview?: string;
  rpmLimit?: number;
}

export interface SourceCoverageSummary {
  items: SourceCoverageItem[];
  summary: string;
}
