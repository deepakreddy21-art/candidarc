/** @vitest-environment node */
import { createHash, generateKeyPairSync, randomUUID, type KeyObject } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, type JWK } from "jose";
import { resetEnvCache } from "../../server/config/env";
import {
  __resetGoogleOAuthTestHooks,
  __setGoogleOAuthTestHooks,
  beginGoogleOAuth,
  exchangeGoogleAuthorizationCode,
  GOOGLE_OAUTH_COOKIE,
  isGoogleAuthConfigured,
  parseGoogleOAuthCookie,
  requireMatchingState,
  sanitizeReturnPath,
  serializeGoogleOAuthCookie,
  validateGoogleAuthConfiguration,
  verifyGoogleIdToken,
} from "../../server/auth/google-oauth";
import { resolveGoogleSignIn } from "../../server/auth/google-account";
import { createSession, hashToken, SESSION_COOKIE_NAME, verifySession } from "../../server/auth/session";
import { hashPassword } from "../../server/auth/password";
import {
  createEmptyMemoryStore,
  MemoryRepositories,
  newId,
  newPublicId,
  nowIso,
} from "../../server/database/repositories";
import { AppError } from "../../server/domain/types";
import { googleErrorMessage } from "@/components/auth/google-auth-button";
import { resetRuntimeForTests, setRuntimeForTests, type Runtime } from "../../server/bootstrap";
import { CSRF_COOKIE_NAME } from "../../server/http/csrf";
import { resetRateLimitsForTests } from "../../server/http/rate-limit";
import { resolvePostAuthDestination } from "../../server/auth/post-auth-destination";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });

async function publicJwk(key = publicKey, kid = "test-google-kid"): Promise<JWK> {
  const jwk = await exportJWK(key);
  return { ...jwk, alg: "RS256", use: "sig", kid };
}

type SignOverrides = {
  exp?: number;
  nbf?: number;
  iat?: number;
  audience?: string | string[];
  issuer?: string;
  alg?: string;
  signingKey?: KeyObject | Uint8Array;
  kid?: string;
};

/**
 * Sign a Google-like ID token. Does NOT inject a default `sub` —
 * omit `sub` from claims to produce a token without a subject.
 */
async function signIdToken(claims: Record<string, unknown>, overrides?: SignOverrides) {
  const headerAlg = overrides?.alg ?? "RS256";
  const key = overrides?.signingKey ?? privateKey;
  const jwk = headerAlg === "RS256" ? await publicJwk(publicKey, overrides?.kid ?? "test-google-kid") : null;
  const builder = new SignJWT({ ...claims })
    .setProtectedHeader(
      headerAlg === "RS256"
        ? { alg: "RS256", kid: jwk!.kid }
        : { alg: headerAlg },
    )
    .setIssuer(overrides?.issuer ?? "https://accounts.google.com")
    .setAudience(overrides?.audience ?? "test-google-client")
    .setIssuedAt(overrides?.iat ?? Math.floor(Date.now() / 1000));
  if (overrides?.nbf !== undefined) builder.setNotBefore(overrides.nbf);
  builder.setExpirationTime(overrides?.exp ?? Math.floor(Date.now() / 1000) + 600);
  return builder.sign(key);
}

function configureGoogleEnv(extra?: Record<string, string | undefined>) {
  process.env.GOOGLE_CLIENT_ID = "test-google-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
  process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/v1/auth/google/callback";
  process.env.APP_URL = "http://localhost:3000";
  process.env.APP_MODE = "demo";
  process.env.SESSION_SECRET = "candidarc-dev-session-secret-change-me!!";
  process.env.CSRF_SECRET = "candidarc-dev-csrf-secret-change-me!!!!";
  process.env.CANDIDARC_DATA_MODE = "memory";
  process.env.QUEUE_BACKEND = "inprocess";
  process.env.AI_MODE = "mock";
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  resetEnvCache();
}

function clearGoogleEnv() {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_REDIRECT_URI;
  resetEnvCache();
}

function collectSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

function cookieHeaderFromSetCookies(setCookies: string[]): string {
  return setCookies
    .map((item) => item.split(";")[0]!)
    .filter(Boolean)
    .join("; ");
}

function emptyAuthRuntime(): Runtime {
  const store = createEmptyMemoryStore();
  const repos = new MemoryRepositories(store);
  return {
    mode: "memory",
    repos,
    store,
    queue: {
      start: async () => undefined,
      stop: async () => undefined,
      enqueue: async () => "job",
      registerHandler: () => undefined,
      onExhaustedRetries: () => undefined,
    } as unknown as Runtime["queue"],
    engine: {} as Runtime["engine"],
    pipeline: {} as Runtime["pipeline"],
    services: {} as Runtime["services"],
  };
}

describe("Google OAuth security primitives", () => {
  beforeEach(async () => {
    configureGoogleEnv();
    const jwk = await publicJwk();
    __setGoogleOAuthTestHooks({
      jwks: createLocalJWKSet({ keys: [jwk] }),
    });
  });

  afterEach(() => {
    __resetGoogleOAuthTestHooks();
    clearGoogleEnv();
    resetRateLimitsForTests();
  });

  it("reports not configured without credentials", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    resetEnvCache();
    expect(isGoogleAuthConfigured()).toBe(false);
  });

  it("sanitizes return paths against open redirects", () => {
    expect(sanitizeReturnPath("/app")).toBe("/app");
    expect(sanitizeReturnPath("/onboarding")).toBe("/onboarding");
    expect(sanitizeReturnPath("https://evil.example")).toBe("/app");
    expect(sanitizeReturnPath("//evil.example")).toBe("/app");
    expect(sanitizeReturnPath("/\\evil")).toBe("/app");
    expect(sanitizeReturnPath("javascript:alert(1)")).toBe("/app");
  });

  it("rejects state mismatch and missing state", () => {
    const { txn } = beginGoogleOAuth("/app");
    try {
      requireMatchingState(txn, null);
      throw new Error("expected missing state to throw");
    } catch (err) {
      expect(err).toMatchObject({ code: "GOOGLE_STATE_MISSING" });
    }
    try {
      requireMatchingState(txn, "wrong");
      throw new Error("expected mismatch to throw");
    } catch (err) {
      expect(err).toMatchObject({ code: "GOOGLE_STATE_MISMATCH" });
    }
    expect(() => requireMatchingState(txn, txn.state)).not.toThrow();
  });

  it("rejects missing, expired, or tampered transaction cookies", () => {
    expect(parseGoogleOAuthCookie(null)).toBeNull();
    const { cookie, txn } = beginGoogleOAuth("/app");
    expect(parseGoogleOAuthCookie(cookie)).toBeTruthy();

    const sealed = cookie.split("=")[1]!;
    const decoded = decodeURIComponent(sealed);
    const [payload] = decoded.split(".");
    expect(parseGoogleOAuthCookie(`candidarc_google_oauth=${encodeURIComponent(`${payload}.tampered`)}`)).toBeNull();

    const expiredCookie = serializeGoogleOAuthCookie({ ...txn, exp: Date.now() - 1_000 });
    expect(parseGoogleOAuthCookie(expiredCookie)).toBeNull();
  });

  it("rejects invalid signature signed with a different key", async () => {
    const { txn } = beginGoogleOAuth("/app");
    const token = await signIdToken(
      { sub: "sub-1", email: "a@example.com", email_verified: true, nonce: txn.nonce },
      { signingKey: otherKeys.privateKey, kid: "other-kid" },
    );
    // JWKS only has the primary public key — signature must fail closed.
    await expect(verifyGoogleIdToken(token, txn.nonce)).rejects.toMatchObject({
      code: "GOOGLE_ID_TOKEN_INVALID",
    });
  });

  it("rejects unsupported signing algorithms", async () => {
    const { txn } = beginGoogleOAuth("/app");
    const secret = new TextEncoder().encode("not-an-rsa-hmac-secret-key!!");
    const token = await signIdToken(
      { sub: "sub-1", email: "a@example.com", email_verified: true, nonce: txn.nonce },
      { alg: "HS256", signingKey: secret },
    );
    await expect(verifyGoogleIdToken(token, txn.nonce)).rejects.toMatchObject({
      code: "GOOGLE_ID_TOKEN_INVALID",
    });
  });

  it("rejects wrong issuer", async () => {
    const { txn } = beginGoogleOAuth("/app");
    const token = await signIdToken(
      { sub: "sub-1", email: "a@example.com", email_verified: true, nonce: txn.nonce },
      { issuer: "https://evil.example" },
    );
    await expect(verifyGoogleIdToken(token, txn.nonce)).rejects.toMatchObject({
      code: "GOOGLE_ID_TOKEN_ISSUER",
    });
  });

  it("rejects wrong audience", async () => {
    const { txn } = beginGoogleOAuth("/app");
    const token = await signIdToken(
      { sub: "sub-1", email: "a@example.com", email_verified: true, nonce: txn.nonce },
      { audience: "someone-else" },
    );
    await expect(verifyGoogleIdToken(token, txn.nonce)).rejects.toMatchObject({
      code: "GOOGLE_ID_TOKEN_INVALID",
    });
  });

  it("rejects multiple audiences even when client id is included", async () => {
    const { txn } = beginGoogleOAuth("/app");
    const token = await signIdToken(
      { sub: "sub-1", email: "a@example.com", email_verified: true, nonce: txn.nonce, azp: "test-google-client" },
      { audience: ["test-google-client", "another-client"] },
    );
    await expect(verifyGoogleIdToken(token, txn.nonce)).rejects.toMatchObject({
      code: "GOOGLE_ID_TOKEN_INVALID",
    });
  });

  it("rejects multiple audiences without valid azp", async () => {
    const { txn } = beginGoogleOAuth("/app");
    const token = await signIdToken(
      { sub: "sub-1", email: "a@example.com", email_verified: true, nonce: txn.nonce },
      { audience: ["test-google-client", "another-client"] },
    );
    await expect(verifyGoogleIdToken(token, txn.nonce)).rejects.toMatchObject({
      code: "GOOGLE_ID_TOKEN_INVALID",
    });
  });

  it("rejects wrong azp when present", async () => {
    const { txn } = beginGoogleOAuth("/app");
    const token = await signIdToken({
      sub: "sub-1",
      email: "a@example.com",
      email_verified: true,
      nonce: txn.nonce,
      azp: "other-client",
    });
    await expect(verifyGoogleIdToken(token, txn.nonce)).rejects.toMatchObject({
      code: "GOOGLE_ID_TOKEN_INVALID",
    });
  });

  it("accepts a one-element audience array containing only the client id", async () => {
    const { txn } = beginGoogleOAuth("/app");
    const token = await signIdToken(
      { sub: "sub-1", email: "a@example.com", email_verified: true, nonce: txn.nonce },
      { audience: ["test-google-client"] },
    );
    await expect(verifyGoogleIdToken(token, txn.nonce)).resolves.toMatchObject({ sub: "sub-1" });
  });

  it("classifies expired tokens as GOOGLE_ID_TOKEN_EXPIRED via JOSE codes", async () => {
    const { txn } = beginGoogleOAuth("/app");
    const token = await signIdToken(
      { sub: "sub-1", email: "a@example.com", email_verified: true, nonce: txn.nonce },
      { exp: Math.floor(Date.now() / 1000) - 120, iat: Math.floor(Date.now() / 1000) - 600 },
    );
    await expect(verifyGoogleIdToken(token, txn.nonce)).rejects.toMatchObject({
      code: "GOOGLE_ID_TOKEN_EXPIRED",
    });
  });

  it("rejects not-yet-valid tokens", async () => {
    const { txn } = beginGoogleOAuth("/app");
    const now = Math.floor(Date.now() / 1000);
    const token = await signIdToken(
      { sub: "sub-1", email: "a@example.com", email_verified: true, nonce: txn.nonce },
      { nbf: now + 600, iat: now, exp: now + 1200 },
    );
    await expect(verifyGoogleIdToken(token, txn.nonce)).rejects.toMatchObject({
      code: "GOOGLE_ID_TOKEN_INVALID",
    });
  });

  it("rejects missing sub without injecting a default subject", async () => {
    const { txn } = beginGoogleOAuth("/app");
    const token = await signIdToken({
      email: "a@example.com",
      email_verified: true,
      nonce: txn.nonce,
    });
    // Decode payload to prove sub is absent
    const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    expect(payload.sub).toBeUndefined();
    await expect(verifyGoogleIdToken(token, txn.nonce)).rejects.toMatchObject({
      code: "GOOGLE_SUB_MISSING",
    });
  });

  it("rejects empty sub", async () => {
    const { txn } = beginGoogleOAuth("/app");
    const token = await signIdToken({
      sub: "",
      email: "a@example.com",
      email_verified: true,
      nonce: txn.nonce,
    });
    await expect(verifyGoogleIdToken(token, txn.nonce)).rejects.toMatchObject({
      code: "GOOGLE_SUB_MISSING",
    });
  });

  it("rejects missing email, unverified email, missing nonce, and wrong nonce", async () => {
    const { txn } = beginGoogleOAuth("/app");
    const missingEmail = await signIdToken({ sub: "sub-1", email_verified: true, nonce: txn.nonce });
    await expect(verifyGoogleIdToken(missingEmail, txn.nonce)).rejects.toMatchObject({
      code: "GOOGLE_EMAIL_MISSING",
    });

    const unverified = await signIdToken({
      sub: "sub-1",
      email: "a@example.com",
      email_verified: false,
      nonce: txn.nonce,
    });
    await expect(verifyGoogleIdToken(unverified, txn.nonce)).rejects.toMatchObject({
      code: "GOOGLE_EMAIL_UNVERIFIED",
    });

    const missingNonce = await signIdToken({
      sub: "sub-1",
      email: "a@example.com",
      email_verified: true,
    });
    await expect(verifyGoogleIdToken(missingNonce, txn.nonce)).rejects.toMatchObject({
      code: "GOOGLE_NONCE_MISMATCH",
    });

    const wrongNonce = await signIdToken({
      sub: "sub-1",
      email: "a@example.com",
      email_verified: true,
      nonce: "other-nonce",
    });
    await expect(verifyGoogleIdToken(wrongNonce, txn.nonce)).rejects.toMatchObject({
      code: "GOOGLE_NONCE_MISMATCH",
    });
  });

  it("times out token exchange and rejects malformed responses", async () => {
    __setGoogleOAuthTestHooks({
      fetch: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      },
    });
    await expect(
      exchangeGoogleAuthorizationCode({ code: "x", codeVerifier: "y" }),
    ).rejects.toMatchObject({ code: "GOOGLE_TOKEN_TIMEOUT" });

    __setGoogleOAuthTestHooks({
      fetch: async () =>
        new Response(JSON.stringify({ access_token: "no-id-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    await expect(
      exchangeGoogleAuthorizationCode({ code: "x", codeVerifier: "y" }),
    ).rejects.toMatchObject({ code: "GOOGLE_TOKEN_MALFORMED" });
  });

  it("refuses test hooks outside NODE_ENV=test", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => __setGoogleOAuthTestHooks({ fetch: fetch })).toThrow(/NODE_ENV=test/);
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
  });
});

describe("Google configuration validation", () => {
  afterEach(() => {
    clearGoogleEnv();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.APP_MODE;
    delete process.env.APP_URL;
    resetEnvCache();
  });

  it("allows completely disabled Google auth", () => {
    configureGoogleEnv({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, GOOGLE_REDIRECT_URI: undefined });
    expect(isGoogleAuthConfigured()).toBe(false);
    expect(() => validateGoogleAuthConfiguration()).toThrow(
      expect.objectContaining({ code: "GOOGLE_AUTH_NOT_CONFIGURED" }),
    );
  });

  it("rejects client id without secret", () => {
    configureGoogleEnv({ GOOGLE_CLIENT_SECRET: undefined });
    expect(() => validateGoogleAuthConfiguration()).toThrow(
      expect.objectContaining({ code: "GOOGLE_AUTH_MISCONFIGURED" }),
    );
  });

  it("rejects secret without client id", () => {
    configureGoogleEnv({ GOOGLE_CLIENT_ID: undefined });
    expect(() => validateGoogleAuthConfiguration()).toThrow(
      expect.objectContaining({ code: "GOOGLE_AUTH_MISCONFIGURED" }),
    );
  });

  it("rejects invalid callback URL", () => {
    configureGoogleEnv({ GOOGLE_REDIRECT_URI: "not-a-url" });
    // Zod may reject at getEnv — either path is fail-closed.
    expect(() => {
      try {
        validateGoogleAuthConfiguration();
      } catch (err) {
        if (err instanceof Error && /Invalid environment|GOOGLE_AUTH_MISCONFIGURED/.test(err.message)) throw err;
        if (err instanceof AppError) throw err;
        throw err;
      }
    }).toThrow();
  });

  it("rejects wrong callback path", () => {
    configureGoogleEnv({ GOOGLE_REDIRECT_URI: "http://localhost:3000/api/v1/auth/google/wrong" });
    expect(() => validateGoogleAuthConfiguration()).toThrow(
      expect.objectContaining({ code: "GOOGLE_AUTH_MISCONFIGURED" }),
    );
  });

  it("rejects production HTTP callback", () => {
    configureGoogleEnv({
      NODE_ENV: "production",
      APP_MODE: "production",
      APP_URL: "https://app.candidarc.example",
      GOOGLE_REDIRECT_URI: "http://app.candidarc.example/api/v1/auth/google/callback",
      SESSION_SECRET: "a-unique-production-secret-that-is-long-enough",
      CANDIDARC_DATA_MODE: "postgres",
      DATABASE_URL: "postgres://example",
      AI_MODE: "live",
      OPENAI_API_KEY: "key",
      ANTHROPIC_API_KEY: "key",
      STORAGE_DRIVER: "s3",
      QUEUE_BACKEND: "redis",
      MALWARE_SCANNER: "clamav",
      PYTHON_BACKEND_TOKEN: "production-python-backend-token-32chars",
    });
    expect(() => validateGoogleAuthConfiguration()).toThrow(
      expect.objectContaining({ code: "GOOGLE_AUTH_MISCONFIGURED" }),
    );
  });

  it("rejects production localhost callback", () => {
    configureGoogleEnv({
      NODE_ENV: "production",
      APP_MODE: "production",
      APP_URL: "https://app.candidarc.example",
      GOOGLE_REDIRECT_URI: "https://localhost/api/v1/auth/google/callback",
      SESSION_SECRET: "a-unique-production-secret-that-is-long-enough",
      CANDIDARC_DATA_MODE: "postgres",
      DATABASE_URL: "postgres://example",
      AI_MODE: "live",
      OPENAI_API_KEY: "key",
      ANTHROPIC_API_KEY: "key",
      STORAGE_DRIVER: "s3",
      QUEUE_BACKEND: "redis",
      MALWARE_SCANNER: "clamav",
      PYTHON_BACKEND_TOKEN: "production-python-backend-token-32chars",
    });
    expect(() => validateGoogleAuthConfiguration()).toThrow(
      expect.objectContaining({ code: "GOOGLE_AUTH_MISCONFIGURED" }),
    );
  });

  it("rejects callback origin different from APP_URL in production", () => {
    configureGoogleEnv({
      NODE_ENV: "production",
      APP_MODE: "production",
      APP_URL: "https://app.candidarc.example",
      GOOGLE_REDIRECT_URI: "https://evil.example/api/v1/auth/google/callback",
      SESSION_SECRET: "a-unique-production-secret-that-is-long-enough",
      CANDIDARC_DATA_MODE: "postgres",
      DATABASE_URL: "postgres://example",
      AI_MODE: "live",
      OPENAI_API_KEY: "key",
      ANTHROPIC_API_KEY: "key",
      STORAGE_DRIVER: "s3",
      QUEUE_BACKEND: "redis",
      MALWARE_SCANNER: "clamav",
      PYTHON_BACKEND_TOKEN: "production-python-backend-token-32chars",
    });
    expect(() => validateGoogleAuthConfiguration()).toThrow(
      expect.objectContaining({ code: "GOOGLE_AUTH_MISCONFIGURED" }),
    );
  });

  it("accepts valid localhost configuration", () => {
    configureGoogleEnv();
    expect(() => validateGoogleAuthConfiguration()).not.toThrow();
    expect(isGoogleAuthConfigured()).toBe(true);
  });

  it("accepts valid production HTTPS configuration", () => {
    configureGoogleEnv({
      NODE_ENV: "production",
      APP_MODE: "production",
      APP_URL: "https://app.candidarc.example",
      GOOGLE_REDIRECT_URI: "https://app.candidarc.example/api/v1/auth/google/callback",
      SESSION_SECRET: "a-unique-production-secret-that-is-long-enough",
      CANDIDARC_DATA_MODE: "postgres",
      DATABASE_URL: "postgres://example",
      AI_MODE: "live",
      OPENAI_API_KEY: "key",
      ANTHROPIC_API_KEY: "key",
      STORAGE_DRIVER: "s3",
      QUEUE_BACKEND: "redis",
      MALWARE_SCANNER: "clamav",
      PYTHON_BACKEND_TOKEN: "production-python-backend-token-32chars",
    });
    expect(() => validateGoogleAuthConfiguration()).not.toThrow();
  });
});

describe("Google account lifecycle (memory)", () => {
  beforeEach(() => {
    configureGoogleEnv();
  });

  afterEach(() => {
    clearGoogleEnv();
  });

  it("creates exactly one user, tenant, owner membership, and identity for a new Google account", async () => {
    const repos = new MemoryRepositories(createEmptyMemoryStore());
    const result = await resolveGoogleSignIn(repos, {
      sub: "google-sub-new",
      email: "fresh@example.com",
      emailVerified: true,
      name: "Fresh User",
    });
    expect(result.created).toBe(true);
    expect(result.user.passwordHash).toBeNull();
    expect(result.user.emailVerified).toBe(true);
    const identities = [...repos.store.authIdentities.values()];
    expect(identities).toHaveLength(1);
    expect(identities[0]!.providerSubject).toBe("google-sub-new");
    expect(repos.store.users.size).toBe(1);
    expect(repos.store.tenants.size).toBe(1);
    expect(repos.store.memberships).toHaveLength(1);
    expect(repos.store.memberships[0]!.role).toBe("owner");
  });

  it("signs an existing Google identity into the same user", async () => {
    const repos = new MemoryRepositories(createEmptyMemoryStore());
    const first = await resolveGoogleSignIn(repos, {
      sub: "google-sub-repeat",
      email: "repeat@example.com",
      emailVerified: true,
      name: "Repeat",
    });
    const second = await resolveGoogleSignIn(repos, {
      sub: "google-sub-repeat",
      email: "repeat@example.com",
      emailVerified: true,
      name: "Repeat",
    });
    expect(second.created).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    expect(repos.store.users.size).toBe(1);
    expect(repos.store.authIdentities.size).toBe(1);
  });

  it("fails with GOOGLE_ACCOUNT_LINK_REQUIRED for existing password accounts", async () => {
    const repos = new MemoryRepositories(createEmptyMemoryStore());
    await repos.users.create({
      publicId: newPublicId("usr"),
      email: "password@example.com",
      emailVerified: true,
      passwordHash: await hashPassword("Password!12345"),
      name: "Password User",
    });
    await expect(
      resolveGoogleSignIn(repos, {
        sub: "google-sub-link",
        email: "password@example.com",
        emailVerified: true,
        name: "Google User",
      }),
    ).rejects.toMatchObject({ code: "GOOGLE_ACCOUNT_LINK_REQUIRED" });
    expect(repos.store.authIdentities.size).toBe(0);
  });

  it("does not create sessions on failed account resolution", async () => {
    const repos = new MemoryRepositories(createEmptyMemoryStore());
    await repos.users.create({
      publicId: newPublicId("usr"),
      email: "taken@example.com",
      emailVerified: false,
      passwordHash: await hashPassword("Password!12345"),
      name: "Taken",
    });
    await expect(
      resolveGoogleSignIn(repos, {
        sub: "sub-x",
        email: "taken@example.com",
        emailVerified: true,
        name: "X",
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(repos.store.sessions.size).toBe(0);
  });

  it("creates a standard CandidArc session that verifySession accepts", async () => {
    const repos = new MemoryRepositories(createEmptyMemoryStore());
    const { user, tenant } = await resolveGoogleSignIn(repos, {
      sub: "google-sub-session",
      email: "session@example.com",
      emailVerified: true,
      name: "Session User",
    });
    const session = await createSession({ userId: user.id, tenantId: tenant.id, sessionId: randomUUID() });
    await repos.sessions.create({
      id: session.sessionId,
      userId: user.id,
      tokenHash: hashToken(session.token),
      expiresAt: session.expiresAt.toISOString(),
    });
    const verified = await verifySession(session.token);
    expect(verified?.sub).toBe(user.id);
    expect(session.cookie).toContain("candidarc_session=");
    expect(session.cookie).toContain("HttpOnly");
    expect(session.cookie).toContain("SameSite=Lax");
    await repos.sessions.revoke(session.sessionId);
    const row = await repos.sessions.findByTokenHash(hashToken(session.token));
    expect(row).toBeNull();
  });

  it("password login still rejects Google-only accounts without passwordHash", async () => {
    const repos = new MemoryRepositories(createEmptyMemoryStore());
    const { user } = await resolveGoogleSignIn(repos, {
      sub: "google-sub-nopw",
      email: "nopw@example.com",
      emailVerified: true,
      name: "No Password",
    });
    expect(user.passwordHash).toBeNull();
    expect(!user.passwordHash).toBe(true);
  });

  it("concurrent creates for the same Google sub converge on one identity", async () => {
    const repos = new MemoryRepositories(createEmptyMemoryStore());
    const claims = {
      sub: "google-sub-race",
      email: "race@example.com",
      emailVerified: true as const,
      name: "Race",
    };
    const results = await Promise.all([
      resolveGoogleSignIn(repos, claims),
      resolveGoogleSignIn(repos, claims),
      resolveGoogleSignIn(repos, claims),
    ]);
    const ids = new Set(results.map((item) => item.user.id));
    expect(ids.size).toBe(1);
    expect(repos.store.users.size).toBe(1);
    expect(repos.store.tenants.size).toBe(1);
    expect(repos.store.authIdentities.size).toBe(1);
  });

  it("replayed createUserWithGoogleIdentity does not duplicate when identity already exists", async () => {
    const repos = new MemoryRepositories(createEmptyMemoryStore());
    await repos.authIdentities.createUserWithGoogleIdentity({
      provider: "google",
      providerSubject: "sub-replay",
      email: "replay@example.com",
      name: "Replay",
    });
    await expect(
      repos.authIdentities.createUserWithGoogleIdentity({
        provider: "google",
        providerSubject: "sub-replay",
        email: "replay@example.com",
        name: "Replay",
      }),
    ).rejects.toMatchObject({ code: "AUTH_IDENTITY_CONFLICT" });
    expect(repos.store.users.size).toBe(1);
  });
});

describe("Google auth UI helpers", () => {
  it("maps callback error codes to safe messages", () => {
    expect(googleErrorMessage("GOOGLE_ACCOUNT_LINK_REQUIRED")).toMatch(/already exists/i);
    expect(googleErrorMessage("GOOGLE_AUTH_CANCELLED")).toMatch(/cancelled/i);
    expect(googleErrorMessage("GOOGLE_AUTH_NOT_CONFIGURED")).toMatch(/not available/i);
    expect(googleErrorMessage("GOOGLE_RATE_LIMITED")).toMatch(/too many/i);
    expect(googleErrorMessage("UNKNOWN_CODE")).toMatch(/failed/i);
  });
});

describe("Google OAuth PKCE challenge", () => {
  it("uses S256 challenge derived from verifier", () => {
    configureGoogleEnv();
    const { txn, authorizationUrl } = beginGoogleOAuth("/app");
    const challenge = createHash("sha256").update(txn.codeVerifier).digest("base64url");
    expect(authorizationUrl).toContain(`code_challenge=${challenge}`);
    expect(authorizationUrl).toContain("code_challenge_method=S256");
    expect(authorizationUrl).toContain("scope=openid+email+profile");
  });
});

describe("Google OAuth real route journey", () => {
  beforeEach(async () => {
    configureGoogleEnv();
    resetRateLimitsForTests();
    resetRuntimeForTests();
    setRuntimeForTests(emptyAuthRuntime());
    const jwk = await publicJwk();
    __setGoogleOAuthTestHooks({
      jwks: createLocalJWKSet({ keys: [jwk] }),
    });
  });

  afterEach(() => {
    __resetGoogleOAuthTestHooks();
    resetRuntimeForTests();
    setRuntimeForTests(null);
    clearGoogleEnv();
    resetRateLimitsForTests();
    vi.restoreAllMocks();
  });

  it("start → callback → me → logout through real route handlers", async () => {
    const { GET: startGet } = await import("../../src/app/api/v1/auth/google/start/route");
    const { GET: callbackGet } = await import("../../src/app/api/v1/auth/google/callback/route");
    const { GET: meGet } = await import("../../src/app/api/v1/auth/me/route");
    const { POST: logoutPost } = await import("../../src/app/api/v1/auth/logout/route");

    const startRes = await startGet(
      new Request("http://localhost:3000/api/v1/auth/google/start?next=/app", {
        headers: { "x-forwarded-for": "203.0.113.10" },
      }),
    );
    expect(startRes.status).toBe(302);
    expect(startRes.headers.get("cache-control")).toBe("no-store");
    const location = startRes.headers.get("location")!;
    expect(location).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    const authUrl = new URL(location);
    expect(authUrl.searchParams.get("scope")).toBe("openid email profile");
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authUrl.searchParams.get("code_challenge")).toBeTruthy();
    expect(authUrl.searchParams.get("state")).toBeTruthy();
    expect(authUrl.searchParams.get("nonce")).toBeTruthy();

    const startCookies = collectSetCookies(startRes);
    const oauthSet = startCookies.find((c) => c.startsWith(`${GOOGLE_OAUTH_COOKIE}=`))!;
    expect(oauthSet).toMatch(/HttpOnly/i);
    expect(oauthSet).toMatch(/SameSite=Lax/i);
    expect(oauthSet).toMatch(/Max-Age=600/i);
    expect(oauthSet).toMatch(/Path=\/api\/v1\/auth\/google/i);

    const txnCookieHeader = cookieHeaderFromSetCookies(startCookies);
    const txn = parseGoogleOAuthCookie(txnCookieHeader)!;
    expect(txn.state).toBe(authUrl.searchParams.get("state"));
    expect(txn.nonce).toBe(authUrl.searchParams.get("nonce"));

    const idToken = await signIdToken({
      sub: "route-journey-sub",
      email: "journey@example.com",
      email_verified: true,
      name: "Journey User",
      nonce: txn.nonce,
    });

    __setGoogleOAuthTestHooks({
      jwks: createLocalJWKSet({ keys: [await publicJwk()] }),
      fetch: async () =>
        new Response(JSON.stringify({ id_token: idToken, access_token: "should-not-persist", refresh_token: "nope" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    const callbackRes = await callbackGet(
      new Request(
        `http://localhost:3000/api/v1/auth/google/callback?code=auth-code-1&state=${encodeURIComponent(txn.state)}`,
        {
          headers: {
            cookie: txnCookieHeader,
            "x-forwarded-for": "203.0.113.10",
          },
        },
      ),
    );
    expect(callbackRes.status).toBe(302);
    expect(callbackRes.headers.get("location")).toBe("http://localhost:3000/onboarding");
    const callbackCookies = collectSetCookies(callbackRes);
    const clearedOAuth = callbackCookies.find((c) => c.startsWith(`${GOOGLE_OAUTH_COOKIE}=`))!;
    expect(clearedOAuth).toMatch(/Max-Age=0/i);
    const sessionSet = callbackCookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!;
    expect(sessionSet).toBeTruthy();
    const csrfSet = callbackCookies.find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`))!;
    expect(csrfSet).toBeTruthy();

    const { getRuntime } = await import("../../server/bootstrap");
    const live = await getRuntime();
    expect(live.store.users.size).toBe(1);
    expect(live.store.tenants.size).toBe(1);
    expect(live.store.memberships).toHaveLength(1);
    expect(live.store.memberships[0]!.role).toBe("owner");
    expect(live.store.authIdentities.size).toBe(1);
    const identity = [...live.store.authIdentities.values()][0]!;
    expect(identity.providerSubject).toBe("route-journey-sub");
    const serialized = JSON.stringify({
      users: [...live.store.users.values()],
      identities: [...live.store.authIdentities.values()],
      sessions: [...live.store.sessions.values()],
    });
    expect(serialized).not.toMatch(/should-not-persist|refresh_token|auth-code-1/);
    expect(serialized).not.toContain(idToken);

    const sessionCookie = cookieHeaderFromSetCookies([sessionSet]);
    const meRes = await meGet(
      new Request("http://localhost:3000/api/v1/auth/me", {
        headers: { cookie: sessionCookie },
      }),
    );
    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as {
      user: { email: string };
      tenant: { role: string };
    };
    expect(meBody.user.email).toBe("journey@example.com");
    expect(meBody.tenant.role).toBe("owner");

    const logoutRes = await logoutPost(
      new Request("http://localhost:3000/api/v1/auth/logout", {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );
    expect(logoutRes.status).toBe(200);

    const meAfter = await meGet(
      new Request("http://localhost:3000/api/v1/auth/me", {
        headers: { cookie: sessionCookie },
      }),
    );
    expect(meAfter.status).toBe(401);
  });

  it("start redirects Google-not-configured safely", async () => {
    clearGoogleEnv();
    configureGoogleEnv({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, GOOGLE_REDIRECT_URI: undefined });
    const { GET: startGet } = await import("../../src/app/api/v1/auth/google/start/route");
    const res = await startGet(new Request("http://localhost:3000/api/v1/auth/google/start"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("google_error=GOOGLE_AUTH_NOT_CONFIGURED");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(collectSetCookies(res).some((c) => c.includes("Max-Age=0"))).toBe(true);
  });

  it("start redirects rate-limit failures safely", async () => {
    process.env.RATE_LIMIT_PER_MINUTE = "1";
    resetEnvCache();
    resetRateLimitsForTests();
    const { GET: startGet } = await import("../../src/app/api/v1/auth/google/start/route");
    const req = () =>
      new Request("http://localhost:3000/api/v1/auth/google/start", {
        headers: { "x-forwarded-for": "198.51.100.9" },
      });
    expect((await startGet(req())).status).toBe(302);
    const limited = await startGet(req());
    expect(limited.status).toBe(302);
    expect(limited.headers.get("location")).toContain("google_error=GOOGLE_RATE_LIMITED");
    delete process.env.RATE_LIMIT_PER_MINUTE;
    resetEnvCache();
  });

  it("start maps unexpected internal failures to GOOGLE_AUTH_FAILED", async () => {
    const bootstrap = await import("../../server/bootstrap");
    vi.spyOn(bootstrap, "getRuntime").mockRejectedValue(new Error("boom-internal-secret"));
    const { GET: startGet } = await import("../../src/app/api/v1/auth/google/start/route");
    const res = await startGet(new Request("http://localhost:3000/api/v1/auth/google/start"));
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("google_error=GOOGLE_AUTH_FAILED");
    expect(loc).not.toContain("boom-internal-secret");
  });

  it("callback failure paths create no session", async () => {
    const { GET: startGet } = await import("../../src/app/api/v1/auth/google/start/route");
    const { GET: callbackGet } = await import("../../src/app/api/v1/auth/google/callback/route");

    const cancel = await callbackGet(
      new Request("http://localhost:3000/api/v1/auth/google/callback?error=access_denied"),
    );
    expect(cancel.headers.get("location")).toContain("GOOGLE_AUTH_CANCELLED");

    const startRes = await startGet(new Request("http://localhost:3000/api/v1/auth/google/start?next=/app"));
    const txnCookie = cookieHeaderFromSetCookies(collectSetCookies(startRes));
    const txn = parseGoogleOAuthCookie(txnCookie)!;

    const mismatch = await callbackGet(
      new Request(`http://localhost:3000/api/v1/auth/google/callback?code=c&state=wrong`, {
        headers: { cookie: txnCookie },
      }),
    );
    expect(mismatch.headers.get("location")).toContain("GOOGLE_STATE_MISMATCH");

    const missingTxn = await callbackGet(
      new Request(`http://localhost:3000/api/v1/auth/google/callback?code=c&state=${txn.state}`),
    );
    expect(missingTxn.headers.get("location")).toContain("GOOGLE_TXN_INVALID");

    const missingCode = await callbackGet(
      new Request(`http://localhost:3000/api/v1/auth/google/callback?state=${txn.state}`, {
        headers: { cookie: txnCookie },
      }),
    );
    expect(missingCode.headers.get("location")).toContain("GOOGLE_CODE_MISSING");

    __setGoogleOAuthTestHooks({
      jwks: createLocalJWKSet({ keys: [await publicJwk()] }),
      fetch: async () => {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      },
    });
    const timeout = await callbackGet(
      new Request(`http://localhost:3000/api/v1/auth/google/callback?code=c&state=${txn.state}`, {
        headers: { cookie: txnCookie },
      }),
    );
    expect(timeout.headers.get("location")).toContain("GOOGLE_TOKEN_TIMEOUT");

    const badToken = await signIdToken({
      sub: "bad",
      email: "bad@example.com",
      email_verified: true,
      nonce: "wrong",
    });
    __setGoogleOAuthTestHooks({
      jwks: createLocalJWKSet({ keys: [await publicJwk()] }),
      fetch: async () =>
        new Response(JSON.stringify({ id_token: badToken }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    const invalidId = await callbackGet(
      new Request(`http://localhost:3000/api/v1/auth/google/callback?code=c&state=${txn.state}`, {
        headers: { cookie: txnCookie },
      }),
    );
    expect(invalidId.headers.get("location")).toMatch(/GOOGLE_NONCE_MISMATCH|GOOGLE_ID_TOKEN_INVALID/);

    const live = await (await import("../../server/bootstrap")).getRuntime();
    await live.repos.users.create({
      publicId: newPublicId("usr"),
      email: "existing-pw@example.com",
      emailVerified: true,
      passwordHash: await hashPassword("Password!12345"),
      name: "Existing",
    });
    const conflictToken = await signIdToken({
      sub: "conflict-sub",
      email: "existing-pw@example.com",
      email_verified: true,
      nonce: txn.nonce,
      name: "G",
    });
    __setGoogleOAuthTestHooks({
      jwks: createLocalJWKSet({ keys: [await publicJwk()] }),
      fetch: async () =>
        new Response(JSON.stringify({ id_token: conflictToken }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    const conflict = await callbackGet(
      new Request(`http://localhost:3000/api/v1/auth/google/callback?code=c&state=${txn.state}`, {
        headers: { cookie: txnCookie },
      }),
    );
    expect(conflict.headers.get("location")).toContain("GOOGLE_ACCOUNT_LINK_REQUIRED");
    expect(live.store.sessions.size).toBe(0);
    expect(live.store.authIdentities.size).toBe(0);
  });
});

async function seedCandidateProfile(
  repos: MemoryRepositories,
  input: {
    userId: string;
    tenantId: string;
    onboardingStep: number;
    onboardingCompletedAt: string | null;
  },
) {
  return repos.candidateProfiles.upsert({
    id: newId("cp"),
    publicId: newPublicId("cp"),
    tenantId: input.tenantId,
    userId: input.userId,
    fullName: "Profile User",
    preferredName: null,
    email: "profile@example.com",
    phone: null,
    location: null,
    linkedIn: null,
    github: null,
    portfolio: null,
    headline: null,
    summary: null,
    experienceLevel: null,
    yearsExperience: null,
    targetRoleFamilies: [],
    preferredResumeLength: "one-page",
    careerGoal: null,
    avatarInitials: "PU",
    remoteOk: true,
    preferredLocations: [],
    workAuthorization: null,
    requiresSponsorship: null,
    targetCompanies: [],
    targetIndustries: [],
    jobTypes: [],
    workplaceModes: [],
    willingToRelocate: null,
    salaryPreference: null,
    seniority: null,
    onboardingStep: input.onboardingStep,
    onboardingCompletedAt: input.onboardingCompletedAt,
    modelImprovementOptIn: false,
    sourceResumeFilePublicId: null,
    resumeImportStatus: null,
    resumeImportExtraction: null,
  });
}

describe("Post-auth destination policy", () => {
  beforeEach(async () => {
    configureGoogleEnv();
    resetRateLimitsForTests();
    resetRuntimeForTests();
    setRuntimeForTests(emptyAuthRuntime());
    const jwk = await publicJwk();
    __setGoogleOAuthTestHooks({ jwks: createLocalJWKSet({ keys: [jwk] }) });
  });

  afterEach(() => {
    __resetGoogleOAuthTestHooks();
    resetRuntimeForTests();
    setRuntimeForTests(null);
    clearGoogleEnv();
    resetRateLimitsForTests();
  });

  async function runGoogleCallback(opts: {
    next?: string;
    sub: string;
    email: string;
  }): Promise<Response> {
    const { GET: startGet } = await import("../../src/app/api/v1/auth/google/start/route");
    const { GET: callbackGet } = await import("../../src/app/api/v1/auth/google/callback/route");
    const startUrl = opts.next
      ? `http://localhost:3000/api/v1/auth/google/start?next=${encodeURIComponent(opts.next)}`
      : "http://localhost:3000/api/v1/auth/google/start";
    const startRes = await startGet(new Request(startUrl));
    const txnCookie = cookieHeaderFromSetCookies(collectSetCookies(startRes));
    const txn = parseGoogleOAuthCookie(txnCookie)!;
    const idToken = await signIdToken({
      sub: opts.sub,
      email: opts.email,
      email_verified: true,
      name: "Dest User",
      nonce: txn.nonce,
    });
    __setGoogleOAuthTestHooks({
      jwks: createLocalJWKSet({ keys: [await publicJwk()] }),
      fetch: async () =>
        new Response(JSON.stringify({ id_token: idToken }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    return callbackGet(
      new Request(
        `http://localhost:3000/api/v1/auth/google/callback?code=c&state=${encodeURIComponent(txn.state)}`,
        { headers: { cookie: txnCookie } },
      ),
    );
  }

  it("sends new Google users to onboarding even when started with next=/app", async () => {
    const res = await runGoogleCallback({
      next: "/app",
      sub: "dest-new-from-signin",
      email: "dest-new-signin@example.com",
    });
    expect(res.headers.get("location")).toBe("http://localhost:3000/onboarding");
    expect(collectSetCookies(res).some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))).toBe(true);
  });

  it("sends new Google users started from sign-up style start to onboarding", async () => {
    const res = await runGoogleCallback({
      sub: "dest-new-from-signup",
      email: "dest-new-signup@example.com",
    });
    expect(res.headers.get("location")).toBe("http://localhost:3000/onboarding");
  });

  it("sends existing Google users with no profile to onboarding", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    await resolveGoogleSignIn(runtime.repos, {
      sub: "dest-no-profile",
      email: "dest-no-profile@example.com",
      emailVerified: true,
      name: "No Profile",
    });
    const res = await runGoogleCallback({
      next: "/app",
      sub: "dest-no-profile",
      email: "dest-no-profile@example.com",
    });
    expect(res.headers.get("location")).toBe("http://localhost:3000/onboarding");
  });

  it("sends incomplete Google users to onboarding and preserves saved step", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const { user, tenant } = await resolveGoogleSignIn(runtime.repos, {
      sub: "dest-incomplete",
      email: "dest-incomplete@example.com",
      emailVerified: true,
      name: "Incomplete",
    });
    await seedCandidateProfile(runtime.repos as MemoryRepositories, {
      userId: user.id,
      tenantId: tenant.id,
      onboardingStep: 2,
      onboardingCompletedAt: null,
    });
    const res = await runGoogleCallback({
      next: "/app",
      sub: "dest-incomplete",
      email: "dest-incomplete@example.com",
    });
    expect(res.headers.get("location")).toBe("http://localhost:3000/onboarding");
    const profile = await runtime.repos.candidateProfiles.getByUser(tenant.id, user.id);
    expect(profile?.onboardingStep).toBe(2);
    expect(profile?.onboardingCompletedAt).toBeNull();
  });

  it("sends completed Google users to /app by default", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const { user, tenant } = await resolveGoogleSignIn(runtime.repos, {
      sub: "dest-complete",
      email: "dest-complete@example.com",
      emailVerified: true,
      name: "Complete",
    });
    await seedCandidateProfile(runtime.repos as MemoryRepositories, {
      userId: user.id,
      tenantId: tenant.id,
      onboardingStep: 4,
      onboardingCompletedAt: nowIso(),
    });
    const res = await runGoogleCallback({
      sub: "dest-complete",
      email: "dest-complete@example.com",
    });
    expect(res.headers.get("location")).toBe("http://localhost:3000/app");
  });

  it("honors an approved local return path for completed users", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const { user, tenant } = await resolveGoogleSignIn(runtime.repos, {
      sub: "dest-return",
      email: "dest-return@example.com",
      emailVerified: true,
      name: "Return",
    });
    await seedCandidateProfile(runtime.repos as MemoryRepositories, {
      userId: user.id,
      tenantId: tenant.id,
      onboardingStep: 4,
      onboardingCompletedAt: nowIso(),
    });
    const res = await runGoogleCallback({
      next: "/app/settings/profile",
      sub: "dest-return",
      email: "dest-return@example.com",
    });
    expect(res.headers.get("location")).toBe("http://localhost:3000/app/settings/profile");
  });

  it("falls back to /app for unsafe return paths when onboarding is complete", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const { user, tenant } = await resolveGoogleSignIn(runtime.repos, {
      sub: "dest-unsafe",
      email: "dest-unsafe@example.com",
      emailVerified: true,
      name: "Unsafe",
    });
    await seedCandidateProfile(runtime.repos as MemoryRepositories, {
      userId: user.id,
      tenantId: tenant.id,
      onboardingStep: 4,
      onboardingCompletedAt: nowIso(),
    });
    const res = await runGoogleCallback({
      next: "https://evil.example",
      sub: "dest-unsafe",
      email: "dest-unsafe@example.com",
    });
    expect(res.headers.get("location")).toBe("http://localhost:3000/app");
  });

  it("keeps GOOGLE_ACCOUNT_LINK_REQUIRED without creating a session", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    await runtime.repos.users.create({
      publicId: newPublicId("usr"),
      email: "dest-link@example.com",
      emailVerified: true,
      passwordHash: await hashPassword("Password!12345"),
      name: "Password",
    });
    const beforeUsers = runtime.store.users.size;
    const res = await runGoogleCallback({
      next: "/app",
      sub: "dest-link-sub",
      email: "dest-link@example.com",
    });
    expect(res.headers.get("location")).toContain("GOOGLE_ACCOUNT_LINK_REQUIRED");
    expect(runtime.store.sessions.size).toBe(0);
    expect(runtime.store.authIdentities.size).toBe(0);
    expect(runtime.store.users.size).toBe(beforeUsers);
  });

  it("resolvePostAuthDestination ignores onboardingStep as completion proof", async () => {
    const repos = new MemoryRepositories(createEmptyMemoryStore());
    const { user, tenant } = await resolveGoogleSignIn(repos, {
      sub: "policy-step",
      email: "policy-step@example.com",
      emailVerified: true,
      name: "Step",
    });
    await seedCandidateProfile(repos, {
      userId: user.id,
      tenantId: tenant.id,
      onboardingStep: 99,
      onboardingCompletedAt: null,
    });
    await expect(
      resolvePostAuthDestination(repos, {
        userId: user.id,
        tenantId: tenant.id,
        preferredReturnPath: "/app",
      }),
    ).resolves.toMatchObject({ path: "/onboarding", reason: "onboarding_incomplete" });
  });
});

describe("Password login redirectTo", () => {
  beforeEach(() => {
    configureGoogleEnv();
    resetRateLimitsForTests();
    resetRuntimeForTests();
    setRuntimeForTests(emptyAuthRuntime());
  });

  afterEach(() => {
    resetRuntimeForTests();
    setRuntimeForTests(null);
    clearGoogleEnv();
    resetRateLimitsForTests();
  });

  async function createPasswordUser(opts: {
    email: string;
    onboardingCompletedAt: string | null;
    onboardingStep?: number;
  }) {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const user = await runtime.repos.users.create({
      publicId: newPublicId("usr"),
      email: opts.email,
      emailVerified: true,
      passwordHash: await hashPassword("Password!12345"),
      name: "Password User",
    });
    const tenant = await runtime.repos.users.createTenant({
      publicId: newPublicId("ten"),
      name: "Workspace",
      plan: "free",
    });
    await runtime.repos.users.createMembership({
      tenantId: tenant.id,
      userId: user.id,
      role: "owner",
    });
    await seedCandidateProfile(runtime.repos as MemoryRepositories, {
      userId: user.id,
      tenantId: tenant.id,
      onboardingStep: opts.onboardingStep ?? 1,
      onboardingCompletedAt: opts.onboardingCompletedAt,
    });
    return runtime;
  }

  it("returns /onboarding for incomplete password users", async () => {
    await createPasswordUser({
      email: "pw-incomplete@example.com",
      onboardingCompletedAt: null,
      onboardingStep: 2,
    });
    const { POST: loginPost } = await import("../../src/app/api/v1/auth/login/route");
    const res = await loginPost(
      new Request("http://localhost:3000/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "pw-incomplete@example.com", password: "Password!12345" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { redirectTo: string };
    expect(body.redirectTo).toBe("/onboarding");
  });

  it("returns /app for completed password users", async () => {
    await createPasswordUser({
      email: "pw-complete@example.com",
      onboardingCompletedAt: nowIso(),
      onboardingStep: 4,
    });
    const { POST: loginPost } = await import("../../src/app/api/v1/auth/login/route");
    const res = await loginPost(
      new Request("http://localhost:3000/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "pw-complete@example.com", password: "Password!12345" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { redirectTo: string };
    expect(body.redirectTo).toBe("/app/radar");
  });
});
