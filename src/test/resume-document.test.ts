/** @vitest-environment node */
import { readFile } from "fs/promises";
import { readdir } from "fs/promises";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  buildResumeDocument,
  validateResumeLayout,
  verifyPdfContainsCanonicalContent,
} from "@/lib/resume-document";
import {
  createMinimalDocx,
  createMinimalPdf,
  renderPdfFromDocument,
} from "../../server/resumes/document-renderer";

const FIXTURE_NAMES = ["Deepak", "Deepak Reddy Kilaru", "app-cisco", "job-cisco"];

const CUSTOMER_ROOTS = [
  "src/app/app",
  "src/app/page.tsx",
  "src/components/layout",
  "src/components/applications",
  "src/components/resumes",
  "src/components/command-palette.tsx",
  "src/components/insights",
  "src/services/api.ts",
];

const ALLOWED_PATTERNS = [
  /seed\.demo\.ts$/,
  /seed\.ts$/,
  /seed\.empty\.ts$/,
  /radar-seed\.demo\.ts$/,
  /radar-seed\.ts$/,
  /\/test\//,
  /placeholder/i,
  /e\.g\./i,
];

async function collectFiles(root: string): Promise<string[]> {
  const absolute = path.join(process.cwd(), root);
  try {
    const stat = await readFile(absolute);
    void stat;
    return [root];
  } catch {
    /* directory */
  }

  const entries = await readdir(absolute, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const next = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(next)));
    else if (/\.(tsx|ts)$/.test(entry.name)) files.push(next);
  }
  return files;
}

describe("production customer surfaces", () => {
  it("does not embed known demo fixture names in customer page sources", async () => {
    const files = (await Promise.all(CUSTOMER_ROOTS.map((root) => collectFiles(root)))).flat();
    const violations: string[] = [];

    for (const file of files) {
      if (ALLOWED_PATTERNS.some((pattern) => pattern.test(file))) continue;
      const source = await readFile(path.join(process.cwd(), file), "utf8");
      for (const fixture of FIXTURE_NAMES) {
        if (source.includes(fixture)) violations.push(`${file} contains "${fixture}"`);
      }
    }

    expect(violations).toEqual([]);
  });
});

describe("resume document model", () => {
  const fixtureSections = [
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
          heading: "Acme Robotics",
          subheading: "Platform Engineer",
          dates: "2022 — Present",
          bullets: [{ id: "b1", text: "Reduced deploy time 40% by standardizing Terraform modules.", evidenceIds: ["ev-1"], confidence: "high", unsupported: false }],
        },
      ],
    },
  ];

  it("builds canonical document content from resume sections", () => {
    const doc = buildResumeDocument({
      sections: fixtureSections,
      candidateName: "Alex Example",
      role: "Platform Engineer",
      company: "Acme Robotics",
      contact: { email: "alex@example.com", location: "Austin, TX" },
    });
    expect(doc.contact.name).toBe("Alex Example");
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[1]?.entries?.[0]?.bullets[0]).toContain("Terraform");
  });

  it("validates page budget and ATS text order", () => {
    const doc = buildResumeDocument({
      sections: fixtureSections,
      candidateName: "Alex Example",
      role: "Platform Engineer",
      company: "Acme Robotics",
    });
    const layout = validateResumeLayout(doc);
    expect(layout.pageCountEstimate).toBeGreaterThanOrEqual(1);
    expect(layout.withinPageLimit).toBe(true);
    expect(layout.atsTextOrder[0]).toBe("Alex Example");
    expect(layout.atsTextOrder).toContain("Experience");
  });

  it("creates non-empty PDF and DOCX with shared substantive content", async () => {
    const doc = buildResumeDocument({
      sections: fixtureSections,
      candidateName: "Alex Example",
      role: "Platform Engineer",
      company: "Acme Robotics",
    });
    const pdf = await renderPdfFromDocument(doc);
    const docx = await createMinimalDocx(["Alex Example", "Platform Engineer"]);
    expect(pdf.length).toBeGreaterThan(500);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toMatch(/startxref\n[1-9]/);
    expect(pdf.toString("latin1")).not.toMatch(/startxref\n0\n/);
    expect(docx.length).toBeGreaterThan(500);
    expect(docx.readUInt32LE(0)).toBe(0x04034b50);
    const verification = await verifyPdfContainsCanonicalContent(pdf, doc);
    expect(verification.ok).toBe(true);
  }, 60_000);

  it("preserves long skills lines, dates, and companies in extractable PDF text", async () => {
    const { createExtractableTextPdf, wrapPdfLines } = await import("../../server/resumes/extractable-pdf");
    const longSkills =
      "Python · PyTorch · Hugging Face · OpenSearch · EKS · LangGraph · SageMaker · RAG · Evaluation pipelines";
    const doc = buildResumeDocument({
      sections: [
        {
          id: "skills",
          type: "skills",
          title: "Skills",
          order: 0,
          bullets: [{ id: "b0", text: longSkills }],
        },
        {
          id: "exp",
          type: "experience",
          title: "Experience",
          order: 1,
          bullets: [{ id: "b1", text: "Software Engineer at USAA, January 2024 – Present" }],
        },
      ],
      candidateName: "Deepak QA Candidate",
      role: "Senior AI Platform Engineer",
      company: "Asteria AI Systems",
    });
    const wrapped = wrapPdfLines(`${longSkills}\nSoftware Engineer at USAA, January 2024 – Present`);
    expect(wrapped.join(" ")).toContain("PyTorch");
    expect(wrapped.join(" ")).toContain("January 2024");
    expect(wrapped.every((line) => line.length <= 95 || line.length === 0)).toBe(true);

    const { resumeDocumentPlainText } = await import("@/lib/resume-document");
    const pdf = createExtractableTextPdf(resumeDocumentPlainText(doc));
    expect(pdf.toString("latin1")).toMatch(/startxref\n[1-9]/);
    expect(pdf.toString("latin1")).not.toMatch(/startxref\n0\n/);
    const verification = await verifyPdfContainsCanonicalContent(pdf, doc);
    expect(verification.ok).toBe(true);
    expect(verification.missing).toEqual([]);
  }, 60_000);

  it("keeps legacy minimal helpers async-compatible", async () => {
    const pdf = await createMinimalPdf(["Alex Example", "Platform Engineer"]);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 60_000);
});
