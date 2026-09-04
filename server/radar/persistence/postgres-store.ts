/**
 * CandidArc Radar — Postgres Store (Release A.6)
 *
 * PostgreSQL implementation of RadarStore using Drizzle.
 * Provides persistence for catalog jobs and user data.
 * Supports FTS via search_vector column when available.
 */

import { eq, and, sql, desc, ilike } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
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
import * as schema from "../../database/schema";

// Type alias for the database client
type Db = PostgresJsDatabase<typeof schema>;

/**
 * PostgreSQL-based RadarStore implementation.
 */
export class PostgresRadarStore implements RadarStore {
  constructor(private readonly db: Db) {}

  // Companies
  async getCompany(id: string): Promise<Company | null> {
    const [row] = await this.db
      .select()
      .from(schema.radarCompanies)
      .where(eq(schema.radarCompanies.id, id))
      .limit(1);
    return row ? this.mapCompany(row) : null;
  }

  async getCompanyByNormalizedName(name: string): Promise<Company | null> {
    const [row] = await this.db
      .select()
      .from(schema.radarCompanies)
      .where(eq(schema.radarCompanies.normalizedName, name))
      .limit(1);
    return row ? this.mapCompany(row) : null;
  }

  async upsertCompany(company: Company): Promise<Company> {
    const [row] = await this.db
      .insert(schema.radarCompanies)
      .values({
        id: company.id,
        publicId: company.publicId,
        name: company.name,
        normalizedName: company.normalizedName,
        domain: company.domain,
        careersUrl: company.careersUrl,
        aliases: company.aliases,
        createdAt: new Date(company.createdAt),
        updatedAt: new Date(company.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.radarCompanies.id,
        set: {
          name: company.name,
          normalizedName: company.normalizedName,
          domain: company.domain,
          careersUrl: company.careersUrl,
          aliases: company.aliases,
          updatedAt: new Date(),
        },
      })
      .returning();
    return this.mapCompany(row);
  }

  private mapCompany(row: typeof schema.radarCompanies.$inferSelect): Company {
    return {
      id: row.id,
      publicId: row.publicId,
      name: row.name,
      normalizedName: row.normalizedName,
      domain: row.domain ?? undefined,
      careersUrl: row.careersUrl ?? undefined,
      aliases: (row.aliases as string[]) ?? [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // Sources
  async getSource(id: string): Promise<JobSource | null> {
    const [row] = await this.db
      .select()
      .from(schema.radarJobSources)
      .where(eq(schema.radarJobSources.id, id))
      .limit(1);
    return row ? this.mapSource(row) : null;
  }

  async listSources(): Promise<JobSource[]> {
    const rows = await this.db.select().from(schema.radarJobSources);
    return rows.map((r) => this.mapSource(r));
  }

  async upsertSource(source: JobSource): Promise<JobSource> {
    const [row] = await this.db
      .insert(schema.radarJobSources)
      .values({
        id: source.id,
        publicId: source.publicId,
        providerId: source.providerId,
        displayName: source.displayName,
        accessMethod: source.accessMethod,
        baseUrl: source.baseUrl,
        enabled: source.enabled,
        createdAt: new Date(source.createdAt),
        updatedAt: new Date(source.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.radarJobSources.id,
        set: {
          displayName: source.displayName,
          accessMethod: source.accessMethod,
          baseUrl: source.baseUrl,
          enabled: source.enabled,
          updatedAt: new Date(),
        },
      })
      .returning();
    return this.mapSource(row);
  }

  private mapSource(row: typeof schema.radarJobSources.$inferSelect): JobSource {
    return {
      id: row.id,
      publicId: row.publicId,
      providerId: row.providerId,
      displayName: row.displayName,
      accessMethod: row.accessMethod as JobSource["accessMethod"],
      baseUrl: row.baseUrl ?? undefined,
      enabled: row.enabled,
      policy: {
        sourceId: row.id,
        accessMethod: row.accessMethod as JobSource["accessMethod"],
        termsUrl: "",
        licenseStatus: "public",
        allowedFields: [],
        attributionRequired: true,
        attributionText: "",
        fullDescriptionAllowed: true,
        retentionDays: null,
        refreshLimitPerDay: null,
        requestsPerMinute: 30,
        removalRequired: false,
        commercialUseAllowed: false,
        lastComplianceReview: new Date().toISOString(),
        enabled: row.enabled,
      },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // Jobs
  async getJob(id: string): Promise<CanonicalJob | null> {
    const [row] = await this.db
      .select()
      .from(schema.radarCanonicalJobs)
      .where(eq(schema.radarCanonicalJobs.id, id))
      .limit(1);
    return row ? this.mapJob(row) : null;
  }

  async getJobByPublicId(publicId: string): Promise<CanonicalJob | null> {
    const [row] = await this.db
      .select()
      .from(schema.radarCanonicalJobs)
      .where(eq(schema.radarCanonicalJobs.publicId, publicId))
      .limit(1);
    return row ? this.mapJob(row) : null;
  }

  async listJobs(opts?: { status?: string; limit?: number; offset?: number }): Promise<CanonicalJob[]> {
    const status = opts?.status as "open" | "closed" | "expired" | "unknown" | undefined;
    const rows = status
      ? await this.db
          .select()
          .from(schema.radarCanonicalJobs)
          .where(eq(schema.radarCanonicalJobs.status, status))
          .limit(opts?.limit ?? 100)
          .offset(opts?.offset ?? 0)
      : await this.db
          .select()
          .from(schema.radarCanonicalJobs)
          .limit(opts?.limit ?? 100)
          .offset(opts?.offset ?? 0);
    return rows.map((r) => this.mapJob(r));
  }

  async upsertJob(job: CanonicalJob): Promise<CanonicalJob> {
    const [row] = await this.db
      .insert(schema.radarCanonicalJobs)
      .values({
        publicId: job.publicId,
        companyId: job.companyId,
        companyName: job.companyName,
        title: job.title,
        normalizedTitle: job.normalizedTitle,
        department: job.department,
        team: job.team,
        employmentType: job.employmentType,
        seniority: job.seniority,
        description: job.description,
        requirements: job.requirements,
        preferredQualifications: job.preferredQualifications,
        responsibilities: job.responsibilities,
        compensation: job.compensation,
        locations: job.locations,
        remotePolicy: job.remotePolicy,
        visaSponsorship: job.visaSponsorship,
        degreeRequired: job.degreeRequired,
        securityClearanceRequired: job.securityClearanceRequired,
        techStack: job.techStack,
        canonicalApplicationUrl: job.canonicalApplicationUrl,
        employerRequisitionId: job.employerRequisitionId,
        originalPostedAt: job.originalPostedAt ? new Date(job.originalPostedAt) : null,
        originalPostedPrecision: job.originalPostedPrecision,
        firstDiscoveredAt: new Date(job.firstDiscoveredAt),
        lastVerifiedAt: job.lastVerifiedAt ? new Date(job.lastVerifiedAt) : null,
        lastVerifiedPrecision: job.lastVerifiedPrecision,
        repostedAt: job.repostedAt ? new Date(job.repostedAt) : null,
        closedAt: job.closedAt ? new Date(job.closedAt) : null,
        reopenedAt: job.reopenedAt ? new Date(job.reopenedAt) : null,
        status: job.status,
        verificationState: job.verificationState,
        classification: job.classification,
        classificationConfidence: String(job.classificationConfidence),
        confidence: String(job.confidence),
        primarySourceId: job.primarySourceId,
        repostCount: job.repostCount,
        companyDirect: job.companyDirect,
        demoData: job.demoData ?? false,
        createdAt: new Date(job.createdAt),
        updatedAt: new Date(job.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.radarCanonicalJobs.id,
        set: {
          companyName: job.companyName,
          title: job.title,
          normalizedTitle: job.normalizedTitle,
          description: job.description,
          status: job.status,
          verificationState: job.verificationState,
          classification: job.classification,
          classificationConfidence: String(job.classificationConfidence),
          lastVerifiedAt: job.lastVerifiedAt ? new Date(job.lastVerifiedAt) : null,
          repostedAt: job.repostedAt ? new Date(job.repostedAt) : null,
          repostCount: job.repostCount,
          updatedAt: new Date(),
        },
      })
      .returning();
    return this.mapJob(row);
  }

  async searchJobs(query: string, limit = 20): Promise<CanonicalJob[]> {
    // Try FTS if available, fall back to ILIKE
    try {
      const rows = await this.db
        .select()
        .from(schema.radarCanonicalJobs)
        .where(
          sql`search_vector @@ plainto_tsquery('english', ${query})`,
        )
        .orderBy(desc(schema.radarCanonicalJobs.firstDiscoveredAt))
        .limit(limit);
      return rows.map((r) => this.mapJob(r));
    } catch {
      // Fall back to ILIKE
      const pattern = `%${query}%`;
      const rows = await this.db
        .select()
        .from(schema.radarCanonicalJobs)
        .where(
          sql`${schema.radarCanonicalJobs.title} ILIKE ${pattern} OR ${schema.radarCanonicalJobs.companyName} ILIKE ${pattern} OR ${schema.radarCanonicalJobs.description} ILIKE ${pattern}`,
        )
        .limit(limit);
      return rows.map((r) => this.mapJob(r));
    }
  }

  private mapJob(row: typeof schema.radarCanonicalJobs.$inferSelect): CanonicalJob {
    return {
      id: row.id,
      publicId: row.publicId,
      companyId: row.companyId,
      companyName: row.companyName,
      title: row.title,
      normalizedTitle: row.normalizedTitle,
      department: row.department ?? undefined,
      team: row.team ?? undefined,
      employmentType: row.employmentType ?? undefined,
      seniority: row.seniority ?? undefined,
      description: row.description,
      requirements: row.requirements ?? undefined,
      preferredQualifications: row.preferredQualifications ?? undefined,
      responsibilities: row.responsibilities ?? undefined,
      compensation: row.compensation as CanonicalJob["compensation"],
      locations: (row.locations as string[]) ?? [],
      remotePolicy: row.remotePolicy as CanonicalJob["remotePolicy"],
      visaSponsorship: row.visaSponsorship ?? undefined,
      degreeRequired: row.degreeRequired ?? undefined,
      securityClearanceRequired: row.securityClearanceRequired ?? undefined,
      techStack: (row.techStack as string[]) ?? [],
      canonicalApplicationUrl: row.canonicalApplicationUrl ?? undefined,
      employerRequisitionId: row.employerRequisitionId ?? undefined,
      originalPostedAt: row.originalPostedAt?.toISOString() ?? null,
      originalPostedPrecision: row.originalPostedPrecision as CanonicalJob["originalPostedPrecision"],
      firstDiscoveredAt: row.firstDiscoveredAt.toISOString(),
      lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
      lastVerifiedPrecision: row.lastVerifiedPrecision as CanonicalJob["lastVerifiedPrecision"],
      repostedAt: row.repostedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      reopenedAt: row.reopenedAt?.toISOString() ?? null,
      status: row.status as CanonicalJob["status"],
      verificationState: row.verificationState as CanonicalJob["verificationState"],
      classification: row.classification as CanonicalJob["classification"],
      classificationConfidence: Number(row.classificationConfidence),
      confidence: Number(row.confidence),
      primarySourceId: row.primarySourceId ?? "",
      repostCount: row.repostCount,
      companyDirect: row.companyDirect,
      demoData: row.demoData,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // Sightings - stub implementations (would need full implementation)
  async getSighting(id: string): Promise<JobSighting | null> {
    // TODO: Implement when radar sightings table schema is added
    return null;
  }

  async getSightingBySourceListing(sourceId: string, listingId: string): Promise<JobSighting | null> {
    return null;
  }

  async listSightingsForJob(jobId: string): Promise<JobSighting[]> {
    return [];
  }

  async upsertSighting(sighting: JobSighting): Promise<JobSighting> {
    return sighting;
  }

  // Snapshots - stub
  async getSnapshot(id: string): Promise<JobSnapshot | null> {
    return null;
  }

  async listSnapshotsForSighting(sightingId: string): Promise<JobSnapshot[]> {
    return [];
  }

  async createSnapshot(snapshot: JobSnapshot): Promise<JobSnapshot> {
    return snapshot;
  }

  // History - stub
  async listHistoryForJob(jobId: string): Promise<JobHistoryEvent[]> {
    return [];
  }

  async createHistoryEvent(event: JobHistoryEvent): Promise<JobHistoryEvent> {
    return event;
  }

  // Provider checkpoints
  async getCheckpoint(providerId: string): Promise<ProviderCheckpoint | null> {
    const [row] = await this.db
      .select()
      .from(schema.radarProviderCheckpoints)
      .where(eq(schema.radarProviderCheckpoints.providerId, providerId))
      .limit(1);
    if (!row) return null;
    return {
      providerId: row.providerId,
      lastFetchedAt: row.lastFetchedAt.toISOString(),
      lastCursor: row.lastCursor ?? undefined,
      lastJobCount: row.lastJobCount ?? undefined,
      metadata: row.metadata as Record<string, unknown> | undefined,
    };
  }

  async setCheckpoint(checkpoint: ProviderCheckpoint): Promise<void> {
    await this.db
      .insert(schema.radarProviderCheckpoints)
      .values({
        providerId: checkpoint.providerId,
        lastFetchedAt: new Date(checkpoint.lastFetchedAt),
        lastCursor: checkpoint.lastCursor,
        lastJobCount: checkpoint.lastJobCount,
        metadata: checkpoint.metadata,
      })
      .onConflictDoUpdate({
        target: schema.radarProviderCheckpoints.providerId,
        set: {
          lastFetchedAt: new Date(checkpoint.lastFetchedAt),
          lastCursor: checkpoint.lastCursor,
          lastJobCount: checkpoint.lastJobCount,
          metadata: checkpoint.metadata,
        },
      });
  }

  // User data - simplified stubs for now
  async getSavedJob(tenantId: string, userId: string, jobId: string): Promise<SavedJob | null> {
    return null;
  }
  async listSavedJobs(tenantId: string, userId: string): Promise<SavedJob[]> {
    return [];
  }
  async saveJob(savedJob: SavedJob): Promise<SavedJob> {
    return savedJob;
  }
  async unsaveJob(tenantId: string, userId: string, jobId: string): Promise<void> {}

  async getHiddenJob(tenantId: string, userId: string, jobId: string): Promise<HiddenJob | null> {
    return null;
  }
  async listHiddenJobs(tenantId: string, userId: string): Promise<HiddenJob[]> {
    return [];
  }
  async hideJob(hiddenJob: HiddenJob): Promise<HiddenJob> {
    return hiddenJob;
  }
  async unhideJob(tenantId: string, userId: string, jobId: string): Promise<void> {}

  async getSavedSearch(tenantId: string, id: string): Promise<SavedSearch | null> {
    return null;
  }
  async listSavedSearches(tenantId: string, userId: string): Promise<SavedSearch[]> {
    return [];
  }
  async createSavedSearch(search: SavedSearch): Promise<SavedSearch> {
    return search;
  }
  async updateSavedSearch(
    tenantId: string,
    id: string,
    patch: Partial<Pick<SavedSearch, "name" | "query" | "alertEnabled">>,
  ): Promise<SavedSearch> {
    throw new Error("Not implemented");
  }
  async deleteSavedSearch(tenantId: string, id: string): Promise<void> {}

  async getAlert(tenantId: string, id: string): Promise<JobAlert | null> {
    return null;
  }
  async listAlerts(tenantId: string, userId: string): Promise<JobAlert[]> {
    return [];
  }
  async createAlert(alert: JobAlert): Promise<JobAlert> {
    return alert;
  }
  async updateAlert(tenantId: string, id: string, patch: Partial<JobAlert>): Promise<JobAlert> {
    throw new Error("Not implemented");
  }
  async deleteAlert(tenantId: string, id: string): Promise<void> {}

  async listDeliveries(tenantId: string, userId: string): Promise<JobAlertDelivery[]> {
    return [];
  }
  async createDelivery(delivery: JobAlertDelivery): Promise<JobAlertDelivery> {
    return delivery;
  }
  async deliveryExists(dedupeKey: string): Promise<boolean> {
    return false;
  }

  async getMatch(tenantId: string, userId: string, jobId: string): Promise<JobMatch | null> {
    return null;
  }
  async upsertMatch(match: JobMatch): Promise<JobMatch> {
    return match;
  }

  async listInteractions(tenantId: string, userId: string, jobId?: string): Promise<JobInteraction[]> {
    return [];
  }
  async createInteraction(interaction: JobInteraction): Promise<JobInteraction> {
    return interaction;
  }

  async getBrief(tenantId: string, userId: string, jobId: string): Promise<PersistedOpportunityBrief | null> {
    return null;
  }
  async upsertBrief(brief: PersistedOpportunityBrief): Promise<PersistedOpportunityBrief> {
    return brief;
  }

  // Hydration for catalog sync
  async hydrateCatalog(): Promise<{
    companies: Company[];
    sources: JobSource[];
    jobs: CanonicalJob[];
    sightings: JobSighting[];
  }> {
    const [companies, sources, jobs] = await Promise.all([
      this.db.select().from(schema.radarCompanies),
      this.db.select().from(schema.radarJobSources),
      this.db.select().from(schema.radarCanonicalJobs),
    ]);

    return {
      companies: companies.map((c) => this.mapCompany(c)),
      sources: sources.map((s) => this.mapSource(s)),
      jobs: jobs.map((j) => this.mapJob(j)),
      sightings: [], // Would need sightings table implementation
    };
  }
}

/**
 * Create a postgres store with the given database client.
 */
export function createPostgresRadarStore(db: Db): PostgresRadarStore {
  return new PostgresRadarStore(db);
}
