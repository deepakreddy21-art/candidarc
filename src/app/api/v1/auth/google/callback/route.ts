import { randomUUID } from "crypto";
import { getRuntime } from "@server/bootstrap";
import { resolveGoogleSignIn } from "@server/auth/google-account";
import {
  clearGoogleOAuthCookieHeader,
  exchangeGoogleAuthorizationCode,
  parseGoogleOAuthCookie,
  requireMatchingState,
  sanitizeReturnPath,
  toSafeGoogleBrowserErrorCode,
  verifyGoogleIdToken,
} from "@server/auth/google-oauth";
import { createSession, hashToken, parseSessionCookie, verifySession } from "@server/auth/session";
import { AppError } from "@server/domain/types";
import { getEnv } from "@server/config/env";
import { ensureCsrfCookie } from "@server/http/csrf";
import { assertRateLimit } from "@server/http/rate-limit";
import { logger } from "@server/observability/logger";
import { resolvePostAuthDestination } from "@server/auth/post-auth-destination";

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

function redirectWithError(_request: Request, code: string): Response {
  const safe = toSafeGoogleBrowserErrorCode(new AppError(code, "Google sign-in failed", 400));
  const target = new URL("/sign-in", getEnv().APP_URL);
  target.searchParams.set("google_error", safe);
  return redirectResponse(target.toString(), [clearGoogleOAuthCookieHeader()]);
}

function redirectSuccess(destinationPath: string, sessionCookie: string): Response {
  const target = new URL(sanitizeReturnPath(destinationPath), getEnv().APP_URL);
  const response = redirectResponse(target.toString(), [
    clearGoogleOAuthCookieHeader(),
    sessionCookie,
  ]);
  ensureCsrfCookie(response);
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

    const destination = await resolvePostAuthDestination(runtime.repos, {
      userId: user.id,
      tenantId: tenant.id,
      preferredReturnPath: txn.returnPath,
    });

    logger.info(
      {
        code: "GOOGLE_AUTH_SUCCESS",
        requestId,
        userPublicId: user.publicId,
        destination: destination.path,
        destinationReason: destination.reason,
      },
      "Google authentication succeeded",
    );
    return redirectSuccess(destination.path, session.cookie);
  } catch (error) {
    const code = toSafeGoogleBrowserErrorCode(error);
    logger.warn({ code, requestId }, "Google authentication failed");
    return redirectWithError(request, code);
  }
}
