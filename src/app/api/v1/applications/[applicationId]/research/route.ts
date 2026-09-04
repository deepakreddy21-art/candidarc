import { z } from "zod";
import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError, parseJsonBody } from "@server/http/response";
import { requireUser, requireApplicationAccess } from "@server/auth/guards";
import { startResearchRequestSchema } from "@server/contracts/api";
import { assertCsrf } from "@server/http/csrf";

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
    const status = await runtime.services.research.getStatus(ctx, applicationId);
    const findings = await runtime.services.research.getFindings(ctx, applicationId);
    return jsonOk({ ...status, findings: findings.findings, sources: findings.sources });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}

const postSchema = startResearchRequestSchema.extend({
  action: z.enum(["start", "retry"]).optional(),
});

export async function POST(request: Request, { params }: Params) {
  let requestId = "";
  try {
    assertCsrf(request);
    const { applicationId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    await requireApplicationAccess(ctx, applicationId);
    const body = await parseJsonBody(request, postSchema);
    const runtime = await getRuntime();
    if (body.action === "retry") {
      const result = await runtime.services.research.retry(ctx, applicationId, body.idempotencyKey);
      return jsonOk({ workflowId: result.workflow.publicId, status: "queued" });
    }
    const result = await runtime.services.research.start(ctx, applicationId, {
      depth: body.depth,
      idempotencyKey: body.idempotencyKey,
    });
    return jsonOk({
      workflowId: result.workflow.publicId,
      status: result.run?.status ?? "queued",
    });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
