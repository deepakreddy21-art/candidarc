import { getRuntime } from "@server/bootstrap";
import { requireApplicationAccess, requireUser } from "@server/auth/guards";
import { buildAuthContext } from "@server/http/context";
import { withMutationGuards } from "@server/http/csrf";
import { jsonError, jsonOk } from "@server/http/response";

type Params = { params: Promise<{ applicationId: string }> };

export async function POST(request: Request, { params }: Params) {
  let requestId = "";
  try {
    return await withMutationGuards(request, async () => {
      const { applicationId } = await params;
      const ctx = await buildAuthContext(request);
      requestId = ctx.requestId;
      requireUser(ctx);
      await requireApplicationAccess(ctx, applicationId);
      const runtime = await getRuntime();
      const result = await runtime.services.audits.startNextGeneration(
        ctx,
        applicationId,
        request.headers.get("idempotency-key") ?? undefined,
      );
      return jsonOk(result, { status: 202 });
    });
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
