import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import { toRadarJobView } from "@server/radar/mappers";

type Params = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const { jobId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const runtime = await getRuntime();
    const result = await runtime.services.radar.getJob(ctx, jobId);
    const job = toRadarJobView(runtime.services.radar.catalog, {
      job: result.job,
      match: result.match,
    });
    return jsonOk({ job, sightings: result.sightings, match: result.match });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
