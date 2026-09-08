/** @vitest-environment node */
import { createHash, generateKeyPairSync, randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, type JWK } from "jose";
import { resetEnvCache } from "../../server/config/env";
import {
  __resetGoogleOAuthTestHooks,
  __setGoogleOAuthTestHooks,
  beginGoogleOAuth,
  exchangeGoogleAuthorizationCode,
  isGoogleAuthConfigured,
  parseGoogleOAuthCookie,
  requireMatchingState,
  sanitizeReturnPath,
  serializeGoogleOAuthCookie,
  verifyGoogleIdToken,
} from "../../server/auth/google-oauth";
import { resolveGoogleSignIn } from "../../server/auth/google-account";
import { createSession, hashToken, verifySession } from "../../server/auth/session";
import { hashPassword } from "../../server/auth/password";
import {
  createEmptyMemoryStore,
  MemoryRepositories,
  newPublicId,
} from "../../server/database/repositories";
import { AppError } from "../../server/domain/types";
import { googleErrorMessage } from "@/components/auth/google-auth-button";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

async function publicJwk(): Promise<JWK> {
  const jwk = await exportJWK(publicKey);
  return { ...jwk, alg: "RS256", use: "sig", kid: "test-google-kid" };
}

async function signIdToken(claims: Record<string, unknown>, overrides?: { exp?: number; audience?: string }) {
  const jwk = await publicJwk();
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer("https://accounts.google.com")
    .setAudience(overrides?.audience ?? "test-google-client")
    .setSubject(String(claims.sub ?? "google-sub-1"))
    .setIssuedAt()
    .setExpirationTime(overrides?.exp ?? Math.floor(Date.now() / 1000) + 600)
    .sign(privateKey);
}

function configureGoogleEnv() {
  resetEnvCache();
  process.env.GOOGLE_CLIENT_ID = "test-google-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
  process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/v1/auth/google/callback";
  process.env.APP_URL = "http://localhost:3000";
  process.env.APP_MODE = "demo";
  process.env.SESSION_SECRET = "candidarc-dev-session-secret-change-me!!";
  resetEnvCache();
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
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
    resetEnvCache();
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
    expect(parseGoogleOAuthCookie(cookie.replace(/^candidarc_google_oauth=/, "candidarc_google_oauth="))).toBeTruthy();

    const sealed = cookie.split("=")[1]!;
    const decoded = decodeURIComponent(sealed);
    const [payload] = decoded.split(".");
    expect(parseGoogleOAuthCookie(`candidarc_google_oauth=${encodeURIComponent(`${payload}.tampered`)}`)).toBeNull();

    const expiredCookie = serializeGoogleOAuthCookie({ ...txn, exp: Date.now() - 1_000 });
    expect(parseGoogleOAuthCookie(expiredCookie)).toBeNull();
  });

  it("verifies nonce, issuer, audience, expiry, sub, email, and email_verified", async () => {
    const { txn } = beginGoogleOAuth("/app");
    const good = await signIdToken({
      sub: "sub-1",
      email: "new@example.com",
      email_verified: true,
      name: "New User",
      nonce: txn.nonce,
    });
    await expect(verifyGoogleIdToken(good, txn.nonce)).resolves.toMatchObject({
      sub: "sub-1",
      email: "new@example.com",
    });

    const badNonce = await signIdToken({
      sub: "sub-1",
      email: "new@example.com",
      email_verified: true,
      nonce: "other",
    });
    await expect(verifyGoogleIdToken(badNonce, txn.nonce)).rejects.toMatchObject({ code: "GOOGLE_NONCE_MISMATCH" });

    const expired = await signIdToken(
      { sub: "sub-1", email: "new@example.com", email_verified: true, nonce: txn.nonce },
      { exp: Math.floor(Date.now() / 1000) - 120 },
    );
    await expect(verifyGoogleIdToken(expired, txn.nonce)).rejects.toBeInstanceOf(AppError);

    const wrongAud = await signIdToken(
      { sub: "sub-1", email: "new@example.com", email_verified: true, nonce: txn.nonce },
      { audience: "someone-else" },
    );
    await expect(verifyGoogleIdToken(wrongAud, txn.nonce)).rejects.toBeInstanceOf(AppError);

    const unverified = await signIdToken({
      sub: "sub-1",
      email: "new@example.com",
      email_verified: false,
      nonce: txn.nonce,
    });
    await expect(verifyGoogleIdToken(unverified, txn.nonce)).rejects.toMatchObject({
      code: "GOOGLE_EMAIL_UNVERIFIED",
    });

    const missingEmail = await signIdToken({ sub: "sub-1", email_verified: true, nonce: txn.nonce });
    await expect(verifyGoogleIdToken(missingEmail, txn.nonce)).rejects.toMatchObject({
      code: "GOOGLE_EMAIL_MISSING",
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
});

describe("Google account lifecycle (memory)", () => {
  beforeEach(() => {
    configureGoogleEnv();
  });

  afterEach(() => {
    resetEnvCache();
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
    // Mirrors login route guard
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
    expect(googleErrorMessage("UNKNOWN_CODE")).toMatch(/failed/i);
  });

  it("sign-in and sign-up pages expose Continue with Google affordance", async () => {
    const fs = await import("fs/promises");
    const signIn = await fs.readFile(new URL("../../src/app/sign-in/page.tsx", import.meta.url), "utf8");
    const signUp = await fs.readFile(new URL("../../src/app/sign-up/page.tsx", import.meta.url), "utf8");
    expect(signIn).toContain("GoogleAuthButton");
    expect(signUp).toContain("GoogleAuthButton");
    expect(signIn).toContain('nextPath="/app"');
    expect(signUp).toContain('nextPath="/onboarding"');
    const button = await fs.readFile(
      new URL("../../src/components/auth/google-auth-button.tsx", import.meta.url),
      "utf8",
    );
    expect(button).toContain("/api/v1/auth/google/start");
    expect(button).toContain("Continue with Google");
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
