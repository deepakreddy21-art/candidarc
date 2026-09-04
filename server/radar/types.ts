/** CandidArc Radar — shared catalog types (Phase 3). */

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

export type SourceAccessMethod =
  | "public_api"
  | "partner_api"
  | "licensed_feed"
  | "ats_board_api"
  | "structured_data"
  | "xml_feed"
  | "sitemap"
  | "user_provided"
  | "approved_integration"
  | "disabled_pending_license";

export type LicenseStatus =
  | "public"
  | "licensed"
  | "partner"
  | "demo_fixture"
  | "disabled"
  | "pending_review"
  | "revoked";

export type JobStatus = "open" | "closed" | "expired" | "unknown";

export type RemotePolicy = "remote" | "hybrid" | "onsite" | "unknown";

export type SortField =
  | "freshness"
  | "match"
  | "discovered"
  | "original"
  | "company"
  | "title";

export interface Company {
  id: string;
  publicId: string;
  name: string;
  normalizedName: string;
  domain?: string;
  careersUrl?: string;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface JobSourcePolicy {
  sourceId: string;
  accessMethod: SourceAccessMethod;
  termsUrl: string;
  licenseStatus: LicenseStatus;
  allowedFields: string[];
  attributionRequired: boolean;
  attributionText: string;
  fullDescriptionAllowed: boolean;
  retentionDays: number | null;
  refreshLimitPerDay: number | null;
  requestsPerMinute: number;
  removalRequired: boolean;
  commercialUseAllowed: boolean;
  lastComplianceReview: string;
  enabled: boolean;
  notes?: string;
}

export interface JobSource {
  id: string;
  publicId: string;
  providerId: string;
  displayName: string;
  accessMethod: SourceAccessMethod;
  baseUrl?: string;
  enabled: boolean;
  policy: JobSourcePolicy;
  createdAt: string;
  updatedAt: string;
}

export interface JobCompensation {
  min?: number;
  max?: number;
  currency?: string;
  period?: "year" | "hour" | "month" | "unknown";
  raw?: string;
}

export interface CanonicalJob {
  id: string;
  publicId: string;
  companyId: string;
  companyName: string;
  title: string;
  normalizedTitle: string;
  department?: string;
  team?: string;
  employmentType?: string;
  seniority?: string;
  description: string;
  requirements?: string;
  preferredQualifications?: string;
  responsibilities?: string;
  compensation?: JobCompensation;
  locations: string[];
  remotePolicy: RemotePolicy;
  visaSponsorship?: boolean | null;
  degreeRequired?: boolean | null;
  securityClearanceRequired?: boolean | null;
  techStack: string[];
  canonicalApplicationUrl?: string;
  employerRequisitionId?: string;
  originalPostedAt?: string | null;
  originalPostedPrecision: TimestampPrecision;
  firstDiscoveredAt: string;
  lastVerifiedAt?: string | null;
  lastVerifiedPrecision: TimestampPrecision;
  repostedAt?: string | null;
  closedAt?: string | null;
  reopenedAt?: string | null;
  status: JobStatus;
  verificationState: VerificationState;
  classification: JobClassification;
  classificationConfidence: number;
  confidence: number;
  primarySourceId: string;
  repostCount: number;
  companyDirect: boolean;
  demoData?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JobSighting {
  id: string;
  publicId: string;
  canonicalJobId: string;
  sourceId: string;
  sourceListingId: string;
  sourceCompanyIdentifier?: string;
  sourceRequisitionId?: string;
  sourceUrl: string;
  sourceApplyUrl?: string;
  sourceTitle: string;
  sourceLocation?: string;
  sourcePostedAt?: string | null;
  sourcePostedPrecision: TimestampPrecision;
  sourceUpdatedAt?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastVerifiedAt?: string | null;
  removedAt?: string | null;
  repostedAt?: string | null;
  validThrough?: string | null;
  contentHash: string;
  descriptionHash: string;
  rawSnapshotId?: string;
  classification: JobClassification;
  classificationConfidence: number;
  demoData?: boolean;
  attribution?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobSnapshot {
  id: string;
  sightingId: string;
  retrievedAt: string;
  contentHash: string;
  title: string;
  description: string;
  location?: string;
  compensation?: JobCompensation;
  sourcePostedAt?: string | null;
  applicationUrl?: string;
  status: JobStatus;
  rawPayloadRef?: string;
  materialChangeSummary?: string;
}

export type JobHistoryEventType =
  | "discovered"
  | "sighted"
  | "classified"
  | "reposted"
  | "refreshed"
  | "reopened"
  | "verified"
  | "closed"
  | "expired"
  | "merged"
  | "split"
  | "updated";

export interface JobHistoryEvent {
  id: string;
  canonicalJobId: string;
  sightingId?: string;
  type: JobHistoryEventType;
  occurredAt: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface SavedSearch {
  id: string;
  publicId: string;
  tenantId: string;
  userId: string;
  name: string;
  query: JobSearchQuery;
  alertEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavedJob {
  id: string;
  tenantId: string;
  userId: string;
  canonicalJobId: string;
  createdAt: string;
}

export interface HiddenJob {
  id: string;
  tenantId: string;
  userId: string;
  canonicalJobId: string;
  createdAt: string;
}

export interface MatchBreakdown {
  overall: number;
  skills: number;
  evidence: number;
  experience: number;
  seniority: number;
  location: number;
  compensation: number;
  eligibility: number;
  career: number;
  explanation: string[];
  matchedSkills: string[];
  missingSkills: string[];
  /** Human-readable match label (Strong match | Good match | Stretch opportunity | Not recommended) */
  matchLabel?: string;
  /** UI tone for the label (success | accent | warning | neutral) */
  matchTone?: "success" | "accent" | "warning" | "neutral";
  /** Evidence-backed reasons citing skills that exist on profile */
  matchReasons?: string[];
}

export interface JobMatch {
  id: string;
  tenantId: string;
  userId: string;
  canonicalJobId: string;
  score: number;
  breakdown: MatchBreakdown;
  computedAt: string;
}

export type AlertCadence =
  | "immediate"
  | "near_realtime"
  | "every_15m"
  | "hourly"
  | "every_3h"
  | "daily"
  | "weekly"
  | "paused";

export interface JobAlert {
  id: string;
  publicId: string;
  tenantId: string;
  userId: string;
  name: string;
  savedSearchId?: string;
  query: JobSearchQuery;
  cadence: AlertCadence;
  enabled: boolean;
  includeReposts: boolean;
  includeRefreshes: boolean;
  lastEvaluatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobAlertDelivery {
  id: string;
  alertId: string;
  tenantId: string;
  userId: string;
  canonicalJobId: string;
  classification: JobClassification;
  deliveredAt: string;
  channel: "in_app";
  message: string;
  dedupeKey: string;
}

export interface JobSearchQuery {
  keywords?: string;
  company?: string;
  location?: string;
  remote?: boolean;
  employmentType?: string;
  seniority?: string;
  freshnessPreset?: string;
  freshnessCustomStart?: string;
  freshnessCustomEnd?: string;
  freshnessBasis?: FreshnessBasis;
  freshnessType?: FreshnessTypeFilter;
  excludeOriginalOlderThanDays?: number;
  maxRepostCount?: number;
  requireKnownOriginalDate?: boolean;
  companyDirectOnly?: boolean;
  verifiedOpenOnly?: boolean;
  matchScoreMin?: number;
  timezone?: string;
  sort?: SortField;
  sortDir?: "asc" | "desc";
  cursor?: string;
  limit?: number;
}

export interface JobSearchResultItem {
  job: CanonicalJob;
  match?: MatchBreakdown;
  saved?: boolean;
  hidden?: boolean;
  primarySighting?: JobSighting;
  freshnessLabel: string;
  originalAgeLabel?: string;
  attribution: string[];
}

export interface JobSearchFacets {
  companies: Array<{ value: string; count: number }>;
  locations: Array<{ value: string; count: number }>;
  seniority: Array<{ value: string; count: number }>;
  classifications: Array<{ value: string; count: number }>;
  sources: Array<{ value: string; count: number }>;
}

export interface JobSearchResult {
  results: JobSearchResultItem[];
  nextCursor: string | null;
  totalEstimate: number;
  appliedFilters: JobSearchQuery;
  facets: JobSearchFacets;
  executionMs: number;
  indexedAt: string;
}

export interface SourceCoverage {
  sourceId: string;
  providerId: string;
  displayName: string;
  enabled: boolean;
  licenseStatus: LicenseStatus;
  accessMethod: SourceAccessMethod;
  companyCount: number;
  openJobCount: number;
  lastIngestedAt?: string | null;
  attribution: string;
  demoOnly: boolean;
}

export interface CandidateProfileForMatch {
  skills: string[];
  seniority?: string;
  preferredLocations?: string[];
  remoteOk?: boolean;
  yearsExperience?: number;
  careerGoals?: string[];
  visaNeeded?: boolean;
  targetCompensationMin?: number;
}

export interface CreateApplicationFromJobPayload {
  company: string;
  role: string;
  location?: string;
  employmentType?: string;
  jobUrl?: string;
  jobDescriptionText?: string;
  roleFamily?: string;
  canonicalJobId: string;
  sightingId?: string;
  researchDepth?: "standard" | "deep-team" | "priority";
  idempotencyKey?: string;
}
