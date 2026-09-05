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
import {
  buildResumeDocument,
  resumeDocumentPlainText,
  validateResumeLayout,
  verifyPdfContainsCanonicalContent,
} from "./resume-document";
import { renderResumeDocumentHtml } from "./resume-html-renderer";
import { createExtractableTextPdf } from "./extractable-pdf";

type ResumeVersionLike = { publicId: string; sections: unknown[] };

export { buildResumeDocument, resumeDocumentPlainText, validateResumeLayout, verifyPdfContainsCanonicalContent };
export { createExtractableTextPdf, wrapPdfLines, toPdfSafeText } from "./extractable-pdf";

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
  const parts = [doc.contact.email, doc.contact.phone, doc.contact.location].filter(Boolean) as string[];
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
  for (const link of [linkParagraph("LinkedIn", doc.contact.linkedIn), linkParagraph("GitHub", doc.contact.github), linkParagraph("Portfolio", doc.contact.portfolio)]) {
    if (link) children.push(link);
  }
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `${doc.metadata.role} · ${doc.metadata.company}`, size: 20, italics: true })],
      spacing: { after: 120 },
    }),
  );
  for (const section of doc.sections) children.push(...sectionParagraphs(section));

  const document = new Document({
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
      throw new Error("Resume HTML rendered empty before PDF export");
    }
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      tagged: true,
      margin: { top: "0.55in", right: "0.6in", bottom: "0.55in", left: "0.6in" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/** Always-extractable text PDF used when Chromium print output lacks a text layer. */
export async function renderPdfFromDocument(doc: ResumeDocument): Promise<Buffer> {
  const html = renderResumeDocumentHtml(doc, { preview: false });
  try {
    const pdf = await renderPdfFromHtml(html);
    const verification = await verifyPdfContainsCanonicalContent(pdf, doc);
    if (verification.ok) return pdf;
  } catch {
    /* Fall through to extractable text PDF */
  }
  const fallback = createExtractableTextPdf(resumeDocumentPlainText(doc));
  const fallbackCheck = await verifyPdfContainsCanonicalContent(fallback, doc);
  if (!fallbackCheck.ok) {
    throw new Error(`PDF content verification failed: missing ${fallbackCheck.missing.join(", ")}`);
  }
  return fallback;
}

export function previewHtmlFromDocument(doc: ResumeDocument): string {
  return renderResumeDocumentHtml(doc, { preview: true });
}

export async function renderPdfAndDocx(input: {
  resumeVersion: ResumeVersionLike;
  candidateName: string;
  role: string;
  company: string;
  tenantId?: string;
  applicationId?: string;
  contact?: Partial<ResumeDocument["contact"]>;
}) {
  const document = buildResumeDocument({
    sections: input.resumeVersion.sections,
    candidateName: input.candidateName,
    role: input.role,
    company: input.company,
    contact: input.contact,
  });
  const layout = validateResumeLayout(document);

  const pdfFileId = newId("file_pdf");
  const docxFileId = newId("file_docx");

  const [pdfBuffer, docxBuffer] = await Promise.all([
    renderPdfFromDocument(document),
    renderDocxFromDocument(document),
  ]);

  const verification = await verifyPdfContainsCanonicalContent(pdfBuffer, document);
  if (!verification.ok) {
    throw new Error(`PDF content verification failed: missing ${verification.missing.join(", ")}`);
  }

  const pageCount = layout.pageCountEstimate;

  return {
    pdfBuffer,
    docxBuffer,
    pdfFileId,
    docxFileId,
    pageCount,
    document,
    layout,
    plainText: resumeDocumentPlainText(document),
  };
}
