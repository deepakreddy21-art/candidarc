import { createHash } from "crypto";

export type ResearchCollectorInput = {
  company: string;
  role: string;
  jobUrl?: string;
  jobDescription?: string;
};

export type SourceDraft = {
  id: string;
  url: string;
  title: string;
  accessedAt: string;
  excerpt: string;
  confidence: "high" | "medium" | "low";
};

const MAX_BYTES = 300_000;
const MAX_EXCERPT = 12_000;
const ALLOWED_BOARD_HOST = /(?:^|\.)(?:greenhouse\.io|lever\.co|ashbyhq\.com)$/i;

function sourceId(url: string): string {
  return `src-${createHash("sha256").update(url).digest("hex").slice(0, 12)}`;
}

function safePublicUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) return null;
    return url;
  } catch {
    return null;
  }
}

function extractBoardUrls(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)]
    .map((match) => match[0].replace(/[.,;:!?]+$/, ""))
    .filter((raw) => {
      const url = safePublicUrl(raw);
      return Boolean(url && ALLOWED_BOARD_HOST.test(url.hostname));
    });
}

function cleanHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_EXCERPT);
}

async function fetchExcerpt(url: URL): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "error",
      headers: { "user-agent": "CandidArcResearchCollector/1.0" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) throw new Error("response too large");
    const reader = response.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        throw new Error("response too large");
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
    return cleanHtml(body);
  } finally {
    clearTimeout(timeout);
  }
}

export async function collectResearchSources(input: ResearchCollectorInput): Promise<SourceDraft[]> {
  const primary = input.jobUrl ? safePublicUrl(input.jobUrl) : null;
  const candidates = [
    ...(primary ? [primary.toString()] : []),
    ...extractBoardUrls(`${input.jobUrl ?? ""}\n${input.jobDescription ?? ""}`),
  ];
  const unique = [...new Set(candidates)];

  return Promise.all(unique.map(async (raw, index): Promise<SourceDraft> => {
    const accessedAt = new Date().toISOString();
    try {
      const excerpt = await fetchExcerpt(new URL(raw));
      return {
        id: sourceId(raw),
        url: raw,
        title: index === 0 ? `${input.company} — ${input.role} job posting` : `${input.company} public job board`,
        accessedAt,
        excerpt: excerpt || "The public source returned no readable text.",
        confidence: excerpt ? "high" : "medium",
      };
    } catch (error) {
      return {
        id: sourceId(raw),
        url: raw,
        title: index === 0 ? `${input.company} — ${input.role} job posting` : `${input.company} public job board`,
        accessedAt,
        excerpt: `Source URL supplied by the application; fetch failed: ${error instanceof Error ? error.message : "unknown error"}.`,
        confidence: "low",
      };
    }
  }));
}
