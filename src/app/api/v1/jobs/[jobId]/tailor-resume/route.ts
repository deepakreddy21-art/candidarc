/**
 * POST /api/v1/jobs/[jobId]/tailor-resume
 * Create a tailored resume for a job.
 * Returns workflowId for navigation to /app/resumes/{workflowId}.
 *
 * NOTE: Does NOT auto-submit applications.
 */

import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { requireUser } from "@server/auth/guards";
import { assertCsrf } from "@server/http/csrf";
import { jsonOk, jsonError } from "@server/http/response";

type Params = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    assertCsrf(request);
    const { services } = await getRuntime();
    const { jobId } = await params;

    const result = await services.radar.tailorResume(ctx, jobId);

    return jsonOk({
      workflowId: result.workflowId,
      applicationId: result.applicationId,
      message: "Resume tailoring started. Navigate to /app/resumes/{workflowId} to view progress.",
    });
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
