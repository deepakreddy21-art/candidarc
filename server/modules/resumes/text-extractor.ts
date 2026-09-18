/**
 * Deterministic résumé text normalization helpers.
 * PDF/DOCX byte parsing for onboarding is owned by the Python FastAPI service.
 * This module must not import pdf-parse.
 */

export type ExtractionProvenance = {
  sourceText?: string;
  pageNumber?: number;
  locationHint?: string;
  confidence?: "high" | "medium" | "low";
  warnings?: string[];
  extractedOrNormalized?: "extracted" | "normalized";
};

export type ResumeCertificationEntry = {
  name: string;
  issuer?: string;
  issueDate?: string;
  expirationDate?: string;
  credentialId?: string;
  credentialUrl?: string;
  provenance?: ExtractionProvenance;
};

export type ResumePublicationEntry = {
  title: string;
  authors?: string[];
  publisher?: string;
  publicationDate?: string;
  doi?: string;
  url?: string;
  description?: string;
  provenance?: ExtractionProvenance;
};

export type ResumeExtractionSection = {
  schemaVersion?: 1 | 2;
  contact?: {
    fullName?: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    email?: string;
    emails?: string[];
    phone?: string;
    phones?: string[];
    location?: string;
    linkedIn?: string;
    github?: string;
    portfolio?: string;
    otherUrls?: string[];
    provenance?: ExtractionProvenance;
  };
  professionalSummary?: string;
  employment: Array<{
    title?: string;
    company?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
    bullets: string[];
    technologies?: string[];
    sourceOrder?: number;
    provenance?: ExtractionProvenance;
  }>;
  education: Array<{
    institution?: string;
    degree?: string;
    field?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    gpa?: string;
    honors?: string;
    provenance?: ExtractionProvenance;
  }>;
  projects: Array<{
    name?: string;
    role?: string;
    organization?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
    bullets?: string[];
    technologies: string[];
    url?: string;
    repoUrl?: string;
    provenance?: ExtractionProvenance;
  }>;
  skills: string[];
  skillGroups?: Array<{ category: string; skills: string[] }>;
  /** Legacy string certifications — prefer certificationEntries. */
  certifications: string[];
  certificationEntries?: ResumeCertificationEntry[];
  publications?: ResumePublicationEntry[];
  evidence: Array<{
    title: string;
    summary: string;
    technologies: string[];
  }>;
  rawText: string;
  parseWarnings: string[];
  pageCount?: number;
  extractionQuality?: "high" | "medium" | "low";
  missingFields?: string[];
  usable?: boolean;
  errorCode?: string;
  error?: string;
};

/** Adapt persisted v1 extractions into the v2 shape without inventing fields. */
export function adaptResumeExtractionV1ToV2(
  extraction: ResumeExtractionSection | Record<string, unknown> | null | undefined,
): ResumeExtractionSection | null {
  if (!extraction || typeof extraction !== "object") return null;
  const raw = extraction as ResumeExtractionSection & { error?: string; errorCode?: string };
  if (raw.error && !raw.employment && !raw.skills) {
    return {
      schemaVersion: 2,
      contact: {},
      employment: [],
      education: [],
      projects: [],
      skills: [],
      certifications: [],
      publications: [],
      evidence: [],
      rawText: "",
      parseWarnings: [],
      error: raw.error,
      errorCode: raw.errorCode,
    };
  }

  const certEntries =
    raw.certificationEntries ??
    (raw.certifications ?? []).map((name) =>
      typeof name === "string" ? { name } : { name: String((name as { name?: string })?.name ?? "") },
    );

  const normalized: ResumeExtractionSection = {
    ...raw,
    schemaVersion: raw.schemaVersion === 2 ? 2 : 2,
    contact: {
      ...(raw.contact ?? {}),
      emails: raw.contact?.emails ?? (raw.contact?.email ? [raw.contact.email] : []),
      phones: raw.contact?.phones ?? (raw.contact?.phone ? [raw.contact.phone] : []),
      otherUrls: raw.contact?.otherUrls ?? [],
    },
    professionalSummary: raw.professionalSummary,
    employment: (raw.employment ?? []).map((job, index) => ({
      ...job,
      bullets: job.bullets ?? [],
      technologies: job.technologies ?? [],
      sourceOrder: job.sourceOrder ?? index,
    })),
    education: raw.education ?? [],
    projects: (raw.projects ?? []).map((project) => ({
      ...project,
      bullets: project.bullets ?? (project.description ? [project.description] : []),
      technologies: project.technologies ?? [],
    })),
    skills: raw.skills ?? [],
    skillGroups: raw.skillGroups ?? [],
    certifications:
      raw.certifications?.length > 0
        ? raw.certifications
        : certEntries.map((c) => c.name).filter(Boolean),
    certificationEntries: certEntries.filter((c) => c.name?.trim()),
    publications: raw.publications ?? [],
    evidence: raw.evidence ?? [],
    rawText: raw.rawText ?? "",
    parseWarnings: raw.parseWarnings ?? [],
  };

  if (!normalized.contact.email) {
    const fromEmails = normalized.contact.emails.find((value) => typeof value === "string" && value.includes("@"));
    const fromRaw = normalized.rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
    const email = fromEmails?.trim() || fromRaw?.trim();
    if (email) {
      normalized.contact.email = email;
      if (!normalized.contact.emails.length) normalized.contact.emails = [email];
    }
  }

  return normalized;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;
const LINKEDIN_RE = /(?:linkedin\.com\/in\/[\w-]+)/gi;
const GITHUB_RE = /(?:github\.com\/[\w-]+)/gi;
const URL_RE = /https?:\/\/[^\s)]+/gi;
const DATE_RANGE_RE =
  /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4})\s*[-–—to]+\s*(Present|Current|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4})/i;

const SECTION_ALIASES: Record<string, string[]> = {
  experience: [
    "experience",
    "work experience",
    "professional experience",
    "employment",
    "employment history",
    "career experience",
    "relevant experience",
    "work history",
    "professional history",
  ],
  education: ["education", "academic background", "academics"],
  projects: ["projects", "personal projects", "selected projects", "side projects"],
  skills: ["skills", "technical skills", "core skills", "technologies", "tech stack"],
  certifications: ["certifications", "certificates", "licenses"],
  publications: ["publications", "papers", "research", "selected publications"],
  summary: ["summary", "professional summary", "profile", "about", "objective"],
};

function matchHeader(line: string): string | null {
  const cleaned = line
    .toLowerCase()
    .replace(/[^a-z &/]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length > 48) return null;
  for (const [canonical, aliases] of Object.entries(SECTION_ALIASES)) {
    if (aliases.includes(cleaned)) return canonical;
  }
  return null;
}

/** Structure plain résumé text — used by unit tests and as a local normalizer only. */
export function normalizeResumeText(text: string, warnings: string[] = []): ResumeExtractionSection {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const joined = lines.join("\n");
  const emails = joined.match(EMAIL_RE) ?? [];
  const phones = joined.match(PHONE_RE) ?? [];
  const linkedIn = joined.match(LINKEDIN_RE)?.[0];
  const github = joined.match(GITHUB_RE)?.[0];
  const urls = joined.match(URL_RE) ?? [];
  const portfolio = urls.find((u) => !/linkedin|github/i.test(u));

  const sections: Record<string, string[]> = { header: [] };
  let current = "header";
  for (const line of lines) {
    const header = matchHeader(line);
    if (header) {
      current = header;
      sections[current] = [];
      continue;
    }
    (sections[current] ??= []).push(line);
  }

  const skillLines = sections.skills ?? [];
  const skills: string[] = [];
  for (const line of skillLines) {
    if (line.includes(":") && line.split(":", 1)[0]!.length < 40) {
      const rest = line.split(":").slice(1).join(":");
      for (const s of rest.split(/[,•|/]/)) {
        const token = s.trim();
        if (token.length > 1 && token.length < 60) skills.push(token);
      }
      continue;
    }
    for (const s of line.split(/[,•|/]/)) {
      const token = s.trim();
      if (token.length > 1 && token.length < 60) skills.push(token);
    }
  }

  const employment = chunkExperience(sections.experience ?? []);
  const education = chunkEducation(sections.education ?? []);
  const projects = chunkProjects(sections.projects ?? []);
  const certifications = (sections.certifications ?? []).slice(0, 20);

  const evidence = employment.slice(0, 5).map((job) => ({
    title: [job.title, job.company].filter(Boolean).join(" @ ") || "Experience",
    summary: job.bullets.slice(0, 3).join(" "),
    technologies: job.technologies ?? [],
  }));

  const usable = Boolean(
    employment.length ||
      projects.length ||
      (education.length && skills.length) ||
      (certifications.length > 0 && (lines[0] || skills.length)),
  );

  return adaptResumeExtractionV1ToV2({
    schemaVersion: 2,
    contact: {
      fullName: lines.find((line) => !EMAIL_RE.test(line) && !matchHeader(line) && line.length < 80),
      email: emails[0],
      phone: phones[0],
      location: undefined,
      linkedIn,
      github,
      portfolio,
    },
    professionalSummary: (sections.summary ?? []).join("\n") || undefined,
    employment,
    education,
    projects,
    skills: [...new Set(skills)],
    certifications,
    certificationEntries: certifications.map((name) => ({ name })),
    publications: (sections.publications ?? []).map((line) => ({ title: line, description: line })),
    evidence,
    rawText: joined.slice(0, 50_000),
    parseWarnings: warnings,
    usable,
    missingFields: [
      ...(employment.length ? [] : ["employment"]),
      ...(education.length ? [] : ["education"]),
      ...(skills.length ? [] : ["skills"]),
      ...(emails[0] ? [] : ["email"]),
    ],
    extractionQuality: employment.length && skills.length ? "high" : usable ? "medium" : "low",
  })!;
}

function chunkExperience(lines: string[]) {
  const jobs: ResumeExtractionSection["employment"] = [];
  let current: ResumeExtractionSection["employment"][number] | null = null;

  for (const line of lines) {
    const isBullet = /^[-•*●]/.test(line) || /^\d+[.)]/.test(line);
    const dateMatch = line.match(DATE_RANGE_RE);
    if (isBullet) {
      if (!current) current = { bullets: [], technologies: [] };
      current.bullets.push(line.replace(/^[-•*●\d.)]+\s*/, ""));
      continue;
    }
    if (dateMatch && current && !current.startDate) {
      current.startDate = dateMatch[1];
      current.endDate = dateMatch[2];
      current.isCurrent = /^(present|current)$/i.test(dateMatch[2] ?? "");
      continue;
    }
    if (!isBullet && line.length < 140) {
      if (current) jobs.push(current);
      const parts = line.split(/\s+[|@]\s+|\s+[-–—]\s+/);
      current = {
        title: parts[0],
        company: parts[1],
        location: parts[2],
        startDate: dateMatch?.[1],
        endDate: dateMatch?.[2],
        isCurrent: dateMatch?.[2] ? /^(present|current)$/i.test(dateMatch[2]) : undefined,
        bullets: [],
        technologies: [],
        sourceOrder: jobs.length,
      };
      continue;
    }
    if (!current) current = { bullets: [], technologies: [] };
    current.bullets.push(line);
  }
  if (current) jobs.push(current);
  return jobs.filter((job) => job.title || job.company || job.bullets.length);
}

function chunkEducation(lines: string[]) {
  const yearRe = /\b(19|20)\d{2}\b/;
  return lines.slice(0, 20).map((line) => {
    const parts = line.split(/\s+[|,—-]\s+/).map((p) => p.trim()).filter(Boolean);
    let endDate: string | undefined;
    if (parts.length && yearRe.test(parts[parts.length - 1]!)) {
      endDate = parts.pop();
    }
    let degree: string | undefined;
    let institution: string | undefined;
    let field: string | undefined;
    if (parts.length >= 2 && /B\.?S\.?|B\.?A\.?|M\.?S\.?|Bachelor|Master/i.test(parts[0]!)) {
      degree = parts[0];
      institution = parts[1];
      field = parts[2];
    } else if (parts.length >= 2) {
      institution = parts[0];
      degree = parts[1];
      field = parts[2];
    } else {
      institution = parts[0] ?? line;
    }
    return { institution, degree, field, endDate };
  });
}

function chunkProjects(lines: string[]) {
  const projects: ResumeExtractionSection["projects"] = [];
  let current: ResumeExtractionSection["projects"][number] | null = null;
  for (const line of lines) {
    if (/^[-•*]/.test(line)) {
      if (!current) current = { name: undefined, description: "", technologies: [], bullets: [] };
      const desc = line.replace(/^[-•*]+\s*/, "");
      current.bullets = [...(current.bullets ?? []), desc];
      current.description = [current.description, desc].filter(Boolean).join(" ").trim();
      continue;
    }
    if (current) projects.push(current);
    current = { name: line, description: "", technologies: [], bullets: [] };
  }
  if (current) projects.push(current);
  return projects;
}
