import { z } from "zod";
import type { CandidateProfileRecord } from "../../database/repositories";
import { AppError } from "../../domain/types";

/** V3 onboarding: 0 preferences → 1 career profile → 2 review. V2 four-step progress is mapped on load. */
export const ONBOARDING_STEP_COUNT = 3;
export const ONBOARDING_LAST_STEP = ONBOARDING_STEP_COUNT - 1;

export const jobTypeSchema = z.enum(["full-time", "contract", "part-time", "internship"]);
export const workplaceModeSchema = z.enum(["remote", "hybrid", "on-site"]);
export const senioritySchema = z.enum([
  "internship",
  "entry",
  "mid",
  "senior",
  "staff",
  "lead",
  "executive",
]);

export function normalizeTitleList(values: unknown, max = 20): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= max) break;
  }
  return out;
}

const stringList = (maxItems: number, maxLen: number) =>
  z.array(z.string().max(maxLen)).max(maxItems).optional();

export const onboardingStepDataSchema = z
  .object({
    targetRoles: stringList(20, 120),
    seniority: senioritySchema.optional().nullable(),
    targetCompanies: stringList(30, 160),
    targetIndustries: stringList(30, 120),
    jobTypes: z.array(jobTypeSchema).max(4).optional(),
    workplaceModes: z.array(workplaceModeSchema).max(3).optional(),
    preferredLocations: stringList(20, 160),
    willingToRelocate: z.boolean().optional().nullable(),
    workAuthorization: z.string().max(120).optional().nullable(),
    requiresSponsorship: z.boolean().optional().nullable(),
    salaryPreference: z.string().max(80).optional().nullable(),
    fullName: z.string().min(1).max(160).optional(),
    email: z.string().email().max(160).optional().or(z.literal("")),
    phone: z.string().max(40).optional().nullable(),
    location: z.string().max(160).optional().nullable(),
    linkedIn: z.string().max(200).optional().nullable(),
    github: z.string().max(200).optional().nullable(),
    portfolio: z.string().max(200).optional().nullable(),
    headline: z.string().max(200).optional().nullable(),
    summary: z.string().max(4000).optional().nullable(),
    skills: stringList(200, 80),
    education: z
      .array(
        z.object({
          school: z.string().max(200).optional(),
          degree: z.string().max(200).optional(),
          field: z.string().max(200).optional(),
          location: z.string().max(160).optional(),
          startDate: z.string().max(40).optional(),
          endDate: z.string().max(40).optional(),
          gpa: z.string().max(40).optional(),
          honors: z.string().max(200).optional(),
        }),
      )
      .max(20)
      .optional(),
    certifications: z
      .array(
        z.object({
          name: z.string().max(200),
          issuer: z.string().max(200).optional(),
          date: z.string().max(40).optional(),
          expirationDate: z.string().max(40).optional(),
          credentialId: z.string().max(120).optional(),
          credentialUrl: z.string().max(400).optional(),
        }),
      )
      .max(20)
      .optional(),
    employment: z
      .array(
        z.object({
          title: z.string().max(160).optional(),
          company: z.string().max(160).optional(),
          location: z.string().max(160).optional(),
          startDate: z.string().max(40).optional(),
          endDate: z.string().max(40).optional(),
          isCurrent: z.boolean().optional(),
          bullets: z.array(z.string().max(800)).max(20).optional(),
          technologies: z.array(z.string().max(80)).max(30).optional(),
        }),
      )
      .max(30)
      .optional(),
    projects: z
      .array(
        z.object({
          name: z.string().max(200).optional(),
          role: z.string().max(160).optional(),
          organization: z.string().max(160).optional(),
          startDate: z.string().max(40).optional(),
          endDate: z.string().max(40).optional(),
          description: z.string().max(4000).optional(),
          bullets: z.array(z.string().max(800)).max(20).optional(),
          technologies: z.array(z.string().max(80)).max(30).optional(),
          url: z.string().max(400).optional(),
          repoUrl: z.string().max(400).optional(),
        }),
      )
      .max(30)
      .optional(),
    publications: z
      .array(
        z.object({
          title: z.string().max(400).optional(),
          authors: z.array(z.string().max(200)).max(20).optional(),
          publisher: z.string().max(200).optional(),
          publicationDate: z.string().max(40).optional(),
          doi: z.string().max(200).optional(),
          url: z.string().max(400).optional(),
          description: z.string().max(2000).optional(),
        }),
      )
      .max(30)
      .optional(),
    careerProfileMode: z.enum(["upload", "manual"]).optional(),
    evidenceNotes: z.string().max(8000).optional(),
    careerGoal: z.string().max(500).optional(),
    experienceLevel: z.string().max(80).optional(),
    resumeLength: z.string().max(40).optional(),
    modelImprovement: z.boolean().optional(),
    remoteOk: z.boolean().optional(),
    yearsExperience: z.number().int().min(0).max(60).optional(),
    onboardingFlowVersion: z.literal(3).optional(),
  })
  .strict();

export type OnboardingStepData = z.infer<typeof onboardingStepDataSchema>;

export const updateOnboardingV2RequestSchema = z.object({
  step: z.number().int().min(0).max(3).optional(),
  completed: z.boolean().optional(),
  expectedVersion: z.number().int().min(1),
  data: onboardingStepDataSchema.optional(),
});

export function hasCareerProfileReady(profile: CandidateProfileRecord): boolean {
  if (profile.resumeImportStatus === "confirmed") return true;
  const extraction = profile.resumeImportExtraction ?? {};
  const employment = Array.isArray(extraction.employment) ? extraction.employment : [];
  const skills = Array.isArray(extraction.skills) ? extraction.skills : [];
  const projects = Array.isArray(extraction.projects) ? extraction.projects : [];
  const hasEmployment = employment.some((row) => {
    if (!row || typeof row !== "object") return false;
    const item = row as Record<string, unknown>;
    return Boolean(String(item.title ?? "").trim() || String(item.company ?? "").trim());
  });
  const hasSkills = skills.some((s) => typeof s === "string" && s.trim());
  const hasProjects = projects.some((row) => {
    if (!row || typeof row !== "object") return false;
    return Boolean(String((row as Record<string, unknown>).name ?? "").trim());
  });
  return Boolean(profile.fullName?.trim() && (hasEmployment || hasSkills || hasProjects));
}

export function isV3Onboarding(data?: OnboardingStepData, extraction?: Record<string, unknown> | null) {
  return data?.onboardingFlowVersion === 3 || extraction?.onboardingFlowVersion === 3;
}

export function assertStepPayload(step: number | undefined, data: OnboardingStepData | undefined) {
  if (step === undefined || !data) return;
  if (step === 0) {
    const roles = normalizeTitleList(data.targetRoles ?? []);
    if (roles.length === 0) {
      throw new AppError("ONBOARDING_VALIDATION", "Add at least one target role to continue", 400);
    }
    if (!data.seniority) {
      throw new AppError("ONBOARDING_VALIDATION", "Select a seniority level to continue", 400);
    }
    if (data.onboardingFlowVersion === 3) {
      if (!data.jobTypes?.length) {
        throw new AppError("ONBOARDING_VALIDATION", "Select at least one job type", 400);
      }
      if (!data.workplaceModes?.length) {
        throw new AppError("ONBOARDING_VALIDATION", "Select at least one workplace mode", 400);
      }
    }
  }
  if (step === 1 && data.onboardingFlowVersion !== 3) {
    if (!data.jobTypes?.length) {
      throw new AppError("ONBOARDING_VALIDATION", "Select at least one job type", 400);
    }
    if (!data.workplaceModes?.length) {
      throw new AppError("ONBOARDING_VALIDATION", "Select at least one workplace mode", 400);
    }
  }
}

export function assertCanComplete(profile: CandidateProfileRecord) {
  const roles = normalizeTitleList(profile.targetRoleFamilies);
  if (!roles.length) {
    throw new AppError("ONBOARDING_VALIDATION", "Target roles are required before completing onboarding", 400);
  }
  if (!profile.seniority) {
    throw new AppError("ONBOARDING_VALIDATION", "Seniority is required before completing onboarding", 400);
  }
  if (!profile.jobTypes?.length) {
    throw new AppError("ONBOARDING_VALIDATION", "Job types are required before completing onboarding", 400);
  }
  if (!profile.workplaceModes?.length) {
    throw new AppError("ONBOARDING_VALIDATION", "Workplace modes are required before completing onboarding", 400);
  }
  if (!hasCareerProfileReady(profile)) {
    throw new AppError(
      "ONBOARDING_VALIDATION",
      "Confirm a resume import or enter career experience before completing onboarding",
      400,
    );
  }
}

function careerArrayHasContent(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.some((row) => {
    if (typeof row === "string") return Boolean(row.trim());
    if (!row || typeof row !== "object") return false;
    return Object.values(row as Record<string, unknown>).some((cell) => {
      if (typeof cell === "string") return Boolean(cell.trim());
      if (Array.isArray(cell)) return cell.some((item) => typeof item === "string" && item.trim());
      return cell != null && cell !== "";
    });
  });
}

/**
 * Keep extracted career sections when an onboarding autosave would replace them with [].
 * Empty arrays are truthy in JS, so a naive `if (data.employment)` clobber was wiping
 * Python parse results while leaving certificationEntries (untouched by autosave) visible.
 */
function assignCareerArray(
  next: Record<string, unknown>,
  key: "employment" | "projects" | "education" | "certifications" | "publications" | "skills",
  incoming: unknown,
  normalize?: (value: unknown) => unknown,
): void {
  if (incoming === undefined) return;
  const prior = next[key];
  if (careerArrayHasContent(prior) && !careerArrayHasContent(incoming)) {
    return;
  }
  next[key] = normalize ? normalize(incoming) : incoming;
}

export function mergeExtraction(
  existing: Record<string, unknown> | null | undefined,
  data: OnboardingStepData,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(existing ?? {}) };
  if (data.skills !== undefined) {
    assignCareerArray(next, "skills", data.skills, (value) =>
      normalizeTitleList(Array.isArray(value) ? value.map(String) : [], 60),
    );
  }
  if (data.employment !== undefined) assignCareerArray(next, "employment", data.employment);
  if (data.projects !== undefined) assignCareerArray(next, "projects", data.projects);
  if (data.education !== undefined) assignCareerArray(next, "education", data.education);
  if (data.certifications !== undefined) assignCareerArray(next, "certifications", data.certifications);
  if (data.publications !== undefined) assignCareerArray(next, "publications", data.publications);
  if (data.careerProfileMode) next.careerProfileMode = data.careerProfileMode;
  if (data.onboardingFlowVersion) next.onboardingFlowVersion = data.onboardingFlowVersion;
  if (data.fullName || data.email || data.phone || data.location || data.linkedIn || data.github || data.portfolio) {
    const contact = {
      ...((next.contact as Record<string, unknown> | undefined) ?? {}),
    };
    const assignContactField = (key: string, value: unknown) => {
      const prior = typeof contact[key] === "string" ? String(contact[key]).trim() : "";
      const incoming = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
      // Keep extracted contact values when an autosave would blank them or replace with a different account value.
      if (!prior || prior === incoming) {
        contact[key] = value;
      }
    };
    if (data.fullName !== undefined) assignContactField("fullName", data.fullName);
    if (data.email !== undefined) assignContactField("email", data.email);
    if (data.phone !== undefined) assignContactField("phone", data.phone);
    if (data.location !== undefined) assignContactField("location", data.location);
    if (data.linkedIn !== undefined) assignContactField("linkedIn", data.linkedIn);
    if (data.github !== undefined) assignContactField("github", data.github);
    if (data.portfolio !== undefined) assignContactField("portfolio", data.portfolio);
    next.contact = contact;
  }
  return next;
}
