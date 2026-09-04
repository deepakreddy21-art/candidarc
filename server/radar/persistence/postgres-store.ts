/**
 * CandidArc Radar — Postgres Store (Release A.6)
 *
 * PostgreSQL implementation of RadarStore using Drizzle.
 * Provides persistence for catalog jobs and user data.
 * Supports FTS via search_vector column when available.
 */

import { randomUUID } from "crypto";
import { eq, and, or, sql, desc } from "drizzle-orm";
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

  // Sightings
  async getSighting(id: string): Promise<JobSighting | null> {
    const [row] = await this.db
      .select()
      .from(schema.radarJobSightings)
      .where(eq(schema.radarJobSightings.id, id))
      .limit(1);
    return row ? this.mapSighting(row) : null;
  }

  async getSightingBySourceListing(sourceId: string, listingId: string): Promise<JobSighting | null> {
    const [row] = await this.db
      .select()
      .from(schema.radarJobSightings)
      .where(
        and(
          eq(schema.radarJobSightings.sourceId, sourceId),
          eq(schema.radarJobSightings.sourceListingId, listingId),
        ),
      )
      .limit(1);
    return row ? this.mapSighting(row) : null;
  }

  async listSightingsForJob(jobId: string): Promise<JobSighting[]> {
    const rows = await this.db
      .select()
      .from(schema.radarJobSightings)
      .where(eq(schema.radarJobSightings.canonicalJobId, jobId))
      .orderBy(desc(schema.radarJobSightings.lastSeenAt));
    return rows.map((r) => this.mapSighting(r));
  }

  async upsertSighting(sighting: JobSighting): Promise<JobSighting> {
    const [row] = await this.db
      .insert(schema.radarJobSightings)
      .values({
        id: sighting.id,
        publicId: sighting.publicId,
        canonicalJobId: sighting.canonicalJobId,
        sourceId: sighting.sourceId,
        sourceListingId: sighting.sourceListingId,
        sourceCompanyIdentifier: sighting.sourceCompanyIdentifier,
        sourceRequisitionId: sighting.sourceRequisitionId,
        sourceUrl: sighting.sourceUrl,
        sourceApplyUrl: sighting.sourceApplyUrl,
        sourceTitle: sighting.sourceTitle,
        sourceLocation: sighting.sourceLocation,
        sourcePostedAt: sighting.sourcePostedAt ? new Date(sighting.sourcePostedAt) : null,
        sourcePostedPrecision: sighting.sourcePostedPrecision,
        sourceUpdatedAt: sighting.sourceUpdatedAt ? new Date(sighting.sourceUpdatedAt) : null,
        firstSeenAt: new Date(sighting.firstSeenAt),
        lastSeenAt: new Date(sighting.lastSeenAt),
        lastVerifiedAt: sighting.lastVerifiedAt ? new Date(sighting.lastVerifiedAt) : null,
        removedAt: sighting.removedAt ? new Date(sighting.removedAt) : null,
        repostedAt: sighting.repostedAt ? new Date(sighting.repostedAt) : null,
        validThrough: sighting.validThrough ? new Date(sighting.validThrough) : null,
        contentHash: sighting.contentHash,
        descriptionHash: sighting.descriptionHash,
        rawSnapshotId: sighting.rawSnapshotId,
        classification: sighting.classification,
        classificationConfidence: String(sighting.classificationConfidence),
        demoData: sighting.demoData ?? false,
        attribution: sighting.attribution,
        createdAt: new Date(sighting.createdAt),
        updatedAt: new Date(sighting.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.radarJobSightings.id,
        set: {
          lastSeenAt: new Date(sighting.lastSeenAt),
          lastVerifiedAt: sighting.lastVerifiedAt ? new Date(sighting.lastVerifiedAt) : null,
          removedAt: sighting.removedAt ? new Date(sighting.removedAt) : null,
          contentHash: sighting.contentHash,
          descriptionHash: sighting.descriptionHash,
          classification: sighting.classification,
          classificationConfidence: String(sighting.classificationConfidence),
          updatedAt: new Date(),
        },
      })
      .returning();
    return this.mapSighting(row);
  }

  private mapSighting(row: typeof schema.radarJobSightings.$inferSelect): JobSighting {
    return {
      id: row.id,
      publicId: row.publicId,
      canonicalJobId: row.canonicalJobId,
      sourceId: row.sourceId,
      sourceListingId: row.sourceListingId,
      sourceCompanyIdentifier: row.sourceCompanyIdentifier ?? undefined,
      sourceRequisitionId: row.sourceRequisitionId ?? undefined,
      sourceUrl: row.sourceUrl,
      sourceApplyUrl: row.sourceApplyUrl ?? undefined,
      sourceTitle: row.sourceTitle,
      sourceLocation: row.sourceLocation ?? undefined,
      sourcePostedAt: row.sourcePostedAt?.toISOString() ?? null,
      sourcePostedPrecision: row.sourcePostedPrecision as JobSighting["sourcePostedPrecision"],
      sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
      firstSeenAt: row.firstSeenAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
      removedAt: row.removedAt?.toISOString() ?? null,
      repostedAt: row.repostedAt?.toISOString() ?? null,
      validThrough: row.validThrough?.toISOString() ?? null,
      contentHash: row.contentHash,
      descriptionHash: row.descriptionHash,
      rawSnapshotId: row.rawSnapshotId ?? undefined,
      classification: row.classification as JobSighting["classification"],
      classificationConfidence: Number(row.classificationConfidence),
      demoData: row.demoData,
      attribution: row.attribution ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // Snapshots
  async getSnapshot(id: string): Promise<JobSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(schema.radarJobSnapshots)
      .where(eq(schema.radarJobSnapshots.id, id))
      .limit(1);
    return row ? this.mapSnapshot(row) : null;
  }

  async listSnapshotsForSighting(sightingId: string): Promise<JobSnapshot[]> {
    const rows = await this.db
      .select()
      .from(schema.radarJobSnapshots)
      .where(eq(schema.radarJobSnapshots.sightingId, sightingId))
      .orderBy(desc(schema.radarJobSnapshots.retrievedAt));
    return rows.map((r) => this.mapSnapshot(r));
  }

  async createSnapshot(snapshot: JobSnapshot): Promise<JobSnapshot> {
    const [row] = await this.db
      .insert(schema.radarJobSnapshots)
      .values({
        id: snapshot.id,
        sightingId: snapshot.sightingId,
        retrievedAt: new Date(snapshot.retrievedAt),
        contentHash: snapshot.contentHash,
        title: snapshot.title,
        description: snapshot.description,
        location: snapshot.location,
        compensation: snapshot.compensation,
        sourcePostedAt: snapshot.sourcePostedAt ? new Date(snapshot.sourcePostedAt) : null,
        applicationUrl: snapshot.applicationUrl,
        status: snapshot.status,
        rawPayloadRef: snapshot.rawPayloadRef,
        materialChangeSummary: snapshot.materialChangeSummary,
      })
      .returning();
    return this.mapSnapshot(row);
  }

  private mapSnapshot(row: typeof schema.radarJobSnapshots.$inferSelect): JobSnapshot {
    return {
      id: row.id,
      sightingId: row.sightingId,
      retrievedAt: row.retrievedAt.toISOString(),
      contentHash: row.contentHash,
      title: row.title,
      description: row.description,
      location: row.location ?? undefined,
      compensation: row.compensation as JobSnapshot["compensation"],
      sourcePostedAt: row.sourcePostedAt?.toISOString() ?? null,
      applicationUrl: row.applicationUrl ?? undefined,
      status: row.status as JobSnapshot["status"],
      rawPayloadRef: row.rawPayloadRef ?? undefined,
      materialChangeSummary: row.materialChangeSummary ?? undefined,
    };
  }

  // History
  async listHistoryForJob(jobId: string): Promise<JobHistoryEvent[]> {
    const rows = await this.db
      .select()
      .from(schema.radarJobHistoryEvents)
      .where(eq(schema.radarJobHistoryEvents.canonicalJobId, jobId))
      .orderBy(desc(schema.radarJobHistoryEvents.occurredAt));
    return rows.map((r) => this.mapHistoryEvent(r));
  }

  async createHistoryEvent(event: JobHistoryEvent): Promise<JobHistoryEvent> {
    const [row] = await this.db
      .insert(schema.radarJobHistoryEvents)
      .values({
        id: event.id,
        canonicalJobId: event.canonicalJobId,
        sightingId: event.sightingId,
        eventType: event.type,
        occurredAt: new Date(event.occurredAt),
        message: event.message,
        metadata: event.metadata,
      })
      .returning();
    return this.mapHistoryEvent(row);
  }

  private mapHistoryEvent(row: typeof schema.radarJobHistoryEvents.$inferSelect): JobHistoryEvent {
    return {
      id: row.id,
      canonicalJobId: row.canonicalJobId,
      sightingId: row.sightingId ?? undefined,
      type: row.eventType as JobHistoryEvent["type"],
      occurredAt: row.occurredAt.toISOString(),
      message: row.message,
      metadata: row.metadata as Record<string, unknown> | undefined,
    };
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

  // User data
  async getSavedJob(tenantId: string, userId: string, jobId: string): Promise<SavedJob | null> {
    const [row] = await this.db
      .select()
      .from(schema.radarSavedJobs)
      .where(
        and(
          eq(schema.radarSavedJobs.tenantId, tenantId),
          eq(schema.radarSavedJobs.userId, userId),
          eq(schema.radarSavedJobs.canonicalJobId, jobId),
        ),
      )
      .limit(1);
    return row ? this.mapSavedJob(row) : null;
  }

  async listSavedJobs(tenantId: string, userId: string): Promise<SavedJob[]> {
    const rows = await this.db
      .select()
      .from(schema.radarSavedJobs)
      .where(
        and(eq(schema.radarSavedJobs.tenantId, tenantId), eq(schema.radarSavedJobs.userId, userId)),
      )
      .orderBy(desc(schema.radarSavedJobs.createdAt));
    return rows.map((r) => this.mapSavedJob(r));
  }

  async saveJob(savedJob: SavedJob): Promise<SavedJob> {
    const [row] = await this.db
      .insert(schema.radarSavedJobs)
      .values({
        id: savedJob.id,
        tenantId: savedJob.tenantId,
        userId: savedJob.userId,
        canonicalJobId: savedJob.canonicalJobId,
        createdAt: new Date(savedJob.createdAt),
      })
      .onConflictDoUpdate({
        target: [
          schema.radarSavedJobs.tenantId,
          schema.radarSavedJobs.userId,
          schema.radarSavedJobs.canonicalJobId,
        ],
        set: { createdAt: new Date(savedJob.createdAt) },
      })
      .returning();
    return this.mapSavedJob(row);
  }

  async unsaveJob(tenantId: string, userId: string, jobId: string): Promise<void> {
    await this.db
      .delete(schema.radarSavedJobs)
      .where(
        and(
          eq(schema.radarSavedJobs.tenantId, tenantId),
          eq(schema.radarSavedJobs.userId, userId),
          eq(schema.radarSavedJobs.canonicalJobId, jobId),
        ),
      );
  }

  async getHiddenJob(tenantId: string, userId: string, jobId: string): Promise<HiddenJob | null> {
    const [row] = await this.db
      .select()
      .from(schema.radarHiddenJobs)
      .where(
        and(
          eq(schema.radarHiddenJobs.tenantId, tenantId),
          eq(schema.radarHiddenJobs.userId, userId),
          eq(schema.radarHiddenJobs.canonicalJobId, jobId),
        ),
      )
      .limit(1);
    return row ? this.mapHiddenJob(row) : null;
  }

  async listHiddenJobs(tenantId: string, userId: string): Promise<HiddenJob[]> {
    const rows = await this.db
      .select()
      .from(schema.radarHiddenJobs)
      .where(
        and(eq(schema.radarHiddenJobs.tenantId, tenantId), eq(schema.radarHiddenJobs.userId, userId)),
      )
      .orderBy(desc(schema.radarHiddenJobs.createdAt));
    return rows.map((r) => this.mapHiddenJob(r));
  }

  async hideJob(hiddenJob: HiddenJob): Promise<HiddenJob> {
    const [row] = await this.db
      .insert(schema.radarHiddenJobs)
      .values({
        id: hiddenJob.id,
        tenantId: hiddenJob.tenantId,
        userId: hiddenJob.userId,
        canonicalJobId: hiddenJob.canonicalJobId,
        createdAt: new Date(hiddenJob.createdAt),
      })
      .onConflictDoUpdate({
        target: [
          schema.radarHiddenJobs.tenantId,
          schema.radarHiddenJobs.userId,
          schema.radarHiddenJobs.canonicalJobId,
        ],
        set: { createdAt: new Date(hiddenJob.createdAt) },
      })
      .returning();
    return this.mapHiddenJob(row);
  }

  async unhideJob(tenantId: string, userId: string, jobId: string): Promise<void> {
    await this.db
      .delete(schema.radarHiddenJobs)
      .where(
        and(
          eq(schema.radarHiddenJobs.tenantId, tenantId),
          eq(schema.radarHiddenJobs.userId, userId),
          eq(schema.radarHiddenJobs.canonicalJobId, jobId),
        ),
      );
  }

  async getSavedSearch(tenantId: string, id: string): Promise<SavedSearch | null> {
    const [row] = await this.db
      .select()
      .from(schema.radarSavedSearches)
      .where(
        and(
          eq(schema.radarSavedSearches.tenantId, tenantId),
          or(eq(schema.radarSavedSearches.id, id), eq(schema.radarSavedSearches.publicId, id)),
        ),
      )
      .limit(1);
    return row ? this.mapSavedSearch(row) : null;
  }

  async listSavedSearches(tenantId: string, userId: string): Promise<SavedSearch[]> {
    const rows = await this.db
      .select()
      .from(schema.radarSavedSearches)
      .where(
        and(
          eq(schema.radarSavedSearches.tenantId, tenantId),
          eq(schema.radarSavedSearches.userId, userId),
        ),
      )
      .orderBy(desc(schema.radarSavedSearches.updatedAt));
    return rows.map((r) => this.mapSavedSearch(r));
  }

  async createSavedSearch(search: SavedSearch): Promise<SavedSearch> {
    const [row] = await this.db
      .insert(schema.radarSavedSearches)
      .values({
        id: search.id,
        publicId: search.publicId,
        tenantId: search.tenantId,
        userId: search.userId,
        name: search.name,
        query: search.query,
        alertEnabled: search.alertEnabled,
        createdAt: new Date(search.createdAt),
        updatedAt: new Date(search.updatedAt),
      })
      .returning();
    return this.mapSavedSearch(row);
  }

  async updateSavedSearch(
    tenantId: string,
    id: string,
    patch: Partial<Pick<SavedSearch, "name" | "query" | "alertEnabled">>,
  ): Promise<SavedSearch> {
    const existing = await this.getSavedSearch(tenantId, id);
    if (!existing) throw new Error("Saved search not found");

    const [row] = await this.db
      .update(schema.radarSavedSearches)
      .set({
        name: patch.name ?? existing.name,
        query: patch.query ?? existing.query,
        alertEnabled: patch.alertEnabled ?? existing.alertEnabled,
        updatedAt: new Date(),
      })
      .where(eq(schema.radarSavedSearches.id, existing.id))
      .returning();
    return this.mapSavedSearch(row);
  }

  async deleteSavedSearch(tenantId: string, id: string): Promise<void> {
    const existing = await this.getSavedSearch(tenantId, id);
    if (!existing) return;
    await this.db.delete(schema.radarSavedSearches).where(eq(schema.radarSavedSearches.id, existing.id));
  }

  async getAlert(tenantId: string, id: string): Promise<JobAlert | null> {
    const [row] = await this.db
      .select()
      .from(schema.radarJobAlerts)
      .where(
        and(
          eq(schema.radarJobAlerts.tenantId, tenantId),
          or(eq(schema.radarJobAlerts.id, id), eq(schema.radarJobAlerts.publicId, id)),
        ),
      )
      .limit(1);
    return row ? this.mapAlert(row) : null;
  }

  async listAlerts(tenantId: string, userId: string): Promise<JobAlert[]> {
    const rows = await this.db
      .select()
      .from(schema.radarJobAlerts)
      .where(
        and(eq(schema.radarJobAlerts.tenantId, tenantId), eq(schema.radarJobAlerts.userId, userId)),
      )
      .orderBy(desc(schema.radarJobAlerts.updatedAt));
    return rows.map((r) => this.mapAlert(r));
  }

  async createAlert(alert: JobAlert): Promise<JobAlert> {
    const [row] = await this.db
      .insert(schema.radarJobAlerts)
      .values({
        id: alert.id,
        publicId: alert.publicId,
        tenantId: alert.tenantId,
        userId: alert.userId,
        name: alert.name,
        savedSearchId: alert.savedSearchId,
        query: alert.query,
        cadence: alert.cadence,
        enabled: alert.enabled,
        includeReposts: alert.includeReposts,
        includeRefreshes: alert.includeRefreshes,
        lastEvaluatedAt: alert.lastEvaluatedAt ? new Date(alert.lastEvaluatedAt) : null,
        createdAt: new Date(alert.createdAt),
        updatedAt: new Date(alert.updatedAt),
      })
      .returning();
    return this.mapAlert(row);
  }

  async updateAlert(tenantId: string, id: string, patch: Partial<JobAlert>): Promise<JobAlert> {
    const existing = await this.getAlert(tenantId, id);
    if (!existing) throw new Error("Alert not found");

    const [row] = await this.db
      .update(schema.radarJobAlerts)
      .set({
        name: patch.name ?? existing.name,
        savedSearchId: patch.savedSearchId ?? existing.savedSearchId,
        query: patch.query ?? existing.query,
        cadence: patch.cadence ?? existing.cadence,
        enabled: patch.enabled ?? existing.enabled,
        includeReposts: patch.includeReposts ?? existing.includeReposts,
        includeRefreshes: patch.includeRefreshes ?? existing.includeRefreshes,
        lastEvaluatedAt:
          patch.lastEvaluatedAt !== undefined
            ? patch.lastEvaluatedAt
              ? new Date(patch.lastEvaluatedAt)
              : null
            : existing.lastEvaluatedAt
              ? new Date(existing.lastEvaluatedAt)
              : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.radarJobAlerts.id, existing.id))
      .returning();
    return this.mapAlert(row);
  }

  async deleteAlert(tenantId: string, id: string): Promise<void> {
    const existing = await this.getAlert(tenantId, id);
    if (!existing) return;
    await this.db.delete(schema.radarJobAlerts).where(eq(schema.radarJobAlerts.id, existing.id));
  }

  async listDeliveries(tenantId: string, userId: string): Promise<JobAlertDelivery[]> {
    const rows = await this.db
      .select()
      .from(schema.radarJobAlertDeliveries)
      .where(
        and(
          eq(schema.radarJobAlertDeliveries.tenantId, tenantId),
          eq(schema.radarJobAlertDeliveries.userId, userId),
        ),
      )
      .orderBy(desc(schema.radarJobAlertDeliveries.deliveredAt));
    return rows.map((r) => this.mapDelivery(r));
  }

  async createDelivery(delivery: JobAlertDelivery): Promise<JobAlertDelivery> {
    const [row] = await this.db
      .insert(schema.radarJobAlertDeliveries)
      .values({
        id: delivery.id,
        alertId: delivery.alertId,
        tenantId: delivery.tenantId,
        userId: delivery.userId,
        canonicalJobId: delivery.canonicalJobId,
        classification: delivery.classification,
        deliveredAt: new Date(delivery.deliveredAt),
        channel: delivery.channel,
        message: delivery.message,
        dedupeKey: delivery.dedupeKey,
      })
      .returning();
    return this.mapDelivery(row);
  }

  async deliveryExists(dedupeKey: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.radarJobAlertDeliveries.id })
      .from(schema.radarJobAlertDeliveries)
      .where(eq(schema.radarJobAlertDeliveries.dedupeKey, dedupeKey))
      .limit(1);
    return Boolean(row);
  }

  async getMatch(tenantId: string, userId: string, jobId: string): Promise<JobMatch | null> {
    const [row] = await this.db
      .select()
      .from(schema.radarJobMatches)
      .where(
        and(
          eq(schema.radarJobMatches.tenantId, tenantId),
          eq(schema.radarJobMatches.userId, userId),
          eq(schema.radarJobMatches.canonicalJobId, jobId),
        ),
      )
      .limit(1);
    return row ? this.mapMatch(row) : null;
  }

  async upsertMatch(match: JobMatch): Promise<JobMatch> {
    const [row] = await this.db
      .insert(schema.radarJobMatches)
      .values({
        id: match.id,
        tenantId: match.tenantId,
        userId: match.userId,
        canonicalJobId: match.canonicalJobId,
        score: String(match.score),
        breakdown: match.breakdown,
        computedAt: new Date(match.computedAt),
      })
      .onConflictDoUpdate({
        target: [
          schema.radarJobMatches.tenantId,
          schema.radarJobMatches.userId,
          schema.radarJobMatches.canonicalJobId,
        ],
        set: {
          score: String(match.score),
          breakdown: match.breakdown,
          computedAt: new Date(match.computedAt),
        },
      })
      .returning();
    return this.mapMatch(row);
  }

  async listInteractions(tenantId: string, userId: string, jobId?: string): Promise<JobInteraction[]> {
    const conditions = [
      eq(schema.radarJobInteractions.tenantId, tenantId),
      eq(schema.radarJobInteractions.userId, userId),
    ];
    if (jobId) {
      conditions.push(eq(schema.radarJobInteractions.canonicalJobId, jobId));
    }

    const rows = await this.db
      .select()
      .from(schema.radarJobInteractions)
      .where(and(...conditions))
      .orderBy(desc(schema.radarJobInteractions.createdAt));
    return rows.map((r) => this.mapInteraction(r));
  }

  async createInteraction(interaction: JobInteraction): Promise<JobInteraction> {
    const id = interaction.id || `int_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const [row] = await this.db
      .insert(schema.radarJobInteractions)
      .values({
        id,
        tenantId: interaction.tenantId,
        userId: interaction.userId,
        canonicalJobId: interaction.canonicalJobId,
        interactionType: interaction.interactionType,
        metadata: interaction.metadata,
        createdAt: new Date(interaction.createdAt),
      })
      .returning();
    return this.mapInteraction(row);
  }

  async getBrief(tenantId: string, userId: string, jobId: string): Promise<PersistedOpportunityBrief | null> {
    const [row] = await this.db
      .select()
      .from(schema.radarOpportunityBriefs)
      .where(
        and(
          eq(schema.radarOpportunityBriefs.tenantId, tenantId),
          eq(schema.radarOpportunityBriefs.userId, userId),
          eq(schema.radarOpportunityBriefs.canonicalJobId, jobId),
        ),
      )
      .limit(1);
    if (!row) return null;

    const brief = this.mapBrief(row);
    if (new Date(brief.expiresAt) < new Date()) {
      await this.db
        .delete(schema.radarOpportunityBriefs)
        .where(eq(schema.radarOpportunityBriefs.id, row.id));
      return null;
    }
    return brief;
  }

  async upsertBrief(brief: PersistedOpportunityBrief): Promise<PersistedOpportunityBrief> {
    const [row] = await this.db
      .insert(schema.radarOpportunityBriefs)
      .values({
        id: brief.id,
        tenantId: brief.tenantId,
        userId: brief.userId,
        canonicalJobId: brief.canonicalJobId,
        brief: brief.brief,
        generatedAt: new Date(brief.generatedAt),
        expiresAt: new Date(brief.expiresAt),
        createdAt: new Date(brief.generatedAt),
      })
      .onConflictDoUpdate({
        target: [
          schema.radarOpportunityBriefs.tenantId,
          schema.radarOpportunityBriefs.userId,
          schema.radarOpportunityBriefs.canonicalJobId,
        ],
        set: {
          brief: brief.brief,
          generatedAt: new Date(brief.generatedAt),
          expiresAt: new Date(brief.expiresAt),
        },
      })
      .returning();
    return this.mapBrief(row);
  }

  private mapSavedJob(row: typeof schema.radarSavedJobs.$inferSelect): SavedJob {
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      canonicalJobId: row.canonicalJobId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapHiddenJob(row: typeof schema.radarHiddenJobs.$inferSelect): HiddenJob {
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      canonicalJobId: row.canonicalJobId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapSavedSearch(row: typeof schema.radarSavedSearches.$inferSelect): SavedSearch {
    return {
      id: row.id,
      publicId: row.publicId,
      tenantId: row.tenantId,
      userId: row.userId,
      name: row.name,
      query: row.query as SavedSearch["query"],
      alertEnabled: row.alertEnabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapAlert(row: typeof schema.radarJobAlerts.$inferSelect): JobAlert {
    return {
      id: row.id,
      publicId: row.publicId,
      tenantId: row.tenantId,
      userId: row.userId,
      name: row.name,
      savedSearchId: row.savedSearchId ?? undefined,
      query: row.query as JobAlert["query"],
      cadence: row.cadence as JobAlert["cadence"],
      enabled: row.enabled,
      includeReposts: row.includeReposts,
      includeRefreshes: row.includeRefreshes,
      lastEvaluatedAt: row.lastEvaluatedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapDelivery(row: typeof schema.radarJobAlertDeliveries.$inferSelect): JobAlertDelivery {
    return {
      id: row.id,
      alertId: row.alertId,
      tenantId: row.tenantId,
      userId: row.userId,
      canonicalJobId: row.canonicalJobId,
      classification: row.classification as JobAlertDelivery["classification"],
      deliveredAt: row.deliveredAt.toISOString(),
      channel: row.channel as JobAlertDelivery["channel"],
      message: row.message,
      dedupeKey: row.dedupeKey,
    };
  }

  private mapMatch(row: typeof schema.radarJobMatches.$inferSelect): JobMatch {
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      canonicalJobId: row.canonicalJobId,
      score: Number(row.score),
      breakdown: row.breakdown as JobMatch["breakdown"],
      computedAt: row.computedAt.toISOString(),
    };
  }

  private mapInteraction(row: typeof schema.radarJobInteractions.$inferSelect): JobInteraction {
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      canonicalJobId: row.canonicalJobId,
      interactionType: row.interactionType,
      metadata: row.metadata as Record<string, unknown> | undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapBrief(row: typeof schema.radarOpportunityBriefs.$inferSelect): PersistedOpportunityBrief {
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      canonicalJobId: row.canonicalJobId,
      brief: row.brief as PersistedOpportunityBrief["brief"],
      generatedAt: row.generatedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  // Hydration for catalog sync
  async hydrateCatalog(): Promise<{
    companies: Company[];
    sources: JobSource[];
    jobs: CanonicalJob[];
    sightings: JobSighting[];
  }> {
    const [companies, sources, jobs, sightings] = await Promise.all([
      this.db.select().from(schema.radarCompanies),
      this.db.select().from(schema.radarJobSources),
      this.db.select().from(schema.radarCanonicalJobs),
      this.db.select().from(schema.radarJobSightings),
    ]);

    return {
      companies: companies.map((c) => this.mapCompany(c)),
      sources: sources.map((s) => this.mapSource(s)),
      jobs: jobs.map((j) => this.mapJob(j)),
      sightings: sightings.map((s) => this.mapSighting(s)),
    };
  }
}

/**
 * Create a postgres store with the given database client.
 */
export function createPostgresRadarStore(db: Db): PostgresRadarStore {
  return new PostgresRadarStore(db);
}
