import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getEnv } from "../config/env";
import { AppError } from "../domain/types";

export const CSRF_COOKIE_NAME = "candidarc_csrf";
const MUTATIONS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const EXEMPT = [
  "/api/v1/auth/login",
  "/api/v1/auth/signup",
  "/api/v1/auth/logout",
  "/api/v1/health",
  "/api/v1/ready",
];

function sign(value: string): string {
  return createHmac("sha256", getEnv().CSRF_SECRET).update(value).digest("base64url");
}

function parseCookie(header: string | null, name: string): string | null {
  const item = header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

function valid(token: string): boolean {
  const [nonce, signature] = token.split(".");
  if (!nonce || !signature) return false;
  const expected = sign(nonce);
  return signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function ensureCsrfCookie(response: Response, request?: Request): string {
  const existing = request ? parseCookie(request.headers.get("cookie"), CSRF_COOKIE_NAME) : null;
  const token = existing && valid(existing)
    ? existing
    : (() => {
        const nonce = randomBytes(24).toString("base64url");
        return `${nonce}.${sign(nonce)}`;
      })();
  const secure = getEnv().NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=1209600${secure}`,
  );
  return token;
}

export function assertCsrf(request: Request): void {
  const path = new URL(request.url).pathname;
  if (!MUTATIONS.has(request.method.toUpperCase()) || EXEMPT.some((item) => path.startsWith(item))) return;
  const cookie = parseCookie(request.headers.get("cookie"), CSRF_COOKIE_NAME);
  const header = request.headers.get("x-csrf-token");
  if (!cookie || !header || cookie !== header || !valid(cookie)) {
    throw new AppError("CSRF_INVALID", "Invalid or missing CSRF token", 403);
  }
}

export async function withMutationGuards<T>(request: Request, handler: () => Promise<T>): Promise<T> {
  assertCsrf(request);
  return handler();
}
