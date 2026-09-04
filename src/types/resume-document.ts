/**
 * Canonical resume document model shared by browser preview, PDF, and DOCX renderers.
 * ATS-safe: single-column reading order, plain text bullets, no tables/columns in body.
 */
export interface ResumeDocumentContact {
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedIn?: string;
  github?: string;
  portfolio?: string;
  headline?: string;
}

export interface ResumeDocumentEntry {
  heading: string;
  subheading?: string;
  location?: string;
  dates?: string;
  bullets: string[];
}

export interface ResumeDocumentSection {
  type: "summary" | "skills" | "experience" | "projects" | "education" | "certifications" | "other";
  title: string;
  /** Plain paragraph for summary/skills blocks */
  content?: string;
  bullets?: string[];
  entries?: ResumeDocumentEntry[];
}

export interface ResumeDocument {
  contact: ResumeDocumentContact;
  sections: ResumeDocumentSection[];
  metadata: {
    role: string;
    company: string;
    generatedAt?: string;
  };
}

export interface ResumeLayoutValidation {
  pageCountEstimate: number;
  withinPageLimit: boolean;
  overflowRisk: "low" | "medium" | "high";
  atsTextOrder: string[];
  warnings: string[];
}
