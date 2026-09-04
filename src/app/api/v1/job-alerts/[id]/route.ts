import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError, parseJsonBody } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import { jobAlertPatchSchema } from "@server/radar/http";
import { toAlertView } from "@server/radar/mappers";
import { assertCsrf } from "@server/http/csrf";
import { getRadarService } from "@server/http/feature-guards";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  let requestId = "";
  try {
    assertCsrf(request);
    const { id } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const body = await parseJsonBody(request, jobAlertPatchSchema);
    const runtime = await getRuntime();
    const alert = toAlertView(
      getRadarService(runtime.services.radar).updateAlert(ctx, id, {
        name: body.name,
        query: body.query,
        cadence: body.cadence,
        enabled: body.enabled ?? body.active,
        includeReposts: body.includeReposts,
        includeRefreshes: body.includeRefreshes,
      }),
    );
    return jsonOk({ alert });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  let requestId = "";
  try {
    assertCsrf(request);
    const { id } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const runtime = await getRuntime();
    const result = getRadarService(runtime.services.radar).deleteAlert(ctx, id);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
