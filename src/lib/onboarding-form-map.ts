import { emptyOnboardingForm, type OnboardingFormState } from "@/components/onboarding/types";
import type { CandidateProfile, ResumeImportExtraction } from "@/types/domain";

export function profileToForm(
  profile: CandidateProfile,
  extraction: ResumeImportExtraction | null,
): OnboardingFormState {
  const base = emptyOnboardingForm();
  const contact = extraction?.contact ?? {};
  return {
    ...base,
    targetRoles: profile.targetRoleFamilies ?? [],
    seniority: profile.seniority ?? "",
    targetCompanies: profile.targetCompanies ?? [],
    targetIndustries: profile.targetIndustries ?? [],
    jobTypes: profile.jobTypes ?? [],
    workplaceModes: profile.workplaceModes ?? [],
    preferredLocations: profile.preferredLocations ?? [],
    willingToRelocate: profile.willingToRelocate ?? null,
    workAuthorization: profile.workAuthorization ?? "",
    requiresSponsorship: profile.requiresSponsorship ?? null,
    salaryPreference: profile.salaryPreference ?? "",
    fullName: profile.fullName || contact.fullName || "",
    email: profile.email || contact.email || "",
    phone: profile.phone || contact.phone || "",
    location: profile.location || contact.location || "",
    linkedIn: profile.linkedIn || contact.linkedIn || "",
    github: profile.github || contact.github || "",
    portfolio: profile.portfolio || contact.portfolio || "",
    headline: profile.headline || "",
    summary: profile.summary || "",
    skills: Array.isArray(extraction?.skills) ? extraction!.skills.filter(Boolean) : [],
    employment: (extraction?.employment ?? []).map((row) => ({
      title: row.title,
      company: row.company,
      location: row.location,
      startDate: row.startDate,
      endDate: row.endDate,
      bullets: row.bullets ?? [],
    })),
    education: (extraction?.education ?? []).map((row) => ({
      school: row.institution,
      degree: row.degree,
      field: row.field,
      endDate: row.endDate,
    })),
    certifications: (extraction?.certifications ?? []).map((name) =>
      typeof name === "string" ? { name } : { name: "" },
    ),
    careerProfileMode:
      ((extraction as { careerProfileMode?: "upload" | "manual" } | null)?.careerProfileMode as
        | "upload"
        | "manual"
        | undefined) || (profile.resumeImportStatus ? "upload" : ""),
    evidenceNotes: "",
  };
}

/** Merge extraction into form without clobbering role/work-preference fields. */
export function mergeExtractionPreservingPreferences(
  prev: OnboardingFormState,
  extraction: ResumeImportExtraction,
): OnboardingFormState {
  const mapped = profileToForm(
    {
      id: "",
      fullName: prev.fullName,
      preferredName: "",
      email: prev.email,
      phone: prev.phone,
      location: prev.location,
      linkedIn: prev.linkedIn,
      github: prev.github,
      portfolio: prev.portfolio,
      headline: prev.headline,
      summary: prev.summary,
      experienceLevel: "experienced",
      yearsExperience: 0,
      targetRoleFamilies: prev.targetRoles,
      preferredResumeLength: "one-page",
      careerGoal: "",
      avatarInitials: "",
      preferredLocations: prev.preferredLocations,
      seniority: prev.seniority,
      targetCompanies: prev.targetCompanies,
      targetIndustries: prev.targetIndustries,
      jobTypes: prev.jobTypes,
      workplaceModes: prev.workplaceModes,
      willingToRelocate: prev.willingToRelocate,
      workAuthorization: prev.workAuthorization,
      requiresSponsorship: prev.requiresSponsorship ?? undefined,
      salaryPreference: prev.salaryPreference,
    },
    extraction,
  );
  return {
    ...mapped,
    careerProfileMode: "upload",
    targetRoles: prev.targetRoles,
    seniority: prev.seniority,
    targetCompanies: prev.targetCompanies,
    targetIndustries: prev.targetIndustries,
    jobTypes: prev.jobTypes,
    workplaceModes: prev.workplaceModes,
    preferredLocations: prev.preferredLocations,
    willingToRelocate: prev.willingToRelocate,
    workAuthorization: prev.workAuthorization,
    requiresSponsorship: prev.requiresSponsorship,
    salaryPreference: prev.salaryPreference,
  };
}
