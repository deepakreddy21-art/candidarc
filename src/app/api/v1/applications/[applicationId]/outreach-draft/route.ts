import { requireUser, requireApplicationAccess } from "@server/auth/guards";
import { getRuntime, mapApplicationToUi } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { withMutationGuards } from "@server/http/csrf";
import { jsonError, jsonOk, parseJsonBody } from "@server/http/response";
import { draftOutreach } from "@server/modules/assistant/service";
import { z } from "zod";

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
      const body = await parseJsonBody(
        request,
        z.object({
          contactName: z.string().max(200).optional(),
          company: z.string().max(200).optional(),
          role: z.string().max(200).optional(),
          notes: z.string().max(4000).optional(),
          connectionBasis: z.string().max(400).optional(),
        }),
      );
      const runtime = await getRuntime();
      const app = await runtime.services.applications.get(ctx, applicationId);
      const contactName =
        body.contactName?.trim() ||
        (Array.isArray(app.metadata?.contacts) && typeof (app.metadata.contacts as Array<{ name?: string }>)[0]?.name === "string"
          ? (app.metadata.contacts as Array<{ name: string }>)[0]!.name
          : "Hiring contact");
      const drafted = draftOutreach({
        contactName,
        company: body.company ?? app.company,
        role: body.role ?? app.role,
        notes: body.notes ?? (typeof app.metadata?.notes === "string" ? app.metadata.notes : undefined),
        connectionBasis: body.connectionBasis,
      });
      const saved = await runtime.services.applications.update(ctx, applicationId, {
        outreachDraft: drafted.draft,
      });
      return jsonOk({
        application: mapApplicationToUi(saved),
        draft: drafted.draft,
        caveats: drafted.caveats,
      });
    });
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
