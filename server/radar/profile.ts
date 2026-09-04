/**
 * CandidArc Radar — Candidate Profile Loading for Matching (Release A.2)
 *
 * Loads the candidate's TRUTHFUL profile from the database for match scoring.
 * Never invents skills. In production, if no profile/evidence exists, returns empty skills.
 * Only in demo mode may fall back to a demo profile when empty.
 */

import type { AuthContext } from "../auth/guards";
import { requireTenantMembership, requireUser } from "../auth/guards";
import type { Repositories } from "../database/repositories";
import { getEnv } from "../config/env";
import type { CandidateProfileForMatch } from "./types";
import { SEED_CANDIDATE_PROFILE } from "./catalog";

/**
 * Empty profile used when no candidate data exists in production.
 * Ensures truthful matching — unknown skills result in lower match scores.
 */
export const EMPTY_PROFILE: CandidateProfileForMatch = {
  skills: [],
  seniority: undefined,
  preferredLocations: [],
  remoteOk: true,
  yearsExperience: undefined,
  careerGoals: [],
  visaNeeded: undefined,
  targetCompensationMin: undefined,
};

/**
 * Load the candidate's profile for match scoring.
 *
 * Sources:
 * - candidateProfiles repository (experience, location, career goals, prefs)
 * - evidence repository (aggregate technologies as skills)
 *
 * NEVER invents skills. If no profile or evidence exists in production, returns EMPTY_PROFILE.
 * In demo mode only, if empty, falls back to SEED_CANDIDATE_PROFILE.
 */
export async function loadCandidateProfileForMatch(
  ctx: AuthContext,
  repos: Repositories,
): Promise<CandidateProfileForMatch> {
  const user = requireUser(ctx);
  const tenantId = ctx.activeTenantId;

  if (!tenantId) {
    return getEnv().APP_MODE === "demo" ? SEED_CANDIDATE_PROFILE : EMPTY_PROFILE;
  }

  requireTenantMembership(ctx, tenantId);

  const candidateProfile = await repos.candidateProfiles.getByUser(tenantId, user.id);
  const evidenceItems = await repos.evidence.list(tenantId);

  const skillsFromEvidence = new Set<string>();
  for (const item of evidenceItems) {
    for (const tech of item.technologies ?? []) {
      if (typeof tech === "string" && tech.trim()) {
        skillsFromEvidence.add(tech.trim());
      }
    }
  }

  const extractionSkills = candidateProfile?.resumeImportExtraction?.skills;
  if (Array.isArray(extractionSkills)) {
    for (const skill of extractionSkills) {
      if (typeof skill === "string" && skill.trim()) {
        skillsFromEvidence.add(skill.trim());
      }
    }
  }

  const skills = [...skillsFromEvidence];
  const hasData = candidateProfile || skills.length > 0;

  if (!hasData) {
    const env = getEnv();
    if (env.APP_MODE === "demo") {
      return SEED_CANDIDATE_PROFILE;
    }
    return EMPTY_PROFILE;
  }

  const seniorityMap: Record<string, string> = {
    entry: "Junior",
    junior: "Junior",
    mid: "Mid-Level",
    "mid-level": "Mid-Level",
    senior: "Senior",
    staff: "Staff",
    principal: "Principal",
    lead: "Lead",
    director: "Director",
    executive: "Executive",
    student: "Junior",
    "early-career": "Junior",
    experienced: "Mid-Level",
    "career-transition": "Mid-Level",
  };

  const experienceLevel = candidateProfile?.experienceLevel?.toLowerCase() ?? "";
  const seniority = seniorityMap[experienceLevel] ?? candidateProfile?.experienceLevel ?? undefined;

  const preferredLocations = [...(candidateProfile?.preferredLocations ?? [])];
  if (candidateProfile?.location && !preferredLocations.includes(candidateProfile.location)) {
    preferredLocations.push(candidateProfile.location);
  }

  const careerGoals: string[] = [];
  if (candidateProfile?.careerGoal) {
    careerGoals.push(candidateProfile.careerGoal);
  }
  for (const family of candidateProfile?.targetRoleFamilies ?? []) {
    if (typeof family === "string" && family.trim()) {
      careerGoals.push(family.trim());
    }
  }

  return {
    skills,
    seniority,
    preferredLocations,
    remoteOk: candidateProfile?.remoteOk ?? true,
    yearsExperience: candidateProfile?.yearsExperience ?? undefined,
    careerGoals,
    visaNeeded: candidateProfile?.requiresSponsorship ?? undefined,
    targetCompensationMin: undefined,
  };
}

/**
 * Check if the profile is empty (no meaningful skills or experience).
 * Used to determine if matching should show "incomplete profile" warnings.
 */
export function isProfileEmpty(profile: CandidateProfileForMatch): boolean {
  return (
    profile.skills.length === 0 &&
    !profile.yearsExperience &&
    !profile.seniority &&
    (profile.careerGoals?.length ?? 0) === 0
  );
}
