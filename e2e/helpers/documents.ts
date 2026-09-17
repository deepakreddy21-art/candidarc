import { Packer, Document, Paragraph } from "docx";
import { textToSimplePdf } from "./simple-pdf";
import { imageOnlyPdf } from "../../src/test/fixtures/resume-samples";

export { textToSimplePdf, imageOnlyPdf };

/** Helvetica-safe PDF fixture. Optional second job is omitted on purpose. */
export const IMPORT_RESUME_TEXT = `Jordan Blake
jordan.blake@example.com | (555) 010-2244 | Seattle, WA
linkedin.com/in/jordanblake | github.com/jordanblake | https://jordanblake.dev

PROFESSIONAL EXPERIENCE
Platform Engineer | Harbor Systems | Seattle, WA
Jan 2021 - Present
- Built Kubernetes-based deployment pipelines for 12 services
- Reduced mean recovery time from 45 minutes to 8 minutes

PROJECTS
Observability Fabric
- Designed OpenTelemetry collectors for Harbor Systems platforms

EDUCATION
B.S. Computer Science | Cascadia University | 2018

CERTIFICATIONS
AWS Solutions Architect Associate

PUBLICATIONS
Reliable Rollouts (2022)
`;

/** DOCX fixture includes representative Unicode that PDF Helvetica cannot encode. */
export const IMPORT_RESUME_DOCX_TEXT = IMPORT_RESUME_TEXT.replace(
  "Reduced mean recovery time from 45 minutes to 8 minutes",
  "Reduced naïve clustering latency for a São Paulo liaison",
);

export function importResumePdf(): Buffer {
  return textToSimplePdf(IMPORT_RESUME_TEXT);
}

export async function importResumeDocx(): Promise<Buffer> {
  const document = new Document({
    sections: [
      {
        children: IMPORT_RESUME_DOCX_TEXT.split(/\r?\n/).map((line) => new Paragraph(line || " ")),
      },
    ],
  });
  const blob = await Packer.toBuffer(document);
  return Buffer.from(blob);
}

export async function pdfContains(buffer: Buffer, snippets: string[]): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    const haystack = (parsed.text ?? "").replace(/\s+/g, " ");
    for (const snippet of snippets) {
      if (!haystack.toLowerCase().includes(snippet.toLowerCase())) {
        throw new Error(`PDF missing “${snippet}”. Extracted: ${haystack.slice(0, 800)}`);
      }
    }
    return haystack;
  } finally {
    await parser.destroy();
  }
}

export async function docxContains(buffer: Buffer, snippets: string[]): Promise<string> {
  const mammoth = await import("mammoth");
  const extracted = await mammoth.extractRawText({ buffer });
  const haystack = extracted.value.replace(/\s+/g, " ");
  for (const snippet of snippets) {
    if (!haystack.toLowerCase().includes(snippet.toLowerCase())) {
      throw new Error(`DOCX missing “${snippet}”. Extracted: ${haystack.slice(0, 800)}`);
    }
  }
  return haystack;
}
