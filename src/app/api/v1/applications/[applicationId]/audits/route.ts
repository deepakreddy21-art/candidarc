import { getRuntime, mapAuditRunToUi } from "@server/bootstrap";
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
    const runs = await runtime.services.audits.listRuns(ctx, applicationId);
    const audits = runs.map((run) => {
      const findings = [...runtime.store.auditFindings.values()].filter(
        (f) => f.auditRunId === run.id || f.auditRunPublicId === run.publicId,
      );
      return mapAuditRunToUi(run, findings);
    });
    return jsonOk({ audits });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
