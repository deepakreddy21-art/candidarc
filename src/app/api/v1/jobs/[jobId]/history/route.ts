import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import { toHistoryApiEvents } from "@server/radar/mappers";
import { getRadarService } from "@server/http/feature-guards";

type Params = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const { jobId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const runtime = await getRuntime();
    const result = getRadarService(runtime.services.radar).getHistory(ctx, jobId);
    const events = toHistoryApiEvents(result.history);
    return jsonOk({ job: result.job, history: events, events });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
