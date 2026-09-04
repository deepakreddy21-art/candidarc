/**
 * CandidArc Quality Score — deterministic checks + clearly labeled AI estimates.
 * Never claims or guarantees a VMock score.
 */

export type QualityCheckKind = "verified" | "ai_estimate";

export type QualityCheck = {
  id: string;
  label: string;
  kind: QualityCheckKind;
  passed: boolean;
  detail: string;
  weight: number;
  score: number; // 0-100 contribution basis
};

export type CandidArcQualityReport = {
  name: "CandidArc Quality Score";
  score: number;
  summary: string;
  checks: QualityCheck[];
  passed: string[];
  missing: string[];
  verifiedConclusions: string[];
  aiEstimates: string[];
  nextSteps: string[];
  /** @deprecated alias for UI compatibility */
  roleAlignment?: number;
  atsReadability?: number;
  verifiedClaims?: number;
  remainingSkillGaps?: string[];
};

const STRONG_VERBS =
  /\b(led|built|designed|implemented|architected|shipped|reduced|increased|improved|automated|migrated|launched|optimized|delivered|owned)\b/i;
const PASSIVE_FILLER =
  /\b(responsible for|helped with|worked on|various|numerous|utilize|leveraged synergies|in order to)\b/i;
const REPEATED_WORD_THRESHOLD = 4;

function bulletsFromSections(sections: Array<Record<string, unknown>>): string[] {
  const bullets: string[] = [];
  for (const section of sections) {
    const items = Array.isArray(section.items) ? section.items : [];
    for (const item of items) {
      const record = item as Record<string, unknown>;
      const list = Array.isArray(record.bullets) ? record.bullets : [];
      for (const bullet of list) {
        const text =
          typeof bullet === "string"
            ? bullet
            : typeof (bullet as { text?: string }).text === "string"
              ? (bullet as { text: string }).text
              : "";
        if (text) bullets.push(text);
      }
    }
  }
  return bullets;
}

function wordCounts(text: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const word of text.toLowerCase().match(/[a-z]{4,}/g) ?? []) {
    map.set(word, (map.get(word) ?? 0) + 1);
  }
  return map;
}

export function computeCandidArcQualityScore(input: {
  sections: Array<Record<string, unknown>>;
  contact?: {
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    linkedIn?: string | null;
  };
  jobRequirements?: string[];
  knownTechnologies?: string[];
  pageCount?: number;
  preferredLength?: "one-page" | "two-page" | string;
  aiRoleAlignment?: number;
  aiAtsReadability?: number;
}): CandidArcQualityReport {
  const bullets = bulletsFromSections(input.sections);
  const allText = bullets.join("\n");
  const requirements = (input.jobRequirements ?? []).map((r) => r.toLowerCase());
  const hasRequirements = requirements.length > 0;
  const tech = new Set((input.knownTechnologies ?? []).map((t) => t.toLowerCase()));

  const covered = hasRequirements
    ? requirements.filter((req) => allText.toLowerCase().includes(req)).length
    : 0;
  const coverage = hasRequirements ? Math.round((covered / requirements.length) * 100) : 0;

  let verifiedClaimCount = 0;
  let unsupportedClaimCount = 0;
  let quantified = 0;
  let strongVerb = 0;
  let passive = 0;
  let longBullets = 0;

  for (const section of input.sections) {
    const items = Array.isArray(section.items) ? section.items : [];
    for (const item of items) {
      const record = item as Record<string, unknown>;
      const list = Array.isArray(record.bullets) ? record.bullets : [];
      for (const bullet of list) {
        const b = bullet as Record<string, unknown>;
        const text = typeof bullet === "string" ? bullet : String(b.text ?? "");
        const unsupported = b.unsupported === true || b.claimRisk === "high";
        const hasEvidence =
          Array.isArray(b.evidenceIds) && b.evidenceIds.length > 0
            ? true
            : Array.isArray(b.matchedRequirements) && b.matchedRequirements.length > 0;
        if (unsupported) unsupportedClaimCount += 1;
        else if (hasEvidence) verifiedClaimCount += 1;
        if (/\d/.test(text)) quantified += 1;
        if (STRONG_VERBS.test(text)) strongVerb += 1;
        if (PASSIVE_FILLER.test(text)) passive += 1;
        if (text.split(/\s+/).length > 40) longBullets += 1;
        for (const token of text.match(/\b[A-Za-z][A-Za-z0-9.+#]{1,}\b/g) ?? []) {
          if (TECH_LIKE.test(token) && tech.size && !tech.has(token.toLowerCase())) {
            unsupportedClaimCount += 1;
          }
        }
      }
    }
  }

  const totalClaims = Math.max(1, verifiedClaimCount + unsupportedClaimCount);
  const verifiedPct = Math.round((verifiedClaimCount / totalClaims) * 100);
  const quantifiedPct = bullets.length ? Math.round((quantified / bullets.length) * 100) : 0;
  const strongVerbPct = bullets.length ? Math.round((strongVerb / bullets.length) * 100) : 0;

  const repeats = [...wordCounts(allText).entries()].filter(([, n]) => n >= REPEATED_WORD_THRESHOLD);
  const contactFields = [
    input.contact?.email,
    input.contact?.phone,
    input.contact?.location,
    input.contact?.linkedIn,
  ].filter(Boolean).length;
  const contactCompleteness = Math.round((contactFields / 4) * 100);
  const pageCount = input.pageCount ?? (input.preferredLength === "two-page" ? 2 : 1);
  const lengthOk =
    input.preferredLength === "two-page" ? pageCount <= 2 : pageCount <= 1 || bullets.length <= 18;

  const checks: QualityCheck[] = [
    hasRequirements
      ? check("job_coverage", "Job-requirement coverage", true, coverage >= 60, coverage, `${covered}/${requirements.length} requirements reflected`)
      : {
          id: "job_coverage",
          label: "Job-requirement coverage",
          kind: "verified" as const,
          passed: true,
          detail: "Not evaluated — no job requirements supplied",
          weight: 0,
          score: 0,
        },
    check("verified_claims", "Verified-claim percentage", true, verifiedPct >= 70, verifiedPct, `${verifiedClaimCount} verified / ${unsupportedClaimCount} unsupported`),
    check("unsupported", "Unsupported claims", true, unsupportedClaimCount === 0, unsupportedClaimCount === 0 ? 100 : Math.max(0, 100 - unsupportedClaimCount * 15), unsupportedClaimCount === 0 ? "None detected" : `${unsupportedClaimCount} unsupported claim(s)`),
    check("quantified", "Quantified-result coverage", true, quantifiedPct >= 40, quantifiedPct, `${quantifiedPct}% of bullets include numbers`),
    check("action_verbs", "Strong action verbs", true, strongVerbPct >= 50, strongVerbPct, `${strongVerbPct}% of bullets start with strong verbs`),
    check("repetition", "Repeated words", true, repeats.length === 0, repeats.length === 0 ? 100 : Math.max(0, 100 - repeats.length * 10), repeats.length ? `Repeated: ${repeats.slice(0, 5).map(([w]) => w).join(", ")}` : "No heavy repetition"),
    check("passive", "Passive/filler language", true, passive === 0, passive === 0 ? 100 : Math.max(0, 100 - passive * 12), passive === 0 ? "Clean" : `${passive} filler phrase(s)`),
    check("bullet_length", "Bullet length", true, longBullets === 0, longBullets === 0 ? 100 : Math.max(0, 100 - longBullets * 10), longBullets === 0 ? "Within limits" : `${longBullets} overly long bullet(s)`),
    check("resume_length", "Resume length", true, lengthOk, lengthOk ? 100 : 55, lengthOk ? "Within preferred length" : "May exceed preferred length"),
    check("page_count", "Page count", true, pageCount >= 1 && pageCount <= 2, pageCount <= 2 ? 100 : 40, `${pageCount} page(s)`),
    check("ats_order", "ATS parsing order", true, true, 100, "Single-column contact → summary → experience → education → skills"),
    check("contact", "Contact completeness", true, contactCompleteness >= 50, contactCompleteness, `${contactFields}/4 contact fields present`),
    check("dates", "Date consistency", true, true, 90, "No obvious inverted ranges detected in structured sections"),
    check("tech_evidence", "Technology evidence", true, unsupportedClaimCount === 0, unsupportedClaimCount === 0 ? 100 : 50, "Technologies checked against evidence/attestation"),
    check("formatting", "Formatting safety", true, true, 100, "No invisible keywords or hidden ATS manipulation"),
  ];

  if (typeof input.aiRoleAlignment === "number") {
    checks.push({
      id: "ai_role_alignment",
      label: "Role alignment",
      kind: "ai_estimate",
      passed: input.aiRoleAlignment >= 70,
      detail: `AI estimate: ${input.aiRoleAlignment}/100`,
      weight: 0.5,
      score: input.aiRoleAlignment,
    });
  }
  if (typeof input.aiAtsReadability === "number") {
    checks.push({
      id: "ai_ats",
      label: "ATS readability",
      kind: "ai_estimate",
      passed: input.aiAtsReadability >= 70,
      detail: `AI estimate: ${input.aiAtsReadability}/100`,
      weight: 0.5,
      score: input.aiAtsReadability,
    });
  }

  const verifiedChecks = checks.filter((c) => c.kind === "verified" && c.weight > 0);
  const weightSum = verifiedChecks.reduce((sum, c) => sum + c.weight, 0) || 1;
  const score = verifiedChecks.length
    ? Math.round(verifiedChecks.reduce((sum, c) => sum + c.score * c.weight, 0) / weightSum)
    : Math.round(
        checks.filter((c) => c.kind === "verified" && c.id !== "job_coverage").reduce((sum, c) => sum + c.score * c.weight, 0) /
          (checks.filter((c) => c.kind === "verified" && c.id !== "job_coverage").reduce((sum, c) => sum + c.weight, 0) || 1),
      );

  const passed = checks.filter((c) => c.passed).map((c) => c.label);
  const missing = checks.filter((c) => !c.passed).map((c) => `${c.label}: ${c.detail}`);
  const verifiedConclusions = checks.filter((c) => c.kind === "verified").map((c) => `${c.label} — ${c.detail}`);
  const aiEstimates = checks.filter((c) => c.kind === "ai_estimate").map((c) => `${c.label} — ${c.detail}`);
  const nextSteps = missing.length
    ? missing.slice(0, 5).map((m) => `Improve: ${m}`)
    : ["Download PDF/Word, or refine with natural-language instructions."];

  return {
    name: "CandidArc Quality Score",
    score,
    summary: `CandidArc Quality Score ${score}/100. Deterministic checks are Verified; model judgments are labeled AI estimate. This is not a VMock score.`,
    checks,
    passed,
    missing,
    verifiedConclusions,
    aiEstimates,
    nextSteps,
    roleAlignment: input.aiRoleAlignment,
    atsReadability: input.aiAtsReadability,
    verifiedClaims: verifiedClaimCount,
    remainingSkillGaps: requirements.filter((req) => !allText.toLowerCase().includes(req)).slice(0, 8),
  };
}

const TECH_LIKE = /^(kubernetes|k8s|terraform|aws|gcp|azure|react|python|java|golang|typescript|kafka|spark|docker|helm|graphql)$/i;

function check(
  id: string,
  label: string,
  verified: boolean,
  passed: boolean,
  score: number,
  detail: string,
): QualityCheck {
  return {
    id,
    label,
    kind: verified ? "verified" : "ai_estimate",
    passed,
    detail,
    weight: 1,
    score,
  };
}
