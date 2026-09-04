import { getRuntime, mapEvidenceToUi } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError, parseJsonBody } from "@server/http/response";
import { requireUser, requireEvidenceAccess } from "@server/auth/guards";
import { updateEvidenceRequestSchema } from "@server/contracts/api";

type Params = { params: Promise<{ evidenceId: string }> };

export async function GET(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const { evidenceId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    await requireEvidenceAccess(ctx, evidenceId);
    const runtime = await getRuntime();
    const item = await runtime.services.evidence.get(ctx, evidenceId);
    return jsonOk({ evidence: mapEvidenceToUi(item) });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const { evidenceId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    await requireEvidenceAccess(ctx, evidenceId);
    const body = await parseJsonBody(request, updateEvidenceRequestSchema);
    const runtime = await getRuntime();
    const item = await runtime.services.evidence.update(ctx, evidenceId, body);
    return jsonOk({ evidence: mapEvidenceToUi(item) });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
