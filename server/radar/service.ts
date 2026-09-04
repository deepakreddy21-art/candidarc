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
import { enhanceMatchBreakdown, getMatchLabel } from "./match-labels";
import { getEnv } from "../config/env";
import type {
  CandidateProfileForMatch,
  JobAlert,
  JobSearchQuery,
  SavedSearch,
} from "./types";

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

  constructor(
    catalog: CanonicalJobCatalog = getSharedCatalog(),
    private readonly applications?: ApplicationsService,
    repos?: Repositories,
    private readonly customerGenerate?: CustomerGenerateService,
  ) {
    this.catalog = catalog;
    this.repos = repos;
    this.index = new RadarSearchIndex(catalog);
    this.index.reindexAll();
  }

  static create(
    applications?: ApplicationsService,
    repos?: Repositories,
    customerGenerate?: CustomerGenerateService,
  ) {
    return new RadarService(getSharedCatalog(), applications, repos, customerGenerate);
  }

  private tenantAndUser(ctx: AuthContext) {
    const user = requireUser(ctx);
    if (!ctx.activeTenantId) {
      throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);
    }
    requireTenantMembership(ctx, ctx.activeTenantId);
    return { tenantId: ctx.activeTenantId, userId: user.id, user };
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

  save(ctx: AuthContext, jobId: string) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    return this.catalog.saveJob(tenantId, userId, jobId);
  }

  unsave(ctx: AuthContext, jobId: string) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    this.catalog.unsaveJob(tenantId, userId, jobId);
    return { ok: true };
  }

  hide(ctx: AuthContext, jobId: string) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    return this.catalog.hideJob(tenantId, userId, jobId);
  }

  unhide(ctx: AuthContext, jobId: string) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    this.catalog.unhideJob(tenantId, userId, jobId);
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

  createSavedSearch(
    ctx: AuthContext,
    input: { name: string; query: JobSearchQuery; alertEnabled?: boolean },
  ) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    return this.catalog.createSavedSearch(tenantId, userId, input);
  }

  updateSavedSearch(
    ctx: AuthContext,
    id: string,
    patch: Partial<Pick<SavedSearch, "name" | "query" | "alertEnabled">>,
  ) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    return this.catalog.updateSavedSearch(tenantId, userId, id, patch);
  }

  deleteSavedSearch(ctx: AuthContext, id: string) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    this.catalog.deleteSavedSearch(tenantId, userId, id);
    return { ok: true };
  }

  listAlerts(ctx: AuthContext) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    return this.catalog.listAlerts(tenantId, userId);
  }

  createAlert(
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
    return this.catalog.createAlert(tenantId, userId, input);
  }

  updateAlert(
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
    return this.catalog.updateAlert(tenantId, userId, id, patch);
  }

  deleteAlert(ctx: AuthContext, id: string) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    this.catalog.deleteAlert(tenantId, userId, id);
    return { ok: true };
  }

  coverage(ctx: AuthContext) {
    requireUser(ctx);
    return this.catalog.coverage();
  }

  /**
   * Record a user interaction with a job.
   * Used for analytics and personalization.
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

    // Store interaction in memory catalog (would persist to DB in postgres mode)
    // For now, log the interaction
    const interaction = {
      tenantId,
      userId,
      canonicalJobId: job.id,
      interactionType,
      metadata,
      createdAt: new Date().toISOString(),
    };

    // TODO: Persist to postgres when CANDIDARC_DATA_MODE=postgres
    void interaction;

    return { recorded: true };
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
      try {
        if (jobUrl) {
          // eslint-disable-next-line no-new
          new URL(jobUrl);
          safeJobUrl = jobUrl;
        }
      } catch {
        safeJobUrl = undefined;
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
   * Lazy generates and caches the brief.
   */
  async getOpportunityBrief(ctx: AuthContext, jobId: string): Promise<OpportunityBrief> {
    requireUser(ctx);

    const job = this.catalog.getJob(jobId);
    if (!job) throw new AppError("JOB_NOT_FOUND", "Job not found", 404);

    // Check cache
    const cacheKey = `${jobId}:${job.updatedAt}`;
    const cached = this.cachedBriefs.get(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    // Load profile for personalization
    const profile = await this.getProfileForMatch(ctx);

    // Import brief generator (lazy load)
    const { generateOpportunityBrief } = await import("./opportunity-brief");

    const brief = await generateOpportunityBrief(job, profile, this.catalog);

    // Cache the result
    this.cachedBriefs.set(cacheKey, brief);

    // Limit cache size
    if (this.cachedBriefs.size > 100) {
      const oldest = this.cachedBriefs.keys().next().value;
      if (oldest) this.cachedBriefs.delete(oldest);
    }

    return brief;
  }
}
