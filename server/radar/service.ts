import type { AuthContext } from "../auth/guards";
import { requireTenantMembership, requireUser } from "../auth/guards";
import { AppError, type CreateApplicationInput } from "../domain/types";
import type { ApplicationsService } from "../modules/applications/service";
import {
  getSharedCatalog,
  type CanonicalJobCatalog,
  SEED_CANDIDATE_PROFILE,
} from "./catalog";
import { RadarSearchIndex } from "./search-index";
import type {
  CandidateProfileForMatch,
  JobAlert,
  JobSearchQuery,
  SavedSearch,
} from "./types";

/**
 * HTTP-facing Radar service.
 * Tenant isolation: never trust client tenant_id — always use AuthContext.
 */
export class RadarService {
  readonly catalog: CanonicalJobCatalog;
  readonly index: RadarSearchIndex;

  constructor(
    catalog: CanonicalJobCatalog = getSharedCatalog(),
    private readonly applications?: ApplicationsService,
  ) {
    this.catalog = catalog;
    this.index = new RadarSearchIndex(catalog);
    this.index.reindexAll();
  }

  static create(applications?: ApplicationsService) {
    return new RadarService(getSharedCatalog(), applications);
  }

  private tenantAndUser(ctx: AuthContext) {
    const user = requireUser(ctx);
    if (!ctx.activeTenantId) {
      throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);
    }
    requireTenantMembership(ctx, ctx.activeTenantId);
    return { tenantId: ctx.activeTenantId, userId: user.id, user };
  }

  search(ctx: AuthContext, query: JobSearchQuery, profile?: CandidateProfileForMatch) {
    const { tenantId, userId } = this.tenantAndUser(ctx);
    return this.index.search(query, {
      tenantId,
      userId,
      candidateProfile: profile ?? SEED_CANDIDATE_PROFILE,
    });
  }

  getJob(ctx: AuthContext, jobId: string) {
    requireUser(ctx);
    const job = this.catalog.getJob(jobId);
    if (!job) throw new AppError("JOB_NOT_FOUND", "Job not found", 404);
    const sightings = this.catalog.getSightingsForJob(job.id);
    const match = this.catalog.matchJob(job, SEED_CANDIDATE_PROFILE);
    return { job, sightings, match };
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
      researchDepth: payload.researchDepth ?? "standard",
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
}
