import { randomUUID } from "crypto";
import { getRuntime } from "@server/bootstrap";
import { resolveGoogleSignIn } from "@server/auth/google-account";
import {
  clearGoogleOAuthCookieHeader,
  exchangeGoogleAuthorizationCode,
  parseGoogleOAuthCookie,
  requireMatchingState,
  sanitizeReturnPath,
  verifyGoogleIdToken,
} from "@server/auth/google-oauth";
import { createSession, hashToken, parseSessionCookie, verifySession } from "@server/auth/session";
import { AppError } from "@server/domain/types";
import { getEnv } from "@server/config/env";
import { ensureCsrfCookie } from "@server/http/csrf";
import { assertRateLimit } from "@server/http/rate-limit";
import { logger } from "@server/observability/logger";

function redirectWithError(request: Request, code: string): Response {
  const target = new URL("/sign-in", getEnv().APP_URL);
  target.searchParams.set("google_error", code);
  const response = Response.redirect(target.toString(), 302);
  response.headers.append("Set-Cookie", clearGoogleOAuthCookieHeader());
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function redirectSuccess(returnPath: string, sessionCookie: string): Response {
  const target = new URL(sanitizeReturnPath(returnPath), getEnv().APP_URL);
  const response = Response.redirect(target.toString(), 302);
  response.headers.append("Set-Cookie", clearGoogleOAuthCookieHeader());
  response.headers.append("Set-Cookie", sessionCookie);
  ensureCsrfCookie(response);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  try {
    await assertRateLimit(request, "auth:google:callback");
    const url = new URL(request.url);
    const oauthError = url.searchParams.get("error");
    if (oauthError) {
      const code = oauthError === "access_denied" ? "GOOGLE_AUTH_CANCELLED" : "GOOGLE_OAUTH_DENIED";
      logger.info({ code, requestId, providerError: oauthError }, "Google OAuth denied");
      return redirectWithError(request, code);
    }

    const txn = parseGoogleOAuthCookie(request.headers.get("cookie"));
    if (!txn) {
      return redirectWithError(request, "GOOGLE_TXN_INVALID");
    }

    const code = url.searchParams.get("code");
    if (!code) {
      return redirectWithError(request, "GOOGLE_CODE_MISSING");
    }

    requireMatchingState(txn, url.searchParams.get("state"));
    if (!txn.codeVerifier) {
      return redirectWithError(request, "GOOGLE_PKCE_MISSING");
    }

    const tokens = await exchangeGoogleAuthorizationCode({
      code,
      codeVerifier: txn.codeVerifier,
    });
    const claims = await verifyGoogleIdToken(tokens.id_token, txn.nonce);

    const runtime = await getRuntime();
    const { user, tenant } = await resolveGoogleSignIn(runtime.repos, claims, requestId);

    const previous = await verifySession(parseSessionCookie(request.headers.get("cookie")));
    if (previous) await runtime.repos.sessions.revoke(previous.sid);

    const session = await createSession({
      userId: user.id,
      tenantId: tenant.id,
      sessionId: randomUUID(),
    });
    await runtime.repos.sessions.create({
      id: session.sessionId,
      userId: user.id,
      tokenHash: hashToken(session.token),
      expiresAt: session.expiresAt.toISOString(),
    });

    logger.info(
      { code: "GOOGLE_AUTH_SUCCESS", requestId, userPublicId: user.publicId },
      "Google authentication succeeded",
    );
    return redirectSuccess(txn.returnPath, session.cookie);
  } catch (error) {
    const code =
      error instanceof AppError
        ? error.code
        : "GOOGLE_AUTH_FAILED";
    logger.warn(
      { code, requestId, status: error instanceof AppError ? error.status : 500 },
      "Google authentication failed",
    );
    return redirectWithError(request, code);
  }
}
