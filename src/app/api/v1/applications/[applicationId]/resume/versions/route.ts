import { getRuntime, mapResumeToUi } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError } from "@server/http/response";
import { requireUser, requireApplicationAccess } from "@server/auth/guards";

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
    const { resume, versions } = await runtime.services.resumes.getResume(ctx, applicationId);
    return jsonOk({
      resumeId: resume.publicId,
      versions: mapResumeToUi(resume, versions).versions,
    });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
