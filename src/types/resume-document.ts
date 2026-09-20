/**
 * Canonical resume document model shared by browser preview, PDF, and DOCX renderers.
 * Template: CandidArc Classic v1 — ATS-safe single-column reading order.
 * Not an official MIT/Harvard/alumni template.
 */
import { RESUME_TEMPLATE } from "@/lib/resume-template";
export const CANDIDARC_CLASSIC_V1_TEMPLATE = RESUME_TEMPLATE.name;
export const CANDIDARC_CLASSIC_V1_TEMPLATE_ID = RESUME_TEMPLATE.id;

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
  type: "summary" | "skills" | "experience" | "projects" | "education" | "certifications" | "publications" | "other";
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
    /** Named template identifier shown in HTML meta — never printed as employment. */
    template?: string;
    templateId?: string;
  };
}

export interface ResumeLayoutValidation {
  /** Authoritative when measured from a rendered PDF; otherwise a pre-render estimate. */
  pageCountEstimate: number;
  /** Actual PDF page count from a PDF parser when available. */
  measuredPageCount?: number;
  withinPageLimit: boolean;
  overflowRisk: "low" | "medium" | "high";
  atsTextOrder: string[];
  warnings: string[];
  blankPageIndexes?: number[];
  clippedText?: boolean;
  unnoticedThirdPage?: boolean;
}
