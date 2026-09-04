import { createHash } from "crypto";
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
        confidence: excerpt ? "high" : "medium",
      });
    }
    if (excerpt) {
      sources.push({
        url: `fixture://job-description/${sourceId(context.company + context.role)}`,
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
    const env = getEnv();
    const apiKey = env.OPENAI_API_KEY ?? env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Configured search unavailable: no live search credentials configured");
    }
    const limits = depthLimits(context.researchDepth);
    if (!limits.includeSearch) return [];

    return [
      {
        url: `search://roles/${encodeURIComponent(context.company)}/${encodeURIComponent(context.role)}`,
        title: `${context.company} ${context.role} public references`,
        accessedAt: new Date().toISOString(),
        type: "search-summary",
        excerpt: `Configured search would query public references for ${context.role} at ${context.company}. Live search is not enabled in this environment.`,
        confidence: "low" as const,
      },
    ].slice(0, limits.maxSources);
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

    return Promise.all(
      unique.map(async (raw, index): Promise<ResearchSourceRecord> => {
        const accessedAt = new Date().toISOString();
        try {
          const fetched = await ssrfFetch(raw);
          const excerpt = htmlToPlainText(fetched.body.toString("utf8")).slice(0, MAX_EXCERPT);
          return {
            url: fetched.url,
            title: index === 0 ? `${context.company} — ${context.role} job posting` : `${context.company} public job board`,
            accessedAt,
            type: "job-posting",
            excerpt: excerpt || "The public source returned no readable text.",
            confidence: excerpt ? "high" : "medium",
          };
        } catch (error) {
          return {
            url: raw,
            title: index === 0 ? `${context.company} — ${context.role} job posting` : `${context.company} public job board`,
            accessedAt,
            type: "job-posting",
            excerpt: `Source URL supplied by the application; fetch failed: ${error instanceof Error ? error.message : "unknown error"}.`,
            confidence: "low",
          };
        }
      }),
    );
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
        const key = source.url.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(source);
        if (merged.length >= limits.maxSources) return merged;
      }
    } catch (error) {
      if (adapter instanceof ConfiguredSearchAdapter) {
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
