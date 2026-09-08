import { getRuntime } from "@server/bootstrap";
import {
  beginGoogleOAuth,
  clearGoogleOAuthCookieHeader,
  toSafeGoogleBrowserErrorCode,
} from "@server/auth/google-oauth";
import { assertRateLimit } from "@server/http/rate-limit";
import { logger } from "@server/observability/logger";

function redirectResponse(url: string, cookies: string[] = []): Response {
  const headers = new Headers({
    Location: url,
    "Cache-Control": "no-store",
  });
  for (const cookie of cookies) {
    headers.append("Set-Cookie", cookie);
  }
  return new Response(null, { status: 302, headers });
}

function redirectStartFailure(request: Request, code: string): Response {
  const target = new URL("/sign-in", request.url);
  target.searchParams.set("google_error", code);
  return redirectResponse(target.toString(), [clearGoogleOAuthCookieHeader()]);
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await assertRateLimit(request, "auth:google:start");
    // Ensure runtime/env is initialized (may throw GOOGLE_AUTH_* inside beginGoogleOAuth).
    await getRuntime();
    const url = new URL(request.url);
    const next = url.searchParams.get("next") ?? url.searchParams.get("returnPath");
    const { authorizationUrl, cookie } = beginGoogleOAuth(next);
    logger.info({ code: "GOOGLE_OAUTH_START", requestId }, "Google OAuth start");
    return redirectResponse(authorizationUrl, [cookie]);
  } catch (error) {
    const safeCode = toSafeGoogleBrowserErrorCode(error);
    logger.warn(
      {
        code: safeCode,
        requestId,
        result: "GOOGLE_OAUTH_START_FAILED",
      },
      "Google OAuth start failed",
    );
    return redirectStartFailure(request, safeCode);
  }
}
