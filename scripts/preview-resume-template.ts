/** Render synthetic review samples with the same functions used by the document worker. */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderDocxFromDocument, renderPdfFromDocument } from "../server/resumes/document-renderer";
import { resumeFontDataUrls } from "../server/resumes/template-fonts";
import { renderResumeDocumentHtml } from "../src/lib/resume-html";
import { classicResumeFixture } from "../src/test/fixtures/classic-resume";

async function main() {
  const output = path.resolve(process.argv[2] ?? "tmp-e2e/resume-template");
  await mkdir(output, { recursive: true });
  for (const variant of ["standard", "long", "sparse"] as const) {
    const doc = classicResumeFixture(variant === "long");
    if (variant === "sparse") {
      doc.contact = { name: "Alexandra José Fernández", email: "alex@example.org", phone: "+44 20 7946 0123", location: "London, UK" };
      doc.sections = doc.sections.filter((section) => section.type === "education" || section.type === "projects" || section.type === "skills");
    }
    await writeFile(path.join(output, `${variant}.json`), JSON.stringify(doc, null, 2));
    await writeFile(path.join(output, `${variant}.html`), renderResumeDocumentHtml(doc, { preview: true, fontSources: await resumeFontDataUrls() }));
    await writeFile(path.join(output, `${variant}.pdf`), await renderPdfFromDocument(doc));
    await writeFile(path.join(output, `${variant}.docx`), await renderDocxFromDocument(doc));
  }
  console.log(`Synthetic résumé previews: ${output}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
