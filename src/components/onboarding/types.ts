export const ONBOARDING_STEPS = [
  {
    id: 0,
    title: "What roles are you targeting?",
    panel:
      "Tell us where you want to go. CandidArc will use this to focus your Job Radar and resume recommendations.",
  },
  {
    id: 1,
    title: "Where and how do you want to work?",
    panel: "These preferences remove irrelevant jobs before they reach your Radar.",
  },
  {
    id: 2,
    title: "Build your career profile",
    panel: "Your career profile is the evidence CandidArc can safely use when tailoring a resume.",
  },
  {
    id: 3,
    title: "Review what CandidArc can use",
    panel:
      "When you choose a job, CandidArc analyzes its requirements and public company or team signals—such as likely technologies, initiatives and hiring patterns. Those signals help prioritize your real experience. They never become claims about you unless your career evidence supports them.",
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
  bullets?: string[];
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
  education: Array<{ school?: string; degree?: string; field?: string; endDate?: string }>;
  certifications: Array<{ name: string; issuer?: string; date?: string }>;
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
    education: [],
    certifications: [],
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
    education: form.education,
    certifications: form.certifications,
    careerProfileMode: form.careerProfileMode || undefined,
    evidenceNotes: form.evidenceNotes.trim() || undefined,
  };
}

export function validateStepClient(
  step: number,
  form: OnboardingFormState,
  importStatus?: string | null,
): string | null {
  if (step === 0) {
    if (!normalizeList(form.targetRoles).length) return "Add at least one target role";
    if (!form.seniority) return "Select a seniority level";
  }
  if (step === 1) {
    if (!form.jobTypes.length) return "Select at least one job type";
    if (!form.workplaceModes.length) return "Select at least one workplace mode";
  }
  if (step === 2) {
    if (importStatus === "confirmed" || importStatus === "ready_for_review") return null;
    if (["pending_scan", "scan_clean", "extracting"].includes(importStatus ?? "")) {
      return "Wait for résumé import to finish, or choose Enter manually";
    }
    if (!form.fullName.trim()) return "Add your name";
    const hasEmployment = form.employment.some((row) => row.title?.trim() || row.company?.trim());
    const hasSkills = normalizeList(form.skills).length > 0;
    const hasEducation = form.education.some((row) => row.school?.trim() || row.degree?.trim());
    const hasCerts = form.certifications.some((row) => row.name?.trim());
    const hasNotes = Boolean(form.evidenceNotes.trim());
    if (hasEmployment || hasSkills || hasEducation || hasCerts || hasNotes) return null;
    return "Add employment, education, skills, or upload a resume";
  }
  return null;
}
