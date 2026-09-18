import {
  adaptResumeExtractionV1ToV2,
  type ExtractionProvenance,
  type ResumeExtractionSection,
} from "./text-extractor";

type PythonProvenance = {
  source_text?: string | null;
  page_number?: number | null;
  location_hint?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  warnings?: string[];
  extracted_or_normalized?: "extracted" | "normalized" | null;
};

function mapProvenance(raw?: PythonProvenance | null): ExtractionProvenance | undefined {
  if (!raw) return undefined;
  return {
    sourceText: raw.source_text ?? undefined,
    pageNumber: raw.page_number ?? undefined,
    locationHint: raw.location_hint ?? undefined,
    confidence: raw.confidence ?? undefined,
    warnings: raw.warnings ?? [],
    extractedOrNormalized: raw.extracted_or_normalized ?? undefined,
  };
}

/** Map Python /v1/resumes/parse structured response into onboarding extraction shape. */
export function mapPythonResumeParseToExtraction(parsed: {
  schema_version?: number;
  text: string;
  page_count?: number | null;
  warnings?: string[];
  contact?: {
    full_name?: string | null;
    first_name?: string | null;
    middle_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    emails?: string[];
    phone?: string | null;
    phones?: string[];
    location?: string | null;
    linkedin?: string | null;
    github?: string | null;
    portfolio?: string | null;
    other_urls?: string[];
    provenance?: PythonProvenance | null;
  } | null;
  professional_summary?: string | null;
  employment?: Array<{
    title?: string | null;
    employer?: string | null;
    location?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    is_current?: boolean | null;
    bullets?: string[];
    technologies?: string[];
    source_order?: number | null;
    provenance?: PythonProvenance | null;
  }>;
  education?: Array<{
    institution?: string | null;
    degree?: string | null;
    field?: string | null;
    location?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    gpa?: string | null;
    honors?: string | null;
    provenance?: PythonProvenance | null;
  }>;
  projects?: Array<{
    name?: string | null;
    role?: string | null;
    organization?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    description?: string | null;
    bullets?: string[];
    technologies?: string[];
    url?: string | null;
    repo_url?: string | null;
    provenance?: PythonProvenance | null;
  }>;
  skills?: string[];
  skill_groups?: Array<{ category: string; skills: string[] }>;
  certifications?: string[];
  certification_entries?: Array<{
    name: string;
    issuer?: string | null;
    issue_date?: string | null;
    expiration_date?: string | null;
    credential_id?: string | null;
    credential_url?: string | null;
    provenance?: PythonProvenance | null;
  }>;
  publications?: Array<{
    title: string;
    authors?: string[];
    publisher?: string | null;
    publication_date?: string | null;
    doi?: string | null;
    url?: string | null;
    description?: string | null;
    provenance?: PythonProvenance | null;
  }>;
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
  const rawText = parsed.text ?? "";
  const emailFromRaw = rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const email =
    contact?.email?.trim() ||
    contact?.emails?.find((value) => typeof value === "string" && value.includes("@"))?.trim() ||
    emailFromRaw ||
    undefined;
  const certificationEntries = (parsed.certification_entries ?? []).map((row) => ({
    name: row.name,
    issuer: row.issuer ?? undefined,
    issueDate: row.issue_date ?? undefined,
    expirationDate: row.expiration_date ?? undefined,
    credentialId: row.credential_id ?? undefined,
    credentialUrl: row.credential_url ?? undefined,
    provenance: mapProvenance(row.provenance),
  }));
  const legacyCerts =
    (parsed.certifications?.length ? parsed.certifications : certificationEntries.map((c) => c.name)).filter(Boolean);

  const mapped: ResumeExtractionSection = {
    schemaVersion: 2,
    contact: {
      fullName: contact?.full_name ?? undefined,
      firstName: contact?.first_name ?? undefined,
      middleName: contact?.middle_name ?? undefined,
      lastName: contact?.last_name ?? undefined,
      email,
      emails: contact?.emails?.length ? contact.emails : email ? [email] : [],
      phone: contact?.phone ?? undefined,
      phones: contact?.phones?.length ? contact.phones : contact?.phone ? [contact.phone] : [],
      location: contact?.location ?? undefined,
      linkedIn: contact?.linkedin ?? undefined,
      github: contact?.github ?? undefined,
      portfolio: contact?.portfolio ?? undefined,
      otherUrls: contact?.other_urls ?? [],
      provenance: mapProvenance(contact?.provenance),
    },
    professionalSummary: parsed.professional_summary ?? undefined,
    employment: (parsed.employment ?? []).map((job, index) => ({
      title: job.title ?? undefined,
      company: job.employer ?? undefined,
      location: job.location ?? undefined,
      startDate: job.start_date ?? undefined,
      endDate: job.end_date ?? undefined,
      isCurrent: job.is_current ?? undefined,
      bullets: job.bullets ?? [],
      technologies: job.technologies ?? [],
      sourceOrder: job.source_order ?? index,
      provenance: mapProvenance(job.provenance),
    })),
    education: (parsed.education ?? []).map((row) => ({
      institution: row.institution ?? undefined,
      degree: row.degree ?? undefined,
      field: row.field ?? undefined,
      location: row.location ?? undefined,
      startDate: row.start_date ?? undefined,
      endDate: row.end_date ?? undefined,
      gpa: row.gpa ?? undefined,
      honors: row.honors ?? undefined,
      provenance: mapProvenance(row.provenance),
    })),
    projects: (parsed.projects ?? []).map((project) => ({
      name: project.name ?? undefined,
      role: project.role ?? undefined,
      organization: project.organization ?? undefined,
      startDate: project.start_date ?? undefined,
      endDate: project.end_date ?? undefined,
      description: project.description ?? undefined,
      bullets: project.bullets ?? [],
      technologies: project.technologies ?? [],
      url: project.url ?? undefined,
      repoUrl: project.repo_url ?? undefined,
      provenance: mapProvenance(project.provenance),
    })),
    skills: parsed.skills ?? [],
    skillGroups: (parsed.skill_groups ?? []).map((g) => ({
      category: g.category,
      skills: g.skills ?? [],
    })),
    certifications: legacyCerts,
    certificationEntries,
    publications: (parsed.publications ?? []).map((row) => ({
      title: row.title,
      authors: row.authors ?? [],
      publisher: row.publisher ?? undefined,
      publicationDate: row.publication_date ?? undefined,
      doi: row.doi ?? undefined,
      url: row.url ?? undefined,
      description: row.description ?? undefined,
      provenance: mapProvenance(row.provenance),
    })),
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

  return adaptResumeExtractionV1ToV2(mapped)!;
}
