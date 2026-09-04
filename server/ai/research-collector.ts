import { createHash } from "crypto";
import { getEnv } from "../config/env";
import {
  collectFromResearchAdapters,
  defaultResearchAdapters,
  type ResearchCollectContext,
  type ResearchSourceRecord,
} from "../research/sources";

export type ResearchCollectorInput = ResearchCollectContext;

export type SourceDraft = {
  id: string;
  url: string;
  title: string;
  accessedAt: string;
  excerpt: string;
  confidence: "high" | "medium" | "low";
  type: string;
};

function toSourceDraft(source: ResearchSourceRecord): SourceDraft {
  return {
    id: `src-${createHash("sha256").update(source.url).digest("hex").slice(0, 12)}`,
    url: source.url,
    title: source.title,
    accessedAt: source.accessedAt,
    excerpt: source.excerpt,
    confidence: source.confidence,
    type: source.type,
  };
}

export async function collectResearchSources(input: ResearchCollectorInput): Promise<SourceDraft[]> {
  const env = getEnv();
  const adapters = defaultResearchAdapters(env.AI_MODE === "mock" ? "demo" : "live");
  const sources = await collectFromResearchAdapters(input, adapters);
  return sources.map(toSourceDraft);
}

export { type ResearchSourceRecord } from "../research/sources";
