import { getEnv } from "../config/env";
import { contentHash, ResumeWorkStore } from "../database/resume-work-store";
import type { Repositories } from "../database/repositories";
import { AppError } from "../domain/types";
import { teamResearchCollector, type ResearchCollection } from "./team-collector";
import { researchCacheKey } from "./team-context";
import type { ResearchCollectContext } from "./sources";

/** Owner-scoped public sources; no candidate facts or strategy are part of this cache. */
export async function collectDurably(repos: Pick<Repositories, "store" | "usage">, tenant: string, owner: string, context: ResearchCollectContext) {
  const store = new ResumeWorkStore(repos, tenant, owner);
  const key = contentHash({ scope: researchCacheKey(context), mode: getEnv().AI_MODE,
    configured: Boolean(getEnv().BRAVE_SEARCH_API_KEY), version: 1, freshness: Math.floor(Date.now() / 900_000) });
  const row = await store.put("research", key, { createdAt: new Date().toISOString() });
  if (row.data.collection) return { key, collection: { ...(row.data.collection as ResearchCollection), cached: true } };
  const token = await store.claim("research", key, 30_000);
  if (!token) throw new AppError("RESEARCH_IN_PROGRESS", "Public research is already being collected", 409, undefined, true);
  try {
    const current = (await store.get("research", key))!;
    if (current.data.collection) return { key, collection: { ...(current.data.collection as ResearchCollection), cached: true } };
    if (current.data.attempted) return { key, collection: { key, collectedAt: String(current.data.createdAt), cached: true,
      status: "unavailable" as const, sources: [], notice: "An earlier research attempt was interrupted. Tailoring uses the supplied job details; no repeated paid search was sent." } };
    await store.patch("research", key, { attempted: true }, token);
    const collection = await teamResearchCollector.collect({ ...context, onSearch: async (query) => {
      await repos.usage.append({ tenantId: tenant, userId: owner, kind: "search_request", units: "1", costCents: "0",
        status: "committed", idempotencyKey: `research:${key}:${contentHash(query)}`, metadata: {
          provider: "brave", dispatchReserved: true, outcomeMayBeUnknown: true, billable: false,
          costMeasured: false, estimatedCostCents: 0.5, pricingCheckedAt: "2026-09-20" } });
    } }, tenant, owner);
    await store.patch("research", key, { collection }, token);
    return { key, collection };
  } finally { await store.release("research", key, token); }
}
