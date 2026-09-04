/**
 * CandidArc Radar — Memory Store (Release A.6)
 *
 * In-memory implementation of RadarStore.
 * Wraps CanonicalJobCatalog for persistence interface compatibility.
 * Suitable for demo mode and testing.
 */

import { randomUUID } from "crypto";
import type { CanonicalJobCatalog } from "../catalog";
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
import type {
  JobInteraction,
  PersistedOpportunityBrief,
  ProviderCheckpoint,
  RadarStore,
} from "./types";

function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/**
 * Memory-based RadarStore implementation.
 * Wraps CanonicalJobCatalog and adds additional storage.
 */
export class MemoryRadarStore implements RadarStore {
  private checkpoints = new Map<string, ProviderCheckpoint>();
  private interactions: JobInteraction[] = [];
  private briefs = new Map<string, PersistedOpportunityBrief>();

  constructor(private readonly catalog: CanonicalJobCatalog) {}

  // Companies
  async getCompany(id: string): Promise<Company | null> {
    return this.catalog.companies.get(id) ?? null;
  }

  async getCompanyByNormalizedName(name: string): Promise<Company | null> {
    for (const c of this.catalog.companies.values()) {
      if (c.normalizedName === name) return c;
    }
    return null;
  }

  async upsertCompany(company: Company): Promise<Company> {
    this.catalog.companies.set(company.id, company);
    return company;
  }

  // Sources
  async getSource(id: string): Promise<JobSource | null> {
    return this.catalog.sources.get(id) ?? null;
  }

  async listSources(): Promise<JobSource[]> {
    return [...this.catalog.sources.values()];
  }

  async upsertSource(source: JobSource): Promise<JobSource> {
    this.catalog.sources.set(source.id, source);
    return source;
  }

  // Jobs
  async getJob(id: string): Promise<CanonicalJob | null> {
    return this.catalog.canonicalJobs.get(id) ?? null;
  }

  async getJobByPublicId(publicId: string): Promise<CanonicalJob | null> {
    return this.catalog.getJob(publicId);
  }

  async listJobs(opts?: { status?: string; limit?: number; offset?: number }): Promise<CanonicalJob[]> {
    let jobs = [...this.catalog.canonicalJobs.values()];
    if (opts?.status) {
      jobs = jobs.filter((j) => j.status === opts.status);
    }
    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? 100;
    return jobs.slice(offset, offset + limit);
  }

  async upsertJob(job: CanonicalJob): Promise<CanonicalJob> {
    this.catalog.canonicalJobs.set(job.id, job);
    return job;
  }

  async searchJobs(query: string, limit = 20): Promise<CanonicalJob[]> {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const jobs = [...this.catalog.canonicalJobs.values()].filter((j) => {
      const hay = `${j.title} ${j.companyName} ${j.description} ${j.techStack.join(" ")}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
    return jobs.slice(0, limit);
  }

  // Sightings
  async getSighting(id: string): Promise<JobSighting | null> {
    return this.catalog.sightings.get(id) ?? null;
  }

  async getSightingBySourceListing(sourceId: string, listingId: string): Promise<JobSighting | null> {
    for (const s of this.catalog.sightings.values()) {
      if (s.sourceId === sourceId && s.sourceListingId === listingId) {
        return s;
      }
    }
    return null;
  }

  async listSightingsForJob(jobId: string): Promise<JobSighting[]> {
    return this.catalog.getSightingsForJob(jobId);
  }

  async upsertSighting(sighting: JobSighting): Promise<JobSighting> {
    this.catalog.sightings.set(sighting.id, sighting);
    return sighting;
  }

  // Snapshots
  async getSnapshot(id: string): Promise<JobSnapshot | null> {
    return this.catalog.snapshots.get(id) ?? null;
  }

  async listSnapshotsForSighting(sightingId: string): Promise<JobSnapshot[]> {
    return [...this.catalog.snapshots.values()].filter((s) => s.sightingId === sightingId);
  }

  async createSnapshot(snapshot: JobSnapshot): Promise<JobSnapshot> {
    this.catalog.snapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  // History
  async listHistoryForJob(jobId: string): Promise<JobHistoryEvent[]> {
    return this.catalog.getHistory(jobId);
  }

  async createHistoryEvent(event: JobHistoryEvent): Promise<JobHistoryEvent> {
    this.catalog.historyEvents.push(event);
    return event;
  }

  // Provider checkpoints
  async getCheckpoint(providerId: string): Promise<ProviderCheckpoint | null> {
    return this.checkpoints.get(providerId) ?? null;
  }

  async setCheckpoint(checkpoint: ProviderCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.providerId, checkpoint);
  }

  // Saved jobs
  private savedKey(tenantId: string, userId: string, jobId: string): string {
    return `${tenantId}:${userId}:${jobId}`;
  }

  async getSavedJob(tenantId: string, userId: string, jobId: string): Promise<SavedJob | null> {
    return this.catalog.savedJobs.get(this.savedKey(tenantId, userId, jobId)) ?? null;
  }

  async listSavedJobs(tenantId: string, userId: string): Promise<SavedJob[]> {
    return [...this.catalog.savedJobs.values()].filter(
      (s) => s.tenantId === tenantId && s.userId === userId,
    );
  }

  async saveJob(savedJob: SavedJob): Promise<SavedJob> {
    this.catalog.savedJobs.set(
      this.savedKey(savedJob.tenantId, savedJob.userId, savedJob.canonicalJobId),
      savedJob,
    );
    return savedJob;
  }

  async unsaveJob(tenantId: string, userId: string, jobId: string): Promise<void> {
    this.catalog.savedJobs.delete(this.savedKey(tenantId, userId, jobId));
  }

  // Hidden jobs
  async getHiddenJob(tenantId: string, userId: string, jobId: string): Promise<HiddenJob | null> {
    return this.catalog.hiddenJobs.get(this.savedKey(tenantId, userId, jobId)) ?? null;
  }

  async listHiddenJobs(tenantId: string, userId: string): Promise<HiddenJob[]> {
    return [...this.catalog.hiddenJobs.values()].filter(
      (h) => h.tenantId === tenantId && h.userId === userId,
    );
  }

  async hideJob(hiddenJob: HiddenJob): Promise<HiddenJob> {
    this.catalog.hiddenJobs.set(
      this.savedKey(hiddenJob.tenantId, hiddenJob.userId, hiddenJob.canonicalJobId),
      hiddenJob,
    );
    return hiddenJob;
  }

  async unhideJob(tenantId: string, userId: string, jobId: string): Promise<void> {
    this.catalog.hiddenJobs.delete(this.savedKey(tenantId, userId, jobId));
  }

  // Saved searches
  async getSavedSearch(tenantId: string, id: string): Promise<SavedSearch | null> {
    for (const s of this.catalog.savedSearches.values()) {
      if ((s.id === id || s.publicId === id) && s.tenantId === tenantId) {
        return s;
      }
    }
    return null;
  }

  async listSavedSearches(tenantId: string, userId: string): Promise<SavedSearch[]> {
    return this.catalog.listSavedSearches(tenantId, userId);
  }

  async createSavedSearch(search: SavedSearch): Promise<SavedSearch> {
    this.catalog.savedSearches.set(search.id, search);
    return search;
  }

  async updateSavedSearch(
    tenantId: string,
    id: string,
    patch: Partial<Pick<SavedSearch, "name" | "query" | "alertEnabled">>,
  ): Promise<SavedSearch> {
    const search = await this.getSavedSearch(tenantId, id);
    if (!search) throw new Error("Saved search not found");
    const updated = { ...search, ...patch, updatedAt: new Date().toISOString() };
    this.catalog.savedSearches.set(updated.id, updated);
    return updated;
  }

  async deleteSavedSearch(tenantId: string, id: string): Promise<void> {
    const search = await this.getSavedSearch(tenantId, id);
    if (search) {
      this.catalog.savedSearches.delete(search.id);
    }
  }

  // Alerts
  async getAlert(tenantId: string, id: string): Promise<JobAlert | null> {
    for (const a of this.catalog.alerts.values()) {
      if ((a.id === id || a.publicId === id) && a.tenantId === tenantId) {
        return a;
      }
    }
    return null;
  }

  async listAlerts(tenantId: string, userId: string): Promise<JobAlert[]> {
    return this.catalog.listAlerts(tenantId, userId);
  }

  async createAlert(alert: JobAlert): Promise<JobAlert> {
    this.catalog.alerts.set(alert.id, alert);
    return alert;
  }

  async updateAlert(tenantId: string, id: string, patch: Partial<JobAlert>): Promise<JobAlert> {
    const alert = await this.getAlert(tenantId, id);
    if (!alert) throw new Error("Alert not found");
    const updated = { ...alert, ...patch, updatedAt: new Date().toISOString() };
    this.catalog.alerts.set(updated.id, updated);
    return updated;
  }

  async deleteAlert(tenantId: string, id: string): Promise<void> {
    const alert = await this.getAlert(tenantId, id);
    if (alert) {
      this.catalog.alerts.delete(alert.id);
    }
  }

  // Alert deliveries
  async listDeliveries(tenantId: string, userId: string): Promise<JobAlertDelivery[]> {
    return this.catalog.alertDeliveries.filter(
      (d) => d.tenantId === tenantId && d.userId === userId,
    );
  }

  async createDelivery(delivery: JobAlertDelivery): Promise<JobAlertDelivery> {
    this.catalog.alertDeliveries.push(delivery);
    return delivery;
  }

  async deliveryExists(dedupeKey: string): Promise<boolean> {
    return this.catalog.alertDeliveries.some((d) => d.dedupeKey === dedupeKey);
  }

  // Job matches
  async getMatch(tenantId: string, userId: string, jobId: string): Promise<JobMatch | null> {
    return this.catalog.jobMatches.get(this.savedKey(tenantId, userId, jobId)) ?? null;
  }

  async upsertMatch(match: JobMatch): Promise<JobMatch> {
    this.catalog.jobMatches.set(
      this.savedKey(match.tenantId, match.userId, match.canonicalJobId),
      match,
    );
    return match;
  }

  // Interactions
  async listInteractions(tenantId: string, userId: string, jobId?: string): Promise<JobInteraction[]> {
    return this.interactions.filter(
      (i) =>
        i.tenantId === tenantId &&
        i.userId === userId &&
        (!jobId || i.canonicalJobId === jobId),
    );
  }

  async createInteraction(interaction: JobInteraction): Promise<JobInteraction> {
    const withId = { ...interaction, id: interaction.id || newId("int") };
    this.interactions.push(withId);
    return withId;
  }

  // Opportunity briefs
  private briefKey(tenantId: string, userId: string, jobId: string): string {
    return `${tenantId}:${userId}:${jobId}`;
  }

  async getBrief(
    tenantId: string,
    userId: string,
    jobId: string,
  ): Promise<PersistedOpportunityBrief | null> {
    const brief = this.briefs.get(this.briefKey(tenantId, userId, jobId));
    if (!brief) return null;
    // Check expiry
    if (new Date(brief.expiresAt) < new Date()) {
      this.briefs.delete(this.briefKey(tenantId, userId, jobId));
      return null;
    }
    return brief;
  }

  async upsertBrief(brief: PersistedOpportunityBrief): Promise<PersistedOpportunityBrief> {
    this.briefs.set(this.briefKey(brief.tenantId, brief.userId, brief.canonicalJobId), brief);
    return brief;
  }
}

/**
 * Create a memory store wrapping an existing catalog.
 */
export function createMemoryRadarStore(catalog: CanonicalJobCatalog): MemoryRadarStore {
  return new MemoryRadarStore(catalog);
}
