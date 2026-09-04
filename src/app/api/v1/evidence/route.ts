import { getRuntime, mapEvidenceToUi } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError, parseJsonBody } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import { createEvidenceRequestSchema } from "@server/contracts/api";

export async function GET(request: Request) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const runtime = await getRuntime();
    const items = await runtime.services.evidence.list(ctx);
    return jsonOk({ evidence: items.map(mapEvidenceToUi) });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}

export async function POST(request: Request) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const body = await parseJsonBody(request, createEvidenceRequestSchema);
    const runtime = await getRuntime();
    const item = await runtime.services.evidence.create(ctx, body);
    return jsonOk({ evidence: mapEvidenceToUi(item) }, { status: 201 });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
