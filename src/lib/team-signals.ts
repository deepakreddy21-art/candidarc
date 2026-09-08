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
  publishedAt?: string;
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
  const publishedAt = job.lastVerifiedAt || job.firstSeenAt;

  const fromTech = (job.technologies ?? []).slice(0, 10).map((name, index) => {
    const confirmed = Boolean(job.companyDirect && job.verificationState === "VERIFIED_OPEN");
    return {
      id: `tech-${index}-${name}`,
      name,
      explanation: confirmed
        ? `${name} appears in the company-direct posting or verified role requirements.`
        : `${name} is associated with this listing from available role text; treat as a team signal, not a guaranteed stack confirmation.`,
      confidence: (confirmed ? "high" : job.companyDirect ? "medium" : "low") as TeamSignal["confidence"],
      inferred: !confirmed,
      sourceTitle,
      sourceDomain,
      sourceUrl,
      publishedAt,
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
    publishedAt,
  }));

  return [...fromTech, ...fromHiring];
}
