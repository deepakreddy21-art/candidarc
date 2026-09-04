import { getRuntime, mapApplicationToUi } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError, parseJsonBody } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import { createApplicationFromJobBodySchema } from "@server/radar/http";
import { assertCsrf } from "@server/http/csrf";
import { getRadarService } from "@server/http/feature-guards";

type Params = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, { params }: Params) {
  let requestId = "";
  try {
    assertCsrf(request);
    const { jobId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const body = await parseJsonBody(request, createApplicationFromJobBodySchema);
    const runtime = await getRuntime();
    const result = await getRadarService(runtime.services.radar).createApplication(ctx, jobId, body.sightingId);
    return jsonOk(
      {
        message: "Opportunity workspace created.",
        payload: result.payload,
        application: result.application ? mapApplicationToUi(result.application) : null,
        workflowId: result.workflowId,
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
