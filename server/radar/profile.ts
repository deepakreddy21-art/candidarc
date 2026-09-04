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
 * - candidateProfiles table (fullName, yearsExperience, location, careerGoal, experienceLevel, targetRoleFamilies)
 * - evidenceItems table (aggregate technologies as skills, job titles)
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

  // Load candidate profile from store
  // Note: Using type assertion as store interface may vary
  const store = repos.store as unknown as Record<string, unknown>;
  const candidateProfileRepo = store.candidateProfiles as { findByUser?: (tenantId: string, userId: string) => Promise<{ experienceLevel?: string; location?: string; careerGoal?: string; targetRoleFamilies?: string[]; yearsExperience?: number } | null> } | undefined;
  const evidenceRepo = store.evidenceItems as { listByTenant?: (tenantId: string) => Promise<Array<{ technologies?: string[] }>> } | undefined;

  const candidateProfile = await candidateProfileRepo?.findByUser?.(tenantId, user.id) ?? null;

  // Aggregate skills from evidence items (technologies field)
  const evidenceItems = await evidenceRepo?.listByTenant?.(tenantId) ?? [];

  // Extract technologies from all evidence items as skills
  const skillsFromEvidence = new Set<string>();
  for (const item of evidenceItems) {
    const techs = item.technologies ?? [];
    for (const tech of techs) {
      if (typeof tech === "string" && tech.trim()) {
        skillsFromEvidence.add(tech.trim());
      }
    }
  }

  // Build profile from actual data
  const skills = [...skillsFromEvidence];
  const hasData = candidateProfile || skills.length > 0;

  if (!hasData) {
    // No profile/evidence exists
    const env = getEnv();
    if (env.APP_MODE === "demo") {
      // Demo mode: fall back to seed profile for demonstration
      return SEED_CANDIDATE_PROFILE;
    }
    // Production: return empty profile — never invent skills
    return EMPTY_PROFILE;
  }

  // Map experience level string to seniority
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
  };

  const experienceLevel = candidateProfile?.experienceLevel?.toLowerCase() ?? "";
  const seniority = seniorityMap[experienceLevel] ?? candidateProfile?.experienceLevel;

  // Build preferred locations
  const preferredLocations: string[] = [];
  if (candidateProfile?.location) {
    preferredLocations.push(candidateProfile.location);
  }

  // Build career goals from careerGoal and targetRoleFamilies
  const careerGoals: string[] = [];
  if (candidateProfile?.careerGoal) {
    careerGoals.push(candidateProfile.careerGoal);
  }
  const targetFamilies = candidateProfile?.targetRoleFamilies ?? [];
  if (Array.isArray(targetFamilies)) {
    for (const family of targetFamilies) {
      if (typeof family === "string" && family.trim()) {
        careerGoals.push(family.trim());
      }
    }
  }

  return {
    skills,
    seniority,
    preferredLocations,
    remoteOk: true, // Default to remote-friendly
    yearsExperience: candidateProfile?.yearsExperience ?? undefined,
    careerGoals,
    visaNeeded: undefined, // Not stored in current schema
    targetCompensationMin: undefined, // Not stored in current schema
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
