import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonError, jsonOk } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import type { ApplicationMode } from "@server/copilot/types";

type Params = { params: Promise<{ opportunityId: string }> };

export async function GET(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const { opportunityId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    const user = requireUser(ctx);
    const runtime = await getRuntime();
    const applicationPackage = runtime.services.copilot.getOrCreatePackage(
      ctx.activeTenantId ?? "demo",
      user.id,
      opportunityId,
    );
    return jsonOk({ applicationPackage });
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}

export async function POST(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const { opportunityId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    const user = requireUser(ctx);
    const body = (await request.json().catch(() => ({}))) as {
      mode?: ApplicationMode;
      company?: string;
      role?: string;
      resumeId?: string;
      requiredIntents?: string[];
      approveAnswerId?: string;
    };
    const runtime = await getRuntime();
    const tenantId = ctx.activeTenantId ?? "demo";
    if (body.approveAnswerId) {
      runtime.services.copilot.approveAnswer(
        tenantId,
        user.id,
        body.approveAnswerId,
        opportunityId,
      );
    }
    const applicationPackage = runtime.services.copilot.preparePackage(
      tenantId,
      user.id,
      opportunityId,
      body,
    );
    return jsonOk({ applicationPackage }, { status: 201 });
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
