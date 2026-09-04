import { requireUser } from "@server/auth/guards";
import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { withMutationGuards } from "@server/http/csrf";
import { jsonError, jsonOk, parseJsonBody } from "@server/http/response";
import { techAnswersInputSchema } from "@server/modules/resumes/customer-generate";

type Params = { params: Promise<{ workflowId: string }> };

export async function POST(request: Request, { params }: Params) {
  let requestId = "";
  try {
    return await withMutationGuards(request, async () => {
      const ctx = await buildAuthContext(request);
      requestId = ctx.requestId;
      requireUser(ctx);
      const { workflowId } = await params;
      const input = await parseJsonBody(request, techAnswersInputSchema);
      return jsonOk(
        await (await getRuntime()).services.customerResumes.submitTechAnswers(
          ctx,
          workflowId,
          input.answers,
          { skip: input.skip },
        ),
      );
    });
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
