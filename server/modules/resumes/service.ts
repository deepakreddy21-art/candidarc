import type { AuthContext } from "../../auth/guards";
import { requireTenantMembership, requireTenantRole, requireUser } from "../../auth/guards";
import type { ApplicationRepository, Repositories, ResumeRepository } from "../../database/repositories";
import { AppError, type WorkflowStage } from "../../domain/types";
import type { DurableWorkflowEngine } from "../../workflows/engine";
import type { QueueAdapter } from "../../workflows/queues";

export class ResumesService {
  constructor(
    private readonly resumes: ResumeRepository,
    private readonly applications: ApplicationRepository,
    private readonly engine: DurableWorkflowEngine,
    private readonly queue: QueueAdapter,
  ) {}

  static fromRepos(repos: Repositories, engine: DurableWorkflowEngine, queue: QueueAdapter) {
    return new ResumesService(repos.resumes, repos.applications, engine, queue);
  }

  private tenantId(ctx: AuthContext) {
    requireUser(ctx);
    if (!ctx.activeTenantId) throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);
    requireTenantMembership(ctx, ctx.activeTenantId);
    return ctx.activeTenantId;
  }

  async getResume(ctx: AuthContext, applicationPublicId: string) {
    const tenantId = this.tenantId(ctx);
    const resume = await this.resumes.getByApplication(tenantId, applicationPublicId);
    if (!resume) throw new AppError("RESUME_NOT_FOUND", "Resume not found", 404);
    const versions = await this.resumes.listVersions(tenantId, resume.publicId);
    return { resume, versions };
  }

  async listVersions(ctx: AuthContext, applicationPublicId: string) {
    const { resume, versions } = await this.getResume(ctx, applicationPublicId);
    return { resumeId: resume.publicId, versions };
  }

  async compare(ctx: AuthContext, applicationPublicId: string, leftVersionId: string, rightVersionId: string) {
    const tenantId = this.tenantId(ctx);
    await this.getResume(ctx, applicationPublicId);
    const left = await this.resumes.getVersion(tenantId, leftVersionId);
    const right = await this.resumes.getVersion(tenantId, rightVersionId);
    if (!left || !right) throw new AppError("VERSION_NOT_FOUND", "Resume version not found", 404);
    return {
      left,
      right,
      scoreDelta: right.score - left.score,
    };
  }

  async requestRegeneration(
    ctx: AuthContext,
    applicationPublicId: string,
    opts?: { targetVersion?: number; idempotencyKey?: string },
  ) {
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    const app = await this.applications.getByPublicId(tenantId, applicationPublicId);
    if (!app) throw new AppError("APPLICATION_NOT_FOUND", "Application not found", 404);

    const versionNumber = opts?.targetVersion ?? 0;
    const stageMap: Record<number, WorkflowStage> = {
      0: "V0_GENERATING",
      1: "V1_GENERATING",
      2: "V2_GENERATING",
      3: "V3_GENERATING",
      4: "V4_GENERATING",
    };
    const stage = stageMap[versionNumber];
    if (!stage) throw new AppError("VALIDATION_ERROR", "Invalid target version", 400);

    const workflow = await this.engine.start({
      tenantId,
      applicationId: app.id,
      applicationPublicId,
      stage,
      idempotencyKey: opts?.idempotencyKey ?? `regen:${applicationPublicId}:v${versionNumber}`,
      inputVersion: versionNumber > 0 ? String(versionNumber - 1) : undefined,
      message: `Regeneration of V${versionNumber} queued`,
    });

    return { workflow };
  }

  async requestExport(
    ctx: AuthContext,
    applicationPublicId: string,
    opts?: { versionId?: string; idempotencyKey?: string },
  ) {
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    const { resume, versions } = await this.getResume(ctx, applicationPublicId);
    const version =
      (opts?.versionId ? versions.find((v) => v.publicId === opts.versionId) : null) ??
      versions.find((v) => v.publicId === resume.currentVersionPublicId) ??
      versions[versions.length - 1];
    if (!version) throw new AppError("VERSION_NOT_FOUND", "No resume version to export", 404);

    const job = await this.queue.enqueue(
      "pdf-rendering",
      "resume.export",
      {
        tenantId,
        applicationPublicId,
        resumePublicId: resume.publicId,
        versionPublicId: version.publicId,
      },
      {
        idempotencyKey: opts?.idempotencyKey ?? `export:${resume.publicId}:${version.publicId}`,
      },
    );

    return { jobId: job.id, versionId: version.publicId, status: "queued" as const };
  }
}
