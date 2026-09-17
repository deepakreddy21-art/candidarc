/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import mammoth from "mammoth";
import { renderDocxFromDocument, renderPdfFromDocument } from "../../server/resumes/document-renderer";
import { analyzeRenderedPdf, buildResumeDocument, resumeDocumentPlainText } from "@/lib/resume-document";
import {
  attachQualityProvenance,
  computeCandidArcQualityScore,
  qualityContactFromSnapshot,
  selectFreshQualityReport,
} from "../../server/resumes/quality-score";

const sections = [
  {
    type: "experience",
    items: [
      {
        bullets: [{ text: "Built Python APIs on AWS and reduced latency 40%", evidenceIds: ["ev_1"] }],
      },
    ],
  },
];

describe("quality contact completeness", () => {
  it("scores populated, partial, and absent contact snapshots", () => {
    const populated = computeCandidArcQualityScore({
      sections,
      contact: {
        email: "ada@example.com",
        phone: "+1 555 0100",
        location: "Austin, TX",
        linkedIn: "linkedin.com/in/ada",
      },
    });
    const partial = computeCandidArcQualityScore({
      sections,
      contact: { email: "ada@example.com", location: "Austin, TX" },
    });
    const absent = computeCandidArcQualityScore({ sections });

    expect(populated.checks.find((check) => check.id === "contact")?.detail).toMatch(/4\/4/);
    expect(partial.checks.find((check) => check.id === "contact")?.detail).toMatch(/2\/4/);
    expect(absent.checks.find((check) => check.id === "contact")?.detail).toMatch(/0\/4/);
    expect(populated.checks.find((check) => check.id === "contact")?.passed).toBe(true);
    expect(absent.checks.find((check) => check.id === "contact")?.passed).toBe(false);
  });

  it("reads contact from the selected resume version snapshot", () => {
    const contact = qualityContactFromSnapshot({
      metadata: {
        candidateEmail: "ada@example.com",
        candidatePhone: "+1 555 0100",
        candidateLinkedIn: "linkedin.com/in/ada",
      },
      location: "Austin, TX",
    });
    const report = computeCandidArcQualityScore({ sections, contact });
    expect(report.checks.find((check) => check.id === "contact")?.detail).toMatch(/4\/4/);
  });

  it("invalidates a persisted quality report after version or contact changes", () => {
    const contact = qualityContactFromSnapshot({
      metadata: { candidateEmail: "ada@example.com" },
      location: "Austin, TX",
    });
    const fresh = attachQualityProvenance(computeCandidArcQualityScore({ sections, contact }), {
      versionPublicId: "ver_2",
      contact,
    });
    const staleVersion = attachQualityProvenance(computeCandidArcQualityScore({ sections }), {
      versionPublicId: "ver_1",
      contact: {},
    });
    const staleContact = attachQualityProvenance(computeCandidArcQualityScore({ sections }), {
      versionPublicId: "ver_2",
      contact: {},
    });

    expect(selectFreshQualityReport(staleVersion, fresh).versionPublicId).toBe("ver_2");
    expect(selectFreshQualityReport(staleContact, fresh).contactFingerprint).toBe(fresh.contactFingerprint);
    expect(selectFreshQualityReport(fresh, fresh)).toBe(fresh);
    expect(selectFreshQualityReport({ score: 99 }, fresh).checks.find((check) => check.id === "contact")?.detail).toMatch(
      /2\/4/,
    );
  });

  it("puts the same contact fields into canonical document text and Word output", async () => {
    const contact = {
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+1 555 0100",
      location: "Austin, TX",
      linkedIn: "linkedin.com/in/ada",
    };
    const document = buildResumeDocument({
      sections: [
        {
          id: "summary",
          type: "summary",
          title: "Summary",
          order: 0,
          content: "Platform engineer with evidence-backed delivery.",
        },
      ],
      candidateName: contact.name,
      role: "Platform Engineer",
      company: "Acme",
      contact,
    });
    const plain = resumeDocumentPlainText(document);
    const docx = await renderDocxFromDocument(document);
    const extracted = await mammoth.extractRawText({ buffer: docx });
    const pdf = await renderPdfFromDocument(document);
    const analysis = await analyzeRenderedPdf(pdf, document);
    for (const surface of [plain, extracted.value]) {
      expect(surface).toContain("Ada Lovelace");
      expect(surface).toContain("ada@example.com");
      expect(surface).toContain("+1 555 0100");
      expect(surface).toContain("Austin, TX");
      expect(surface).toContain("linkedin.com/in/ada");
    }
    expect(
      analysis.missing.filter((item) => /ada@example|555 0100|Austin, TX|linkedin.com\/in\/ada/i.test(item)),
    ).toEqual([]);
    expect(pdf.byteLength).toBeGreaterThan(1000);
  }, 60_000);
});
