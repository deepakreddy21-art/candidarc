import type { AuthContext } from "../../auth/guards";
import { requireTenantMembership, requireTenantRole, requireUser } from "../../auth/guards";
import type { ApplicationRepository, AuditRepository, Repositories } from "../../database/repositories";
import type { FindingDecision, WorkflowStage } from "../../domain/types";
import { AppError } from "../../domain/types";
import type { DurableWorkflowEngine } from "../../workflows/engine";
import { addMistakeMemoryRule } from "../../ai/mistake-memory";

const NEXT_GENERATION: Record<string, { stage: WorkflowStage; version: number }> = {
  "hr-1": { stage: "V1_GENERATING", version: 1 },
  "em-1": { stage: "V2_GENERATING", version: 2 },
  "hr-2": { stage: "V3_GENERATING", version: 3 },
  "em-2": { stage: "V4_GENERATING", version: 4 },
};

export class AuditsService {
  constructor(
    private readonly audits: AuditRepository,
    private readonly applications: ApplicationRepository,
    private readonly engine: DurableWorkflowEngine,
    private readonly store: Repositories["store"],
  ) {}

  static fromRepos(repos: Repositories, engine: DurableWorkflowEngine) {
    return new AuditsService(repos.audits, repos.applications, engine, repos.store);
  }

  private tenantId(ctx: AuthContext) {
    requireUser(ctx);
    if (!ctx.activeTenantId) throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);
    requireTenantMembership(ctx, ctx.activeTenantId);
    return ctx.activeTenantId;
  }

  async listRuns(ctx: AuthContext, applicationPublicId: string) {
    const tenantId = this.tenantId(ctx);
    const runs = await this.audits.listRuns(tenantId, applicationPublicId);
    return runs;
  }

  async updateFindingDecision(
    ctx: AuthContext,
    findingPublicId: string,
    status: FindingDecision,
    editedText?: string,
  ) {
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    if (status === "edited" && !editedText) {
      throw new AppError("VALIDATION_ERROR", "editedText required when status is edited", 400);
    }
    return this.audits.updateFindingDecision(tenantId, findingPublicId, status, editedText);
  }

  async startNextGeneration(ctx: AuthContext, applicationPublicId: string, idempotencyKey?: string) {
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    const app = await this.applications.getByPublicId(tenantId, applicationPublicId);
    if (!app) throw new AppError("APPLICATION_NOT_FOUND", "Application not found", 404);

    const runs = await this.audits.listRuns(tenantId, applicationPublicId);
    const latest = runs[runs.length - 1];
    if (!latest) throw new AppError("AUDIT_NOT_FOUND", "No audit run to continue from", 404);

    const findings = await this.audits.listFindings(tenantId, latest.publicId);
    const open = findings.filter((finding) => finding.status === "open");
    if (open.length) {
      throw new AppError(
        "AUDIT_FINDINGS_OPEN",
        `Resolve all audit findings before continuing (${open.length} open)`,
        409,
      );
    }

    const next = NEXT_GENERATION[latest.lens];
    if (!next) throw new AppError("AUDIT_SEQUENCE_ERROR", `No next generation for lens ${latest.lens}`, 409);

    for (const finding of findings.filter(
      (item) =>
        (item.status === "accepted" || item.status === "edited") &&
        (item.severity === "critical" || item.severity === "major"),
    )) {
      await addMistakeMemoryRule(this.store, {
        tenantId,
        applicationId: app.id,
        originatingAudit: latest.lens,
        affectedVersion: latest.reviewsVersion,
        category: finding.section,
        rule: finding.editedText ?? finding.suggestedText,
        severity: finding.severity,
        status: "active",
        userOverride: false,
        appliedIn: [`V${next.version}`],
      });
    }

    const workflow = await this.engine.start({
      tenantId,
      applicationId: app.id,
      applicationPublicId,
      stage: next.stage,
      idempotencyKey: idempotencyKey ?? `next-gen:${applicationPublicId}:${latest.lens}:${next.version}`,
      inputVersion: String(next.version - 1),
      message: `Generation of V${next.version} queued after ${latest.lens}`,
    });

    await this.applications.update(tenantId, applicationPublicId, {
      stage: next.stage,
      workflowStage: next.stage,
      nextAction: `Generating V${next.version}`,
    });

    return { workflow, targetVersion: next.version };
  }
}
