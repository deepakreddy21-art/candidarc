import { z } from "zod";
import { getRuntime } from "@server/bootstrap";
import { createSession, hashToken } from "@server/auth/session";
import { hashPassword } from "@server/auth/password";
import { ensureCsrfCookie } from "@server/http/csrf";
import { assertRateLimit } from "@server/http/rate-limit";
import { jsonError, jsonOk, parseJsonBody } from "@server/http/response";
import { AppError } from "@server/domain/types";
import { newId } from "@server/database/repositories";

const schema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(10),
  name: z.string().trim().min(1).max(120),
});

export async function POST(request: Request) {
  try {
    await assertRateLimit(request, "auth:signup");
    const body = await parseJsonBody(request, schema);
    const runtime = await getRuntime();
    if (await runtime.repos.users.findByEmail(body.email)) {
      throw new AppError("EMAIL_IN_USE", "An account with this email already exists", 409);
    }

    const user = await runtime.repos.users.create({
      publicId: newId("usrp"),
      email: body.email,
      emailVerified: false,
      passwordHash: await hashPassword(body.password),
      name: body.name,
    });
    const tenant = await runtime.repos.users.createTenant({
      publicId: newId("tenp"),
      name: `${body.name}'s workspace`,
      plan: "free",
    });
    await runtime.repos.users.createMembership({ tenantId: tenant.id, userId: user.id, role: "owner" });

    const session = await createSession({ userId: user.id, tenantId: tenant.id });
    await runtime.repos.sessions.create({
      id: session.sessionId,
      userId: user.id,
      tokenHash: hashToken(session.token),
      expiresAt: session.expiresAt.toISOString(),
    });
    const response = jsonOk({ user: { id: user.publicId, email: user.email, name: user.name }, tenantId: tenant.publicId }, { status: 201 });
    response.headers.append("Set-Cookie", session.cookie);
    ensureCsrfCookie(response);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
