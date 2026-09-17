import { requireUser } from "@server/auth/guards";
import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonError, jsonOk } from "@server/http/response";
import { detectAts, mapApprovedFields } from "@server/copilot/ats-adapters";
import { getCopilotService } from "@server/http/feature-guards";

export async function GET(request: Request) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const url = new URL(request.url);
    const host = url.searchParams.get("host") ?? "";
    const opportunityId = url.searchParams.get("opportunityId") ?? "new";
    const ats = detectAts(host);
    const runtime = await getRuntime();
    const user = requireUser(ctx);
    const copilot = getCopilotService(runtime.services.copilot);
    const pkg = copilot.getOrCreatePackage(ctx.activeTenantId ?? "demo", user.id, opportunityId);
    const fields = ats ? mapApprovedFields(pkg.answers, ats, opportunityId) : [];
    return jsonOk({
      ats,
      supported: Boolean(ats),
      mode: pkg.mode,
      fields,
      unresolvedIntents: pkg.unresolvedIntents,
      neverSubmit: true,
    });
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
