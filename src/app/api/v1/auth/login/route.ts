import { z } from "zod";
import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError, parseJsonBody } from "@server/http/response";
import { verifyPassword } from "@server/auth/password";
import { createSession, hashToken, parseSessionCookie, verifySession } from "@server/auth/session";
import { AppError } from "@server/domain/types";
import { ensureCsrfCookie } from "@server/http/csrf";
import { assertRateLimit } from "@server/http/rate-limit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  let requestId = "";
  try {
    await assertRateLimit(request, "auth:login");
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    const body = await parseJsonBody(request, loginSchema);
    const runtime = await getRuntime();

    const user = await runtime.repos.users.findByEmail(body.email);
    if (!user || !user.passwordHash) {
      throw new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);
    }
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) {
      throw new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);
    }

    const memberships = await runtime.repos.users.listMemberships(user.id);
    const tenantId = memberships[0]?.tenantId;

    const previous = await verifySession(parseSessionCookie(request.headers.get("cookie")));
    if (previous) await runtime.repos.sessions.revoke(previous.sid);

    const { token, sessionId, expiresAt, cookie } = await createSession({
      userId: user.id,
      tenantId,
    });

    await runtime.repos.sessions.create({
      id: sessionId,
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: expiresAt.toISOString(),
    });

    const response = jsonOk({
      user: {
        id: user.publicId,
        email: user.email,
        name: user.name,
      },
      tenantId: memberships[0]?.tenant.publicId ?? null,
    });
    response.headers.append("Set-Cookie", cookie);
    ensureCsrfCookie(response);
    return response;
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
