import { requireUser } from "@server/auth/guards";
import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { withMutationGuards } from "@server/http/csrf";
import { assertRateLimit } from "@server/http/rate-limit";
import { jsonError, jsonOk, parseJsonBody } from "@server/http/response";
import { customerGenerateInputSchema } from "@server/modules/resumes/customer-generate";

export async function POST(request: Request) {
  let requestId = "";
  try {
    return await withMutationGuards(request, async () => {
      await assertRateLimit(request, "customer-resume-generate");
      const ctx = await buildAuthContext(request);
      requestId = ctx.requestId;
      requireUser(ctx);
      const input = await parseJsonBody(request, customerGenerateInputSchema);
      const result = await (await getRuntime()).services.customerResumes.generate(ctx, input);
      return jsonOk(result, { status: 202 });
    });
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
