import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import { parseJobSearchParams } from "@server/radar/http";
import { toSearchApiResponse } from "@server/radar/mappers";
import { getRadarService } from "@server/http/feature-guards";

export async function GET(request: Request) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const runtime = await getRuntime();
    const radar = getRadarService(runtime.services.radar);
    const url = new URL(request.url);
    const query = parseJobSearchParams(url);
    const result = await radar.search(ctx, query);
    return jsonOk(toSearchApiResponse(radar.catalog, result));
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
