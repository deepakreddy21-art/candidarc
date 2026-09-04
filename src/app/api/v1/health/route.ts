import { getEnv } from "@server/config/env";
import { jsonOk } from "@server/http/response";

export async function GET() {
  const env = getEnv();
  return jsonOk({ ok: true, mode: env.CANDIDARC_DATA_MODE });
}
