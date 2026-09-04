import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

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
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;
const LINKEDIN_RE = /(?:linkedin\.com\/in\/[\w-]+)/gi;
const GITHUB_RE = /(?:github\.com\/[\w-]+)/gi;
const URL_RE = /https?:\/\/[^\s)]+/gi;

export async function extractTextFromResume(
  buffer: Buffer,
  mimeType: string,
): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];
  if (mimeType === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      await parser.destroy();
      if (!parsed.text?.trim()) {
        warnings.push("PDF parsed but contained no extractable text");
      }
      return { text: parsed.text ?? "", warnings };
    } catch (err) {
      await parser.destroy().catch(() => undefined);
      throw new Error(`PDF parse failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      if (result.messages.length) {
        warnings.push(...result.messages.map((m) => m.message));
      }
      if (!result.value.trim()) {
        warnings.push("DOCX parsed but contained no extractable text");
      }
      return { text: result.value, warnings };
    } catch (err) {
      throw new Error(`DOCX parse failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  throw new Error(`Unsupported mime type: ${mimeType}`);
}

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

  const sectionHeaders = [
    "experience",
    "work experience",
    "employment",
    "education",
    "projects",
    "skills",
    "certifications",
    "summary",
  ];

  const sections: Record<string, string[]> = {};
  let current = "header";
  sections[current] = [];

  for (const line of lines) {
    const lower = line.toLowerCase().replace(/[^a-z ]/g, "").trim();
    const header = sectionHeaders.find((h) => lower === h || lower.startsWith(`${h} `));
    if (header) {
      current = header;
      sections[current] = [];
      continue;
    }
    (sections[current] ??= []).push(line);
  }

  const skills = (sections.skills ?? [])
    .flatMap((line) => line.split(/[,•|]/))
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 60);

  const employment = chunkExperience(sections.experience ?? sections["work experience"] ?? sections.employment ?? []);
  const education = chunkEducation(sections.education ?? []);
  const projects = chunkProjects(sections.projects ?? []);

  const evidence = employment.slice(0, 5).map((job) => ({
    title: [job.title, job.company].filter(Boolean).join(" @ ") || "Experience",
    summary: job.bullets.slice(0, 3).join(" "),
    technologies: skills.slice(0, 8),
  }));

  return {
    contact: {
      fullName: lines[0],
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
  };
}

function chunkExperience(lines: string[]) {
  const jobs: ResumeExtractionSection["employment"] = [];
  let current: ResumeExtractionSection["employment"][number] | null = null;

  for (const line of lines) {
    const isBullet = /^[-•*]/.test(line) || /^\d+[.)]/.test(line);
    if (!isBullet && line.length < 120) {
      if (current) jobs.push(current);
      const parts = line.split(/\s+[|@]\s+|\s+-\s+/);
      current = {
        title: parts[0],
        company: parts[1],
        location: parts[2],
        bullets: [],
      };
      continue;
    }
    if (!current) current = { bullets: [] };
    current.bullets.push(line.replace(/^[-•*\d.)]+\s*/, ""));
  }
  if (current) jobs.push(current);
  return jobs;
}

function chunkEducation(lines: string[]) {
  return lines.slice(0, 12).map((line) => {
    const parts = line.split(/\s+[|,-]\s+/);
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
