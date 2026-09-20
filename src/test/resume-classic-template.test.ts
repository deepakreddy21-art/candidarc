/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { chromium } from "playwright";
import { analyzeRenderedPdf, buildResumeDocument } from "@/lib/resume-document";
import { renderResumeDocumentHtml } from "@/lib/resume-html";
import { RESUME_TEMPLATE, resumeLink } from "@/lib/resume-template";
import { renderDocxFromDocument, renderPdfAndDocx, renderPdfFromDocument } from "../../server/resumes/document-renderer";
import { resumeFontDataUrls } from "../../server/resumes/template-fonts";
import { classicResumeFixture } from "./fixtures/classic-resume";

afterEach(() => vi.restoreAllMocks());

describe("approved classic résumé layout", () => {
  it("preserves every section and does not mutate its source document", async () => {
    const doc = classicResumeFixture();
    const snapshot = JSON.stringify(doc);
    const pdf = await renderPdfFromDocument(doc);
    expect(await analyzeRenderedPdf(pdf, doc)).toMatchObject({ ok: true, pageCount: 1, missing: [], blankPageIndexes: [] });
    expect(JSON.stringify(doc)).toBe(snapshot);
    const zip = await JSZip.loadAsync(await renderDocxFromDocument(doc));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("PUBLICATIONS");
    expect(xml).toContain("Northwind Analytics");
    expect(xml).toContain("Valley State University");
    expect(xml).not.toContain("Target Company Must Not Appear");
    expect(xml).toContain('w:orient="portrait"');
    expect(xml).toContain('w:w="12240"');
    expect(xml).toContain('w:right="893"');
    expect(xml).not.toContain("<w:tbl>");
    const fonts = await zip.file("word/fontTable.xml")!.async("string");
    for (const face of ["Regular", "Bold", "Italic", "BoldItalic"]) expect(fonts).toContain(`w:embed${face}`);
    expect(fonts.match(/w:fontKey="\{[0-9a-f-]{36}\}"/gi)).toHaveLength(4);
    expect(Object.keys(zip.files).filter((name) => name.endsWith(".odttf"))).toHaveLength(4);
  }, 30_000);

  it("rejects missing later jobs, education dates and publications, including non-Latin text", async () => {
    const doc = classicResumeFixture();
    const incomplete = structuredClone(doc);
    incomplete.sections[1].entries!.pop();
    incomplete.sections[4].entries![1].dates = undefined;
    incomplete.sections.pop();
    const pdf = await renderPdfFromDocument(incomplete);
    doc.sections[6].entries![0].bullets.push("山田太郎");
    const analysis = await analyzeRenderedPdf(pdf, doc);
    expect(analysis.ok).toBe(false);
    for (const missing of ["Northwind Analytics", "2016 – 2020", "Practical Data Validation", "山田太郎"]) expect(analysis.missing).toContain(missing);
  }, 30_000);

  it("does not silently switch to a text PDF on a browser failure; Word is still available", async () => {
    vi.spyOn(chromium, "launch").mockRejectedValue(new Error("Browser unavailable"));
    await expect(renderPdfFromDocument(classicResumeFixture())).rejects.toMatchObject({ code: "PDF_RENDER_FAILED", retryable: true });
    const result = await renderPdfAndDocx({ candidateName: "Jordan Lee", company: "Target", role: "Engineer", resumeVersion: { publicId: "test", sections: [{ type: "summary", title: "Summary", content: "Verified career history." }] } });
    expect(result.pdfBuffer).toBeNull();
    expect(result.pdfError).toBe("PDF_RENDER_FAILED");
    expect(result.docxBuffer?.byteLength).toBeGreaterThan(1000);
  });

  it("keeps long names and URLs inside the page and uses embedded fonts", async () => {
    const doc = classicResumeFixture();
    doc.contact.name = "José María Alexandra Christine Fernández de la Cruz";
    doc.contact.portfolio = `https://example.org/${"portfolio".repeat(30)}`;
    doc.sections[1].entries![0].heading = "International Research and Engineering Organization for Accessible Community Infrastructure";
    const browser = await chromium.launch({ headless: true, executablePath: process.env.RESUME_PDF_BROWSER_PATH || undefined });
    try {
      const page = await browser.newPage();
      await page.setContent(renderResumeDocumentHtml(doc, { preview: true, fontSources: await resumeFontDataUrls() }));
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.evaluate(() => {
        const main = document.querySelector("main")!;
        const bounds = main.getBoundingClientRect();
        return { width: bounds.width, overflowing: [...main.querySelectorAll("h1,p,li,.entry-row > *,.contact")].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < bounds.left || r.right > bounds.right || el.scrollWidth > el.clientWidth + 1;
        }).map((el) => el.tagName), font: getComputedStyle(main).fontFamily, loadedFonts: [...document.fonts].filter((font) => font.status === "loaded").length };
      });
      expect(layout).toMatchObject({ width: 816, overflowing: [], loadedFonts: 3 });
      expect(layout.font).toContain(RESUME_TEMPLATE.fontFamily);
    } finally { await browser.close(); }
    expect((await analyzeRenderedPdf(await renderPdfFromDocument(doc), doc)).ok).toBe(true);
  }, 30_000);

  it("omits empty optional sections and keeps untrusted URLs inert", () => {
    const doc = buildResumeDocument({ candidateName: "Candidate", company: "Target", role: "Role", sections: [
      { type: "publications", title: "Publications", items: [{ heading: "", bullets: [] }] },
    ] });
    expect(doc.sections).toEqual([]);
    expect(resumeLink("javascript:alert(1)")).toBeUndefined();
    doc.contact.portfolio = 'javascript:alert("<script>")';
    const html = renderResumeDocumentHtml(doc);
    expect(html).not.toContain('<a href="javascript:');
    expect(html).not.toContain("<script>");
  });
});
