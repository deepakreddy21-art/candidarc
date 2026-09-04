import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import { AppError } from "@server/domain/types";
import { assertCsrf } from "@server/http/csrf";

export async function POST(request: Request) {
  let requestId = "";
  try {
    assertCsrf(request);
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_ERROR", "Missing file field", 400);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const runtime = await getRuntime();
    const result = await runtime.services.resumeImport.upload(ctx, {
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      buffer,
    });
    return jsonOk(result, { status: 201 });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
