import type { RadarJob } from "@/types/radar";

export type TeamSignal = {
  id: string;
  name: string;
  explanation: string;
  confidence: "high" | "medium" | "low";
  inferred: boolean;
  sourceTitle?: string;
  sourceDomain?: string;
  sourceUrl?: string;
  observedAt?: string;
};

function domainFromUrl(url?: string) {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * Present team/technology signals from existing Radar job fields.
 * Does not invent sources — when attribution is missing, mark as inferred/low confidence.
 */
export function buildTeamSignals(job: RadarJob): TeamSignal[] {
  const sourceTitle = job.primarySource?.name;
  const sourceUrl =
    job.applicationUrl ||
    job.companyCareersUrl ||
    job.sightings?.find((s) => s.url)?.url;
  const sourceDomain = domainFromUrl(sourceUrl);
  const observedAt = job.lastVerifiedAt || job.firstSeenAt;

  const fromTech = (job.technologies ?? []).slice(0, 10).map((name, index) => {
    return {
      id: `tech-${index}-${name}`,
      name,
      explanation: `${name} is associated with this listing's role text. This does not independently confirm the team's production stack.`,
      confidence: (job.companyDirect ? "medium" : "low") as TeamSignal["confidence"],
      inferred: true,
      sourceTitle,
      sourceDomain,
      sourceUrl,
      observedAt,
    };
  });

  const fromHiring = (job.hiringSignals ?? []).slice(0, 5).map((text, index) => ({
    id: `hire-${index}`,
    name: text.length > 48 ? `${text.slice(0, 48)}…` : text,
    explanation: text,
    confidence: "medium" as const,
    inferred: true,
    sourceTitle,
    sourceDomain,
    sourceUrl,
    observedAt,
  }));

  return [...fromTech, ...fromHiring];
}
