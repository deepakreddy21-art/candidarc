import { getEnv } from "../config/env";
import { ConfiguredSearchAdapter, DemoResearchSourceAdapter, UrlFetchResearchAdapter, researchQueries,
  type ResearchCollectContext, type ResearchSourceRecord } from "./sources";
import { researchCacheKey } from "./team-context";

export type ResearchCollection = {
  key: string; collectedAt: string; cached: boolean;
  status: "available" | "limited" | "unavailable" | "demo";
  notice: string;
  sources: ResearchSourceRecord[];
};

/** Optional bounded acceleration. Durable per-workflow snapshots live in application metadata. */
export class TeamResearchCollector {
  private readonly cache = new Map<string, { expiresAt: number; value: ResearchCollection }>();
  private readonly pending = new Map<string, Promise<ResearchCollection>>();

  async collect(context: ResearchCollectContext, tenantId: string, userId: string): Promise<ResearchCollection> {
    const env = getEnv();
    const key = researchCacheKey(context);
    const scopedKey = JSON.stringify([tenantId, userId, env.AI_MODE, Boolean(env.BRAVE_SEARCH_API_KEY), key]);
    const hit = this.cache.get(scopedKey);
    if (hit && hit.expiresAt > Date.now()) return structuredClone({ ...hit.value, cached: true });
    this.cache.delete(scopedKey);
    const pending = this.pending.get(scopedKey);
    if (pending) return structuredClone(await pending);
    const work = this.retrieve(context, key).then((value) => {
      // Do not cache missing credentials or upstream failures as successful research.
      if (value.status === "available") {
        if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(scopedKey, { expiresAt: Date.now() + 15 * 60_000, value: structuredClone(value) });
      }
      return value;
    }).finally(() => this.pending.delete(scopedKey));
    this.pending.set(scopedKey, work);
    return structuredClone(await work);
  }

  private async retrieve(context: ResearchCollectContext, key: string): Promise<ResearchCollection> {
    const collectedAt = new Date().toISOString();
    if (getEnv().AI_MODE === "mock") return { key, collectedAt, cached: false, status: "demo",
      notice: "Demo mode uses supplied job details; no live company research was performed.",
      sources: await new DemoResearchSourceAdapter().collect(context) };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    // A shared limiter covers direct URLs and all search result pages.
    let active = 0;
    const waiting: Array<() => void> = [];
    const fetchPage = async <T>(work: () => Promise<T>): Promise<T> => {
      if (active >= 3) await new Promise<void>(resolve => waiting.push(resolve));
      else active += 1;
      try { controller.signal.throwIfAborted(); return await work(); }
      finally { const next = waiting.shift(); if (next) next(); else active -= 1; }
    };
    const input = { ...context, signal: controller.signal, fetchPage };
    const batches: ResearchSourceRecord[][] = [];
    let failures = 0;
    const searchEnabled = Boolean(getEnv().BRAVE_SEARCH_API_KEY);
    const tasks = [new UrlFetchResearchAdapter().collect(input),
      ...(searchEnabled ? researchQueries(input).map(async (query, index) => {
        // Space search requests; result pages still fetch concurrently with bounded limits.
        await new Promise((resolve) => setTimeout(resolve, index * 1_100));
        controller.signal.throwIfAborted();
        return new ConfiguredSearchAdapter().search(input, query, 3);
      }) : [])];
    const all = Promise.all(tasks.map(async (task) => {
      try { const batch = await task; if (!controller.signal.aborted) batches.push(batch); }
      catch { failures += 1; }
    }));
    try {
      await Promise.race([all, new Promise<void>((resolve) => controller.signal.addEventListener("abort", () => resolve(), { once: true }))]);
    } finally { clearTimeout(timer); }
    const unique = new Map<string, ResearchSourceRecord>();
    for (const source of batches.flat()) {
      if (!source.excerpt.trim()) continue;
      const url = new URL(source.url);
      url.hash = "";
      for (const param of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(param)) url.searchParams.delete(param);
      if (!unique.has(url.toString())) unique.set(url.toString(), source);
    }
    const sources = [...unique.values()].sort((a, b) => Number(a.type === "public-reference") - Number(b.type === "public-reference") || a.url.localeCompare(b.url)).slice(0, 8);
    const external = sources.some((source) => source.type === "public-reference");
    const status = external && !failures && !controller.signal.aborted ? "available" : sources.length ? "limited" : "unavailable";
    const notice = !searchEnabled ? "Company search is not configured. Tailoring uses the job details and your career profile."
      : !external ? "No usable company or team references were retrieved. Tailoring uses the job details and your career profile."
      : status === "limited" ? "Some research could not be retrieved. Only the available sources will inform tailoring."
      : "Public sources retrieved. Team-specific findings are distinguished from company-wide context.";
    return { key, collectedAt, cached: false, status, notice, sources };
  }
}

export const teamResearchCollector = new TeamResearchCollector();
