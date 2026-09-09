import type { AuthContext } from "../auth/guards";
import { requireTenantMembership, requireUser } from "../auth/guards";
import { AppError, type CreateApplicationInput } from "../domain/types";
import type { ApplicationsService } from "../modules/applications/service";
import type { CustomerGenerateService } from "../modules/resumes/customer-generate";
import type { Repositories } from "../database/repositories";
import {
  getSharedCatalog,
  type CanonicalJobCatalog,
  SEED_CANDIDATE_PROFILE,
} from "./catalog";
import { RadarSearchIndex } from "./search-index";
import { loadCandidateProfileForMatch, EMPTY_PROFILE } from "./profile";
import { enhanceMatchBreakdown } from "./match-labels";
import { getEnv } from "../config/env";
import type {
  CandidateProfileForMatch,
  JobAlert,
  JobSearchQuery,
  SavedSearch,
} from "./types";
import type { PersistedOpportunityBrief, RadarStore } from "./persistence/types";
import type { JobSourceListing } from "./providers/types";
import { createHash, randomUUID } from "crypto";

/** Interaction types for job interactions tracking */
export type JobInteractionType =
  | "view"
  | "expand"
  | "save"
  | "unsave"
  | "hide"
  | "apply"
  | "tailor_resume"
  | "open_listing"
  | "share";

/** Opportunity brief response */
export interface OpportunityBrief {
  jobId: string;
  summary: string;
  companyOverview?: string;
  roleHighlights: string[];
  skillsAlignment: string[];
  concerns: string[];
  resumeReadinessLabel: "ready" | "needs_work" | "significant_gaps";
  researchUrls?: string[];
  generatedAt: string;
  cached: boolean;
}

const BRIEF_ALGO_VERSION = "opportunity-brief-v2";
const BRIEF_TTL_MS = 24 * 60 * 60 * 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Deterministic UUID for provider source ids that are not already UUIDs. */
function stableSourceUuid(sourceKey: string): string {
  const hash = createHash("sha256").update(`candidarc.radar.source:${sourceKey}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function profileRevisionOf(profile: CandidateProfileForMatch): string {
  return [
    profile.skills.slice().sort().join(","),
    (profile.careerGoals ?? []).slice().sort().join(","),
    (profile.preferredLocations ?? []).slice().sort().join(","),
    profile.seniority ?? "",
    String(profile.yearsExperience ?? ""),
    String(profile.targetCompensationMin ?? ""),
    String(profile.remoteOk ?? ""),
  ].join("|");
}

function briefCacheKey(
  tenantId: string,
  userId: string,
  jobId: string,
  jobUpdatedAt: string,
  profileRevision: string,
): string {
  return `${tenantId}:${userId}:${jobId}:${jobUpdatedAt}:${profileRevision}:${BRIEF_ALGO_VERSION}`;
}

function persistedBriefMatches(
  persisted: PersistedOpportunityBrief,
  profileRevision: string,
  jobUpdatedAt: string,
): boolean {
  return (
    persisted.profileRevision === profileRevision &&
    persisted.algoVersion === BRIEF_ALGO_VERSION &&
    persisted.jobUpdatedAt === jobUpdatedAt &&
    new Date(persisted.expiresAt) >= new Date()
  );
}

function toOpportunityBrief(
  persisted: PersistedOpportunityBrief,
  jobPublicId: string,
  cached: boolean,
): OpportunityBrief {
  return {
    jobId: jobPublicId,
    ...persisted.brief,
    generatedAt: persisted.generatedAt,
    cached,
  };
}

/**
 * HTTP-facing Radar service.
 * Tenant isolation: never trust client tenant_id — always use AuthContext.
 *
 * Production posture:
 * - NEVER uses SEED_CANDIDATE_PROFILE for matching in production
 * - Always loads profile from database via loadCandidateProfileForMatch
 * - Empty profile results in honest "incomplete profile" matching
 */
export class RadarService {
  readonly catalog: CanonicalJobCatalog;
  readonly index: RadarSearchIndex;
  private readonly repos?: Repositories;
  private cachedBriefs = new Map<string, OpportunityBrief>();
  private readonly store?: RadarStore;

  constructor(
    catalog: CanonicalJobCatalog = getSharedCatalog(),
    private readonly applications?: ApplicationsService,
    repos?: Repositories,
    private readonly customerGenerate?: CustomerGenerateService,
    store?: RadarStore,
  ) {
    this.catalog = catalog;
    this.repos = repos;
    this.store = store;
    this.index = new RadarSearchIndex(catalog);
    this.index.reindexAll();
  }

  static create(
    applications?: ApplicationsService,
    repos?: Repositories,
    customerGenerate?: CustomerGenerateService,
    store?: RadarStore,
  ) {
    return new RadarService(getSharedCatalog(), applications, repos, customerGenerate, store);
  }

  private tenantAndUser(ctx: AuthContext) {
    const user = requireUser(ctx);
    if (!ctx.activeTenantId) {
      throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);
    }
    requireTenantMembership(ctx, ctx.activeTenantId);
    return { tenantId: ctx.activeTenantId, userId: user.id, user };
  }

  private async persistOrThrow<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    if (!this.store) {
      throw new AppError("RADAR_STORE_UNAVAILABLE", "Radar persistence is not configured", 503);
    }
    try {
      return await fn();
    } catch (err) {
      throw new AppError(
        "RADAR_STORE_ERROR",
        `Failed to persist radar ${operation}`,
        503,
        err instanceof Error ? err.message : err,
      );
    }
  }

  /**
   * Load the candidate profile for matching.
   * In production, loads from database. In demo mode, may fall back to seed profile.
   */
  private async getProfileForMatch(ctx: AuthContext): Promise<CandidateProfileForMatch> {
    if (!this.repos) {
      // No repos available — use demo behavior
      const env = getEnv();
      return env.APP_MODE === "demo" ? SEED_CANDIDATE_PROFILE : EMPTY_PROFILE;
    }
    return loadCandidateProfileForMatch(ctx, this.repos);
  }

  async search(ctx: AuthContext, query: JobSearchQuery, profile?: CandidateProfileForMatch) {
    const { tenantId, userId } = this.tenantAndUser(ctx);

    // Load profile from database if not provided
    const candidateProfile = profile ?? (await this.getProfileForMatch(ctx));

    const result = this.index.search(query, {
      tenantId,
      userId,
      candidateProfile,
    });

    // Enhance match results with labels
    return {
      ...result,
      results: result.results.map((r) => ({
        ...r,
        match: r.match ? enhanceMatchBreakdown(r.match, candidateProfile) : r.match,
      })),
    };
  }

  async getJob(ctx: AuthContext, jobId: string) {
    requireUser(ctx);
    const job = this.catalog.getJob(jobId);
    if (!job) throw new AppError("JOB_NOT_FOUND", "Job not found", 404);
    const sightings = this.catalog.getSightingsForJob(job.id);

    // Load profile from database — NEVER use SEED_CANDIDATE_PROFILE in production
    const profile = await this.getProfileForMatch(ctx);
    const match = this.catalog.matchJob(job, profile);
    const enhancedMatch = enhanceMatchBreakdown(match, profile);

    return { job, sightings, match: enhancedMatch };
  }

  getHistory(ctx: AuthContext, jobId: string) {
    requireUser(ctx);
    const job = this.catalog.getJob(jobId);
    if (!job) throw new AppError("JOB_NOT_FOUND", "Job not found", 404);
    return { job, history: this.catalog.getHistory(jobId) };
  }

  async save(ctx: AuthContext, jobId: string) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    const saved = this.catalog.saveJob(tenantId, userId, jobId);
    if (this.store) {
      await this.persistOrThrow("saved job", () => this.store!.saveJob(saved));
    }
    return saved;
  }

  async unsave(ctx: AuthContext, jobId: string) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    this.catalog.unsaveJob(tenantId, userId, jobId);
    if (this.store) {
      const job = this.catalog.getJob(jobId);
      if (job) {
        await this.persistOrThrow("unsaved job", () => this.store!.unsaveJob(tenantId, userId, job.id));
      }
    }
    return { ok: true };
  }

  async hide(ctx: AuthContext, jobId: string) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    const hidden = this.catalog.hideJob(tenantId, userId, jobId);
    if (this.store) {
      await this.persistOrThrow("hidden job", () => this.store!.hideJob(hidden));
    }
    return hidden;
  }

  async unhide(ctx: AuthContext, jobId: string) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    this.catalog.unhideJob(tenantId, userId, jobId);
    if (this.store) {
      const job = this.catalog.getJob(jobId);
      if (job) {
        await this.persistOrThrow("unhidden job", () => this.store!.unhideJob(tenantId, userId, job.id));
      }
    }
    return { ok: true };
  }

  async createApplication(ctx: AuthContext, jobId: string, sightingId?: string) {
    const { tenantId } = this.tenantAndUser(ctx);
    // tenantId from auth only — never from client body
    void tenantId;
    const payload = this.catalog.createApplicationFromJob(jobId, { sightingId });
    if (!this.applications) {
      return { payload, application: null, workflowId: null };
    }
    const input: CreateApplicationInput = {
      company: payload.company,
      role: payload.role,
      location: payload.location,
      employmentType: payload.employmentType,
      jobUrl: payload.jobUrl,
      jobDescriptionText: payload.jobDescriptionText,
      roleFamily: payload.roleFamily,
      researchDepth: payload.researchDepth === "deep-team" ? "deep-team" : "standard",
      idempotencyKey: payload.idempotencyKey,
    };
    const result = await this.applications.create(ctx, input);
    return {
      payload,
      application: result.application,
      workflowId: result.workflow.publicId,
    };
  }

  listSavedSearches(ctx: AuthContext) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    return this.catalog.listSavedSearches(tenantId, userId);
  }

  async createSavedSearch(
    ctx: AuthContext,
    input: { name: string; query: JobSearchQuery; alertEnabled?: boolean },
  ) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    const saved = this.catalog.createSavedSearch(tenantId, userId, input);
    if (this.store) {
      await this.persistOrThrow("saved search", () => this.store!.createSavedSearch(saved));
    }
    return saved;
  }

  async updateSavedSearch(
    ctx: AuthContext,
    id: string,
    patch: Partial<Pick<SavedSearch, "name" | "query" | "alertEnabled">>,
  ) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    const updated = this.catalog.updateSavedSearch(tenantId, userId, id, patch);
    if (this.store) {
      await this.persistOrThrow("saved search update", () =>
        this.store!.updateSavedSearch(tenantId, updated.id, patch),
      );
    }
    return updated;
  }

  async deleteSavedSearch(ctx: AuthContext, id: string) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    const existing = this.catalog.listSavedSearches(tenantId, userId).find(
      (s) => s.id === id || s.publicId === id,
    );
    this.catalog.deleteSavedSearch(tenantId, userId, id);
    if (this.store && existing) {
      await this.persistOrThrow("saved search delete", () =>
        this.store!.deleteSavedSearch(tenantId, existing.id),
      );
    }
    return { ok: true };
  }

  listAlerts(ctx: AuthContext) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    return this.catalog.listAlerts(tenantId, userId);
  }

  async createAlert(
    ctx: AuthContext,
    input: {
      name: string;
      query: JobSearchQuery;
      cadence?: JobAlert["cadence"];
      includeReposts?: boolean;
      includeRefreshes?: boolean;
      savedSearchId?: string;
    },
  ) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    const alert = this.catalog.createAlert(tenantId, userId, input);
    if (this.store) {
      await this.persistOrThrow("job alert", () => this.store!.createAlert(alert));
    }
    return alert;
  }

  async updateAlert(
    ctx: AuthContext,
    id: string,
    patch: Partial<
      Pick<
        JobAlert,
        "name" | "query" | "cadence" | "enabled" | "includeReposts" | "includeRefreshes"
      >
    >,
  ) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    const updated = this.catalog.updateAlert(tenantId, userId, id, patch);
    if (this.store) {
      await this.persistOrThrow("job alert update", () => this.store!.updateAlert(tenantId, updated.id, patch));
    }
    return updated;
  }

  async deleteAlert(ctx: AuthContext, id: string) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    const existing = this.catalog.listAlerts(tenantId, userId).find(
      (a) => a.id === id || a.publicId === id,
    );
    this.catalog.deleteAlert(tenantId, userId, id);
    if (this.store && existing) {
      await this.persistOrThrow("job alert delete", () => this.store!.deleteAlert(tenantId, existing.id));
    }
    return { ok: true };
  }

  coverage(ctx: AuthContext) {
    requireUser(ctx);
    return this.catalog.coverage();
  }

  /**
   * Record a user interaction with a job.
   * Store is authoritative when present — failures propagate.
   */
  async recordInteraction(
    ctx: AuthContext,
    jobId: string,
    interactionType: JobInteractionType,
    metadata?: Record<string, unknown>,
  ): Promise<{ recorded: true }> {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    const job = this.catalog.getJob(jobId);
    if (!job) throw new AppError("JOB_NOT_FOUND", "Job not found", 404);

    const interaction = {
      id: randomUUID(),
      tenantId,
      userId,
      canonicalJobId: job.id,
      interactionType,
      metadata,
      createdAt: new Date().toISOString(),
    };

    if (this.store) {
      await this.persistOrThrow("job interaction", () => this.store!.createInteraction(interaction));
    }

    return { recorded: true };
  }

  /**
   * Ingest a listing and write-through job/sighting when a store is present.
   * Store failures propagate — no silent memory-only success.
   */
  async ingestListing(listing: JobSourceListing, sourceId: string) {
    const result = this.catalog.ingestListing(listing, sourceId);
    if (this.store) {
      await this.persistIngestWriteThrough(result);
    }
    this.index.reindexAll();
    return result;
  }

  private async persistIngestWriteThrough(result: {
    job: import("./types").CanonicalJob;
    sighting: import("./types").JobSighting;
    created: boolean;
  }): Promise<void> {
    if (!this.store) return;

    const company = this.catalog.companies.get(result.job.companyId);
    if (company) {
      await this.store.upsertCompany(company);
    }

    const catalogSource = this.catalog.sources.get(result.sighting.sourceId);
    let persistedSourceId = result.sighting.sourceId;
    if (catalogSource) {
      persistedSourceId = isUuid(catalogSource.id)
        ? catalogSource.id
        : stableSourceUuid(catalogSource.id);
      await this.store.upsertSource({
        ...catalogSource,
        id: persistedSourceId,
      });
    }

    await this.store.upsertJob({
      ...result.job,
      primarySourceId: isUuid(result.job.primarySourceId)
        ? result.job.primarySourceId
        : persistedSourceId,
    });
    await this.store.upsertSighting({
      ...result.sighting,
      sourceId: persistedSourceId,
    });
  }

  /**
   * Tailor a resume for a specific job.
   * Uses CustomerGenerateService to create a tailored resume workflow.
   * Does NOT auto-submit applications.
   *
   * @returns workflowId for navigation to /app/resumes/{workflowId}
   */
  async tailorResume(
    ctx: AuthContext,
    jobId: string,
  ): Promise<{ workflowId: string; applicationId: string }> {
    this.tenantAndUser(ctx);

    const job = this.catalog.getJob(jobId);
    if (!job) throw new AppError("JOB_NOT_FOUND", "Job not found", 404);

    // Record the interaction
    await this.recordInteraction(ctx, jobId, "tailor_resume");

    // Get job details for tailoring
    const jobUrl = job.canonicalApplicationUrl;
    const jobDescription = job.description;
    const company = job.companyName;
    const role = job.title;
    const location = job.locations[0];

    // Use CustomerGenerateService if available
    if (this.customerGenerate) {
      const description =
        (jobDescription && jobDescription.trim().length >= 20
          ? jobDescription
          : [
              `Role: ${role}`,
              `Company: ${company}`,
              location ? `Location: ${location}` : null,
              job.requirements ? `Requirements:\n${job.requirements}` : null,
              job.responsibilities ? `Responsibilities:\n${job.responsibilities}` : null,
              job.techStack?.length ? `Technologies: ${job.techStack.join(", ")}` : null,
            ]
              .filter(Boolean)
              .join("\n\n")) || `${role} at ${company}. Tailor an evidence-backed resume for this opening.`;

      let safeJobUrl: string | undefined;
      if (jobUrl) {
        try {
          safeJobUrl = new URL(jobUrl).toString();
        } catch {
          safeJobUrl = undefined;
        }
      }

      const result = await this.customerGenerate.generate(ctx, {
        jobDescription: description,
        jobUrl: safeJobUrl,
        company,
        role,
        location,
        idempotencyKey: `radar:tailor:${job.publicId}`,
      });
      return {
        workflowId: result.workflowId,
        applicationId: result.applicationId,
      };
    }

    throw new AppError(
      "TAILOR_UNAVAILABLE",
      "Resume tailoring is not available. Please try again later.",
      503,
    );
  }

  /**
   * Parse natural language search into structured query.
   * Returns parsed filters and any remaining keywords.
   */
  async parseNaturalLanguageSearch(
    ctx: AuthContext,
    naturalQuery: string,
  ): Promise<{
    query: JobSearchQuery;
    parsedFilters: Record<string, string>;
    confidence: number;
    originalText: string;
  }> {
    requireUser(ctx);

    // Import the NL parser (lazy load)
    const { parseNaturalLanguageQuery } = await import("./nl-search");

    try {
      const result = await parseNaturalLanguageQuery(naturalQuery);
      return {
        query: result.query,
        parsedFilters: result.extractedFilters,
        confidence: result.confidence,
        originalText: naturalQuery,
      };
    } catch {
      // On failure, return keyword-only query
      return {
        query: { keywords: naturalQuery },
        parsedFilters: {},
        confidence: 0.1,
        originalText: naturalQuery,
      };
    }
  }

  /**
   * Get or generate an opportunity brief for a job.
   * Postgres mode: store is authoritative; profile/algo/job revision must match.
   */
  async getOpportunityBrief(ctx: AuthContext, jobId: string): Promise<OpportunityBrief> {
    const { tenantId, userId } = this.tenantAndUser(ctx);

    const job = this.catalog.getJob(jobId);
    if (!job) throw new AppError("JOB_NOT_FOUND", "Job not found", 404);

    const profile = await this.getProfileForMatch(ctx);
    const profileRevision = profileRevisionOf(profile);
    const cacheKey = briefCacheKey(tenantId, userId, job.id, job.updatedAt, profileRevision);

    if (this.store) {
      let persisted: PersistedOpportunityBrief | null;
      try {
        persisted = await this.store.getBrief(tenantId, userId, job.id);
      } catch (err) {
        throw new AppError(
          "RADAR_STORE_ERROR",
          "Failed to load opportunity brief",
          503,
          err instanceof Error ? err.message : err,
        );
      }

      if (persisted && persistedBriefMatches(persisted, profileRevision, job.updatedAt)) {
        const cachedBrief = toOpportunityBrief(persisted, job.publicId, true);
        this.cachedBriefs.set(cacheKey, cachedBrief);
        return cachedBrief;
      }
    } else {
      const cached = this.cachedBriefs.get(cacheKey);
      if (cached) {
        return { ...cached, cached: true };
      }
    }

    const { generateOpportunityBrief } = await import("./opportunity-brief");
    const generated = await generateOpportunityBrief(job, profile, this.catalog);
    const generatedAt = generated.generatedAt || new Date().toISOString();

    if (this.store) {
      const persisted: PersistedOpportunityBrief = {
        id: randomUUID(),
        tenantId,
        userId,
        canonicalJobId: job.id,
        brief: {
          summary: generated.summary,
          companyOverview: generated.companyOverview,
          roleHighlights: generated.roleHighlights,
          skillsAlignment: generated.skillsAlignment,
          concerns: generated.concerns,
          resumeReadinessLabel: generated.resumeReadinessLabel,
          researchUrls: generated.researchUrls,
        },
        profileRevision,
        algoVersion: BRIEF_ALGO_VERSION,
        jobUpdatedAt: job.updatedAt,
        generatedAt,
        expiresAt: new Date(Date.now() + BRIEF_TTL_MS).toISOString(),
      };
      await this.persistOrThrow("opportunity brief", () => this.store!.upsertBrief(persisted));
    } else {
      this.cachedBriefs.set(cacheKey, generated);
      if (this.cachedBriefs.size > 100) {
        const oldest = this.cachedBriefs.keys().next().value;
        if (oldest) this.cachedBriefs.delete(oldest);
      }
    }

    return { ...generated, cached: false };
  }
}
