import { getRuntime, mapProfileToUi } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import { assertCsrf } from "@server/http/csrf";

export async function POST(request: Request) {
  let requestId = "";
  try {
    assertCsrf(request);
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const runtime = await getRuntime();
    const result = await runtime.services.resumeImport.confirmImport(ctx);
    return jsonOk({
      profile: mapProfileToUi(result.profile),
      extraction: result.extraction,
    });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
