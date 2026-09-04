import { getRuntime, mapResumeToUi } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError } from "@server/http/response";
import { requireUser, requireApplicationAccess } from "@server/auth/guards";
import { AppError } from "@server/domain/types";

type Params = { params: Promise<{ applicationId: string }> };

export async function GET(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const { applicationId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    await requireApplicationAccess(ctx, applicationId);
    const runtime = await getRuntime();
    try {
      const { resume, versions } = await runtime.services.resumes.getResume(ctx, applicationId);
      return jsonOk({ resume: mapResumeToUi(resume, versions), versions });
    } catch (err) {
      if (err instanceof AppError && err.code === "RESUME_NOT_FOUND") {
        return jsonOk({ resume: null, versions: [] });
      }
      throw err;
    }
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
