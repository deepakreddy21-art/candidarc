import { getRuntime, mapProfileToUi } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError, parseJsonBody } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import { updateProfileRequestSchema } from "@server/contracts/api";
import { withMutationGuards } from "@server/http/csrf";

export async function GET(request: Request) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const runtime = await getRuntime();
    const profile = await runtime.services.profile.get(ctx);
    return jsonOk({ profile: mapProfileToUi(profile) });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}

export async function PATCH(request: Request) {
  let requestId = "";
  try {
    return await withMutationGuards(request, async () => {
      const ctx = await buildAuthContext(request);
      requestId = ctx.requestId;
      requireUser(ctx);
      const body = await parseJsonBody(request, updateProfileRequestSchema);
      const runtime = await getRuntime();
      const profile = await runtime.services.profile.update(ctx, body);
      return jsonOk({ profile: mapProfileToUi(profile) });
    });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
