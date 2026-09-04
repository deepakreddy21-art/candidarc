/**
 * CandidArc Radar — Persistence Layer Types (Release A.6)
 *
 * Interfaces for saving/loading catalog jobs and user data.
 * Supports both memory and postgres backends.
 */

import type {
  CanonicalJob,
  Company,
  JobAlert,
  JobAlertDelivery,
  JobHistoryEvent,
  JobMatch,
  JobSighting,
  JobSnapshot,
  JobSource,
  SavedJob,
  SavedSearch,
  HiddenJob,
} from "../types";

/**
 * Provider checkpoint for tracking ingestion state.
 */
export interface ProviderCheckpoint {
  providerId: string;
  lastFetchedAt: string;
  lastCursor?: string;
  lastJobCount?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Opportunity brief cached in persistence.
 */
export interface PersistedOpportunityBrief {
  id: string;
  tenantId: string;
  userId: string;
  canonicalJobId: string;
  brief: {
    summary: string;
    companyOverview?: string;
    roleHighlights: string[];
    skillsAlignment: string[];
    concerns: string[];
    resumeReadinessLabel: "ready" | "needs_work" | "significant_gaps";
    researchUrls?: string[];
  };
  generatedAt: string;
  expiresAt: string;
}

/**
 * Job interaction for analytics and personalization.
 */
export interface JobInteraction {
  id: string;
  tenantId: string;
  userId: string;
  canonicalJobId: string;
  interactionType: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/**
 * Radar store interface for catalog data (shared across tenants).
 */
export interface RadarCatalogStore {
  // Companies
  getCompany(id: string): Promise<Company | null>;
  getCompanyByNormalizedName(name: string): Promise<Company | null>;
  upsertCompany(company: Company): Promise<Company>;

  // Sources
  getSource(id: string): Promise<JobSource | null>;
  listSources(): Promise<JobSource[]>;
  upsertSource(source: JobSource): Promise<JobSource>;

  // Canonical Jobs
  getJob(id: string): Promise<CanonicalJob | null>;
  getJobByPublicId(publicId: string): Promise<CanonicalJob | null>;
  listJobs(opts?: { status?: string; limit?: number; offset?: number }): Promise<CanonicalJob[]>;
  upsertJob(job: CanonicalJob): Promise<CanonicalJob>;
  searchJobs(query: string, limit?: number): Promise<CanonicalJob[]>;

  // Sightings
  getSighting(id: string): Promise<JobSighting | null>;
  getSightingBySourceListing(sourceId: string, listingId: string): Promise<JobSighting | null>;
  listSightingsForJob(jobId: string): Promise<JobSighting[]>;
  upsertSighting(sighting: JobSighting): Promise<JobSighting>;

  // Snapshots
  getSnapshot(id: string): Promise<JobSnapshot | null>;
  listSnapshotsForSighting(sightingId: string): Promise<JobSnapshot[]>;
  createSnapshot(snapshot: JobSnapshot): Promise<JobSnapshot>;

  // History
  listHistoryForJob(jobId: string): Promise<JobHistoryEvent[]>;
  createHistoryEvent(event: JobHistoryEvent): Promise<JobHistoryEvent>;

  // Provider checkpoints
  getCheckpoint(providerId: string): Promise<ProviderCheckpoint | null>;
  setCheckpoint(checkpoint: ProviderCheckpoint): Promise<void>;
}

/**
 * Radar store interface for user-scoped data (tenant-isolated).
 */
export interface RadarUserStore {
  // Saved jobs
  getSavedJob(tenantId: string, userId: string, jobId: string): Promise<SavedJob | null>;
  listSavedJobs(tenantId: string, userId: string): Promise<SavedJob[]>;
  saveJob(savedJob: SavedJob): Promise<SavedJob>;
  unsaveJob(tenantId: string, userId: string, jobId: string): Promise<void>;

  // Hidden jobs
  getHiddenJob(tenantId: string, userId: string, jobId: string): Promise<HiddenJob | null>;
  listHiddenJobs(tenantId: string, userId: string): Promise<HiddenJob[]>;
  hideJob(hiddenJob: HiddenJob): Promise<HiddenJob>;
  unhideJob(tenantId: string, userId: string, jobId: string): Promise<void>;

  // Saved searches
  getSavedSearch(tenantId: string, id: string): Promise<SavedSearch | null>;
  listSavedSearches(tenantId: string, userId: string): Promise<SavedSearch[]>;
  createSavedSearch(search: SavedSearch): Promise<SavedSearch>;
  updateSavedSearch(
    tenantId: string,
    id: string,
    patch: Partial<Pick<SavedSearch, "name" | "query" | "alertEnabled">>,
  ): Promise<SavedSearch>;
  deleteSavedSearch(tenantId: string, id: string): Promise<void>;

  // Alerts
  getAlert(tenantId: string, id: string): Promise<JobAlert | null>;
  listAlerts(tenantId: string, userId: string): Promise<JobAlert[]>;
  createAlert(alert: JobAlert): Promise<JobAlert>;
  updateAlert(
    tenantId: string,
    id: string,
    patch: Partial<JobAlert>,
  ): Promise<JobAlert>;
  deleteAlert(tenantId: string, id: string): Promise<void>;

  // Alert deliveries
  listDeliveries(tenantId: string, userId: string): Promise<JobAlertDelivery[]>;
  createDelivery(delivery: JobAlertDelivery): Promise<JobAlertDelivery>;
  deliveryExists(dedupeKey: string): Promise<boolean>;

  // Job matches (cached)
  getMatch(tenantId: string, userId: string, jobId: string): Promise<JobMatch | null>;
  upsertMatch(match: JobMatch): Promise<JobMatch>;

  // Interactions
  listInteractions(tenantId: string, userId: string, jobId?: string): Promise<JobInteraction[]>;
  createInteraction(interaction: JobInteraction): Promise<JobInteraction>;

  // Opportunity briefs
  getBrief(tenantId: string, userId: string, jobId: string): Promise<PersistedOpportunityBrief | null>;
  upsertBrief(brief: PersistedOpportunityBrief): Promise<PersistedOpportunityBrief>;
}

/**
 * Combined radar store interface.
 */
export interface RadarStore extends RadarCatalogStore, RadarUserStore {
  /** Hydrate catalog from persistence on boot (postgres mode). */
  hydrateCatalog?(): Promise<{
    companies: Company[];
    sources: JobSource[];
    jobs: CanonicalJob[];
    sightings: JobSighting[];
  }>;

  /** Sync memory catalog to persistence (write-through). */
  syncCatalog?(catalog: {
    companies: Company[];
    sources: JobSource[];
    jobs: CanonicalJob[];
    sightings: JobSighting[];
  }): Promise<void>;
}
