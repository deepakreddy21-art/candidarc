export const ONBOARDING_STEPS = [
  {
    id: 0,
    title: "What kind of role are you looking for?",
    panel: "Tell us how you want to work. CandidArc uses this to focus Jobs and recommendations.",
  },
  {
    id: 1,
    title: "Start with what you already have",
    panel: "Upload a résumé or build without one. This is the evidence CandidArc can safely use when tailoring.",
  },
  {
    id: 2,
    title: "Your profile, ready for your next move",
    panel:
      "When you choose a job, CandidArc uses posting requirements and public team signals to prioritize your real experience—never to invent claims.",
  },
] as const;

export const ROLE_SUGGESTIONS = [
  "Software Engineer",
  "Senior Software Engineer",
  "Full-Stack Engineer",
  "Backend Engineer",
  "Frontend Engineer",
  "Platform Engineer",
  "ML Engineer",
  "Data Engineer",
  "Product Manager",
  "Engineering Manager",
];

export const LOCATION_SUGGESTIONS = [
  "Remote",
  "San Francisco, CA",
  "New York, NY",
  "Austin, TX",
  "Seattle, WA",
  "Chicago, IL",
  "Boston, MA",
  "Los Angeles, CA",
];

export const INDUSTRY_SUGGESTIONS = [
  "AI / ML",
  "Enterprise software",
  "Fintech",
  "Healthcare",
  "Consumer",
  "Infrastructure",
  "Cybersecurity",
  "Climate",
];

export const SENIORITY_OPTIONS = [
  { value: "internship", label: "Internship" },
  { value: "entry", label: "Entry level" },
  { value: "mid", label: "Mid-level" },
  { value: "senior", label: "Senior" },
  { value: "staff", label: "Staff" },
  { value: "lead", label: "Lead" },
  { value: "executive", label: "Executive" },
] as const;

export const JOB_TYPE_OPTIONS = [
  { value: "full-time", label: "Full-time" },
  { value: "contract", label: "Contract" },
  { value: "part-time", label: "Part-time" },
  { value: "internship", label: "Internship" },
] as const;

export const WORKPLACE_OPTIONS = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "on-site", label: "On-site" },
] as const;

export type EmploymentDraft = {
  title?: string;
  company?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  bullets?: string[];
  technologies?: string[];
};

export type ProjectDraft = {
  name?: string;
  role?: string;
  organization?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  bullets?: string[];
  technologies?: string[];
  url?: string;
  repoUrl?: string;
};

export type PublicationDraft = {
  title?: string;
  authors?: string[];
  publisher?: string;
  publicationDate?: string;
  doi?: string;
  url?: string;
  description?: string;
};

export type OnboardingFormState = {
  targetRoles: string[];
  seniority: string;
  targetCompanies: string[];
  targetIndustries: string[];
  jobTypes: string[];
  workplaceModes: string[];
  preferredLocations: string[];
  willingToRelocate: boolean | null;
  workAuthorization: string;
  requiresSponsorship: boolean | null;
  salaryPreference: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedIn: string;
  github: string;
  portfolio: string;
  headline: string;
  summary: string;
  skills: string[];
  employment: EmploymentDraft[];
  projects: ProjectDraft[];
  education: Array<{
    school?: string;
    degree?: string;
    field?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    gpa?: string;
    honors?: string;
  }>;
  certifications: Array<{
    name: string;
    issuer?: string;
    date?: string;
    expirationDate?: string;
    credentialId?: string;
    credentialUrl?: string;
  }>;
  publications: PublicationDraft[];
  lowConfidenceCount: number;
  careerProfileMode: "upload" | "manual" | "";
  evidenceNotes: string;
};

export function emptyOnboardingForm(): OnboardingFormState {
  return {
    targetRoles: [],
    seniority: "",
    targetCompanies: [],
    targetIndustries: [],
    jobTypes: [],
    workplaceModes: [],
    preferredLocations: [],
    willingToRelocate: null,
    workAuthorization: "",
    requiresSponsorship: null,
    salaryPreference: "",
    fullName: "",
    email: "",
    phone: "",
    location: "",
    linkedIn: "",
    github: "",
    portfolio: "",
    headline: "",
    summary: "",
    skills: [],
    employment: [],
    projects: [],
    education: [],
    certifications: [],
    publications: [],
    lowConfidenceCount: 0,
    careerProfileMode: "",
    evidenceNotes: "",
  };
}

export function normalizeList(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export function formToPayload(form: OnboardingFormState): Record<string, unknown> {
  return {
    onboardingFlowVersion: 3,
    targetRoles: normalizeList(form.targetRoles),
    seniority: form.seniority || null,
    targetCompanies: normalizeList(form.targetCompanies),
    targetIndustries: normalizeList(form.targetIndustries),
    jobTypes: form.jobTypes,
    workplaceModes: form.workplaceModes,
    preferredLocations: normalizeList(form.preferredLocations),
    willingToRelocate: form.willingToRelocate,
    workAuthorization: form.workAuthorization.trim() || null,
    requiresSponsorship: form.requiresSponsorship,
    salaryPreference: form.salaryPreference.trim() || null,
    fullName: form.fullName.trim() || undefined,
    email: form.email.trim(),
    phone: form.phone.trim() || null,
    location: form.location.trim() || null,
    linkedIn: form.linkedIn.trim() || null,
    github: form.github.trim() || null,
    portfolio: form.portfolio.trim() || null,
    headline: form.headline.trim() || null,
    summary: form.summary.trim() || null,
    skills: normalizeList(form.skills),
    employment: form.employment,
    projects: form.projects,
    education: form.education,
    certifications: form.certifications,
    publications: form.publications,
    careerProfileMode: form.careerProfileMode || undefined,
    evidenceNotes: form.evidenceNotes.trim() || undefined,
  };
}

/** Send only changed fields, so untouched/empty controls cannot erase a newer import. */
export function formToPatch(form: OnboardingFormState, baseline: OnboardingFormState): Record<string, unknown> {
  const next = formToPayload(form);
  const previous = formToPayload(baseline);
  return Object.fromEntries(Object.entries(next).filter(([key, value]) =>
    key === "onboardingFlowVersion" || JSON.stringify(value) !== JSON.stringify(previous[key]),
  ));
}

export function validateStepClient(
  step: number,
  form: OnboardingFormState,
  importStatus?: string | null,
): string | null {
  if (step === 0) {
    if (!normalizeList(form.targetRoles).length) return "Add at least one target role";
    if (!form.seniority) return "Select a seniority level";
    if (!form.jobTypes.length) return "Select at least one job type";
    if (!form.workplaceModes.length) return "Select at least one workplace mode";
  }
  if (step === 1) {
    if (["pending_scan", "scan_clean", "extracting"].includes(importStatus ?? "")) {
      return "Wait for résumé import to finish, or choose Enter manually";
    }
    if (!form.fullName.trim()) return "Add your name";
    if (!form.email.trim()) return "Add your résumé contact email";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Enter a valid email";
    if (!form.phone.trim()) return "Add your phone number";
    if (!form.location.trim()) return "Add your current location";
    // Import ready for review: contact is complete; employment may already be extracted.
    if (importStatus === "ready_for_review" || importStatus === "confirmed") return null;
    const hasEmployment = form.employment.some((row) => row.title?.trim() || row.company?.trim());
    const hasSkills = normalizeList(form.skills).length > 0;
    const hasEducation = form.education.some((row) => row.school?.trim() || row.degree?.trim());
    const hasCerts = form.certifications.some((row) => row.name?.trim());
    const hasProjects = form.projects.some((row) => row.name?.trim());
    const hasNotes = Boolean(form.evidenceNotes.trim());
    if (hasEmployment || hasSkills || hasEducation || hasCerts || hasProjects || hasNotes) return null;
    return "Add employment, projects, education, skills, or upload a resume";
  }
  return null;
}
