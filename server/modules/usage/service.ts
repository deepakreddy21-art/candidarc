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

  private scopeKey(tenantId: string, idempotencyKey: string) {
    const prefix = `${tenantId}:`;
    return idempotencyKey.startsWith(prefix) ? idempotencyKey : `${prefix}${idempotencyKey}`;
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
    const scopedKey = this.scopeKey(tenantId, input.idempotencyKey);
    const existing = await this.usage.findByIdempotency(tenantId, scopedKey);
    if (existing) {
      logger.debug({ idempotencyKey: scopedKey }, "usage reserve idempotent hit");
      return existing;
    }
    return this.usage.append({
      tenantId,
      userId: user.id,
      kind: input.kind,
      units: String(input.units),
      costCents: String(input.costCents ?? 0),
      workflowRunId: input.workflowRunId,
      idempotencyKey: scopedKey,
      status: "reserved",
      metadata: input.metadata ?? {},
    });
  }

  async commitUsage(ctx: AuthContext, idempotencyKey: string, costCents?: number | string | null) {
    const user = requireUser(ctx);
    const tenantId = this.tenantId(ctx);
    const scopedKey = this.scopeKey(tenantId, idempotencyKey);

    // Use transactional commit to ensure reservation and cost row are written atomically.
    // This prevents leaving a committed reservation without a cost observation row.
    const result = await this.usage.commitReservedWithCost({
      tenantId,
      idempotencyKey: scopedKey,
      costCents: costCents ?? null,
      userId: user.id,
    });

    logger.debug({ idempotencyKey: scopedKey, costKnown: costCents != null }, "usage committed atomically");
    return result.reservation;
  }

  async releaseUsage(ctx: AuthContext, idempotencyKey: string) {
    const tenantId = this.tenantId(ctx);
    const scopedKey = this.scopeKey(tenantId, idempotencyKey);
    const existing = await this.usage.findByIdempotency(tenantId, scopedKey);
    if (!existing) throw new AppError("USAGE_NOT_FOUND", "Usage reservation not found", 404);
    if (existing.tenantId !== tenantId) {
      throw new AppError("USAGE_FORBIDDEN", "Cannot release another tenant's usage", 403);
    }
    if (existing.status === "committed") {
      throw new AppError("USAGE_ALREADY_COMMITTED", "Cannot release a committed reservation", 409);
    }
    if (existing.status === "released") return existing;
    return this.usage.updateStatus(tenantId, scopedKey, "released");
  }
}
