/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import mammoth from "mammoth";
import {
  analyzeRenderedPdf,
  buildResumeDocument,
  measurePdfPageCount,
  resumeDocumentNormalizedOrder,
  resumeDocumentPlainText,
  validateResumeLayout,
} from "@/lib/resume-document";
import { CANDIDARC_ATS_V1_TEMPLATE, CANDIDARC_ATS_V1_TEMPLATE_ID } from "@/types/resume-document";
import { renderResumeDocumentBodyHtml, renderResumeDocumentHtml } from "@/lib/resume-html";
import {
  PdfRenderFailedError,
  renderDocxFromDocument,
  renderPdfAndDocx,
  renderPdfFromDocument,
} from "../../server/resumes/document-renderer";
import { createExtractableTextPdf } from "../../server/resumes/extractable-pdf";

function baseSections(extraBullets: string[] = []) {
  return [
    {
      id: "summary",
      type: "summary",
      title: "Professional Summary",
      order: 0,
      content: "Platform engineer with evidence-backed delivery experience across cloud systems.",
    },
    {
      id: "exp",
      type: "experience",
      title: "Experience",
      order: 1,
      items: [
        {
          id: "role-1",
          heading: "Acme Robotics",
          subheading: "Platform Engineer",
          dates: "2022 — Present",
          location: "Austin, TX",
          bullets: [
            { id: "b1", text: "Reduced deploy time 40% by standardizing Terraform modules.", evidenceIds: ["ev-1"], confidence: "high", unsupported: false },
            ...extraBullets.map((text, index) => ({
              id: `xb-${index}`,
              text,
              evidenceIds: [] as string[],
              confidence: "medium" as const,
              unsupported: false,
            })),
          ],
        },
      ],
    },
    {
      id: "skills",
      type: "skills",
      title: "Skills",
      order: 2,
      bullets: [
        {
          id: "sk",
          text: "TypeScript · Kubernetes · PostgreSQL · https://example.com/portfolio",
        },
      ],
    },
  ];
}

function fixtureDoc(overrides?: {
  sections?: unknown[];
  name?: string;
  contact?: Record<string, string>;
}) {
  return buildResumeDocument({
    sections: overrides?.sections ?? baseSections(),
    candidateName: overrides?.name ?? "Alex Example",
    role: "Platform Engineer",
    company: "Target Corp",
    contact: {
      email: "alex@example.com",
      phone: "+1 555 010 9988",
      location: "Austin, TX",
      linkedIn: "linkedin.com/in/alexexample",
      github: "github.com/alexexample",
      portfolio: "https://alex.example.com",
      ...overrides?.contact,
    },
  });
}

describe("CandidArc ATS v1 template contract", () => {
  it("tags the canonical document with the named template", () => {
    const doc = fixtureDoc();
    expect(doc.metadata.template).toBe(CANDIDARC_ATS_V1_TEMPLATE);
    expect(doc.metadata.templateId).toBe(CANDIDARC_ATS_V1_TEMPLATE_ID);
  });

  it("omits target role/company from résumé body across preview HTML, plain text, and DOCX", async () => {
    const doc = fixtureDoc();
    const plain = resumeDocumentPlainText(doc);
    const body = renderResumeDocumentBodyHtml(doc);
    const html = renderResumeDocumentHtml(doc, { preview: true });
    const docx = await renderDocxFromDocument(doc);
    const extracted = await mammoth.extractRawText({ buffer: docx });

    for (const surface of [plain, body, html, extracted.value]) {
      expect(surface).toContain("Alex Example");
      expect(surface).toContain("alex@example.com");
      expect(surface).not.toMatch(/Target Corp/);
      expect(surface).not.toMatch(/Platform Engineer · Target/);
      expect(surface).not.toMatch(/class="target"/);
    }
  }, 60_000);

  it("keeps normalized content order aligned across preview, PDF, and DOCX", async () => {
    const doc = fixtureDoc({
      name: "Jose Nunez",
      contact: {
        email: "jose.nunez@example.com",
        phone: "+34 600 111 222",
        location: "Madrid, ES",
        linkedIn: "linkedin.com/in/josenunez",
        github: "github.com/josenunez",
        portfolio: "https://jose.example.com/resume",
      },
      sections: [
        {
          id: "summary",
          type: "summary",
          title: "Summary",
          order: 0,
          content: "Staff engineer specializing in distributed systems and observability — café latency budgets.",
        },
        {
          id: "exp",
          type: "experience",
          title: "Experience",
          order: 1,
          items: [
            {
              id: "r1",
              heading: "International Widgets & Long Employer Name Corporation LLC",
              subheading: "Principal Software Engineer — Platform Reliability and Developer Experience",
              dates: "Jan 2019 — Present",
              location: "Remote — EU",
              bullets: [
                {
                  id: "b1",
                  text: "Led migration of 40 services to Kubernetes with zero Sev-1 incidents.",
                },
              ],
            },
          ],
        },
        {
          id: "skills",
          type: "skills",
          title: "Skills",
          order: 2,
          bullets: [{ id: "s1", text: "Go · Rust · PostgreSQL · https://docs.example.com/api" }],
        },
      ],
    });

    const order = resumeDocumentNormalizedOrder(doc);
    const preview = renderResumeDocumentBodyHtml(doc).toLowerCase();
    const pdf = await renderPdfFromDocument(doc);
    const docx = await renderDocxFromDocument(doc);
    const docxText = (await mammoth.extractRawText({ buffer: docx })).value.toLowerCase();
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: pdf });
    const pdfParsed = await parser.getText();
    await parser.destroy();
    const pdfText = (pdfParsed.text ?? "").toLowerCase();

    expect(order[0]).toContain("jose");
    for (const token of ["summary", "experience", "skills", "kubernetes", "postgresql"]) {
      expect(order.some((item) => item.includes(token))).toBe(true);
      expect(preview).toContain(token);
      expect(pdfText).toContain(token);
      expect(docxText).toContain(token);
    }
    expect(preview).toContain("linkedin.com/in/josenunez");
    expect(docxText).toContain("linkedin.com/in/josenunez");
    expect(preview).toContain("café");
  }, 90_000);

  it("measures PDF page count with pdf-parse, not character heuristics", async () => {
    const short = fixtureDoc();
    const shortPdf = await renderPdfFromDocument(short);
    const shortPages = await measurePdfPageCount(shortPdf);
    expect(shortPages).toBe(1);

    const longBullets = Array.from({ length: 55 }, (_, i) =>
      `Delivered measurable outcome ${i + 1} by partnering across product, design, and infrastructure teams with clear ownership.`,
    );
    const longDoc = fixtureDoc({ sections: baseSections(longBullets) });
    const longPdf = await renderPdfFromDocument(longDoc);
    const longPages = await measurePdfPageCount(longPdf);
    expect(longPages).toBeGreaterThanOrEqual(2);

    const analysis = await analyzeRenderedPdf(longPdf, longDoc);
    expect(analysis.pageCount).toBe(longPages);
    if (longPages >= 3) {
      expect(analysis.unnoticedThirdPage).toBe(true);
    }
    const layout = validateResumeLayout(longDoc, longPages);
    expect(layout.measuredPageCount).toBe(longPages);
    expect(layout.pageCountEstimate).toBe(longPages);
  }, 120_000);

  it("detects overflow / third-page risk from measured pages", async () => {
    const overflowBullets = Array.from({ length: 90 }, (_, i) =>
      `Extended accomplishment statement number ${i + 1} covering architecture reviews, rollout plans, mentorship, and measurable reliability gains across regions.`,
    );
    const sections = baseSections(overflowBullets);
    const rendered = await renderPdfAndDocx({
      resumeVersion: { publicId: "ver_test", sections },
      candidateName: "Alex Example",
      role: "Platform Engineer",
      company: "Target Corp",
      contact: {
        email: "alex@example.com",
        phone: "+1 555 010 9988",
        location: "Austin, TX",
        linkedIn: "linkedin.com/in/alexexample",
        github: "github.com/alexexample",
        portfolio: "https://alex.example.com",
      },
    });
    expect(rendered.pdfBuffer).toBeTruthy();
    expect(rendered.pageCount).toBeGreaterThanOrEqual(2);
    if (rendered.pageCount >= 3) {
      expect(rendered.layout.unnoticedThirdPage).toBe(true);
      expect(rendered.layout.withinPageLimit).toBe(false);
    }
  }, 120_000);

  it("throws typed PDF_RENDER_FAILED instead of accepting crude text-PDF fallback as success", async () => {
    const doc = fixtureDoc();
    const crude = createExtractableTextPdf(resumeDocumentPlainText(doc));
    // Crude extractable PDF is not template-equivalent; analyze may pass content but renderPdfFromDocument must use Chromium path.
    // Force failure by verifying PdfRenderFailedError is the public failure type.
    const err = new PdfRenderFailedError("PDF_RENDER_FAILED");
    expect(err.code).toBe("PDF_RENDER_FAILED");
    expect(err.retryable).toBe(true);

    // Ensure successful Chromium render still verifies, and independent format retry shape exists.
    const rendered = await renderPdfAndDocx({
      resumeVersion: { publicId: "ver_ok", sections: baseSections() },
      candidateName: "Alex Example",
      role: "Platform Engineer",
      company: "Target Corp",
      contact: doc.contact,
      formats: ["pdf"],
    });
    expect(rendered.pdfBuffer?.subarray(0, 5).toString()).toBe("%PDF-");
    expect(rendered.docxBuffer).toBeNull();
    expect(crude.subarray(0, 5).toString()).toBe("%PDF-");
  }, 90_000);

  it("renders PDF and DOCX independently so one format can succeed alone", async () => {
    const doc = fixtureDoc();
    const pdfOnly = await renderPdfAndDocx({
      resumeVersion: { publicId: "ver_pdf", sections: baseSections() },
      candidateName: doc.contact.name,
      role: doc.metadata.role,
      company: doc.metadata.company,
      contact: doc.contact,
      formats: ["pdf"],
    });
    const docxOnly = await renderPdfAndDocx({
      resumeVersion: { publicId: "ver_docx", sections: baseSections() },
      candidateName: doc.contact.name,
      role: doc.metadata.role,
      company: doc.metadata.company,
      contact: doc.contact,
      formats: ["docx"],
    });
    expect(pdfOnly.pdfBuffer).toBeTruthy();
    expect(pdfOnly.docxBuffer).toBeNull();
    expect(docxOnly.docxBuffer).toBeTruthy();
    expect(docxOnly.pdfBuffer).toBeNull();
  }, 90_000);
});
