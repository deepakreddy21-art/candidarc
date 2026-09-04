import type { AuthContext } from "../../auth/guards";
import { requireTenantMembership, requireUser } from "../../auth/guards";
import type { Repositories, UsageRepository } from "../../database/repositories";
import { AppError } from "../../domain/types";
import { logger } from "../../observability/logger";

export class UsageService {
  constructor(private readonly usage: UsageRepository) {}

  static fromRepos(repos: Repositories) {
    return new UsageService(repos.usage);
  }

  private tenantId(ctx: AuthContext) {
    requireUser(ctx);
    if (!ctx.activeTenantId) throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);
    requireTenantMembership(ctx, ctx.activeTenantId);
    return ctx.activeTenantId;
  }

  async reserveUsage(
    ctx: AuthContext,
    input: {
      kind: string;
      units: number | string;
      costCents?: number | string;
      workflowRunId?: string;
      idempotencyKey: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const user = requireUser(ctx);
    const tenantId = this.tenantId(ctx);
    const existing = await this.usage.findByIdempotency(input.idempotencyKey);
    if (existing) {
      logger.debug({ idempotencyKey: input.idempotencyKey }, "usage reserve idempotent hit");
      return existing;
    }
    return this.usage.append({
      tenantId,
      userId: user.id,
      kind: input.kind,
      units: String(input.units),
      costCents: String(input.costCents ?? 0),
      workflowRunId: input.workflowRunId,
      idempotencyKey: input.idempotencyKey,
      status: "reserved",
      metadata: input.metadata ?? {},
    });
  }

  async commitUsage(ctx: AuthContext, idempotencyKey: string, costCents?: number | string) {
    this.tenantId(ctx);
    const existing = await this.usage.findByIdempotency(idempotencyKey);
    if (!existing) throw new AppError("USAGE_NOT_FOUND", "Usage reservation not found", 404);
    if (existing.status === "committed") return existing;
    if (existing.status === "released") {
      throw new AppError("USAGE_ALREADY_RELEASED", "Cannot commit a released reservation", 409);
    }
    const committed = await this.usage.updateStatus(idempotencyKey, "committed");
    if (costCents !== undefined && String(costCents) !== existing.costCents) {
      await this.usage.append({
        tenantId: existing.tenantId,
        userId: existing.userId,
        kind: "provider_cost",
        units: "0",
        costCents: String(costCents),
        workflowRunId: existing.workflowRunId,
        idempotencyKey: `${idempotencyKey}:cost`,
        status: "committed",
        metadata: { parentKey: idempotencyKey },
      });
    }
    return committed;
  }

  async releaseUsage(ctx: AuthContext, idempotencyKey: string) {
    this.tenantId(ctx);
    const existing = await this.usage.findByIdempotency(idempotencyKey);
    if (!existing) throw new AppError("USAGE_NOT_FOUND", "Usage reservation not found", 404);
    if (existing.status === "committed") {
      throw new AppError("USAGE_ALREADY_COMMITTED", "Cannot release a committed reservation", 409);
    }
    if (existing.status === "released") return existing;
    return this.usage.updateStatus(idempotencyKey, "released");
  }
}
