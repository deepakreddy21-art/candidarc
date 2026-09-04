import { createHash, createSecretKey, randomUUID } from "crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { getEnv } from "../config/env";
import { logger } from "../observability/logger";

export const SESSION_COOKIE_NAME = "candidarc_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

export type SessionClaims = {
  sub: string; // user public id or internal id
  sid: string; // session id
  tid?: string; // active tenant public/internal id
};

export type VerifiedSession = SessionClaims & {
  token: string;
  expiresAt: Date;
};

function secretKey() {
  return createSecretKey(Buffer.from(getEnv().SESSION_SECRET));
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(input: {
  userId: string;
  sessionId?: string;
  tenantId?: string;
  ttlSeconds?: number;
}): Promise<{ token: string; sessionId: string; expiresAt: Date; cookie: string }> {
  const sessionId = input.sessionId ?? `ses_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const ttl = input.ttlSeconds ?? SESSION_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttl * 1000);

  const token = await new SignJWT({
    sid: sessionId,
    tid: input.tenantId,
  } satisfies Omit<SessionClaims, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .setJti(randomUUID())
    .sign(secretKey());

  return {
    token,
    sessionId,
    expiresAt,
    cookie: serializeSessionCookie(token, expiresAt),
  };
}

export async function verifySession(token: string | undefined | null): Promise<VerifiedSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const claims = normalizeClaims(payload);
    if (!claims) return null;
    const exp = payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
    return { ...claims, token, expiresAt: exp };
  } catch (err) {
    logger.debug({ err }, "session verification failed");
    return null;
  }
}

export function revokeSession(): { cookie: string } {
  return { cookie: serializeSessionCookie("", new Date(0)) };
}

export function parseSessionCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq);
    if (name === SESSION_COOKIE_NAME) {
      return decodeURIComponent(part.slice(eq + 1));
    }
  }
  return null;
}

export function serializeSessionCookie(token: string, expiresAt: Date): string {
  const env = getEnv();
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  if (!token) {
    return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  }
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function normalizeClaims(payload: JWTPayload): SessionClaims | null {
  if (typeof payload.sub !== "string" || !payload.sub) return null;
  const sid = typeof payload.sid === "string" ? payload.sid : null;
  if (!sid) return null;
  return {
    sub: payload.sub,
    sid,
    tid: typeof payload.tid === "string" ? payload.tid : undefined,
  };
}
