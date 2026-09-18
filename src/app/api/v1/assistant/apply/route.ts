import { requireUser } from "@server/auth/guards";
import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { withMutationGuards } from "@server/http/csrf";
import { jsonError, jsonOk, parseJsonBody } from "@server/http/response";
import { assistantApplySchema } from "@server/modules/assistant/service";

export async function POST(request: Request) {
  let requestId = "";
  try {
    return await withMutationGuards(request, async () => {
      const ctx = await buildAuthContext(request);
      requestId = ctx.requestId;
      requireUser(ctx);
      const input = await parseJsonBody(request, assistantApplySchema);
      const runtime = await getRuntime();
      const thread = await runtime.services.assistant.apply(ctx, input);
      return jsonOk({ messages: thread.messages });
    });
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
