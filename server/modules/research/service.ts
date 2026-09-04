import type { AuthContext } from "../../auth/guards";
import { requireTenantMembership, requireTenantRole, requireUser } from "../../auth/guards";
import type { ApplicationRepository, ResearchRepository, Repositories } from "../../database/repositories";
import { newId } from "../../database/repositories";
import { AppError } from "../../domain/types";
import type { DurableWorkflowEngine } from "../../workflows/engine";

export class ResearchService {
  constructor(
    private readonly research: ResearchRepository,
    private readonly applications: ApplicationRepository,
    private readonly engine: DurableWorkflowEngine,
  ) {}

  static fromRepos(repos: Repositories, engine: DurableWorkflowEngine) {
    return new ResearchService(repos.research, repos.applications, engine);
  }

  private tenantId(ctx: AuthContext) {
    requireUser(ctx);
    if (!ctx.activeTenantId) throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);
    requireTenantMembership(ctx, ctx.activeTenantId);
    return ctx.activeTenantId;
  }

  async start(
    ctx: AuthContext,
    applicationPublicId: string,
    opts?: { depth?: string; idempotencyKey?: string },
  ) {
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    const app = await this.applications.getByPublicId(tenantId, applicationPublicId);
    if (!app) throw new AppError("APPLICATION_NOT_FOUND", "Application not found", 404);

    const existing = await this.research.getLatest(tenantId, applicationPublicId);
    if (!existing) {
      await this.research.createRun({
        id: newId("rid"),
        publicId: newId("rr"),
        tenantId,
        applicationId: app.id,
        applicationPublicId,
        status: "queued",
        depth: opts?.depth ?? "standard",
        confidence: 0,
        findings: [],
        sources: [],
      });
    }

    const workflow = await this.engine.start({
      tenantId,
      applicationId: app.id,
      applicationPublicId,
      stage: "RESEARCH_QUEUED",
      idempotencyKey: opts?.idempotencyKey ?? `research:${applicationPublicId}`,
      message: "Research queued",
    });

    await this.applications.update(tenantId, applicationPublicId, {
      stage: "RESEARCH_QUEUED",
      workflowStage: "RESEARCH_QUEUED",
      status: "researching",
      nextAction: "Wait for research",
    });

    return { workflow, run: await this.research.getLatest(tenantId, applicationPublicId) };
  }

  async getStatus(ctx: AuthContext, applicationPublicId: string) {
    const tenantId = this.tenantId(ctx);
    const app = await this.applications.getByPublicId(tenantId, applicationPublicId);
    if (!app) throw new AppError("APPLICATION_NOT_FOUND", "Application not found", 404);
    const run = await this.research.getLatest(tenantId, applicationPublicId);
    return {
      applicationId: applicationPublicId,
      status: run?.status ?? "not_started",
      confidence: run?.confidence ?? app.researchConfidence,
      stage: app.stage,
      findingsCount: Array.isArray(run?.findings) ? run!.findings.length : 0,
      updatedAt: run?.updatedAt ?? app.updatedAt,
    };
  }

  async getFindings(ctx: AuthContext, applicationPublicId: string) {
    const tenantId = this.tenantId(ctx);
    const run = await this.research.getLatest(tenantId, applicationPublicId);
    if (!run) {
      return { applicationId: applicationPublicId, findings: [], sources: [], confidence: 0 };
    }
    return {
      applicationId: applicationPublicId,
      findings: run.findings,
      sources: run.sources,
      confidence: run.confidence,
    };
  }

  async retry(ctx: AuthContext, applicationPublicId: string, idempotencyKey?: string) {
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    const app = await this.applications.getByPublicId(tenantId, applicationPublicId);
    if (!app) throw new AppError("APPLICATION_NOT_FOUND", "Application not found", 404);

    const workflow = await this.engine.start({
      tenantId,
      applicationId: app.id,
      applicationPublicId,
      stage: "RESEARCH_QUEUED",
      idempotencyKey: idempotencyKey ?? `research-retry:${applicationPublicId}:${Date.now()}`,
      message: "Research retry queued",
    });

    return { workflow };
  }
}
