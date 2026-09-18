import { requireUser, requireApplicationAccess } from "@server/auth/guards";
import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonError, jsonOk } from "@server/http/response";
import { interviewPrepFromEvidence } from "@server/modules/assistant/service";
import type { ResumeImportExtraction } from "@/types/domain";

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
    const app = await runtime.services.applications.get(ctx, applicationId);
    const profile = await runtime.services.profile.get(ctx);
    const extraction = (profile.resumeImportExtraction ?? null) as ResumeImportExtraction | null;
    const prep = interviewPrepFromEvidence({
      company: app.company,
      role: app.role,
      jobDescription: typeof app.metadata?.jobDescription === "string" ? app.metadata.jobDescription : undefined,
      extraction,
    });
    return jsonOk(prep);
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
