import { getRuntime, mapApplicationToUi } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError } from "@server/http/response";
import { requireUser, requireApplicationAccess } from "@server/auth/guards";
import { assertCsrf } from "@server/http/csrf";

type Params = { params: Promise<{ applicationId: string }> };

export async function POST(request: Request, { params }: Params) {
  let requestId = "";
  try {
    assertCsrf(request);
    const { applicationId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    await requireApplicationAccess(ctx, applicationId);
    const runtime = await getRuntime();
    const app = await runtime.services.applications.restore(ctx, applicationId);
    return jsonOk({ application: mapApplicationToUi(app) });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
