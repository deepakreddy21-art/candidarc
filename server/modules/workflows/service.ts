import type { AuthContext } from "../../auth/guards";
import { requireTenantMembership, requireTenantRole, requireUser } from "../../auth/guards";
import type { Repositories, WorkflowRepository } from "../../database/repositories";
import { AppError } from "../../domain/types";
import type { DurableWorkflowEngine } from "../../workflows/engine";

export class WorkflowsService {
  constructor(
    private readonly engine: DurableWorkflowEngine,
    private readonly workflows: WorkflowRepository,
  ) {}

  static fromRepos(repos: Repositories, engine: DurableWorkflowEngine) {
    return new WorkflowsService(engine, repos.workflows);
  }

  private tenantId(ctx: AuthContext) {
    requireUser(ctx);
    if (!ctx.activeTenantId) throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);
    requireTenantMembership(ctx, ctx.activeTenantId);
    return ctx.activeTenantId;
  }

  async getStatus(ctx: AuthContext, workflowPublicId: string) {
    const tenantId = this.tenantId(ctx);
    const run = await this.engine.getStatus(tenantId, workflowPublicId);
    if (!run) throw new AppError("WORKFLOW_NOT_FOUND", "Workflow not found", 404);
    return run;
  }

  async cancel(ctx: AuthContext, workflowPublicId: string, reason?: string) {
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    return this.engine.cancel(tenantId, workflowPublicId, reason);
  }

  async retry(ctx: AuthContext, workflowPublicId: string) {
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    return this.engine.retry(tenantId, workflowPublicId);
  }

  async listEvents(ctx: AuthContext, workflowPublicId: string, sinceSeq?: number) {
    const tenantId = this.tenantId(ctx);
    return this.engine.listEvents(tenantId, workflowPublicId, sinceSeq);
  }

  async listByApplication(ctx: AuthContext, applicationPublicId: string) {
    const tenantId = this.tenantId(ctx);
    return this.workflows.listByApplication(tenantId, applicationPublicId);
  }
}
