/**
 * GET /api/v1/jobs/[jobId]/brief
 * Get opportunity brief for a job.
 */

import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { requireUser } from "@server/auth/guards";
import { jsonOk, jsonError } from "@server/http/response";

type Params = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const { services } = await getRuntime();
    const { jobId } = await params;

    const brief = await services.radar.getOpportunityBrief(ctx, jobId);

    return jsonOk(brief);
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
