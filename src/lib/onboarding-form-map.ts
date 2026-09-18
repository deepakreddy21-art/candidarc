import { emptyOnboardingForm, type OnboardingFormState } from "@/components/onboarding/types";
import type { CandidateProfile, ResumeImportExtraction } from "@/types/domain";

function lowConfidenceCount(extraction: ResumeImportExtraction | null): number {
  if (!extraction) return 0;
  let count = 0;
  const missing = extraction.missingFields ?? [];
  count += missing.length;
  for (const job of extraction.employment ?? []) {
    if (!job.title || !job.company) count += 1;
  }
  if (extraction.extractionQuality === "low") count += 1;
  return count;
}

function preferredContactEmail(
  extraction: ResumeImportExtraction | null,
  fallback = "",
): string {
  const contact = extraction?.contact ?? {};
  const fromContact =
    contact.email?.trim() ||
    (Array.isArray(contact.emails)
      ? contact.emails.find((value) => typeof value === "string" && value.includes("@"))?.trim()
      : undefined);
  if (fromContact) return fromContact;
  const raw = `${extraction?.rawText ?? ""} ${extraction?.professionalSummary ?? ""}`;
  const fromRaw = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (fromRaw) return fromRaw.trim();
  // Prefer leaving blank over an account signup address when career extraction is present
  // but contact.email was omitted — callers can still pass fallback explicitly.
  return fallback;
}

export function profileToForm(
  profile: CandidateProfile,
  extraction: ResumeImportExtraction | null,
): OnboardingFormState {
  const base = emptyOnboardingForm();
  const contact = extraction?.contact ?? {};
  const certEntries: Array<{
    name: string;
    issuer?: string;
    issueDate?: string;
    expirationDate?: string;
    credentialId?: string;
    credentialUrl?: string;
  }> =
    extraction?.certificationEntries?.length
      ? extraction.certificationEntries
      : (extraction?.certifications ?? []).map((name) => ({ name: typeof name === "string" ? name : "" }));

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
    fullName: contact.fullName?.trim() || profile.fullName || "",
    email: preferredContactEmail(
      extraction,
      extraction && (extraction.employment?.length || extraction.contact?.fullName || extraction.rawText)
        ? ""
        : profile.email || "",
    ),
    phone: contact.phone?.trim() || profile.phone || "",
    location: contact.location?.trim() || profile.location || "",
    linkedIn: contact.linkedIn?.trim() || profile.linkedIn || "",
    github: contact.github?.trim() || profile.github || "",
    portfolio: contact.portfolio?.trim() || profile.portfolio || "",
    headline: profile.headline || "",
    summary: extraction?.professionalSummary?.trim() || profile.summary || "",
    skills: Array.isArray(extraction?.skills) ? extraction!.skills.filter(Boolean) : [],
    employment: (extraction?.employment ?? []).map((row) => ({
      title: row.title,
      company: row.company,
      location: row.location,
      startDate: row.startDate,
      endDate: row.endDate,
      isCurrent: row.isCurrent,
      bullets: row.bullets ?? [],
      technologies: row.technologies ?? [],
    })),
    projects: (extraction?.projects ?? []).map((row) => ({
      name: row.name,
      role: row.role,
      organization: row.organization,
      startDate: row.startDate,
      endDate: row.endDate,
      description: row.description,
      bullets: row.bullets ?? (row.description ? [row.description] : []),
      technologies: row.technologies ?? [],
      url: row.url,
      repoUrl: row.repoUrl,
    })),
    education: (extraction?.education ?? []).map((row) => ({
      school: row.institution,
      degree: row.degree,
      field: row.field,
      location: row.location,
      startDate: row.startDate,
      endDate: row.endDate,
      gpa: row.gpa,
      honors: row.honors,
    })),
    certifications: certEntries
      .filter((row) => row.name?.trim())
      .map((row) => ({
        name: row.name,
        issuer: row.issuer,
        date: row.issueDate,
        expirationDate: row.expirationDate,
        credentialId: row.credentialId,
        credentialUrl: row.credentialUrl,
      })),
    publications: (extraction?.publications ?? []).map((row) => ({
      title: row.title,
      authors: row.authors ?? [],
      publisher: row.publisher,
      publicationDate: row.publicationDate,
      doi: row.doi,
      url: row.url,
      description: row.description,
    })),
    lowConfidenceCount: lowConfidenceCount(extraction),
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
