import { getRuntime, mapFindingToUi } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError, parseJsonBody } from "@server/http/response";
import { requireUser, requireApplicationAccess } from "@server/auth/guards";
import { updateFindingRequestSchema } from "@server/contracts/api";
import { withMutationGuards } from "@server/http/csrf";

type Params = { params: Promise<{ applicationId: string; findingId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  let requestId = "";
  try {
    return await withMutationGuards(request, async () => {
      const { applicationId, findingId } = await params;
      const ctx = await buildAuthContext(request);
      requestId = ctx.requestId;
      requireUser(ctx);
      await requireApplicationAccess(ctx, applicationId);
      const body = await parseJsonBody(request, updateFindingRequestSchema);
      const runtime = await getRuntime();
      const finding = await runtime.services.audits.updateFindingDecision(
        ctx,
        findingId,
        body.status,
        body.editedText,
      );
      return jsonOk({ finding: mapFindingToUi(finding) });
    });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
