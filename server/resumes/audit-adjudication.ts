/**
 * Audit adjudication — validate findings before auto-accepting them.
 * Grammar/clarity/structure may auto-accept; factual/tech claims need evidence.
 */

export type AdjudicationDecision = "accepted" | "rejected" | "needs_user";

export type AdjudicableFinding = {
  publicId: string;
  severity: string;
  section: string;
  title: string;
  explanation: string;
  beforeText?: string | null;
  suggestedText?: string | null;
  evidenceSource?: string | null;
  status: string;
};

export type AdjudicationContext = {
  knownEvidenceIds: string[];
  knownTechnologies: string[];
  /** Lowercased tech tokens already present in evidence / attested list */
  evidenceTextBlob: string;
};

const STYLE_KEYWORDS =
  /\b(grammar|clarity|structure|repetition|formatting|typo|readability|concise|wording|passive|filler|bullet length|spacing|punctuation)\b/i;

const FACTUAL_KEYWORDS =
  /\b(metric|quantif|ownership|led |owned |built |designed |architect|deployed|reduced|increased|revenue|latency|throughput|users|team of|headcount|promoted|hired)\b/i;

const TECH_CLAIM_KEYWORDS =
  /\b(kubernetes|k8s|terraform|aws|gcp|azure|react|python|java|golang|typescript|kafka|spark|flink|redis|postgres|mysql|mongodb|docker|helm|graphql|langchain|openai|anthropic)\b/i;

function normalizeTech(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9.+#]/g, "");
}

function extractTechTokens(text: string): string[] {
  const matches = text.match(TECH_CLAIM_KEYWORDS) ?? [];
  return [...new Set(matches.map(normalizeTech).filter(Boolean))];
}

function introducesUnsupportedMetric(suggested: string, evidenceBlob: string): boolean {
  const metricLike = suggested.match(/\b\d+(\.\d+)?\s*%|\b\d{2,}\+?\s*(ms|s|users|requests|qps|tps)\b/gi) ?? [];
  if (!metricLike.length) return false;
  const blob = evidenceBlob.toLowerCase();
  return metricLike.some((metric) => !blob.includes(metric.toLowerCase().replace(/\s+/g, " ").trim()));
}

function introducesTeamAsIndividual(suggested: string, before: string): boolean {
  const teamish = /\b(we|our team|the team)\b/i.test(before);
  const individual = /\b(i |i'm |i’ve |i led|i owned|i built|solely)\b/i.test(suggested);
  return teamish && individual;
}

/**
 * Decide whether an audit finding may be auto-applied.
 */
export function adjudicateFinding(
  finding: AdjudicableFinding,
  ctx: AdjudicationContext,
): { decision: AdjudicationDecision; reason: string } {
  const suggested = finding.suggestedText ?? "";
  const before = finding.beforeText ?? "";
  const haystack = `${finding.title} ${finding.explanation} ${finding.section} ${suggested}`;
  const evidenceBlob = ctx.evidenceTextBlob.toLowerCase();
  const knownTech = new Set(ctx.knownTechnologies.map(normalizeTech));
  const knownEvidence = new Set(ctx.knownEvidenceIds);

  if (STYLE_KEYWORDS.test(haystack) && !FACTUAL_KEYWORDS.test(haystack) && !TECH_CLAIM_KEYWORDS.test(suggested)) {
    return { decision: "accepted", reason: "Style/clarity improvement" };
  }

  if (finding.evidenceSource && !knownEvidence.has(finding.evidenceSource) && finding.evidenceSource !== "general") {
    return { decision: "rejected", reason: "Evidence ID not found" };
  }

  const newTechs = extractTechTokens(suggested).filter((tech) => !extractTechTokens(before).includes(tech));
  for (const tech of newTechs) {
    if (!knownTech.has(tech)) {
      // "Similar technology" must not authorize claiming the exact technology.
      return {
        decision: "rejected",
        reason: `Unsupported technology claim: ${tech}`,
      };
    }
  }

  if (introducesUnsupportedMetric(suggested, evidenceBlob)) {
    return { decision: "rejected", reason: "Metric not supported by evidence" };
  }

  if (introducesTeamAsIndividual(suggested, before)) {
    return { decision: "rejected", reason: "Converts team result into individual ownership without evidence" };
  }

  if (FACTUAL_KEYWORDS.test(haystack) || FACTUAL_KEYWORDS.test(suggested)) {
    if (!finding.evidenceSource || finding.evidenceSource === "general") {
      return { decision: "needs_user", reason: "Factual claim needs evidence confirmation" };
    }
    if (!knownEvidence.has(finding.evidenceSource)) {
      return { decision: "rejected", reason: "Factual claim references unknown evidence" };
    }
  }

  if (STYLE_KEYWORDS.test(haystack) || finding.severity === "minor" || finding.severity === "suggestion") {
    return { decision: "accepted", reason: "Safe structural improvement" };
  }

  // Default: accept only when evidence-backed; otherwise reject unsupported invention.
  if (finding.evidenceSource && knownEvidence.has(finding.evidenceSource)) {
    return { decision: "accepted", reason: "Evidence-backed finding" };
  }

  return { decision: "rejected", reason: "Unsupported information without evidence" };
}

export function adjudicateFindings(
  findings: AdjudicableFinding[],
  ctx: AdjudicationContext,
): Array<AdjudicableFinding & { adjudication: AdjudicationDecision; adjudicationReason: string }> {
  return findings.map((finding) => {
    const result = adjudicateFinding(finding, ctx);
    return {
      ...finding,
      adjudication: result.decision,
      adjudicationReason: result.reason,
    };
  });
}

export function buildAdjudicationContext(input: {
  evidence: Array<{
    publicId: string;
    technologies: string[];
    title?: string;
    situation?: string;
    task?: string;
    actions?: string[] | string;
    result?: string;
    organization?: string;
  }>;
  attestedTechnologies?: string[];
}): AdjudicationContext {
  const knownEvidenceIds = input.evidence.map((item) => item.publicId);
  const knownTechnologies = [
    ...new Set([
      ...input.evidence.flatMap((item) => item.technologies),
      ...(input.attestedTechnologies ?? []),
    ]),
  ];
  const evidenceTextBlob = input.evidence
    .map((item) =>
      [
        item.title,
        item.organization,
        item.situation,
        item.task,
        Array.isArray(item.actions) ? item.actions.join(" ") : item.actions,
        item.result,
        item.technologies.join(" "),
      ]
        .filter(Boolean)
        .join(" "),
    )
    .join("\n");
  return { knownEvidenceIds, knownTechnologies, evidenceTextBlob };
}
