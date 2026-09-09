import {
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { chromium } from "playwright";
import { newId } from "../database/repositories";
import type { ResumeDocument, ResumeDocumentSection } from "@/types/resume-document";
import { CANDIDARC_ATS_V1_TEMPLATE } from "@/types/resume-document";
import {
  analyzeRenderedPdf,
  buildResumeDocument,
  measurePdfPageCount,
  resumeDocumentPlainText,
  validateResumeLayout,
  verifyPdfContainsCanonicalContent,
} from "./resume-document";
import { renderResumeDocumentHtml } from "./resume-html-renderer";
import { AppError } from "../domain/types";

type ResumeVersionLike = { publicId: string; sections: unknown[] };

export { buildResumeDocument, resumeDocumentPlainText, validateResumeLayout, verifyPdfContainsCanonicalContent };
export { createExtractableTextPdf, wrapPdfLines, toPdfSafeText } from "./extractable-pdf";
export { analyzeRenderedPdf, measurePdfPageCount } from "./resume-document";
export { CANDIDARC_ATS_V1_TEMPLATE, CANDIDARC_ATS_V1_TEMPLATE_ID } from "@/types/resume-document";

/** Typed, retryable Chromium/PDF print failure — never silently swapped for crude text PDF. */
export class PdfRenderFailedError extends AppError {
  constructor(message = "PDF rendering failed", details?: unknown) {
    super("PDF_RENDER_FAILED", message, 503, details, true);
    this.name = "PdfRenderFailedError";
  }
}

function legacyDocument(lines: string[]) {
  return buildResumeDocument({
    sections: [{ id: "s", type: "summary", title: "Summary", order: 0, content: lines.join("\n") }],
    candidateName: lines[0] ?? "Candidate",
    role: lines[1] ?? "Role",
    company: "Company",
  });
}

export async function createMinimalPdf(lines: string[]): Promise<Buffer> {
  return renderPdfFromDocument(legacyDocument(lines));
}

export async function createMinimalDocx(lines: string[]): Promise<Buffer> {
  return renderDocxFromDocument(legacyDocument(lines));
}

function sectionParagraphs(section: ResumeDocumentSection): Paragraph[] {
  const blocks: Paragraph[] = [
    new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_2, spacing: { before: 180, after: 80 } }),
  ];
  if (section.content) {
    blocks.push(new Paragraph({ children: [new TextRun(section.content)], spacing: { after: 80 } }));
  }
  for (const bullet of section.bullets ?? []) {
    blocks.push(new Paragraph({ text: bullet, bullet: { level: 0 }, spacing: { after: 40 } }));
  }
  for (const entry of section.entries ?? []) {
    blocks.push(
      new Paragraph({
        children: [
          new TextRun({ text: entry.heading, bold: true }),
          ...(entry.subheading ? [new TextRun({ text: ` — ${entry.subheading}` })] : []),
        ],
        spacing: { before: 80, after: 20 },
      }),
    );
    const meta = [entry.location, entry.dates].filter(Boolean).join(" · ");
    if (meta) blocks.push(new Paragraph({ children: [new TextRun({ text: meta, italics: true })], spacing: { after: 40 } }));
    for (const bullet of entry.bullets) {
      blocks.push(new Paragraph({ text: bullet, bullet: { level: 0 }, spacing: { after: 40 } }));
    }
  }
  return blocks;
}

function contactRuns(doc: ResumeDocument): TextRun[] {
  const parts = [
    doc.contact.email,
    doc.contact.phone,
    doc.contact.location,
    doc.contact.linkedIn,
    doc.contact.github,
    doc.contact.portfolio,
  ].filter(Boolean) as string[];
  return parts.length ? [new TextRun({ text: parts.join(" · "), size: 20 })] : [];
}

function linkParagraph(label: string, url?: string): Paragraph | null {
  if (!url) return null;
  const href = url.startsWith("http") ? url : `https://${url}`;
  return new Paragraph({
    children: [
      new ExternalHyperlink({
        children: [new TextRun({ text: label, style: "Hyperlink", size: 20 })],
        link: href,
      }),
    ],
    spacing: { after: 40 },
  });
}

export async function renderDocxFromDocument(doc: ResumeDocument): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: doc.contact.name, bold: true, size: 32 })],
      spacing: { after: 60 },
    }),
  ];
  if (doc.contact.headline) {
    children.push(new Paragraph({ children: [new TextRun({ text: doc.contact.headline, size: 22 })], spacing: { after: 60 } }));
  }
  if (contactRuns(doc).length) {
    children.push(new Paragraph({ children: contactRuns(doc), spacing: { after: 60 } }));
  }
  for (const link of [
    linkParagraph("LinkedIn", doc.contact.linkedIn),
    linkParagraph("GitHub", doc.contact.github),
    linkParagraph("Portfolio", doc.contact.portfolio),
  ]) {
    if (link) children.push(link);
  }
  // Target role/company intentionally omitted from résumé body (CandidArc ATS v1).
  for (const section of doc.sections) children.push(...sectionParagraphs(section));

  const document = new Document({
    creator: CANDIDARC_ATS_V1_TEMPLATE,
    title: `${doc.contact.name} — ${CANDIDARC_ATS_V1_TEMPLATE}`,
    sections: [
      {
        properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(document));
}

export async function renderPdfFromHtml(html: string): Promise<Buffer> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const bodyText = (await page.locator("body").innerText()).trim();
    if (bodyText.length < 8) {
      throw new PdfRenderFailedError("Resume HTML rendered empty before PDF export");
    }
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      tagged: true,
      margin: { top: "0.55in", right: "0.6in", bottom: "0.55in", left: "0.6in" },
    });
    return Buffer.from(pdf);
  } catch (error) {
    if (error instanceof PdfRenderFailedError) throw error;
    throw new PdfRenderFailedError(
      error instanceof Error ? error.message : "Chromium PDF export failed",
      error,
    );
  } finally {
    await browser.close();
  }
}

/**
 * Render CandidArc ATS v1 PDF via Chromium.
 * Does not silently substitute a crude plain-text PDF on failure.
 */
export async function renderPdfFromDocument(doc: ResumeDocument): Promise<Buffer> {
  const html = renderResumeDocumentHtml(doc, { preview: false });
  let pdf: Buffer;
  try {
    pdf = await renderPdfFromHtml(html);
  } catch (error) {
    if (error instanceof PdfRenderFailedError) throw error;
    throw new PdfRenderFailedError(
      error instanceof Error ? error.message : "Chromium PDF export failed",
      error,
    );
  }

  const analysis = await analyzeRenderedPdf(pdf, doc);
  if (!analysis.ok || analysis.missing.length > 0) {
    throw new PdfRenderFailedError(
      `PDF_RENDER_FAILED: content verification failed (${analysis.missing.slice(0, 5).join(", ") || analysis.warnings.join("; ")})`,
      analysis,
    );
  }
  return pdf;
}

export function previewHtmlFromDocument(doc: ResumeDocument): string {
  return renderResumeDocumentHtml(doc, { preview: true });
}

export type RenderArtifactsResult = {
  pdfBuffer: Buffer | null;
  docxBuffer: Buffer | null;
  pdfFileId: string;
  docxFileId: string;
  pageCount: number;
  document: ResumeDocument;
  layout: ReturnType<typeof validateResumeLayout>;
  plainText: string;
  pdfError?: string;
  docxError?: string;
};

/**
 * Render PDF and DOCX independently from one canonical ResumeDocument.
 * A failure in one format does not discard the other.
 */
export async function renderPdfAndDocx(input: {
  resumeVersion: ResumeVersionLike;
  candidateName: string;
  role: string;
  company: string;
  tenantId?: string;
  applicationId?: string;
  contact?: Partial<ResumeDocument["contact"]>;
  /** When set, only regenerate the listed formats (retry failed artifact only). */
  formats?: Array<"pdf" | "docx">;
}): Promise<RenderArtifactsResult> {
  const document = buildResumeDocument({
    sections: input.resumeVersion.sections,
    candidateName: input.candidateName,
    role: input.role,
    company: input.company,
    contact: input.contact,
  });

  const formats = input.formats?.length ? input.formats : (["pdf", "docx"] as Array<"pdf" | "docx">);
  const wantPdf = formats.includes("pdf");
  const wantDocx = formats.includes("docx");

  const pdfFileId = newId("file_pdf");
  const docxFileId = newId("file_docx");

  let pdfBuffer: Buffer | null = null;
  let docxBuffer: Buffer | null = null;
  let pdfError: string | undefined;
  let docxError: string | undefined;

  if (wantPdf) {
    try {
      pdfBuffer = await renderPdfFromDocument(document);
    } catch {
      pdfError = "PDF_RENDER_FAILED";
    }
  }

  if (wantDocx) {
    try {
      docxBuffer = await renderDocxFromDocument(document);
    } catch (error) {
      docxError = error instanceof Error ? error.message.slice(0, 200) : "DOCX_RENDER_FAILED";
    }
  }

  if (wantPdf && !pdfBuffer && wantDocx && !docxBuffer) {
    throw new PdfRenderFailedError("PDF_RENDER_FAILED", { pdfError, docxError });
  }
  if (wantPdf && !pdfBuffer && !wantDocx) {
    throw new PdfRenderFailedError(pdfError ?? "PDF_RENDER_FAILED");
  }
  if (wantDocx && !docxBuffer && !wantPdf) {
    throw new AppError("DOCX_RENDER_FAILED", docxError ?? "DOCX rendering failed", 503, undefined, true);
  }

  const pageCount = pdfBuffer ? await measurePdfPageCount(pdfBuffer) : 0;
  const analysis = pdfBuffer ? await analyzeRenderedPdf(pdfBuffer, document) : null;
  const layout = validateResumeLayout(document, pageCount || undefined);
  if (analysis) {
    layout.blankPageIndexes = analysis.blankPageIndexes;
    layout.clippedText = analysis.clippedText;
    layout.unnoticedThirdPage = analysis.unnoticedThirdPage;
    layout.warnings = [...layout.warnings, ...analysis.warnings.filter((w) => !layout.warnings.includes(w))];
  }

  return {
    pdfBuffer,
    docxBuffer,
    pdfFileId,
    docxFileId,
    pageCount,
    document,
    layout,
    plainText: resumeDocumentPlainText(document),
    pdfError,
    docxError,
  };
}
