import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import { assertCsrf } from "@server/http/csrf";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  let requestId = "";
  try {
    assertCsrf(request);
    const { id } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const runtime = await getRuntime();
    await runtime.services.notifications.markRead(ctx, id);
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
