import type {
  ResumeDocument,
  ResumeDocumentContact,
  ResumeDocumentSection,
  ResumeLayoutValidation,
} from "@/types/resume-document";
import { CANDIDARC_ATS_V1_TEMPLATE, CANDIDARC_ATS_V1_TEMPLATE_ID } from "@/types/resume-document";
import type { ResumeSection } from "@/types/domain";

/** Soft pre-render heuristic only — never authoritative for shipped page count. */
const PAGE_CHAR_BUDGET = 3200;
const TWO_PAGE_CHAR_BUDGET = PAGE_CHAR_BUDGET * 2;

function bulletText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && typeof (value as { text?: unknown }).text === "string") {
    const text = (value as { text: string }).text.trim();
    return text || null;
  }
  return null;
}

function mapSectionType(type: unknown): ResumeDocumentSection["type"] {
  const normalized = typeof type === "string" ? type : "other";
  if (
    normalized === "summary" ||
    normalized === "skills" ||
    normalized === "experience" ||
    normalized === "projects" ||
    normalized === "education" ||
    normalized === "certifications"
  ) {
    return normalized;
  }
  return "other";
}

export function buildResumeDocument(input: {
  sections: unknown[];
  candidateName: string;
  role: string;
  company: string;
  contact?: Partial<ResumeDocumentContact>;
}): ResumeDocument {
  const contact: ResumeDocumentContact = {
    name: input.contact?.name?.trim() || input.candidateName.trim() || "Candidate",
    email: input.contact?.email?.trim() || undefined,
    phone: input.contact?.phone?.trim() || undefined,
    location: input.contact?.location?.trim() || undefined,
    linkedIn: input.contact?.linkedIn?.trim() || undefined,
    github: input.contact?.github?.trim() || undefined,
    portfolio: input.contact?.portfolio?.trim() || undefined,
    headline: input.contact?.headline?.trim() || undefined,
  };

  const mapped = (input.sections as ResumeSection[])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((section): ResumeDocumentSection | null => {
      const title = section.title?.trim() || "Section";
      const type = mapSectionType(section.type);
      const bullets = (section.bullets ?? [])
        .map((bullet) => bulletText(bullet))
        .filter((text): text is string => Boolean(text));
      const entries = (section.items ?? []).map((item) => ({
        heading: item.heading?.trim() || "Role",
        subheading: item.subheading?.trim() || undefined,
        location: item.location?.trim() || undefined,
        dates: item.dates?.trim() || undefined,
        bullets: (item.bullets ?? [])
          .map((bullet) => bulletText(bullet))
          .filter((text): text is string => Boolean(text)),
      }));
      const content = section.content?.trim() || undefined;

      if (!content && bullets.length === 0 && entries.length === 0) return null;

      return { type, title, content, bullets: bullets.length ? bullets : undefined, entries: entries.length ? entries : undefined };
    })
    .filter((section): section is ResumeDocumentSection => section !== null);

  return {
    contact,
    sections: mapped,
    metadata: {
      role: input.role,
      company: input.company,
      generatedAt: new Date().toISOString(),
      template: CANDIDARC_ATS_V1_TEMPLATE,
      templateId: CANDIDARC_ATS_V1_TEMPLATE_ID,
    },
  };
}

/** Canonical plain text for ATS extraction / DOCX parity. Omits target role/company. */
export function resumeDocumentPlainText(doc: ResumeDocument): string {
  const lines: string[] = [doc.contact.name];
  const contactLine = [
    doc.contact.headline,
    doc.contact.email,
    doc.contact.phone,
    doc.contact.location,
    doc.contact.linkedIn,
    doc.contact.github,
    doc.contact.portfolio,
  ]
    .filter(Boolean)
    .join(" · ");
  if (contactLine) lines.push(contactLine);
  lines.push("");

  for (const section of doc.sections) {
    lines.push(section.title.toUpperCase());
    if (section.content) lines.push(section.content);
    if (section.bullets?.length) {
      for (const bullet of section.bullets) lines.push(`• ${bullet}`);
    }
    for (const entry of section.entries ?? []) {
      const header = [entry.heading, entry.subheading].filter(Boolean).join(" — ");
      lines.push(header);
      const meta = [entry.location, entry.dates].filter(Boolean).join(" · ");
      if (meta) lines.push(meta);
      for (const bullet of entry.bullets) lines.push(`• ${bullet}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

/** Normalized token sequence for cross-format content parity checks. */
export function resumeDocumentNormalizedOrder(doc: ResumeDocument): string[] {
  const order: string[] = [doc.contact.name];
  for (const field of [
    doc.contact.headline,
    doc.contact.email,
    doc.contact.phone,
    doc.contact.location,
    doc.contact.linkedIn,
    doc.contact.github,
    doc.contact.portfolio,
  ]) {
    if (field) order.push(field);
  }
  for (const section of doc.sections) {
    order.push(section.title);
    if (section.content) order.push(section.content);
    section.bullets?.forEach((bullet) => order.push(bullet));
    section.entries?.forEach((entry) => {
      order.push(entry.heading);
      if (entry.subheading) order.push(entry.subheading);
      if (entry.location) order.push(entry.location);
      if (entry.dates) order.push(entry.dates);
      entry.bullets.forEach((bullet) => order.push(bullet));
    });
  }
  return order.map((value) => normalizeForPdfMatch(value)).filter(Boolean);
}

export function validateResumeLayout(doc: ResumeDocument, measuredPageCount?: number): ResumeLayoutValidation {
  const plain = resumeDocumentPlainText(doc);
  const charCount = plain.length;
  const pageCountEstimate =
    typeof measuredPageCount === "number" && measuredPageCount > 0
      ? measuredPageCount
      : Math.max(1, Math.ceil(charCount / PAGE_CHAR_BUDGET));
  const withinPageLimit =
    typeof measuredPageCount === "number" ? measuredPageCount <= 2 : charCount <= TWO_PAGE_CHAR_BUDGET;
  const overflowRisk: ResumeLayoutValidation["overflowRisk"] =
    typeof measuredPageCount === "number"
      ? measuredPageCount > 2
        ? "high"
        : measuredPageCount === 2
          ? "medium"
          : "low"
      : charCount > TWO_PAGE_CHAR_BUDGET
        ? "high"
        : charCount > PAGE_CHAR_BUDGET * 1.35
          ? "medium"
          : "low";

  const atsTextOrder: string[] = [doc.contact.name];
  if (doc.contact.headline) atsTextOrder.push(doc.contact.headline);
  for (const section of doc.sections) {
    atsTextOrder.push(section.title);
    if (section.content) atsTextOrder.push(section.content);
    section.bullets?.forEach((bullet) => atsTextOrder.push(bullet));
    section.entries?.forEach((entry) => {
      atsTextOrder.push(entry.heading);
      entry.bullets.forEach((bullet) => atsTextOrder.push(bullet));
    });
  }

  const warnings: string[] = [];
  if (!withinPageLimit) warnings.push("Content may exceed two pages when printed.");
  if (!doc.sections.some((section) => section.type === "experience" || section.entries?.length)) {
    warnings.push("No experience entries detected.");
  }
  if (doc.sections.every((section) => !section.bullets?.length && !section.entries?.some((e) => e.bullets.length))) {
    warnings.push("Resume has no bullet accomplishments.");
  }
  const unnoticedThirdPage = typeof measuredPageCount === "number" && measuredPageCount >= 3;
  if (unnoticedThirdPage) warnings.push("Rendered PDF has an unnoticed third (or later) page.");

  return {
    pageCountEstimate,
    measuredPageCount,
    withinPageLimit,
    overflowRisk,
    atsTextOrder,
    warnings,
    unnoticedThirdPage,
  };
}

function normalizeForPdfMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u00b7\u2022\u2023\u25e6|]/g, " ")
    .replace(/[\u2010-\u2015\u2212-]/g, "-")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function snippetPresentInPdf(haystack: string, snippet: string): boolean {
  const normalized = normalizeForPdfMatch(snippet);
  if (normalized.length < 4) return true;
  if (haystack.includes(normalized.slice(0, 80))) return true;
  const tokens = normalized.split(" ").filter((token) => token.length >= 4);
  if (tokens.length >= 3) {
    const hits = tokens.filter((token) => haystack.includes(token)).length;
    return hits >= Math.ceil(tokens.length * 0.75);
  }
  return haystack.includes(normalized);
}

export async function measurePdfPageCount(pdf: Buffer): Promise<number> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: pdf });
  try {
    const info = await parser.getInfo();
    const total = typeof info.total === "number" ? info.total : 0;
    if (total > 0) return total;
    const parsed = await parser.getText();
    return typeof parsed.total === "number" && parsed.total > 0 ? parsed.total : 1;
  } finally {
    await parser.destroy();
  }
}

export type PdfRenderAnalysis = {
  ok: boolean;
  pageCount: number;
  blankPageIndexes: number[];
  clippedText: boolean;
  unnoticedThirdPage: boolean;
  warnings: string[];
  missing: string[];
};

/** Parse rendered PDF: page count, blank pages, clipping, third-page risk. */
export async function analyzeRenderedPdf(pdf: Buffer, doc: ResumeDocument): Promise<PdfRenderAnalysis> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: pdf });
  const warnings: string[] = [];
  try {
    const info = await parser.getInfo();
    const parsed = await parser.getText();
    const pageCount =
      (typeof info.total === "number" && info.total > 0
        ? info.total
        : typeof parsed.total === "number"
          ? parsed.total
          : 1) || 1;

    const pages = Array.isArray(parsed.pages) ? parsed.pages : [];
    const blankPageIndexes: number[] = [];
    if (pages.length > 0) {
      for (let i = 0; i < Math.min(pageCount, pages.length); i++) {
        const page = pages[i] as { text?: string } | undefined;
        const pageText = typeof page?.text === "string" ? page.text.trim() : "";
        if (pageText.length < 8) blankPageIndexes.push(i);
      }
    }

    const pdfText =
      typeof parsed.text === "string"
        ? parsed.text
        : pages.map((p) => (p as { text?: string }).text ?? "").join("\n");
    const haystack = normalizeForPdfMatch(`${pdf.toString("latin1")}\n${pdfText}`);
    const required = [
      doc.contact.name,
      doc.contact.email,
      doc.contact.phone,
      doc.contact.location,
      doc.contact.linkedIn,
      doc.contact.github,
      doc.contact.portfolio,
      ...doc.sections.flatMap((section) => [
        section.title,
        ...(section.bullets ?? []).slice(0, 2),
        ...(section.entries?.[0]?.bullets.slice(0, 1) ?? []),
        section.entries?.[0]?.heading,
      ]),
    ]
      .filter((value): value is string => typeof value === "string" && value.trim().length >= 4)
      .map((value) => value.trim());

    const unique = [...new Set(required)];
    const missing = unique.filter((snippet) => !snippetPresentInPdf(haystack, snippet));

    const canonicalNorm = normalizeForPdfMatch(resumeDocumentPlainText(doc));
    const clippedText =
      missing.length > 0 ||
      (canonicalNorm.length > 80 && haystack.length < Math.floor(canonicalNorm.length * 0.45));

    const unnoticedThirdPage = pageCount >= 3;
    if (blankPageIndexes.length) {
      warnings.push(`Blank page(s) detected: ${blankPageIndexes.map((i) => i + 1).join(", ")}`);
    }
    if (clippedText) warnings.push("Clipped or missing résumé text detected in PDF.");
    if (unnoticedThirdPage) warnings.push("PDF spans three or more pages.");

    // Third page / blank pages are layout warnings; content missing/clipping fails the render.
    return {
      ok: missing.length === 0 && !clippedText,
      pageCount,
      blankPageIndexes,
      clippedText,
      unnoticedThirdPage,
      warnings,
      missing,
    };
  } finally {
    await parser.destroy();
  }
}

export async function verifyPdfContainsCanonicalContent(
  pdf: Buffer,
  doc: ResumeDocument,
): Promise<{ ok: boolean; missing: string[] }> {
  const analysis = await analyzeRenderedPdf(pdf, doc);
  return { ok: analysis.missing.length === 0, missing: analysis.missing };
}
