import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError, parseJsonBody } from "@server/http/response";
import { requireUser, requireApplicationAccess } from "@server/auth/guards";
import { exportResumeRequestSchema } from "@server/contracts/api";

type Params = { params: Promise<{ applicationId: string }> };

export async function POST(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const { applicationId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    await requireApplicationAccess(ctx, applicationId);
    const body = await parseJsonBody(request, exportResumeRequestSchema);
    const runtime = await getRuntime();
    const result = await runtime.services.resumes.requestExport(ctx, applicationId, {
      versionId: body.versionId,
      idempotencyKey: body.idempotencyKey,
    });
    return jsonOk(result);
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
