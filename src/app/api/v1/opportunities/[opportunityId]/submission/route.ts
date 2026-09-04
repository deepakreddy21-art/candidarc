import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonError, jsonOk } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import { assertCsrf } from "@server/http/csrf";
import { getCopilotService } from "@server/http/feature-guards";

type Params = { params: Promise<{ opportunityId: string }> };

export async function POST(request: Request, { params }: Params) {
  let requestId = "";
  try {
    assertCsrf(request);
    const { opportunityId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const body = (await request.json()) as {
      packageId?: string;
      attemptId?: string;
      confirmationId?: string;
      confirmationUrl?: string;
      verificationEvidence?: string;
    };
    const copilot = getCopilotService((await getRuntime()).services.copilot);
    if (body.attemptId) {
      const receipt = copilot.confirmReceipt(body.attemptId, body);
      return jsonOk({ opportunityId, receipt });
    }
    if (!body.packageId) throw new Error("packageId or attemptId is required");
    const attempt = copilot.recordAttempt(body.packageId);
    return jsonOk({ opportunityId, attempt }, { status: 201 });
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
