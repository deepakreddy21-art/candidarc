import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError, parseJsonBody } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import { jobAlertBodySchema } from "@server/radar/http";
import { toAlertView } from "@server/radar/mappers";
import { assertCsrf } from "@server/http/csrf";
import { getRadarService } from "@server/http/feature-guards";

export async function GET(request: Request) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const runtime = await getRuntime();
    const alerts = getRadarService(runtime.services.radar).listAlerts(ctx).map(toAlertView);
    return jsonOk({ alerts });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}

export async function POST(request: Request) {
  let requestId = "";
  try {
    assertCsrf(request);
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const body = await parseJsonBody(request, jobAlertBodySchema);
    const runtime = await getRuntime();
    const created = getRadarService(runtime.services.radar).createAlert(ctx, {
      name: body.name,
      query: body.query,
      cadence: body.cadence,
      includeReposts: body.includeReposts,
      includeRefreshes: body.includeRefreshes,
      savedSearchId: body.savedSearchId,
    });
    if (body.active === false) {
      getRadarService(runtime.services.radar).updateAlert(ctx, created.publicId, { enabled: false });
      created.enabled = false;
    }
    return jsonOk({ alert: toAlertView(created) }, { status: 201 });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
