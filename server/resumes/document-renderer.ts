import {
  Document,
  ExternalHyperlink,
  AlignmentType,
  BorderStyle,
  LevelFormat,
  LineRuleType,
  TabStopType,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { chromium } from "playwright";
import { newId } from "../database/repositories";
import type { ResumeDocument, ResumeDocumentSection } from "@/types/resume-document";
import {
  analyzeRenderedPdf,
  buildResumeDocument,
  measurePdfPageCount,
  resumeDocumentPlainText,
  validateResumeLayout,
  verifyPdfContainsCanonicalContent,
} from "./resume-document";
import { renderResumeDocumentHtml } from "./resume-html-renderer";
import { RESUME_TEMPLATE as T, RESUME_FONT_FACES, resumeContactLinks, resumeLink } from "@/lib/resume-template";
import { loadResumeFonts, resumeFontDataUrls } from "./template-fonts";
import { AppError } from "../domain/types";

type ResumeVersionLike = { publicId: string; sections: unknown[] };

export { buildResumeDocument, resumeDocumentPlainText, validateResumeLayout, verifyPdfContainsCanonicalContent };
export { createExtractableTextPdf, wrapPdfLines, toPdfSafeText } from "./extractable-pdf";
export { analyzeRenderedPdf, measurePdfPageCount } from "./resume-document";
export { CANDIDARC_CLASSIC_V1_TEMPLATE, CANDIDARC_CLASSIC_V1_TEMPLATE_ID } from "@/types/resume-document";

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

const twips = (points: number) => Math.round(points * 20);
const halfPoints = (points: number) => Math.round(points * 2);
const contentWidth = T.page.width - T.page.left - T.page.right;

function bulletParagraph(text: string, skills = false): Paragraph {
  const colon = skills ? text.indexOf(":") : -1;
  return new Paragraph({
    children: colon > 0 && colon < 70
      ? [new TextRun({ text: text.slice(0, colon + 1), bold: true }), new TextRun(text.slice(colon + 1))]
      : [new TextRun(text)],
    numbering: { reference: "resume-bullets", level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: twips(T.bulletGap) },
  });
}

/** Two ordinary text paragraphs, not tables/textboxes: robust ATS reading order. */
function entryRow(left: string, right: string | undefined, italic = false, before = 0): Paragraph {
  // Long headings wrap independently, with the right field on the next line.
  // The tab stop handles typical entries without splitting dates across columns.
  const stacked = left.length + (right?.length ?? 0) > 90;
  return new Paragraph({
    children: [
      new TextRun({ text: left, bold: !italic, italics: italic }),
      ...(right ? [new TextRun({ text: stacked ? right : `\t${right}`, break: stacked ? 1 : undefined, bold: !italic, italics: italic })] : []),
    ],
    spacing: { before: twips(before), line: twips(T.bodySize), lineRule: LineRuleType.AT_LEAST },
    tabStops: [{ type: TabStopType.RIGHT, position: twips(contentWidth) }],
    keepNext: true,
    keepLines: true,
  });
}

function sectionParagraphs(section: ResumeDocumentSection): Paragraph[] {
  const blocks: Paragraph[] = [new Paragraph({
    children: [new TextRun({ text: section.title.toUpperCase(), bold: true, size: halfPoints(T.headingSize) })],
    alignment: AlignmentType.CENTER,
    spacing: { before: twips(T.sectionGap), after: twips(section.entries?.length && !section.content && !section.bullets?.length ? 0 : T.headingGap) },
    keepNext: true,
    keepLines: true,
  })];
  if (section.content) blocks.push(new Paragraph({
    children: [new TextRun({ text: section.content, bold: section.type === "certifications" })],
    alignment: section.type === "certifications" ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
    indent: section.type === "summary" ? { firstLine: twips(T.summaryIndent) } : undefined,
  }));
  for (const bullet of section.bullets ?? []) blocks.push(bulletParagraph(bullet, section.type === "skills"));
  for (const [i, entry] of (section.entries ?? []).entries()) {
    const header = entryRow(entry.heading, entry.dates, false, i > 0 ? T.entryGap : 0);
    blocks.push(header);
    if (entry.subheading || entry.location) blocks.push(entryRow(entry.subheading ?? "", entry.location, true));
    for (const bullet of entry.bullets) blocks.push(bulletParagraph(bullet));
  }
  return blocks;
}

export async function renderDocxFromDocument(doc: ResumeDocument): Promise<Buffer> {
  const centered = { alignment: AlignmentType.CENTER, keepNext: true } as const;
  const links = resumeContactLinks(doc.contact);
  const contact = [doc.contact.location, doc.contact.phone, doc.contact.email].filter(Boolean).join(" | ");
  const rule = { bottom: { style: BorderStyle.SINGLE, size: Math.round(T.rule * 8), color: "000000", space: 5 } };
  const children: Paragraph[] = [new Paragraph({
    ...centered,
    border: !doc.contact.headline && !contact && !links.length ? rule : undefined,
    children: [new TextRun({ text: doc.contact.name, bold: true, size: halfPoints(T.nameSize) })],
    spacing: { after: twips(T.nameGap), line: twips(T.nameSize * 1.05), lineRule: LineRuleType.AT_LEAST },
  })];
  if (doc.contact.headline) children.push(new Paragraph({ ...centered, text: doc.contact.headline, border: !contact && !links.length ? rule : undefined }));
  if (contact) children.push(new Paragraph({ ...centered, border: !links.length ? rule : undefined, children: [new TextRun({ text: contact, size: halfPoints(T.contactSize) })] }));
  if (links.length) children.push(new Paragraph({
    ...centered, border: rule,
    children: links.flatMap(({ label, value }, i): Array<TextRun | ExternalHyperlink> => {
      const href = resumeLink(value);
      const runs = [new TextRun({ text: `${label}: `, bold: true, size: halfPoints(T.contactSize) }), new TextRun({ text: value, size: halfPoints(T.contactSize) })];
      return [...(i ? [new TextRun(" | ")] : []), ...(href ? [new ExternalHyperlink({ children: runs, link: href })] : runs)];
    }),
  }));
  for (const section of doc.sections) children.push(...sectionParagraphs(section));
  const fontData = await loadResumeFonts();
  const document = new Document({
    creator: T.name,
    title: `${doc.contact.name} — ${T.name}`,
    fonts: fontData.map((data) => ({ name: T.fontFamily, data })),
    styles: { default: { document: {
      run: { font: T.fontFamily, size: halfPoints(T.bodySize), color: "000000" },
      paragraph: { spacing: { line: twips(T.leading), lineRule: LineRuleType.AT_LEAST, before: 0, after: 0 } },
    } } },
    numbering: { config: [{ reference: "resume-bullets", levels: [{
      level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: twips(T.bulletIndent), hanging: twips(T.bulletIndent - 3) } }, run: { font: T.fontFamily, size: halfPoints(T.contactSize) } },
    }] }] },
    sections: [{ properties: { page: {
      size: { width: twips(T.page.width), height: twips(T.page.height) },
      margin: { top: twips(T.page.top), right: twips(T.page.right), bottom: twips(T.page.bottom), left: twips(T.page.left) },
    } }, children }],
  });
  // docx embeds four font files; explicitly map all faces into one font family.
  const faces = document.FontTable.fontOptionsWithKey.map(({ fontKey }, i) =>
    `<w:${RESUME_FONT_FACES[i].embed} r:id="rId${i + 1}" w:fontKey="{${fontKey}}"/>`,
  ).join("");
  const fontTable = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:font w:name="${T.fontFamily}"><w:altName w:val="Times New Roman"/><w:family w:val="roman"/>${faces}</w:font></w:fonts>`;
  return Buffer.from(await Packer.toBuffer(document, false, [{ path: "word/fontTable.xml", data: fontTable }]));
}

export async function renderPdfFromHtml(html: string): Promise<Buffer> {
  const browser = await chromium.launch({
    executablePath: process.env.RESUME_PDF_BROWSER_PATH || undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const bodyText = (await page.locator("body").innerText()).trim();
    if (bodyText.length < 8) {
      throw new PdfRenderFailedError("Resume HTML rendered empty before PDF export");
    }
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      tagged: true,
      preferCSSPageSize: true,
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

/** Never substitute a different template when the approved PDF cannot be rendered. */
export async function renderPdfFromDocument(doc: ResumeDocument): Promise<Buffer> {
  try {
    const html = renderResumeDocumentHtml(doc, { fontSources: await resumeFontDataUrls() });
    const pdf = await renderPdfFromHtml(html);
    const analysis = await analyzeRenderedPdf(pdf, doc);
    if (analysis.ok) return pdf;
    throw new PdfRenderFailedError("PDF content verification failed", { missing: analysis.missing, warnings: analysis.warnings });
  } catch (error) {
    if (error instanceof PdfRenderFailedError) throw error;
    throw new PdfRenderFailedError(error instanceof Error ? error.message : "PDF render failed");
  }
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
