import type { ResumeDocument } from "@/types/resume-document";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function contactLine(doc: ResumeDocument): string {
  return [
    doc.contact.email,
    doc.contact.phone,
    doc.contact.location,
    doc.contact.linkedIn,
    doc.contact.github,
    doc.contact.portfolio,
  ]
    .filter(Boolean)
    .map((value) => escapeHtml(String(value)))
    .join(" · ");
}

export function renderResumeDocumentHtml(doc: ResumeDocument, opts: { preview?: boolean } = {}): string {
  const sections = doc.sections
    .map((section) => {
      const bullets = section.bullets?.length
        ? `<ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>`
        : "";
      const entries = (section.entries ?? [])
        .map((entry) => {
          const meta = [entry.location, entry.dates].filter(Boolean).join(" · ");
          return `<article class="entry">
            <div class="entry-head">
              <strong>${escapeHtml(entry.heading)}</strong>
              ${entry.subheading ? `<span>${escapeHtml(entry.subheading)}</span>` : ""}
            </div>
            ${meta ? `<div class="entry-meta">${escapeHtml(meta)}</div>` : ""}
            ${entry.bullets.length ? `<ul>${entry.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>` : ""}
          </article>`;
        })
        .join("");
      return `<section>
        <h2>${escapeHtml(section.title)}</h2>
        ${section.content ? `<p>${escapeHtml(section.content)}</p>` : ""}
        ${bullets}
        ${entries}
      </section>`;
    })
    .join("");

  const pageClass = opts.preview ? "page preview" : "page print";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: letter; margin: 0.55in 0.6in; }
    * { box-sizing: border-box; }
    body { margin: 0; background: ${opts.preview ? "#eef1f4" : "#fff"}; color: #111; font-family: "Segoe UI", Calibri, Arial, sans-serif; }
    .page.preview,
    .page.print {
      width: 8.5in;
      min-height: 11in;
      padding: 0.55in 0.6in;
      background: #fff;
    }
    .page.preview {
      margin: 0 auto;
      box-shadow: 0 8px 28px rgba(0,0,0,.12);
    }
    .page.print {
      margin: 0;
    }
    header { border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-bottom: 14px; }
    h1 { margin: 0; font-size: 22px; letter-spacing: 0.01em; }
    .headline { margin-top: 4px; font-size: 12px; color: #333; }
    .contact { margin-top: 6px; font-size: 10.5px; color: #444; }
    .target { margin-top: 8px; font-size: 10.5px; color: #555; }
    section { margin-top: 14px; break-inside: avoid-page; }
    h2 {
      margin: 0 0 6px;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      border-bottom: 1px solid #e5e5e5;
      padding-bottom: 2px;
    }
    p, li, .entry-meta { font-size: 10.5px; line-height: 1.45; }
    ul { margin: 4px 0 0 18px; padding: 0; }
    li { margin-bottom: 3px; }
    .entry { margin-top: 8px; }
    .entry-head { display: flex; justify-content: space-between; gap: 12px; font-size: 10.8px; }
    .entry-head span { color: #444; font-weight: 500; }
    .entry-meta { color: #555; margin-top: 2px; }
  </style>
</head>
<body>
  <main class="${pageClass}">
    <header>
      <h1>${escapeHtml(doc.contact.name)}</h1>
      ${doc.contact.headline ? `<div class="headline">${escapeHtml(doc.contact.headline)}</div>` : ""}
      ${contactLine(doc) ? `<div class="contact">${contactLine(doc)}</div>` : ""}
      <div class="target">${escapeHtml(doc.metadata.role)} · ${escapeHtml(doc.metadata.company)}</div>
    </header>
    ${sections}
  </main>
</body>
</html>`;
}
