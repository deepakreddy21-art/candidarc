import type { ResumeExtractionSection } from "./text-extractor";

/** Map Python /v1/resumes/parse structured response into onboarding extraction shape. */
export function mapPythonResumeParseToExtraction(parsed: {
  text: string;
  page_count?: number | null;
  warnings?: string[];
  contact?: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    linkedin?: string | null;
    github?: string | null;
    portfolio?: string | null;
  } | null;
  employment?: Array<{
    title?: string | null;
    employer?: string | null;
    location?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    bullets?: string[];
  }>;
  education?: Array<{
    institution?: string | null;
    degree?: string | null;
    field?: string | null;
    end_date?: string | null;
  }>;
  projects?: Array<{
    name?: string | null;
    description?: string | null;
    technologies?: string[];
  }>;
  skills?: string[];
  certifications?: string[];
  evidence?: Array<{ title: string; summary: string; technologies?: string[] }>;
  extraction_quality?: "high" | "medium" | "low" | null;
  missing_fields?: string[];
  usable?: boolean | null;
}): ResumeExtractionSection & {
  pageCount?: number;
  extractionQuality?: "high" | "medium" | "low";
  missingFields?: string[];
  usable?: boolean;
  errorCode?: string;
} {
  const contact = parsed.contact;
  return {
    contact: {
      fullName: contact?.full_name ?? undefined,
      email: contact?.email ?? undefined,
      phone: contact?.phone ?? undefined,
      location: contact?.location ?? undefined,
      linkedIn: contact?.linkedin ?? undefined,
      github: contact?.github ?? undefined,
      portfolio: contact?.portfolio ?? undefined,
    },
    employment: (parsed.employment ?? []).map((job) => ({
      title: job.title ?? undefined,
      company: job.employer ?? undefined,
      location: job.location ?? undefined,
      startDate: job.start_date ?? undefined,
      endDate: job.end_date ?? undefined,
      bullets: job.bullets ?? [],
    })),
    education: (parsed.education ?? []).map((row) => ({
      institution: row.institution ?? undefined,
      degree: row.degree ?? undefined,
      field: row.field ?? undefined,
      endDate: row.end_date ?? undefined,
    })),
    projects: (parsed.projects ?? []).map((project) => ({
      name: project.name ?? undefined,
      description: project.description ?? undefined,
      technologies: project.technologies ?? [],
    })),
    skills: parsed.skills ?? [],
    certifications: parsed.certifications ?? [],
    evidence: (parsed.evidence ?? []).map((item) => ({
      title: item.title,
      summary: item.summary,
      technologies: item.technologies ?? [],
    })),
    rawText: parsed.text.slice(0, 50_000),
    parseWarnings: parsed.warnings ?? [],
    pageCount: parsed.page_count ?? undefined,
    extractionQuality: parsed.extraction_quality ?? undefined,
    missingFields: parsed.missing_fields ?? [],
    usable: parsed.usable ?? undefined,
  };
}
