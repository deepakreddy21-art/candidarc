import { getRuntime, mapEvidenceToUi } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError } from "@server/http/response";
import { requireUser, requireApplicationAccess } from "@server/auth/guards";

type Params = { params: Promise<{ applicationId: string }> };

export async function GET(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const { applicationId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    await requireApplicationAccess(ctx, applicationId);
    const runtime = await getRuntime();
    const all = await runtime.services.evidence.list(ctx);
    const matched = all.filter(
      (e) =>
        e.matchedApplicationIds.includes(applicationId) &&
        !e.excludedFromApplicationIds.includes(applicationId),
    );
    return jsonOk({ evidence: matched.map(mapEvidenceToUi) });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
