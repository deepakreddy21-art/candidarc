/**
 * Google OAuth 2.0 Authorization Code + OpenID Connect (PKCE S256).
 * ID tokens are verified with jose + Google JWKS — never hand-rolled crypto.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import {
  createRemoteJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";
import { getEnv } from "../config/env";
import { AppError } from "../domain/types";
import { logger } from "../observability/logger";

export const GOOGLE_OAUTH_COOKIE = "candidarc_google_oauth";
export const GOOGLE_AUTH_PROVIDER = "google" as const;
export const GOOGLE_CALLBACK_PATH = "/api/v1/auth/google/callback";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"] as const;
const TXN_TTL_SECONDS = 600;
const TOKEN_TIMEOUT_MS = 10_000;

/** Browser-safe google_error query values — never put arbitrary AppError codes in redirects. */
export const SAFE_GOOGLE_BROWSER_ERROR_CODES = new Set([
  "GOOGLE_AUTH_NOT_CONFIGURED",
  "GOOGLE_AUTH_MISCONFIGURED",
  "GOOGLE_RATE_LIMITED",
  "GOOGLE_AUTH_CANCELLED",
  "GOOGLE_OAUTH_DENIED",
  "GOOGLE_TXN_INVALID",
  "GOOGLE_STATE_MISSING",
  "GOOGLE_STATE_MISMATCH",
  "GOOGLE_CODE_MISSING",
  "GOOGLE_PKCE_MISSING",
  "GOOGLE_TOKEN_TIMEOUT",
  "GOOGLE_TOKEN_EXCHANGE_FAILED",
  "GOOGLE_TOKEN_MALFORMED",
  "GOOGLE_ID_TOKEN_INVALID",
  "GOOGLE_ID_TOKEN_EXPIRED",
  "GOOGLE_ID_TOKEN_ISSUER",
  "GOOGLE_NONCE_MISMATCH",
  "GOOGLE_SUB_MISSING",
  "GOOGLE_EMAIL_MISSING",
  "GOOGLE_EMAIL_UNVERIFIED",
  "GOOGLE_ACCOUNT_LINK_REQUIRED",
  "GOOGLE_ACCOUNT_DISABLED",
  "GOOGLE_AUTH_FAILED",
]);

export type GoogleOAuthTxn = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnPath: string;
  exp: number;
};

export type GoogleIdClaims = {
  sub: string;
  email: string;
  emailVerified: true;
  name: string;
  picture?: string;
};

export type GoogleTokenResponse = {
  id_token: string;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

type FetchLike = typeof fetch;

let jwks: JWTVerifyGetKey = createRemoteJWKSet(GOOGLE_JWKS_URL);
let fetchImpl: FetchLike = fetch;

function assertGoogleTestHooksAllowed(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Google OAuth test hooks are only available when NODE_ENV=test");
  }
}

/** Test-only: replace JWKS / fetch (never used in production paths). */
export function __setGoogleOAuthTestHooks(hooks: {
  jwks?: JWTVerifyGetKey;
  fetch?: FetchLike;
}): void {
  assertGoogleTestHooksAllowed();
  if (hooks.jwks) jwks = hooks.jwks;
  if (hooks.fetch) fetchImpl = hooks.fetch;
}

export function __resetGoogleOAuthTestHooks(): void {
  assertGoogleTestHooksAllowed();
  jwks = createRemoteJWKSet(GOOGLE_JWKS_URL);
  fetchImpl = fetch;
}

function isProductionRuntime(env: ReturnType<typeof getEnv>): boolean {
  return env.NODE_ENV === "production" || env.APP_MODE === "production";
}

/**
 * Validate Google OAuth configuration.
 * - Neither credential → GOOGLE_AUTH_NOT_CONFIGURED (feature off).
 * - Either credential → both required, deterministic callback URI, production HTTPS/origin rules.
 */
export function validateGoogleAuthConfiguration(): void {
  const env = getEnv();
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;

  if (!clientId && !clientSecret) {
    throw new AppError(
      "GOOGLE_AUTH_NOT_CONFIGURED",
      "Google sign-in is not configured for this environment",
      503,
    );
  }
  if (!clientId || !clientSecret) {
    throw new AppError(
      "GOOGLE_AUTH_MISCONFIGURED",
      "Google sign-in is misconfigured for this environment",
      503,
    );
  }

  let redirect: URL;
  try {
    redirect = new URL(resolveGoogleRedirectUriRaw(env));
  } catch {
    throw new AppError(
      "GOOGLE_AUTH_MISCONFIGURED",
      "Google sign-in is misconfigured for this environment",
      503,
    );
  }

  if (redirect.pathname !== GOOGLE_CALLBACK_PATH) {
    throw new AppError(
      "GOOGLE_AUTH_MISCONFIGURED",
      "Google sign-in is misconfigured for this environment",
      503,
    );
  }

  if (isProductionRuntime(env)) {
    if (redirect.protocol !== "https:") {
      throw new AppError(
        "GOOGLE_AUTH_MISCONFIGURED",
        "Google sign-in is misconfigured for this environment",
        503,
      );
    }
    if (redirect.hostname === "localhost" || redirect.hostname === "127.0.0.1") {
      throw new AppError(
        "GOOGLE_AUTH_MISCONFIGURED",
        "Google sign-in is misconfigured for this environment",
        503,
      );
    }
    let appOrigin: string;
    try {
      appOrigin = new URL(env.APP_URL).origin;
    } catch {
      throw new AppError(
        "GOOGLE_AUTH_MISCONFIGURED",
        "Google sign-in is misconfigured for this environment",
        503,
      );
    }
    if (redirect.origin !== appOrigin) {
      throw new AppError(
        "GOOGLE_AUTH_MISCONFIGURED",
        "Google sign-in is misconfigured for this environment",
        503,
      );
    }
  }
}

function resolveGoogleRedirectUriRaw(env: ReturnType<typeof getEnv>): string {
  if (env.GOOGLE_REDIRECT_URI) return env.GOOGLE_REDIRECT_URI;
  return new URL(GOOGLE_CALLBACK_PATH, env.APP_URL).toString();
}

export function isGoogleAuthConfigured(): boolean {
  try {
    validateGoogleAuthConfiguration();
    return true;
  } catch {
    return false;
  }
}

export function assertGoogleAuthConfigured(): void {
  validateGoogleAuthConfiguration();
}

export function resolveGoogleRedirectUri(): string {
  assertGoogleAuthConfigured();
  return resolveGoogleRedirectUriRaw(getEnv());
}

/** Map any failure to a browser-safe google_error code (no provider/token leakage). */
export function toSafeGoogleBrowserErrorCode(error: unknown): string {
  if (error instanceof AppError) {
    if (error.code === "RATE_LIMITED") return "GOOGLE_RATE_LIMITED";
    if (SAFE_GOOGLE_BROWSER_ERROR_CODES.has(error.code)) return error.code;
  }
  return "GOOGLE_AUTH_FAILED";
}

/** Only same-app relative paths; block open redirects. */
export function sanitizeReturnPath(raw: string | null | undefined, fallback = "/app"): string {
  if (!raw) return fallback;
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("://") || value.includes("\\") || value.includes("@")) return fallback;
  if (/[\x00-\x1f]/.test(value)) return fallback;
  return value.slice(0, 512) || fallback;
}

export function createPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function createOAuthSecrets(): { state: string; nonce: string } {
  return {
    state: randomBytes(24).toString("base64url"),
    nonce: randomBytes(24).toString("base64url"),
  };
}

function oauthCookieSecret(): string {
  return getEnv().SESSION_SECRET;
}

function sealTxn(txn: GoogleOAuthTxn): string {
  const payload = Buffer.from(JSON.stringify(txn), "utf8").toString("base64url");
  const signature = createHmac("sha256", oauthCookieSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function openTxn(sealed: string): GoogleOAuthTxn | null {
  const [payload, signature] = sealed.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", oauthCookieSecret()).update(payload).digest("base64url");
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const txn = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as GoogleOAuthTxn;
    if (
      typeof txn.state !== "string" ||
      typeof txn.nonce !== "string" ||
      typeof txn.codeVerifier !== "string" ||
      typeof txn.returnPath !== "string" ||
      typeof txn.exp !== "number"
    ) {
      return null;
    }
    if (Date.now() > txn.exp) return null;
    return txn;
  } catch {
    return null;
  }
}

export function serializeGoogleOAuthCookie(txn: GoogleOAuthTxn | null): string {
  const env = getEnv();
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  const path = "; Path=/api/v1/auth/google";
  if (!txn) {
    return `${GOOGLE_OAUTH_COOKIE}=; ${path.slice(2)}; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  }
  const value = encodeURIComponent(sealTxn(txn));
  return `${GOOGLE_OAUTH_COOKIE}=${value}${path}; HttpOnly; SameSite=Lax; Max-Age=${TXN_TTL_SECONDS}${secure}`;
}

export function parseGoogleOAuthCookie(cookieHeader: string | null | undefined): GoogleOAuthTxn | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) !== GOOGLE_OAUTH_COOKIE) continue;
    return openTxn(decodeURIComponent(trimmed.slice(eq + 1)));
  }
  return null;
}

export function buildGoogleAuthorizationUrl(input: {
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  assertGoogleAuthConfigured();
  const env = getEnv();
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", resolveGoogleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function beginGoogleOAuth(returnPath?: string | null): {
  authorizationUrl: string;
  cookie: string;
  txn: GoogleOAuthTxn;
} {
  assertGoogleAuthConfigured();
  const { state, nonce } = createOAuthSecrets();
  const { codeVerifier, codeChallenge } = createPkcePair();
  const txn: GoogleOAuthTxn = {
    state,
    nonce,
    codeVerifier,
    returnPath: sanitizeReturnPath(returnPath),
    exp: Date.now() + TXN_TTL_SECONDS * 1000,
  };
  return {
    authorizationUrl: buildGoogleAuthorizationUrl({ state, nonce, codeChallenge }),
    cookie: serializeGoogleOAuthCookie(txn),
    txn,
  };
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function exchangeGoogleAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
}): Promise<GoogleTokenResponse> {
  assertGoogleAuthConfigured();
  const env = getEnv();
  const body = new URLSearchParams({
    code: input.code,
    client_id: env.GOOGLE_CLIENT_ID!,
    client_secret: env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: resolveGoogleRedirectUri(),
    grant_type: "authorization_code",
    code_verifier: input.codeVerifier,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    logger.warn(
      { code: aborted ? "GOOGLE_TOKEN_TIMEOUT" : "GOOGLE_TOKEN_NETWORK", requestId: undefined },
      "Google token exchange failed",
    );
    throw new AppError(
      aborted ? "GOOGLE_TOKEN_TIMEOUT" : "GOOGLE_TOKEN_EXCHANGE_FAILED",
      "Could not complete Google sign-in",
      aborted ? 504 : 502,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    logger.warn({ code: "GOOGLE_TOKEN_EXCHANGE_FAILED", status: response.status }, "Google token HTTP error");
    throw new AppError("GOOGLE_TOKEN_EXCHANGE_FAILED", "Could not complete Google sign-in", 502);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new AppError("GOOGLE_TOKEN_MALFORMED", "Could not complete Google sign-in", 502);
  }
  if (!json || typeof json !== "object" || typeof (json as { id_token?: unknown }).id_token !== "string") {
    throw new AppError("GOOGLE_TOKEN_MALFORMED", "Could not complete Google sign-in", 502);
  }
  return json as GoogleTokenResponse;
}

function assertAcceptedAudience(payload: JWTPayload, clientId: string): void {
  const aud = payload.aud;
  if (typeof aud === "string") {
    if (aud !== clientId) {
      throw new AppError("GOOGLE_ID_TOKEN_INVALID", "Could not verify Google sign-in", 401);
    }
    return;
  }
  if (Array.isArray(aud)) {
    // Single trusted web client only — reject multi-audience tokens.
    if (aud.length === 1 && aud[0] === clientId) return;
    throw new AppError("GOOGLE_ID_TOKEN_INVALID", "Could not verify Google sign-in", 401);
  }
  throw new AppError("GOOGLE_ID_TOKEN_INVALID", "Could not verify Google sign-in", 401);
}

function assertAuthorizedParty(payload: JWTPayload, clientId: string): void {
  if (payload.azp === undefined) return;
  if (typeof payload.azp !== "string" || payload.azp !== clientId) {
    throw new AppError("GOOGLE_ID_TOKEN_INVALID", "Could not verify Google sign-in", 401);
  }
}

function mapJoseVerifyError(err: unknown): AppError {
  const code =
    err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
  const claim =
    err && typeof err === "object" && "claim" in err ? String((err as { claim: unknown }).claim) : "";

  if (
    err instanceof joseErrors.JWTExpired ||
    code === "ERR_JWT_EXPIRED" ||
    (code === "ERR_JWT_CLAIM_VALIDATION_FAILED" && claim === "exp")
  ) {
    return new AppError("GOOGLE_ID_TOKEN_EXPIRED", "Google sign-in expired; try again", 401);
  }
  if (
    (err instanceof joseErrors.JWTClaimValidationFailed || code === "ERR_JWT_CLAIM_VALIDATION_FAILED") &&
    claim === "iss"
  ) {
    return new AppError("GOOGLE_ID_TOKEN_ISSUER", "Could not verify Google sign-in", 401);
  }
  return new AppError("GOOGLE_ID_TOKEN_INVALID", "Could not verify Google sign-in", 401);
}

export async function verifyGoogleIdToken(idToken: string, expectedNonce: string): Promise<GoogleIdClaims> {
  assertGoogleAuthConfigured();
  const env = getEnv();
  const clientId = env.GOOGLE_CLIENT_ID!;
  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(idToken, jwks, {
      algorithms: ["RS256"],
      issuer: [...GOOGLE_ISSUERS],
      audience: clientId,
      clockTolerance: 5,
    });
    payload = verified.payload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const mapped = mapJoseVerifyError(err);
    logger.warn(
      { code: mapped.code, joseCode: err && typeof err === "object" && "code" in err ? (err as { code: unknown }).code : undefined },
      "Google ID token rejected",
    );
    throw mapped;
  }

  try {
    assertAcceptedAudience(payload, clientId);
    assertAuthorizedParty(payload, clientId);
  } catch (err) {
    if (err instanceof AppError) {
      logger.warn({ code: err.code }, "Google ID token audience/azp rejected");
      throw err;
    }
    throw err;
  }

  if (typeof payload.nonce !== "string" || !payload.nonce || !safeEqual(payload.nonce, expectedNonce)) {
    throw new AppError("GOOGLE_NONCE_MISMATCH", "Could not verify Google sign-in", 401);
  }
  if (typeof payload.sub !== "string" || !payload.sub.trim()) {
    throw new AppError("GOOGLE_SUB_MISSING", "Could not verify Google sign-in", 401);
  }
  if (typeof payload.email !== "string" || !payload.email.trim()) {
    throw new AppError("GOOGLE_EMAIL_MISSING", "Google did not provide a verified email", 401);
  }
  if (payload.email_verified !== true && payload.email_verified !== "true") {
    throw new AppError("GOOGLE_EMAIL_UNVERIFIED", "Google email is not verified", 401);
  }

  const name =
    (typeof payload.name === "string" && payload.name.trim()) ||
    (typeof payload.given_name === "string" && payload.given_name.trim()) ||
    payload.email.split("@")[0] ||
    "Google user";

  return {
    sub: payload.sub,
    email: payload.email.trim().toLowerCase(),
    emailVerified: true,
    name: name.slice(0, 120),
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
}

export function requireMatchingState(txn: GoogleOAuthTxn, state: string | null): void {
  if (!state) throw new AppError("GOOGLE_STATE_MISSING", "Google sign-in could not be completed", 400);
  if (!safeEqual(txn.state, state)) {
    throw new AppError("GOOGLE_STATE_MISMATCH", "Google sign-in could not be completed", 400);
  }
}

export function clearGoogleOAuthCookieHeader(): string {
  return serializeGoogleOAuthCookie(null);
}
