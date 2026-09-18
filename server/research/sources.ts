import { createHash } from "crypto";
import { logger } from "../observability/logger";
import { getEnv } from "../config/env";
import { htmlToPlainText, ssrfFetch } from "../security/ssrf-fetch";

export type ResearchSourceRecord = {
  url: string;
  title: string;
  accessedAt: string;
  type: string;
  excerpt: string;
  confidence: "high" | "medium" | "low";
};

export type ResearchCollectContext = {
  company: string;
  role: string;
  jobUrl?: string;
  jobDescription?: string;
  researchDepth?: string;
};

export interface ResearchSourceAdapter {
  readonly name: string;
  collect(context: ResearchCollectContext): Promise<ResearchSourceRecord[]>;
}

const ALLOWED_BOARD_HOST = /(?:^|\.)(?:greenhouse\.io|lever\.co|ashbyhq\.com)$/i;
const MAX_EXCERPT = 12_000;

function sourceId(url: string): string {
  return `src-${createHash("sha256").update(url).digest("hex").slice(0, 12)}`;
}

function depthLimits(researchDepth?: string): { maxSources: number; includeSearch: boolean } {
  switch (researchDepth) {
    case "deep-team":
      return { maxSources: 8, includeSearch: true };
    case "priority":
      return { maxSources: 6, includeSearch: true };
    default:
      return { maxSources: 3, includeSearch: false };
  }
}

function extractBoardUrls(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)]
    .map((match) => match[0].replace(/[.,;:!?]+$/, ""))
    .filter((raw) => {
      try {
        const url = new URL(raw);
        return ["http:", "https:"].includes(url.protocol) && ALLOWED_BOARD_HOST.test(url.hostname);
      } catch {
        return false;
      }
    });
}

export class DemoResearchSourceAdapter implements ResearchSourceAdapter {
  readonly name = "demo-fixtures";

  async collect(context: ResearchCollectContext): Promise<ResearchSourceRecord[]> {
    const accessedAt = new Date().toISOString();
    const excerpt = (context.jobDescription ?? "").slice(0, MAX_EXCERPT);
    const sources: ResearchSourceRecord[] = [];
    if (context.jobUrl) {
      sources.push({
        url: context.jobUrl,
        title: `${context.company} — ${context.role} job posting`,
        accessedAt,
        type: "job-posting",
        excerpt: excerpt || "Demo fixture job description supplied by the application.",
        confidence: "high",
      });
    }
    if (excerpt) {
      sources.push({
        // https URL required by Python ResearchSource HttpUrl schema (no fixture://)
        url: `https://fixtures.candidarc.local/job-description/${sourceId(context.company + context.role)}`,
        title: `${context.company} role requirements (provided text)`,
        accessedAt,
        type: "job-description",
        excerpt,
        confidence: "high",
      });
    }
    return sources.slice(0, depthLimits(context.researchDepth).maxSources);
  }
}

export class ConfiguredSearchAdapter implements ResearchSourceAdapter {
  readonly name = "configured-search";

  async collect(context: ResearchCollectContext): Promise<ResearchSourceRecord[]> {
    const limits = depthLimits(context.researchDepth);
    const apiKey = getEnv().BRAVE_SEARCH_API_KEY;
    if (!limits.includeSearch || !apiKey) return [];
    const query = `"${context.company.replaceAll('"', '')}" ${context.role} engineering team technology`;
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query.slice(0, 400));
    url.searchParams.set("count", String(limits.maxSources));
    const response = await ssrfFetch(url.toString(), {
      maxRedirects: 0,
      headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
      timeoutMs: 8_000,
      maxBytes: 300_000,
    });
    const body = JSON.parse(response.body.toString("utf8")) as { web?: { results?: Array<{ url?: string; title?: string }> } };
    const candidates = (body.web?.results ?? []).filter((row) => typeof row.url === "string").slice(0, limits.maxSources);
    const results = await Promise.all(candidates.map(async (row): Promise<ResearchSourceRecord | null> => {
      try {
        // The search token is never forwarded to result pages. SSRF checks apply to every URL/redirect.
        const page = await ssrfFetch(row.url!);
        const excerpt = htmlToPlainText(page.body.toString("utf8")).slice(0, MAX_EXCERPT).trim();
        if (!excerpt) return null;
        return { url: page.url, title: row.title?.slice(0, 300) || context.company,
          accessedAt: new Date().toISOString(), type: "public-reference", excerpt, confidence: "medium" };
      } catch { return null; }
    }));
    return results.filter((row): row is ResearchSourceRecord => row !== null);
  }
}

export class UrlFetchResearchAdapter implements ResearchSourceAdapter {
  readonly name = "url-fetch";

  async collect(context: ResearchCollectContext): Promise<ResearchSourceRecord[]> {
    const limits = depthLimits(context.researchDepth);
    const candidates = [
      ...(context.jobUrl ? [context.jobUrl] : []),
      ...extractBoardUrls(`${context.jobUrl ?? ""}\n${context.jobDescription ?? ""}`),
    ];
    const unique = [...new Set(candidates)].slice(0, limits.maxSources);

    const results = await Promise.all(
      unique.map(async (raw, index): Promise<ResearchSourceRecord | null> => {
        const accessedAt = new Date().toISOString();
        try {
          const fetched = await ssrfFetch(raw);
          const excerpt = htmlToPlainText(fetched.body.toString("utf8")).slice(0, MAX_EXCERPT);
          if (!excerpt.trim()) return null;
          return {
            url: fetched.url,
            title: index === 0 ? `${context.company} — ${context.role} job posting` : `${context.company} public job board`,
            accessedAt,
            type: "job-posting",
            excerpt,
            confidence: "high",
          };
        } catch {
          // Fetch diagnostics are not source content or employer facts.
          return null;
        }
      }),
    );
    return results.filter((row): row is ResearchSourceRecord => row !== null);
  }
}

export async function collectFromResearchAdapters(
  context: ResearchCollectContext,
  adapters: ResearchSourceAdapter[],
): Promise<ResearchSourceRecord[]> {
  const limits = depthLimits(context.researchDepth);
  const merged: ResearchSourceRecord[] = [];
  const seen = new Set<string>();

  for (const adapter of adapters) {
    try {
      const batch = await adapter.collect(context);
      for (const source of batch) {
        let url: URL;
        try { url = new URL(source.url); } catch { continue; }
        if (!["https:", "http:"].includes(url.protocol) || !source.excerpt.trim()) continue;
        const key = source.url;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(source);
        if (merged.length >= limits.maxSources) return merged;
      }
    } catch (error) {
      if (adapter instanceof ConfiguredSearchAdapter) {
        logger.warn({ adapter: adapter.name }, "Public research search unavailable; continuing with retrieved sources only");
        continue;
      }
      throw error;
    }
  }

  return merged;
}

export function defaultResearchAdapters(mode: "demo" | "live"): ResearchSourceAdapter[] {
  if (mode === "demo") {
    return [new DemoResearchSourceAdapter()];
  }
  return [new UrlFetchResearchAdapter(), new ConfiguredSearchAdapter()];
}
