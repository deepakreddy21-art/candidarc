import { getRuntime, mapApplicationToUi } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError, parseJsonBody } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import { createApplicationInputSchema } from "@server/domain/types";
import { listApplicationsQuerySchema } from "@server/contracts/api";

export async function GET(request: Request) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const runtime = await getRuntime();
    const url = new URL(request.url);
    const query = listApplicationsQuerySchema.parse({
      includeArchived: url.searchParams.get("includeArchived") ?? undefined,
    });
    const apps = await runtime.services.applications.list(ctx, query.includeArchived);
    return jsonOk({ applications: apps.map(mapApplicationToUi) });
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
    const body = await parseJsonBody(request, createApplicationInputSchema);
    const runtime = await getRuntime();
    const result = await runtime.services.applications.create(ctx, body);
    return jsonOk(
      {
        application: mapApplicationToUi(result.application),
        workflowId: result.workflow.publicId,
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
