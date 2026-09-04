import { getRuntime, mapApplicationToUi } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError, parseJsonBody } from "@server/http/response";
import { requireUser, requireApplicationAccess } from "@server/auth/guards";
import { updateApplicationRequestSchema } from "@server/contracts/api";
import { assertCsrf } from "@server/http/csrf";

type Params = { params: Promise<{ applicationId: string }> };

export async function GET(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const { applicationId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    await requireApplicationAccess(ctx, applicationId);
    const runtime = await getRuntime();
    const app = await runtime.services.applications.get(ctx, applicationId);
    return jsonOk({ application: mapApplicationToUi(app) });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  let requestId = "";
  try {
    assertCsrf(request);
    const { applicationId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    await requireApplicationAccess(ctx, applicationId);
    const body = await parseJsonBody(request, updateApplicationRequestSchema);
    const runtime = await getRuntime();
    const app = await runtime.services.applications.update(ctx, applicationId, body);
    return jsonOk({ application: mapApplicationToUi(app) });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  let requestId = "";
  try {
    assertCsrf(request);
    const { applicationId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    await requireApplicationAccess(ctx, applicationId);
    const runtime = await getRuntime();
    const app = await runtime.services.applications.archive(ctx, applicationId);
    return jsonOk({ application: mapApplicationToUi(app) });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
