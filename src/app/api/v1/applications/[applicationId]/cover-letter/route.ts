import { requireUser, requireApplicationAccess } from "@server/auth/guards";
import { getRuntime, mapApplicationToUi } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { withMutationGuards } from "@server/http/csrf";
import { jsonError, jsonOk } from "@server/http/response";
import { draftCoverLetter } from "@server/modules/assistant/service";
import type { ResumeImportExtraction } from "@/types/domain";

type Params = { params: Promise<{ applicationId: string }> };

export async function POST(request: Request, { params }: Params) {
  let requestId = "";
  try {
    return await withMutationGuards(request, async () => {
      const { applicationId } = await params;
      const ctx = await buildAuthContext(request);
      requestId = ctx.requestId;
      requireUser(ctx);
      await requireApplicationAccess(ctx, applicationId);
      const runtime = await getRuntime();
      const app = await runtime.services.applications.get(ctx, applicationId);
      const profile = await runtime.services.profile.get(ctx);
      const extraction = (profile.resumeImportExtraction ?? null) as ResumeImportExtraction | null;
      const drafted = draftCoverLetter({
        candidateName: profile.fullName || profile.preferredName || "Candidate",
        company: app.company,
        role: app.role,
        jobDescription: typeof app.metadata?.jobDescription === "string" ? app.metadata.jobDescription : undefined,
        extraction,
      });
      const saved = await runtime.services.applications.update(ctx, applicationId, {
        coverLetter: drafted.letter,
      });
      return jsonOk({
        application: mapApplicationToUi(saved),
        letter: drafted.letter,
        caveats: drafted.caveats,
      });
    });
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
