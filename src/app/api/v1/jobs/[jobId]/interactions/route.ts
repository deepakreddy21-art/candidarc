/**
 * POST /api/v1/jobs/[jobId]/interactions
 * Record a user interaction with a job.
 */

import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { requireUser } from "@server/auth/guards";
import { jsonOk, jsonError } from "@server/http/response";
import { z } from "zod";
import { assertCsrf } from "@server/http/csrf";
import { getRadarService } from "@server/http/feature-guards";

const bodySchema = z.object({
  interactionType: z.enum([
    "view",
    "expand",
    "save",
    "unsave",
    "hide",
    "apply",
    "tailor_resume",
    "open_listing",
    "share",
  ]),
  metadata: z.record(z.unknown()).optional(),
});

type Params = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, { params }: Params) {
  let requestId = "";
  try {
    assertCsrf(request);
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const { services } = await getRuntime();
    const { jobId } = await params;
    const body = await request.json();
    const { interactionType, metadata } = bodySchema.parse(body);

    const result = await getRadarService(services.radar).recordInteraction(ctx, jobId, interactionType, metadata);

    return jsonOk(result);
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
