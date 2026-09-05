import type {
  ResumeDocument,
  ResumeDocumentContact,
  ResumeDocumentSection,
  ResumeLayoutValidation,
} from "@/types/resume-document";
import type { ResumeSection } from "@/types/domain";

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
    },
  };
}

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
  lines.push(`${doc.metadata.role} · ${doc.metadata.company}`, "");

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

export function validateResumeLayout(doc: ResumeDocument): ResumeLayoutValidation {
  const plain = resumeDocumentPlainText(doc);
  const charCount = plain.length;
  const pageCountEstimate = Math.max(1, Math.ceil(charCount / PAGE_CHAR_BUDGET));
  const withinPageLimit = charCount <= TWO_PAGE_CHAR_BUDGET;
  const overflowRisk: ResumeLayoutValidation["overflowRisk"] =
    charCount > TWO_PAGE_CHAR_BUDGET ? "high" : charCount > PAGE_CHAR_BUDGET * 1.35 ? "medium" : "low";

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

  return { pageCountEstimate, withinPageLimit, overflowRisk, atsTextOrder, warnings };
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

export async function verifyPdfContainsCanonicalContent(pdf: Buffer, doc: ResumeDocument): Promise<{ ok: boolean; missing: string[] }> {
  let pdfText = pdf.toString("latin1");
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: pdf });
    const parsed = await parser.getText();
    await parser.destroy();
    pdfText = `${pdfText}\n${parsed.text ?? ""}`;
  } catch {
    /* fall back to latin1 scan */
  }

  const required = [
    doc.contact.name,
    doc.metadata.role,
    ...doc.sections.flatMap((section) => [
      section.title,
      ...(section.bullets ?? []).slice(0, 2),
      ...(section.entries?.[0]?.bullets.slice(0, 1) ?? []),
    ]),
  ]
    .map((value) => value.trim())
    .filter((value) => value.length >= 4);

  const unique = [...new Set(required)];
  const haystack = normalizeForPdfMatch(pdfText);
  const missing = unique.filter((snippet) => !snippetPresentInPdf(haystack, snippet));
  return { ok: missing.length === 0, missing };
}
