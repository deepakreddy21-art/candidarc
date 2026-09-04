import { requireUser } from "@server/auth/guards";
import { getRuntime } from "@server/bootstrap";
import { AppError } from "@server/domain/types";
import { buildAuthContext } from "@server/http/context";
import { jsonError } from "@server/http/response";

type Params = { params: Promise<{ workflowId: string }> };

export async function GET(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const format = new URL(request.url).searchParams.get("format");
    if (format !== "pdf" && format !== "docx") throw new AppError("VALIDATION_ERROR", "format must be pdf or docx", 400);
    const { workflowId } = await params;
    const file = await (await getRuntime()).services.customerResumes.getDownload(ctx, workflowId, format);
    return new Response(file.body, {
      headers: {
        "content-type": file.contentType,
        "content-disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
