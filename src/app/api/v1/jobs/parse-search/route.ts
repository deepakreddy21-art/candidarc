/**
 * POST /api/v1/jobs/parse-search
 * Parse natural language search query into structured filters.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { requireUser } from "@server/auth/guards";
import { jsonOk, jsonError } from "@server/http/response";
import { z } from "zod";

const bodySchema = z.object({
  query: z.string().min(1).max(500),
});

export async function POST(req: Request) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(req);
    requestId = ctx.requestId;
    requireUser(ctx);
    const { services } = await getRuntime();
    const body = await req.json();
    const { query } = bodySchema.parse(body);

    const result = await services.radar.parseNaturalLanguageSearch(ctx, query);

    return jsonOk(result);
  } catch (error) {
    return jsonError(error, requestId || undefined);
  }
}
