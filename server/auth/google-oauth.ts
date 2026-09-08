/**
 * Google OAuth 2.0 Authorization Code + OpenID Connect (PKCE S256).
 * ID tokens are verified with jose + Google JWKS — never hand-rolled crypto.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { getEnv } from "../config/env";
import { AppError } from "../domain/types";
import { logger } from "../observability/logger";

export const GOOGLE_OAUTH_COOKIE = "candidarc_google_oauth";
export const GOOGLE_AUTH_PROVIDER = "google" as const;
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const TXN_TTL_SECONDS = 600;
const TOKEN_TIMEOUT_MS = 10_000;

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

/** Test-only: replace JWKS / fetch (never used in production paths). */
export function __setGoogleOAuthTestHooks(hooks: {
  jwks?: JWTVerifyGetKey;
  fetch?: FetchLike;
}): void {
  if (hooks.jwks) jwks = hooks.jwks;
  if (hooks.fetch) fetchImpl = hooks.fetch;
}

export function __resetGoogleOAuthTestHooks(): void {
  jwks = createRemoteJWKSet(GOOGLE_JWKS_URL);
  fetchImpl = fetch;
}

export function isGoogleAuthConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && resolveGoogleRedirectUri());
}

export function assertGoogleAuthConfigured(): void {
  if (!isGoogleAuthConfigured()) {
    throw new AppError(
      "GOOGLE_AUTH_NOT_CONFIGURED",
      "Google sign-in is not configured for this environment",
      503,
    );
  }
}

export function resolveGoogleRedirectUri(): string {
  const env = getEnv();
  if (env.GOOGLE_REDIRECT_URI) return env.GOOGLE_REDIRECT_URI;
  return new URL("/api/v1/auth/google/callback", env.APP_URL).toString();
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

export async function verifyGoogleIdToken(idToken: string, expectedNonce: string): Promise<GoogleIdClaims> {
  assertGoogleAuthConfigured();
  const env = getEnv();
  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(idToken, jwks, {
      audience: env.GOOGLE_CLIENT_ID!,
      clockTolerance: 5,
    });
    payload = verified.payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : "verify failed";
    logger.warn({ code: "GOOGLE_ID_TOKEN_INVALID", reason: message.slice(0, 120) }, "Google ID token rejected");
    if (/expir/i.test(message)) {
      throw new AppError("GOOGLE_ID_TOKEN_EXPIRED", "Google sign-in expired; try again", 401);
    }
    throw new AppError("GOOGLE_ID_TOKEN_INVALID", "Could not verify Google sign-in", 401);
  }

  const issuer = typeof payload.iss === "string" ? payload.iss : "";
  if (!GOOGLE_ISSUERS.has(issuer)) {
    throw new AppError("GOOGLE_ID_TOKEN_ISSUER", "Could not verify Google sign-in", 401);
  }
  if (typeof payload.nonce !== "string" || !safeEqual(payload.nonce, expectedNonce)) {
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
