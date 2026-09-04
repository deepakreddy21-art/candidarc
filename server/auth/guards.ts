import type { TenantRole } from "../domain/types";
import { AppError } from "../domain/types";
import type {
  ApplicationRepository,
  EvidenceRepository,
  UserRecord,
} from "../database/repositories";

export type MembershipView = {
  tenantId: string;
  tenantPublicId: string;
  role: TenantRole;
};

export type AuthUser = {
  id: string;
  publicId: string;
  email: string;
  name: string;
};

export type GuardRepositories = {
  applications: Pick<ApplicationRepository, "getByPublicIdGlobal">;
  evidence: Pick<EvidenceRepository, "getByPublicIdGlobal">;
};

export type AuthContext = {
  requestId: string;
  user: AuthUser | null;
  memberships: MembershipView[];
  activeTenantId: string | null;
  /** Injected by request middleware for resource lookups */
  repos?: GuardRepositories;
};

export function toAuthUser(user: UserRecord): AuthUser {
  return {
    id: user.id,
    publicId: user.publicId,
    email: user.email,
    name: user.name,
  };
}

export function requireUser(ctx: AuthContext): AuthUser {
  if (!ctx.user) {
    throw new AppError("UNAUTHENTICATED", "Authentication required", 401);
  }
  return ctx.user;
}

export function requireTenantMembership(ctx: AuthContext, tenantId: string): MembershipView {
  requireUser(ctx);
  const membership = ctx.memberships.find((m) => m.tenantId === tenantId || m.tenantPublicId === tenantId);
  if (!membership) {
    throw new AppError("FORBIDDEN_TENANT", "Not a member of this tenant", 403);
  }
  return membership;
}

export function requireTenantRole(ctx: AuthContext, tenantId: string, roles: TenantRole[]): MembershipView {
  const membership = requireTenantMembership(ctx, tenantId);
  if (!roles.includes(membership.role)) {
    throw new AppError("FORBIDDEN_ROLE", `Requires one of roles: ${roles.join(", ")}`, 403);
  }
  return membership;
}

export async function requireApplicationAccess(ctx: AuthContext, applicationPublicId: string) {
  const user = requireUser(ctx);
  if (!ctx.repos) {
    throw new AppError("INTERNAL_MISCONFIG", "Auth context missing repositories", 500);
  }
  const app = await ctx.repos.applications.getByPublicIdGlobal(applicationPublicId);
  if (!app) {
    throw new AppError("APPLICATION_NOT_FOUND", "Application not found", 404);
  }
  requireTenantMembership(ctx, app.tenantId);
  if (ctx.activeTenantId && ctx.activeTenantId !== app.tenantId) {
    const stillMember = ctx.memberships.some((m) => m.tenantId === app.tenantId);
    if (!stillMember) {
      throw new AppError("FORBIDDEN_TENANT", "Active tenant cannot access this application", 403);
    }
  }
  return { user, application: app };
}

export async function requireEvidenceAccess(ctx: AuthContext, evidencePublicId: string) {
  const user = requireUser(ctx);
  if (!ctx.repos) {
    throw new AppError("INTERNAL_MISCONFIG", "Auth context missing repositories", 500);
  }
  const evidence = await ctx.repos.evidence.getByPublicIdGlobal(evidencePublicId);
  if (!evidence) {
    throw new AppError("EVIDENCE_NOT_FOUND", "Evidence not found", 404);
  }
  requireTenantMembership(ctx, evidence.tenantId);
  return { user, evidence };
}

/** Support role access must be explicit and auditable — never silent bypass. */
export function assertSupportAccessAudited(ctx: AuthContext, tenantId: string, audit: (info: Record<string, unknown>) => void) {
  const membership = requireTenantRole(ctx, tenantId, ["support", "owner", "admin"]);
  if (membership.role === "support") {
    audit({
      type: "support_access",
      requestId: ctx.requestId,
      userId: ctx.user?.id,
      tenantId,
      at: new Date().toISOString(),
    });
  }
  return membership;
}
