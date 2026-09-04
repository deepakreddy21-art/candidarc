import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import { getRuntime } from "@server/bootstrap";

export async function GET(request: Request) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    const user = requireUser(ctx);
    const runtime = await getRuntime();
    const memberships = await runtime.repos.users.listMemberships(user.id);
    const active = memberships.find((m) => m.tenantId === ctx.activeTenantId) ?? memberships[0];

    return jsonOk({
      user: {
        id: user.publicId,
        email: user.email,
        name: user.name,
      },
      tenant: active
        ? {
            id: active.tenant.publicId,
            name: active.tenant.name,
            role: active.role,
          }
        : null,
    });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
