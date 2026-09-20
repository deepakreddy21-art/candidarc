export type ResumeResearch = {
  status: "available" | "limited" | "unavailable" | "demo";
  notice: string;
  collectedAt: string;
  cached: boolean;
  limitations: string[];
  findings: Array<{
    title: string; summary: string; scope: string; status: string; caveat?: string | null;
    sources: Array<{ title: string; url: string; publishedAt?: string | null; accessedAt: string }>;
  }>;
  plan: Array<{ capability: string; emphasis: string; placement: string; gap?: string | null }>;
};
