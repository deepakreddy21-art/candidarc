import { getRuntime } from "@server/bootstrap";
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
    const runs = await runtime.services.workflows.listByApplication(ctx, applicationId);
    const run = runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
    const events = run
      ? await runtime.services.workflows.listEvents(ctx, run.publicId)
      : [];
    return jsonOk({
      workflow: run
        ? {
            id: run.publicId,
            applicationId: run.applicationPublicId,
            stage: run.stage,
            status: run.status,
            attempt: run.attempt,
            inputVersion: run.inputVersion,
            outputVersion: run.outputVersion,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            errorClass: run.errorClass,
          }
        : null,
      events: events.map((e) => ({
        id: e.publicId,
        seq: e.seq,
        stage: e.stage,
        status: e.status,
        message: e.message,
        createdAt: e.createdAt,
        metadata: e.metadata,
      })),
    });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
