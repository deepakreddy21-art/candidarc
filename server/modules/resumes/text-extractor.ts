/**
 * Deterministic résumé text normalization helpers.
 * PDF/DOCX byte parsing for onboarding is owned by the Python FastAPI service.
 * This module must not import pdf-parse.
 */

export type ResumeExtractionSection = {
  contact?: {
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedIn?: string;
    github?: string;
    portfolio?: string;
  };
  employment: Array<{
    title?: string;
    company?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    bullets: string[];
  }>;
  education: Array<{
    institution?: string;
    degree?: string;
    field?: string;
    endDate?: string;
  }>;
  projects: Array<{
    name?: string;
    description?: string;
    technologies: string[];
  }>;
  skills: string[];
  certifications: string[];
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

  const skills = (sections.skills ?? [])
    .flatMap((line) => line.split(/[,•|/]/))
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 60);

  const employment = chunkExperience(sections.experience ?? []);
  const education = chunkEducation(sections.education ?? []);
  const projects = chunkProjects(sections.projects ?? []);

  const evidence = employment.slice(0, 5).map((job) => ({
    title: [job.title, job.company].filter(Boolean).join(" @ ") || "Experience",
    summary: job.bullets.slice(0, 3).join(" "),
    technologies: skills.slice(0, 8),
  }));

  const usable = Boolean(
    employment.length ||
      projects.length ||
      (education.length && skills.length) ||
      ((sections.certifications?.length ?? 0) > 0 && (lines[0] || skills.length)),
  );

  return {
    contact: {
      fullName: lines.find((line) => !EMAIL_RE.test(line) && !matchHeader(line) && line.length < 80),
      email: emails[0],
      phone: phones[0],
      location: undefined,
      linkedIn,
      github,
      portfolio,
    },
    employment,
    education,
    projects,
    skills: [...new Set(skills)],
    certifications: (sections.certifications ?? []).slice(0, 20),
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
  };
}

function chunkExperience(lines: string[]) {
  const jobs: ResumeExtractionSection["employment"] = [];
  let current: ResumeExtractionSection["employment"][number] | null = null;

  for (const line of lines) {
    const isBullet = /^[-•*●]/.test(line) || /^\d+[.)]/.test(line);
    const dateMatch = line.match(DATE_RANGE_RE);
    if (isBullet) {
      if (!current) current = { bullets: [] };
      current.bullets.push(line.replace(/^[-•*●\d.)]+\s*/, ""));
      continue;
    }
    if (dateMatch && current && !current.startDate) {
      current.startDate = dateMatch[1];
      current.endDate = dateMatch[2];
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
        bullets: [],
      };
      continue;
    }
    if (!current) current = { bullets: [] };
    current.bullets.push(line);
  }
  if (current) jobs.push(current);
  return jobs.filter((job) => job.title || job.company || job.bullets.length);
}

function chunkEducation(lines: string[]) {
  return lines.slice(0, 12).map((line) => {
    const parts = line.split(/\s+[|,—-]\s+/);
    return {
      institution: parts[0],
      degree: parts[1],
      field: parts[2],
    };
  });
}

function chunkProjects(lines: string[]) {
  const projects: ResumeExtractionSection["projects"] = [];
  let current: ResumeExtractionSection["projects"][number] | null = null;
  for (const line of lines) {
    if (/^[-•*]/.test(line)) {
      if (!current) current = { technologies: [], description: "" };
      current.description = `${current.description ?? ""} ${line.replace(/^[-•*]+\s*/, "")}`.trim();
      continue;
    }
    if (current) projects.push(current);
    current = { name: line, description: "", technologies: [] };
  }
  if (current) projects.push(current);
  return projects;
}
