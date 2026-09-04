import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError, parseJsonBody } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import { savedSearchPatchSchema } from "@server/radar/http";
import { toSavedSearchView } from "@server/radar/mappers";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const { id } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const body = await parseJsonBody(request, savedSearchPatchSchema);
    const runtime = await getRuntime();
    const savedSearch = toSavedSearchView(runtime.services.radar.updateSavedSearch(ctx, id, body));
    return jsonOk({ savedSearch });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const { id } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const runtime = await getRuntime();
    const result = runtime.services.radar.deleteSavedSearch(ctx, id);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
