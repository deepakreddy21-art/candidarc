import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import { AppError } from "@server/domain/types";
import type { ResumeExtractionSection } from "@server/modules/resumes/text-extractor";
import { assertCsrf } from "@server/http/csrf";

export async function GET(request: Request) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const runtime = await getRuntime();
    const status = await runtime.services.resumeImport.getImportStatus(ctx);
    return jsonOk(status);
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}

export async function PATCH(request: Request) {
  let requestId = "";
  try {
    assertCsrf(request);
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const body = (await request.json()) as { extraction?: ResumeExtractionSection };
    if (!body.extraction) {
      return jsonError(new AppError("VALIDATION_ERROR", "extraction is required", 400), requestId);
    }
    const runtime = await getRuntime();
    const result = await runtime.services.resumeImport.updateExtraction(ctx, body.extraction);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
