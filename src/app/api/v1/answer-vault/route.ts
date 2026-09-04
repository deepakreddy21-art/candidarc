import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonError, jsonOk } from "@server/http/response";
import { requireUser } from "@server/auth/guards";

export async function GET(request: Request) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    const user = requireUser(ctx);
    const runtime = await getRuntime();
    return jsonOk({
      answers: runtime.services.copilot.listAnswers(
        ctx.activeTenantId ?? "demo",
        user.id,
      ),
    });
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
