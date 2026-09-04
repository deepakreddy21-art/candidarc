import { getRuntime, mapProfileToUi } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError, parseJsonBody } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import { updateOnboardingRequestSchema } from "@server/contracts/api";

export async function GET(request: Request) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const runtime = await getRuntime();
    const profile = await runtime.services.profile.get(ctx);
    return jsonOk({
      step: profile.onboardingStep,
      completedAt: profile.onboardingCompletedAt,
      data: mapProfileToUi(profile),
    });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}

export async function PATCH(request: Request) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const body = await parseJsonBody(request, updateOnboardingRequestSchema);
    const runtime = await getRuntime();
    const profile = await runtime.services.profile.updateOnboarding(ctx, body);
    return jsonOk({
      step: profile.onboardingStep,
      completedAt: profile.onboardingCompletedAt,
      profile: mapProfileToUi(profile),
    });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
