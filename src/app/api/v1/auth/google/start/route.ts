import { getRuntime } from "@server/bootstrap";
import { beginGoogleOAuth, clearGoogleOAuthCookieHeader } from "@server/auth/google-oauth";
import { AppError } from "@server/domain/types";
import { assertRateLimit } from "@server/http/rate-limit";
import { jsonError } from "@server/http/response";
import { logger } from "@server/observability/logger";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await assertRateLimit(request, "auth:google:start");
    // Ensure runtime/env is initialized (may throw GOOGLE_AUTH_NOT_CONFIGURED inside beginGoogleOAuth).
    await getRuntime();
    const url = new URL(request.url);
    const next = url.searchParams.get("next") ?? url.searchParams.get("returnPath");
    const { authorizationUrl, cookie } = beginGoogleOAuth(next);
    logger.info({ code: "GOOGLE_OAUTH_START", requestId }, "Google OAuth start");
    const response = Response.redirect(authorizationUrl, 302);
    response.headers.append("Set-Cookie", cookie);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const clear = clearGoogleOAuthCookieHeader();
    if (error instanceof AppError && error.code === "GOOGLE_AUTH_NOT_CONFIGURED") {
      const response = Response.redirect(
        new URL(`/sign-in?google_error=${encodeURIComponent(error.code)}`, request.url).toString(),
        302,
      );
      response.headers.append("Set-Cookie", clear);
      return response;
    }
    const response = jsonError(error, requestId);
    response.headers.append("Set-Cookie", clear);
    return response;
  }
}
