import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
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
    const runtime = await getRuntime();
    const hidden = getRadarService(runtime.services.radar).hide(ctx, jobId);
    return jsonOk({ hidden }, { status: 201 });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  let requestId = "";
  try {
    assertCsrf(request);
    const { jobId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const runtime = await getRuntime();
    const result = getRadarService(runtime.services.radar).unhide(ctx, jobId);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
