import type { AuthContext } from "../../auth/guards";
import { requireTenantMembership, requireTenantRole, requireUser } from "../../auth/guards";
import type { EvidenceRepository, Repositories } from "../../database/repositories";
import { newId } from "../../database/repositories";
import { AppError } from "../../domain/types";

export class EvidenceService {
  constructor(private readonly evidence: EvidenceRepository) {}

  static fromRepos(repos: Repositories) {
    return new EvidenceService(repos.evidence);
  }

  private tenantId(ctx: AuthContext) {
    requireUser(ctx);
    if (!ctx.activeTenantId) throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);
    requireTenantMembership(ctx, ctx.activeTenantId);
    return ctx.activeTenantId;
  }

  async list(ctx: AuthContext) {
    return this.evidence.list(this.tenantId(ctx));
  }

  async get(ctx: AuthContext, evidencePublicId: string) {
    const item = await this.evidence.getByPublicId(this.tenantId(ctx), evidencePublicId);
    if (!item) throw new AppError("EVIDENCE_NOT_FOUND", "Evidence not found", 404);
    return item;
  }

  async create(
    ctx: AuthContext,
    input: {
      title: string;
      organization: string;
      situation: string;
      task: string;
      actions: string[];
      result: string;
      technologies: string[];
      confidence: string;
      verificationStatus: string;
      privacyLevel: string;
      payload?: Record<string, unknown>;
    },
  ) {
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    return this.evidence.create({
      id: newId("ev"),
      publicId: newId("evp"),
      tenantId,
      title: input.title,
      organization: input.organization,
      situation: input.situation,
      task: input.task,
      actions: input.actions,
      result: input.result,
      technologies: input.technologies,
      confidence: input.confidence,
      verificationStatus: input.verificationStatus,
      privacyLevel: input.privacyLevel,
      excludedFromApplicationIds: [],
      matchedApplicationIds: [],
      payload: input.payload ?? {},
    });
  }

  async update(ctx: AuthContext, evidencePublicId: string, patch: Record<string, unknown>) {
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    return this.evidence.update(tenantId, evidencePublicId, patch as never);
  }

  async match(ctx: AuthContext, applicationId: string, evidenceIds: string[]) {
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    const updated = [];
    for (const id of evidenceIds) {
      const item = await this.evidence.getByPublicId(tenantId, id);
      if (!item) throw new AppError("EVIDENCE_NOT_FOUND", `Evidence ${id} not found`, 404);
      const matched = Array.from(new Set([...item.matchedApplicationIds, applicationId]));
      const excluded = item.excludedFromApplicationIds.filter((a) => a !== applicationId);
      updated.push(await this.evidence.update(tenantId, id, { matchedApplicationIds: matched, excludedFromApplicationIds: excluded }));
    }
    return updated;
  }

  async exclude(ctx: AuthContext, applicationId: string, evidenceId: string) {
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    const item = await this.evidence.getByPublicId(tenantId, evidenceId);
    if (!item) throw new AppError("EVIDENCE_NOT_FOUND", "Evidence not found", 404);
    const excluded = Array.from(new Set([...item.excludedFromApplicationIds, applicationId]));
    const matched = item.matchedApplicationIds.filter((a) => a !== applicationId);
    return this.evidence.update(tenantId, evidenceId, {
      excludedFromApplicationIds: excluded,
      matchedApplicationIds: matched,
    });
  }
}
