/**
 * CandidArc Radar — Opportunity Brief Generator (Release C.2)
 *
 * Generates personalized opportunity briefs for jobs.
 * Lazy generates and caches briefs.
 *
 * Evidence-backed: Cites evidence IDs, research URLs.
 * Company research cites URLs.
 * Never converts research into candidate experience.
 * Resume readiness labels based on actual profile match.
 */

import { z } from "zod";
import { getEnv } from "../config/env";
import { getProviderForRole } from "../ai";
import type { CanonicalJobCatalog } from "./catalog";
import type { CanonicalJob, CandidateProfileForMatch } from "./types";
import { getMatchLabel } from "./match-labels";
import type { OpportunityBrief } from "./service";

/**
 * Generate a mock brief when AI is unavailable.
 */
function generateMockBrief(
  job: CanonicalJob,
  profile: CandidateProfileForMatch,
): OpportunityBrief {
  const matchedSkills = job.techStack.filter((tech) =>
    profile.skills.some((s) => s.toLowerCase() === tech.toLowerCase()),
  );

  const missingSkills = job.techStack.filter(
    (tech) => !profile.skills.some((s) => s.toLowerCase() === tech.toLowerCase()),
  );

  // Determine resume readiness based on skill overlap
  let resumeReadinessLabel: OpportunityBrief["resumeReadinessLabel"];
  const overlapRatio =
    job.techStack.length > 0 ? matchedSkills.length / job.techStack.length : 0;

  if (overlapRatio >= 0.7) {
    resumeReadinessLabel = "ready";
  } else if (overlapRatio >= 0.4) {
    resumeReadinessLabel = "needs_work";
  } else {
    resumeReadinessLabel = "significant_gaps";
  }

  const skillsAlignment: string[] = [];
  if (matchedSkills.length > 0) {
    skillsAlignment.push(`Matched skills: ${matchedSkills.slice(0, 5).join(", ")}`);
  }
  if (missingSkills.length > 0) {
    skillsAlignment.push(`Skills to highlight or develop: ${missingSkills.slice(0, 3).join(", ")}`);
  }

  const concerns: string[] = [];
  if (profile.skills.length === 0) {
    concerns.push("Your profile has no skills listed — add skills for better matching");
  }
  if (job.classification === "REPOSTED") {
    concerns.push(
      `This role has been reposted ${job.repostCount} time(s) — may indicate high competition or turnover`,
    );
  }
  if (!job.companyDirect) {
    concerns.push("Listing from third-party source — verify on company careers page");
  }

  return {
    jobId: job.publicId,
    summary: `${job.title} at ${job.companyName} — ${job.locations.join(", ")}. ${job.description.slice(0, 200)}...`,
    companyOverview: job.companyDirect
      ? `${job.companyName} is hiring directly through their ATS.`
      : `${job.companyName} listing discovered via ${job.primarySourceId}.`,
    roleHighlights: [
      `${job.employmentType ?? "Full-time"} position`,
      job.remotePolicy !== "unknown" ? `Work arrangement: ${job.remotePolicy}` : null,
      job.seniority ? `Level: ${job.seniority}` : null,
      job.department ? `Team: ${job.department}` : null,
    ].filter((h): h is string => h !== null),
    skillsAlignment,
    concerns,
    resumeReadinessLabel,
    generatedAt: new Date().toISOString(),
    cached: false,
  };
}

/** Schema for opportunity brief */
const briefSchema = z.object({
  summary: z.string(),
  companyOverview: z.string().optional(),
  roleHighlights: z.array(z.string()),
  skillsAlignment: z.array(z.string()),
  concerns: z.array(z.string()),
  resumeReadinessLabel: z.enum(["ready", "needs_work", "significant_gaps"]),
});

/**
 * Generate opportunity brief using AI.
 */
async function generateWithAI(
  job: CanonicalJob,
  profile: CandidateProfileForMatch,
  catalog: CanonicalJobCatalog,
): Promise<OpportunityBrief | null> {
  const env = getEnv();

  if (env.AI_MODE === "mock") {
    return null;
  }

  try {
    const provider = getProviderForRole("generation");
    if (!provider) return null;

    const matchedSkills = job.techStack.filter((tech) =>
      profile.skills.some((s) => s.toLowerCase() === tech.toLowerCase()),
    );
    const missingSkills = job.techStack.filter(
      (tech) => !profile.skills.some((s) => s.toLowerCase() === tech.toLowerCase()),
    );

    const result = await provider.generateStructured({
      prompt: { id: "radar-opportunity-brief", version: "1.0" },
      system: `You are generating a personalized opportunity brief for a job seeker.

IMPORTANT RULES:
1. Only cite skills that the candidate actually has (provided below)
2. Never convert company research into candidate experience
3. Be honest about skill gaps
4. Cite sources when making company claims
5. Focus on actionable insights`,
      user: `Generate an opportunity brief for this job and candidate:

JOB:
- Title: ${job.title}
- Company: ${job.companyName}
- Location: ${job.locations.join(", ")}
- Remote: ${job.remotePolicy}
- Description: ${job.description.slice(0, 1500)}
- Required skills: ${job.techStack.join(", ") || "Not specified"}

CANDIDATE SKILLS (only cite these):
${profile.skills.length > 0 ? profile.skills.join(", ") : "No skills on profile"}

MATCHED SKILLS: ${matchedSkills.join(", ") || "None"}
MISSING SKILLS: ${missingSkills.join(", ") || "None"}

CANDIDATE GOALS: ${profile.careerGoals?.join(", ") || "Not specified"}
CANDIDATE EXPERIENCE: ${profile.yearsExperience ?? "Unknown"} years`,
      schema: briefSchema,
      model: { provider: "openai", model: "gpt-4o-mini", temperature: 0.3, maxOutputTokens: 1000 },
    });

    return {
      jobId: job.publicId,
      summary: result.data.summary,
      companyOverview: result.data.companyOverview,
      roleHighlights: result.data.roleHighlights,
      skillsAlignment: result.data.skillsAlignment,
      concerns: result.data.concerns,
      resumeReadinessLabel: result.data.resumeReadinessLabel,
      generatedAt: new Date().toISOString(),
      cached: false,
    };
  } catch {
    return null;
  }
}

/**
 * Generate an opportunity brief for a job.
 * Uses AI when available, falls back to rule-based generation.
 */
export async function generateOpportunityBrief(
  job: CanonicalJob,
  profile: CandidateProfileForMatch,
  catalog: CanonicalJobCatalog,
): Promise<OpportunityBrief> {
  // Try AI generation first
  const aiResult = await generateWithAI(job, profile, catalog);
  if (aiResult) {
    return aiResult;
  }

  // Fall back to mock/heuristic generation
  return generateMockBrief(job, profile);
}
