/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  buildResumeDocument,
  measurePdfPageCount,
  resumeDocumentPlainText,
  validateResumeLayout,
} from "@/lib/resume-document";
import { renderResumeDocumentBodyHtml } from "@/lib/resume-html";
import { CANDIDARC_ATS_V1_TEMPLATE, CANDIDARC_ATS_V1_TEMPLATE_ID } from "@/types/resume-document";
import {
  renderDocxFromDocument,
  renderPdfAndDocx,
  renderPdfFromDocument,
} from "../../server/resumes/document-renderer";

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function docxPlainText(docXml: string): string {
  return docXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeComparable(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u00b7\u2022|]/g, " ")
    .replace(/[^a-z0-9+#./\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const baseSections = [
  {
    id: "summary",
    type: "summary",
    title: "Professional Summary",
    order: 0,
    content: "Platform engineer with evidence-backed delivery experience.",
  },
  {
    id: "exp",
    type: "experience",
    title: "Experience",
    order: 1,
    items: [
      {
        id: "role-1",
        heading: "Acme Robotics — Very Long Employer Name With Unicode Café",
        subheading: "Principal Platform Engineer & Site Reliability Lead",
        dates: "2022 — Present",
        location: "Austin, TX",
        bullets: [{ id: "b1", text: "Reduced deploy time 40% by standardizing Terraform modules.", evidenceIds: [], confidence: "high", unsupported: false }],
      },
    ],
  },
  {
    id: "skills",
    type: "skills",
    title: "Skills",
    order: 2,
    bullets: [{ id: "b2", text: "Python · Kubernetes · https://example.com/playbook", evidenceIds: [], confidence: "high", unsupported: false }],
  },
];

describe("CandidArc ATS v1 canonical parity", () => {
  it("stamps template metadata and never claims MIT/Harvard", () => {
    const doc = buildResumeDocument({
      sections: baseSections,
      candidateName: "Alex Example",
      role: "Platform Engineer",
      company: "Acme Robotics",
      contact: {
        email: "alex@example.com",
        phone: "(555) 010-2244",
        location: "Austin, TX",
        linkedIn: "linkedin.com/in/alexexample",
        github: "github.com/alexexample",
        portfolio: "alexexample.dev",
      },
    });
    expect(doc.metadata.template).toBe(CANDIDARC_ATS_V1_TEMPLATE);
    expect(doc.metadata.templateId).toBe(CANDIDARC_ATS_V1_TEMPLATE_ID);
    const plain = resumeDocumentPlainText(doc);
    expect(plain).not.toMatch(/MIT|Harvard|alumni/i);
    expect(plain).not.toMatch(/Target company|Target role/i);
  });

  it("keeps contact fields and section order across plain text, HTML body, and DOCX", async () => {
    const doc = buildResumeDocument({
      sections: baseSections,
      candidateName: "Alex Example",
      role: "Platform Engineer",
      company: "Acme Robotics",
      contact: {
        email: "alex@example.com",
        phone: "(555) 010-2244",
        location: "Austin, TX",
        linkedIn: "linkedin.com/in/alexexample",
        github: "github.com/alexexample",
        portfolio: "alexexample.dev",
      },
    });

    const plain = resumeDocumentPlainText(doc);
    const htmlText = stripHtml(renderResumeDocumentBodyHtml(doc));
    const docx = await renderDocxFromDocument(doc);
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(docx);
    const docXml = (await zip.file("word/document.xml")?.async("string")) ?? "";
    const docxText = docxPlainText(docXml);

    for (const token of ["Alex Example", "Professional Summary", "Experience", "Acme Robotics"]) {
      expect(normalizeComparable(plain)).toContain(normalizeComparable(token));
      expect(normalizeComparable(htmlText)).toContain(normalizeComparable(token));
      expect(normalizeComparable(docxText)).toContain(normalizeComparable(token));
    }

    expect(docxText).toContain("alex@example.com");
    expect(docxText).toContain("linkedin.com/in/alexexample");
    expect(docxText).toContain("github.com/alexexample");
    expect(docxText).toContain("alexexample.dev");
    expect(htmlText).not.toMatch(/Target company|Target role/i);
  }, 30_000);

  it("estimates one-page vs two-page layouts and exposes measuredPageCount", () => {
    const shortDoc = buildResumeDocument({
      sections: baseSections,
      candidateName: "Alex Example",
      role: "Platform Engineer",
      company: "Acme Robotics",
    });
    const shortLayout = validateResumeLayout(shortDoc);
    expect(shortLayout.pageCountEstimate).toBe(1);
    expect(shortLayout.measuredPageCount).toBeUndefined();
    expect(shortLayout.withinPageLimit).toBe(true);

    const longContent = "Delivered measurable outcomes across platform, data, and AI systems. ".repeat(90);
    const longDoc = buildResumeDocument({
      sections: [
        ...baseSections,
        {
          id: "extra",
          type: "projects",
          title: "Projects",
          order: 3,
          content: longContent,
        },
      ],
      candidateName: "Alex Example",
      role: "Platform Engineer",
      company: "Acme Robotics",
    });
    const estimatedTwoPage = validateResumeLayout(longDoc);
    expect(estimatedTwoPage.pageCountEstimate).toBeGreaterThanOrEqual(2);

    const measured = validateResumeLayout(longDoc, 2);
    expect(measured.measuredPageCount).toBe(2);
    expect(measured.pageCountEstimate).toBe(2);
  });

  it("records measured page count from pdf-parse on extractable PDFs", async () => {
    const doc = buildResumeDocument({
      sections: baseSections,
      candidateName: "Alex Example",
      role: "Platform Engineer",
      company: "Acme Robotics",
    });
    const { createExtractableTextPdf } = await import("../../server/resumes/extractable-pdf");
    const pdf = createExtractableTextPdf(`${resumeDocumentPlainText(doc)}\n${"Extra line. ".repeat(120)}`);
    const pages = await measurePdfPageCount(pdf);
    expect(pages).toBeGreaterThanOrEqual(1);
    const layout = validateResumeLayout(doc, pages);
    expect(layout.measuredPageCount).toBe(pages);
  });

  it("supports DOCX-only rendering without requiring PDF", async () => {
    const rendered = await renderPdfAndDocx({
      resumeVersion: { publicId: "rv_test", sections: baseSections },
      candidateName: "Alex Example",
      role: "Platform Engineer",
      company: "Acme Robotics",
      formats: ["docx"],
    });

    expect(rendered.pdfError).toBeUndefined();
    expect(rendered.pdfBuffer).toBeNull();
    expect(rendered.docxBuffer?.length).toBeGreaterThan(100);
    expect(rendered.document.metadata.template).toBe(CANDIDARC_ATS_V1_TEMPLATE);
  }, 30_000);
});

describe("CandidArc ATS v1 chromium PDF path", () => {
  it.skipIf(!process.env.RUN_CHROMIUM_TESTS)("renders tagged PDF via chromium when enabled", async () => {
    const doc = buildResumeDocument({
      sections: baseSections,
      candidateName: "Alex Example",
      role: "Platform Engineer",
      company: "Acme Robotics",
      contact: { email: "alex@example.com" },
    });
    const pdf = await renderPdfFromDocument(doc);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const pages = await measurePdfPageCount(pdf);
    const layout = validateResumeLayout(doc, pages);
    expect(layout.measuredPageCount).toBe(pages);
  }, 60_000);
});
