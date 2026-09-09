export type EvidenceKind = "exact" | "transferable_public" | "proprietary" | "none";

export type ResumePlacement =
  | "skills_and_experience"
  | "skills_only"
  | "transferable_substitute"
  | "target_skill_and_interview"
  | "omit";

export type EvidencePolicyDecision = {
  kind: EvidenceKind;
  technology: string;
  substitute?: string;
  placement: ResumePlacement;
  mayClaimProductionUse: boolean;
  mayInventEmployerOrProject: boolean;
  mayInventMetrics: boolean;
  interviewGap: boolean;
  rationale: string;
};

const PROPRIETARY_HINTS = [
  /internal/i,
  /proprietary/i,
  /\bin-house\b/i,
  /\bcustom\b/i,
  /\bprivate\b/i,
  /^[A-Z][a-z]+[A-Z]/, // CamelCase product names often proprietary when unmatched
];

export function looksProprietary(technology: string, explicit?: boolean): boolean {
  if (explicit) return true;
  return PROPRIETARY_HINTS.some((re) => re.test(technology));
}

/**
 * Automatic resume-claim decisions for team / role technology signals.
 * Never invent employers, projects, dates, ownership, metrics, or production use without evidence.
 */
export function decideTechnologyClaim(input: {
  technology: string;
  hasExactEvidence: boolean;
  hasTransferableEvidence: boolean;
  transferableTechnology?: string;
  proprietary?: boolean;
  publicOrOpenSource?: boolean;
}): EvidencePolicyDecision {
  const proprietary = looksProprietary(input.technology, input.proprietary);
  const publicTech = input.publicOrOpenSource !== false && !proprietary;

  if (input.hasExactEvidence) {
    return {
      kind: "exact",
      technology: input.technology,
      placement: "skills_and_experience",
      mayClaimProductionUse: true,
      mayInventEmployerOrProject: false,
      mayInventMetrics: false,
      interviewGap: false,
      rationale: `Exact evidence supports listing ${input.technology} in Skills and grounded experience bullets.`,
    };
  }

  if (proprietary && input.hasTransferableEvidence) {
    const substitute = input.transferableTechnology?.trim() || "closest transferable capability";
    return {
      kind: "proprietary",
      technology: input.technology,
      substitute,
      placement: "transferable_substitute",
      mayClaimProductionUse: false,
      mayInventEmployerOrProject: false,
      mayInventMetrics: false,
      interviewGap: true,
      rationale: `${input.technology} appears proprietary or company-specific. Emphasize ${substitute}; do not claim use of the proprietary system.`,
    };
  }

  if (publicTech && input.hasTransferableEvidence) {
    return {
      kind: "transferable_public",
      technology: input.technology,
      substitute: input.transferableTechnology,
      placement: "skills_only",
      mayClaimProductionUse: false,
      mayInventEmployerOrProject: false,
      mayInventMetrics: false,
      interviewGap: true,
      rationale: `${input.technology} may appear in Skills based on transferable evidence, but not as rewritten professional production history.`,
    };
  }

  if (publicTech) {
    return {
      kind: "none",
      technology: input.technology,
      placement: "target_skill_and_interview",
      mayClaimProductionUse: false,
      mayInventEmployerOrProject: false,
      mayInventMetrics: false,
      interviewGap: true,
      rationale: `No professional evidence for ${input.technology}. It may appear only as a target/preparation skill; cover the gap in interview prep.`,
    };
  }

  return {
    kind: "none",
    technology: input.technology,
    placement: "omit",
    mayClaimProductionUse: false,
    mayInventEmployerOrProject: false,
    mayInventMetrics: false,
    interviewGap: true,
    rationale: `No exact or transferable evidence for ${input.technology}; omit fabricated claims and prepare the gap for interviews.`,
  };
}

export function assertHonestClaims(decision: EvidencePolicyDecision): string[] {
  const violations: string[] = [];
  if (decision.mayInventEmployerOrProject) violations.push("must never invent employers or projects");
  if (decision.mayInventMetrics) violations.push("must never invent metrics");
  if (decision.kind !== "exact" && decision.mayClaimProductionUse) {
    violations.push("production use claimed without exact evidence");
  }
  if (decision.kind === "proprietary" && decision.placement === "skills_and_experience") {
    violations.push("proprietary tech must not be claimed as professional experience");
  }
  return violations;
}
