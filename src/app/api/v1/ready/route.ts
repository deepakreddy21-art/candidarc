import { getRuntime } from "@server/bootstrap";
import { jsonOk, jsonError } from "@server/http/response";
import { createRequestId } from "@server/observability/logger";

export async function GET() {
  const requestId = createRequestId();
  try {
    const runtime = await getRuntime();
    const apps = [...runtime.store.applications.values()].filter((a) => !a.deletedAt);
    return jsonOk({
      ok: true,
      mode: runtime.mode,
      applications: apps.length,
      ready: true,
    });
  } catch (err) {
    return jsonError(err, requestId);
  }
}
