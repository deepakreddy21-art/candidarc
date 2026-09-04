import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError } from "@server/http/response";
import { requireUser, requireTenantMembership } from "@server/auth/guards";
import { getRuntime } from "@server/bootstrap";
import { AppError } from "@server/domain/types";
import { assertRateLimit } from "@server/http/rate-limit";
import { assertCsrf } from "@server/http/csrf";
import { hashToken, parseSessionCookie, revokeSession, verifySession } from "@server/auth/session";

/**
 * GET /api/v1/account/export — downloadable JSON of the caller's tenant-scoped data.
 */
export async function GET(request: Request) {
  let requestId = "";
  try {
    await assertRateLimit(request, "account-export");
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    const user = requireUser(ctx);
    if (!ctx.activeTenantId) throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);
    requireTenantMembership(ctx, ctx.activeTenantId);
    const runtime = await getRuntime();
    const tenantId = ctx.activeTenantId;

    const [profile, applications, evidence] = await Promise.all([
      runtime.repos.candidateProfiles.getByUser(tenantId, user.id),
      runtime.repos.applications.list(tenantId),
      runtime.repos.evidence.list(tenantId),
    ]);

    const resumes = [];
    for (const app of applications) {
      const resume = await runtime.repos.resumes.getByApplication(tenantId, app.publicId);
      if (!resume) continue;
      const versions = await runtime.repos.resumes.listVersions(tenantId, resume.publicId);
      resumes.push({
        id: resume.publicId,
        title: resume.title,
        versions: versions.map((version) => ({
          id: version.publicId,
          versionNumber: version.versionNumber,
          createdAt: version.createdAt,
        })),
      });
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      user: { id: user.publicId, email: user.email, name: user.name },
      profile,
      applications: applications.map((app) => ({
        id: app.publicId,
        company: app.company,
        role: app.role,
        stage: app.stage,
        createdAt: app.createdAt,
      })),
      evidence: evidence.map((item) => ({
        id: item.publicId,
        title: item.title,
        organization: item.organization,
        technologies: item.technologies,
      })),
      resumes,
    };

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="candidarc-export-${user.publicId}.json"`,
        "X-Request-Id": requestId,
      },
    });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}

/**
 * DELETE /api/v1/account — soft-delete applications/profile PII and revoke the session.
 */
export async function DELETE(request: Request) {
  let requestId = "";
  try {
    await assertRateLimit(request, "account-delete");
    assertCsrf(request);
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    const user = requireUser(ctx);
    if (!ctx.activeTenantId) throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);
    requireTenantMembership(ctx, ctx.activeTenantId);
    const runtime = await getRuntime();
    const tenantId = ctx.activeTenantId;

    const apps = await runtime.repos.applications.list(tenantId, { includeArchived: true });
    for (const app of apps) {
      await runtime.repos.applications.softDelete(tenantId, app.publicId);
    }

    await runtime.repos.candidateProfiles.update(tenantId, user.id, {
      deletedAt: new Date().toISOString(),
      fullName: "Deleted User",
      preferredName: null,
      email: `deleted+${user.publicId}@invalid.local`,
      phone: null,
      linkedIn: null,
      github: null,
      portfolio: null,
      summary: null,
      headline: null,
    });

    const token = parseSessionCookie(request.headers.get("cookie"));
    const session = await verifySession(token);
    if (session) {
      const record = await runtime.repos.sessions.findByTokenHash(hashToken(session.token));
      if (record) await runtime.repos.sessions.revoke(record.id);
    }
    const { cookie } = revokeSession();
    const response = jsonOk({
      deleted: true,
      message: "Account data deleted for this tenant. Your session has been revoked.",
    });
    response.headers.set("Set-Cookie", cookie);
    return response;
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
