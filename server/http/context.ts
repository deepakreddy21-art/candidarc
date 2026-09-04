import type { AuthContext } from "../auth/guards";
import { toAuthUser } from "../auth/guards";
import { parseSessionCookie, verifySession, hashToken } from "../auth/session";
import { createRequestId } from "../observability/logger";
import { getRuntime } from "../bootstrap";

/**
 * Build AuthContext from an incoming Request:
 * cookie → verify session → load user + memberships → set activeTenantId.
 */
export async function buildAuthContext(request: Request): Promise<AuthContext> {
  const requestId =
    request.headers.get("x-request-id")?.trim() || createRequestId();

  const runtime = await getRuntime();
  const { repos } = runtime;

  const token = parseSessionCookie(request.headers.get("cookie"));
  const session = await verifySession(token);

  if (!session) {
    return {
      requestId,
      user: null,
      memberships: [],
      activeTenantId: null,
      repos: {
        applications: repos.applications,
        evidence: repos.evidence,
      },
    };
  }

  // Prefer lookup by session record token hash, then by subject claim
  const tokenHash = hashToken(session.token);
  const sessionRecord = await repos.sessions.findByTokenHash(tokenHash);
  if (!sessionRecord || sessionRecord.revokedAt) {
    return {
      requestId,
      user: null,
      memberships: [],
      activeTenantId: null,
      repos: {
        applications: repos.applications,
        evidence: repos.evidence,
      },
    };
  }

  if (new Date(sessionRecord.expiresAt).getTime() < Date.now()) {
    return {
      requestId,
      user: null,
      memberships: [],
      activeTenantId: null,
      repos: {
        applications: repos.applications,
        evidence: repos.evidence,
      },
    };
  }

  const user =
    (await repos.users.findById(sessionRecord.userId)) ??
    (await repos.users.findByPublicId(session.sub)) ??
    (await repos.users.findById(session.sub));

  if (!user || user.deletedAt) {
    return {
      requestId,
      user: null,
      memberships: [],
      activeTenantId: null,
      repos: {
        applications: repos.applications,
        evidence: repos.evidence,
      },
    };
  }

  const membershipRows = await repos.users.listMemberships(user.id);
  const memberships = membershipRows.map((m) => ({
    tenantId: m.tenantId,
    tenantPublicId: m.tenant.publicId,
    role: m.role,
  }));

  const activeTenantId =
    (session.tid
      ? memberships.find((m) => m.tenantId === session.tid || m.tenantPublicId === session.tid)?.tenantId
      : null) ??
    memberships[0]?.tenantId ??
    null;

  return {
    requestId,
    user: toAuthUser(user),
    memberships,
    activeTenantId,
    repos: {
      applications: repos.applications,
      evidence: repos.evidence,
    },
  };
}

