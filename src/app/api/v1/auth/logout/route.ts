import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError } from "@server/http/response";
import { parseSessionCookie, revokeSession, hashToken } from "@server/auth/session";
import { getRuntime } from "@server/bootstrap";
import { verifySession } from "@server/auth/session";

export async function POST(request: Request) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    const runtime = await getRuntime();
    const token = parseSessionCookie(request.headers.get("cookie"));
    const session = await verifySession(token);
    if (session) {
      const record = await runtime.repos.sessions.findByTokenHash(hashToken(session.token));
      if (record) await runtime.repos.sessions.revoke(record.id);
    }
    const { cookie } = revokeSession();
    const response = jsonOk({ ok: true });
    response.headers.set("Set-Cookie", cookie);
    return response;
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
