import { requireUser } from "@server/auth/guards";
import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { withMutationGuards } from "@server/http/csrf";
import { jsonError, jsonOk } from "@server/http/response";

type Params = { params: Promise<{ workflowId: string }> };

export async function POST(request: Request, { params }: Params) {
  let requestId = "";
  try {
    return await withMutationGuards(request, async () => {
      const ctx = await buildAuthContext(request);
      requestId = ctx.requestId;
      requireUser(ctx);
      const { workflowId } = await params;
      return jsonOk(await (await getRuntime()).services.customerResumes.retry(ctx, workflowId), { status: 202 });
    });
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
