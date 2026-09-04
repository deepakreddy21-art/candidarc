import { requireUser } from "@server/auth/guards";
import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonError, jsonOk } from "@server/http/response";

type Params = { params: Promise<{ workflowId: string }> };

export async function GET(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const { workflowId } = await params;
    return jsonOk(await (await getRuntime()).services.customerResumes.getCustomerWorkflow(ctx, workflowId));
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
