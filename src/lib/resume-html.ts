/** One typesetting specification for the browser preview and Chromium PDF. */
import type { ResumeDocument } from "@/types/resume-document";
import { RESUME_FONT_FACES, RESUME_TEMPLATE as T, resumeContactLinks, resumeLink } from "./resume-template";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function bulletList(bullets: string[] = [], skills = false): string {
  if (!bullets.length) return "";
  return `<ul>${bullets.map((bullet) => {
    const separator = skills ? bullet.indexOf(":") : -1;
    const text = separator > 0 && separator < 70
      ? `<strong>${escapeHtml(bullet.slice(0, separator + 1))}</strong>${escapeHtml(bullet.slice(separator + 1))}`
      : escapeHtml(bullet);
    return `<li>${text}</li>`;
  }).join("")}</ul>`;
}

export function renderResumeDocumentBodyHtml(doc: ResumeDocument): string {
  const sections = doc.sections.map((section) => {
    const entries = (section.entries ?? []).map((entry) => `<article class="entry">
      <div class="entry-heading">
        <div class="entry-row"><strong>${escapeHtml(entry.heading)}</strong>${entry.dates ? `<strong class="entry-right">${escapeHtml(entry.dates)}</strong>` : ""}</div>
        ${entry.subheading || entry.location ? `<div class="entry-row entry-meta"><span>${escapeHtml(entry.subheading ?? "")}</span>${entry.location ? `<span class="entry-right">${escapeHtml(entry.location)}</span>` : ""}</div>` : ""}
      </div>
      ${bulletList(entry.bullets)}
    </article>`).join("");
    return `<section class="section-${section.type}">
      <h2>${escapeHtml(section.title)}</h2>
      ${section.content ? `<p>${escapeHtml(section.content)}</p>` : ""}
      ${bulletList(section.bullets, section.type === "skills")}${entries}
    </section>`;
  }).join("");
  const contact = [doc.contact.location, doc.contact.phone, doc.contact.email].filter(Boolean).map((v) => escapeHtml(v!)).join(" | ");
  const links = resumeContactLinks(doc.contact).map(({ label, value }) => {
    const href = resumeLink(value);
    const text = `<strong>${label}:</strong> ${escapeHtml(value)}`;
    return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>` : text;
  }).join(" | ");
  return `<header>
    <h1>${escapeHtml(doc.contact.name)}</h1>
    ${doc.contact.headline ? `<div class="headline">${escapeHtml(doc.contact.headline)}</div>` : ""}
    ${contact ? `<div class="contact">${contact}</div>` : ""}
    ${links ? `<div class="contact">${links}</div>` : ""}
  </header>${sections}`;
}

export function renderResumeDocumentHtml(doc: ResumeDocument, opts: { preview?: boolean; fontSources?: string[] } = {}): string {
  const fonts = RESUME_FONT_FACES.map((font, i) => `@font-face {
    font-family: "${T.fontFamily}"; src: url("${opts.fontSources?.[i] ?? `/fonts/resume/${font.file}`}") format("truetype");
    font-style: ${font.style}; font-weight: ${font.weight}; font-display: block;
  }`).join("\n");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
    <meta name="candidarc-template" content="${T.name}" />
    <style>
      ${fonts}
      @page { size: ${T.page.width}pt ${T.page.height}pt; margin: ${T.page.top}pt ${T.page.right}pt ${T.page.bottom}pt ${T.page.left}pt; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { background: #fff; color: #000; font-family: "${T.fontFamily}", "Times New Roman", serif; font-size: ${T.bodySize}pt; line-height: ${T.leading}pt; font-kerning: normal; }
      .page.preview { width: ${T.page.width}pt; min-height: ${T.page.height}pt; padding: ${T.page.top}pt ${T.page.right}pt ${T.page.bottom}pt ${T.page.left}pt; }
      /* Print margins belong to @page only. Never pad the print content a second time. */
      .page.print { width: auto; margin: 0; padding: 0; }
      header { text-align: center; padding-bottom: 5pt; border-bottom: ${T.rule}pt solid #000; break-inside: avoid; }
      h1 { margin: 0 0 ${T.nameGap}pt; font-size: ${T.nameSize}pt; line-height: 1.05; font-weight: 700; overflow-wrap: anywhere; }
      .contact, .headline { font-size: ${T.contactSize}pt; line-height: ${T.leading}pt; overflow-wrap: anywhere; }
      a { color: inherit; text-decoration: none; }
      a:focus-visible { outline: 1pt solid #000; outline-offset: 1pt; }
      section { margin-top: ${T.sectionGap}pt; }
      h2 { margin: 0 0 ${T.headingGap}pt; text-align: center; text-transform: uppercase; font-size: ${T.headingSize}pt; line-height: ${T.leading}pt; font-weight: 700; break-after: avoid; }
      h2:has(+ .entry) { margin-bottom: 0; }
      .section-summary > p { text-indent: ${T.summaryIndent}pt; }
      p { margin: 0; text-align: justify; white-space: pre-line; overflow-wrap: anywhere; orphans: 2; widows: 2; }
      ul { margin: 2pt 0 0; padding-left: ${T.bulletIndent}pt; }
      li { padding: 0; margin: 0 0 ${T.bulletGap}pt; text-align: justify; overflow-wrap: anywhere; orphans: 2; widows: 2; }
      li::marker { font-size: ${T.contactSize}pt; }
      li:last-child { margin-bottom: 0; }
      .entry + .entry { margin-top: ${T.entryGap}pt; }
      .entry-heading { break-inside: avoid; break-after: avoid; }
      .entry-row { line-height: ${T.bodySize}pt; display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; column-gap: 12pt; }
      .entry-row > * { min-width: 0; overflow-wrap: anywhere; max-width: 100%; }
      .entry-right { margin-left: auto; text-align: right; }
      .entry-meta { font-style: italic; }
      .section-certifications > p { text-align: center; font-weight: 700; }
      @media print { .page.preview { width: auto; min-height: 0; padding: 0; } }
    </style></head><body><main class="page ${opts.preview ? "preview" : "print"}" data-template="${T.name}">
    ${renderResumeDocumentBodyHtml(doc)}
    </main></body></html>`;
}
