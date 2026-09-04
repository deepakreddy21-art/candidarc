import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError } from "@server/http/response";
import { requireUser } from "@server/auth/guards";

type Params = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const { jobId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const runtime = await getRuntime();
    const saved = runtime.services.radar.save(ctx, jobId);
    return jsonOk({ saved }, { status: 201 });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const { jobId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const runtime = await getRuntime();
    const result = runtime.services.radar.unsave(ctx, jobId);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
