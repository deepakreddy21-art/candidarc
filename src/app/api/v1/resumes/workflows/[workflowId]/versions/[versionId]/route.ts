import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonError, jsonOk } from "@server/http/response";

type Params = { params: Promise<{ workflowId: string; versionId: string }> };
export async function GET(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    const { workflowId, versionId } = await params;
    const result = await (await getRuntime()).services.customerResumes.getCustomerVersion(ctx, workflowId, versionId);
    const response = jsonOk(result);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return jsonError(error, requestId || undefined); }
}
