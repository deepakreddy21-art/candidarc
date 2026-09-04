import type { AuthContext } from "../../auth/guards";
import { requireTenantMembership, requireTenantRole, requireUser } from "../../auth/guards";
import type { CreateApplicationInput } from "../../domain/types";
import { AppError } from "../../domain/types";
import type { ApplicationRepository, Repositories } from "../../database/repositories";
import { newId } from "../../database/repositories";
import type { DurableWorkflowEngine } from "../../workflows/engine";
import { logger } from "../../observability/logger";

export class ApplicationsService {
  constructor(
    private readonly applications: ApplicationRepository,
    private readonly engine: DurableWorkflowEngine,
  ) {}

  static fromRepos(repos: Repositories, engine: DurableWorkflowEngine) {
    return new ApplicationsService(repos.applications, engine);
  }

  private tenantId(ctx: AuthContext) {
    requireUser(ctx);
    if (!ctx.activeTenantId) throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);
    requireTenantMembership(ctx, ctx.activeTenantId);
    return ctx.activeTenantId;
  }

  async create(ctx: AuthContext, input: CreateApplicationInput) {
    const user = requireUser(ctx);
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);

    const publicId = `app-${input.company.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}-${Date.now().toString(36)}`;
    const app = await this.applications.create({
      id: newId("app"),
      publicId,
      tenantId,
      company: input.company,
      companyMark: input.company.slice(0, 2).toUpperCase(),
      role: input.role,
      location: input.location ?? "Remote",
      employmentType: input.employmentType ?? "Full-time",
      status: "researching",
      stage: "APPLICATION_CREATED",
      workflowStage: "APPLICATION_CREATED",
      resumeScore: 0,
      evidenceCoverage: 0,
      atsAlignment: 0,
      interviewStatus: "not-started",
      researchConfidence: 0,
      deadline: input.deadline,
      archived: false,
      roleFamily: input.roleFamily ?? "General",
      nextAction: "Start research",
      ownerUserId: user.id,
      metadata: {
        jobUrl: input.jobUrl,
        jobDescription: input.jobDescription ?? input.jobDescriptionText,
        researchDepth: input.researchDepth ?? "standard",
        candidateProfileId: input.candidateProfileId,
        excludedEvidenceIds: input.excludedEvidenceIds ?? [],
        resumeLength: input.resumeLength ?? "one-page",
        experienceLevel: input.experienceLevel,
      },
    });

    const idempotencyKey = input.idempotencyKey ?? `app-create:${app.publicId}`;
    const workflow = await this.engine.start({
      tenantId,
      applicationId: app.id,
      applicationPublicId: app.publicId,
      stage: "RESEARCH_QUEUED",
      idempotencyKey,
      message: "Application created — research queued",
      payload: {
        jobUrl: input.jobUrl,
        jobDescription: input.jobDescription ?? input.jobDescriptionText,
        researchDepth: input.researchDepth ?? "standard",
      },
    });

    await this.applications.update(tenantId, app.publicId, {
      stage: "RESEARCH_QUEUED",
      workflowStage: "RESEARCH_QUEUED",
      nextAction: "Wait for research",
    });

    logger.info(
      { requestId: ctx.requestId, applicationId: app.publicId, workflowId: workflow.publicId },
      "application created",
    );

    return { application: { ...app, stage: "RESEARCH_QUEUED" as const, workflowStage: "RESEARCH_QUEUED" as const }, workflow };
  }

  async list(ctx: AuthContext, includeArchived = false) {
    const tenantId = this.tenantId(ctx);
    return this.applications.list(tenantId, { includeArchived });
  }

  async get(ctx: AuthContext, applicationPublicId: string) {
    const tenantId = this.tenantId(ctx);
    const app = await this.applications.getByPublicId(tenantId, applicationPublicId);
    if (!app) throw new AppError("APPLICATION_NOT_FOUND", "Application not found", 404);
    return app;
  }

  async update(ctx: AuthContext, applicationPublicId: string, patch: Partial<{
    company: string;
    role: string;
    location: string;
    employmentType: string;
    deadline: string;
    roleFamily: string;
    nextAction: string;
  }>) {
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    return this.applications.update(tenantId, applicationPublicId, patch);
  }

  async archive(ctx: AuthContext, applicationPublicId: string) {
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    return this.applications.update(tenantId, applicationPublicId, {
      archived: true,
      status: "archived",
      nextAction: "Restore to continue",
    });
  }

  async restore(ctx: AuthContext, applicationPublicId: string) {
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    return this.applications.update(tenantId, applicationPublicId, {
      archived: false,
      status: "researching",
      nextAction: "Continue workflow",
    });
  }
}
