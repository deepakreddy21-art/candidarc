import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError, parseJsonBody } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import { savedSearchBodySchema } from "@server/radar/http";
import { toSavedSearchView } from "@server/radar/mappers";
import { assertCsrf } from "@server/http/csrf";
import { getRadarService } from "@server/http/feature-guards";

export async function GET(request: Request) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const runtime = await getRuntime();
    const radar = getRadarService(runtime.services.radar);
    const savedSearches = radar.listSavedSearches(ctx).map(toSavedSearchView);
    return jsonOk({ savedSearches });
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
    const body = await parseJsonBody(request, savedSearchBodySchema);
    const runtime = await getRuntime();
    const radar = getRadarService(runtime.services.radar);
    const savedSearch = toSavedSearchView(radar.createSavedSearch(ctx, body));
    return jsonOk({ savedSearch }, { status: 201 });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
