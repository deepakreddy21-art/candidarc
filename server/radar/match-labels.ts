/**
 * CandidArc Radar — Match Labels (Release A.4)
 *
 * Maps numeric match scores to human-readable labels.
 * Provides evidence-backed reasons citing skills that exist on the profile.
 */

import type { MatchBreakdown, CandidateProfileForMatch } from "./types";

export type MatchLabel =
  | "Strong match"
  | "Good match"
  | "Stretch opportunity"
  | "Not recommended";

export type MatchLabelInfo = {
  label: MatchLabel;
  tone: "success" | "accent" | "warning" | "neutral";
  shortReason: string;
};

/**
 * Score thresholds for match labels.
 */
export const MATCH_THRESHOLDS = {
  strong: 75,
  good: 55,
  stretch: 35,
} as const;

/**
 * Map a numeric match score to a human-readable label.
 */
export function getMatchLabel(score: number): MatchLabelInfo {
  if (score >= MATCH_THRESHOLDS.strong) {
    return {
      label: "Strong match",
      tone: "success",
      shortReason: "Your experience aligns well with this role",
    };
  }
  if (score >= MATCH_THRESHOLDS.good) {
    return {
      label: "Good match",
      tone: "accent",
      shortReason: "Several skills overlap with requirements",
    };
  }
  if (score >= MATCH_THRESHOLDS.stretch) {
    return {
      label: "Stretch opportunity",
      tone: "warning",
      shortReason: "May require growth in key areas",
    };
  }
  return {
    label: "Not recommended",
    tone: "neutral",
    shortReason: "Limited alignment with your current profile",
  };
}

/**
 * Generate evidence-backed match reasons citing skills that actually exist on the profile.
 * Never invents skills — only cites what's verified.
 */
export function getMatchReasons(
  breakdown: MatchBreakdown,
  profile: CandidateProfileForMatch,
  maxReasons: number = 3,
): string[] {
  const reasons: string[] = [];

  // Cite matched skills (these exist on the profile)
  if (breakdown.matchedSkills.length > 0) {
    const topSkills = breakdown.matchedSkills.slice(0, 3);
    reasons.push(`Matched skills: ${topSkills.join(", ")}`);
  }

  // Career alignment
  if (breakdown.career >= 70 && profile.careerGoals && profile.careerGoals.length > 0) {
    reasons.push("Aligns with your stated career goals");
  }

  // Location/remote fit
  if (breakdown.location >= 85) {
    if (profile.remoteOk) {
      reasons.push("Remote-compatible role");
    } else if (profile.preferredLocations && profile.preferredLocations.length > 0) {
      reasons.push("Location matches your preferences");
    }
  }

  // Experience level
  if (breakdown.seniority >= 80 && profile.seniority) {
    reasons.push(`Seniority level matches your ${profile.seniority} experience`);
  }

  // Years of experience
  if (breakdown.experience >= 75 && profile.yearsExperience) {
    reasons.push(`Your ${profile.yearsExperience}+ years of experience is a fit`);
  }

  // Skill gaps (only if we have matched skills to compare against)
  if (breakdown.missingSkills.length > 0 && breakdown.matchedSkills.length > 0) {
    const topGaps = breakdown.missingSkills.slice(0, 2);
    reasons.push(`Gap areas: ${topGaps.join(", ")}`);
  }

  // If no evidence-backed reasons, provide honest assessment
  if (reasons.length === 0) {
    if (profile.skills.length === 0) {
      reasons.push("Add more skills to your profile for better matching");
    } else {
      reasons.push("Limited overlap between your skills and job requirements");
    }
  }

  return reasons.slice(0, maxReasons);
}

/**
 * Enhanced match breakdown with label and evidence-backed reasons.
 */
export type EnhancedMatchBreakdown = MatchBreakdown & {
  matchLabel: MatchLabel;
  matchTone: MatchLabelInfo["tone"];
  matchReasons: string[];
};

/**
 * Enhance a match breakdown with label and evidence-backed reasons.
 */
export function enhanceMatchBreakdown(
  breakdown: MatchBreakdown,
  profile: CandidateProfileForMatch,
): EnhancedMatchBreakdown {
  const labelInfo = getMatchLabel(breakdown.overall);
  const reasons = getMatchReasons(breakdown, profile);

  return {
    ...breakdown,
    matchLabel: labelInfo.label,
    matchTone: labelInfo.tone,
    matchReasons: reasons,
  };
}
