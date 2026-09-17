import { requireUser } from "@server/auth/guards";
import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { withMutationGuards } from "@server/http/csrf";
import { jsonError, jsonOk, parseJsonBody } from "@server/http/response";
import { assistantAskSchema } from "@server/modules/assistant/service";
import type { ResumeImportExtraction } from "@/types/domain";

export async function GET(request: Request) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const url = new URL(request.url);
    const contextType = url.searchParams.get("contextType") as "job" | "resume" | "application" | null;
    const contextId = url.searchParams.get("contextId");
    if (!contextType || !contextId) {
      return jsonOk({ messages: [] });
    }
    const runtime = await getRuntime();
    const thread = await runtime.services.assistant.getThread(ctx, contextType, contextId);
    return jsonOk({ messages: thread.messages });
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}

export async function POST(request: Request) {
  let requestId = "";
  try {
    return await withMutationGuards(request, async () => {
      const ctx = await buildAuthContext(request);
      requestId = ctx.requestId;
      requireUser(ctx);
      const input = await parseJsonBody(request, assistantAskSchema);
      const runtime = await getRuntime();
      const profile = await runtime.services.profile.get(ctx);
      const extraction = (profile.resumeImportExtraction ?? null) as ResumeImportExtraction | null;
      const thread = await runtime.services.assistant.ask(ctx, input, extraction);
      return jsonOk({ messages: thread.messages });
    });
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
