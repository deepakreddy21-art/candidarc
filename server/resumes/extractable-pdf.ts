/**
 * Deterministic, extractable text PDF with a valid xref table.
 * Used when Chromium print output fails content verification.
 * Preserves full plain-text content via wrapped lines (no silent truncation).
 */

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 50;
const MARGIN_TOP = 750;
const LINE_HEIGHT = 14;
const MAX_CHARS = 95;
const LINES_PER_PAGE = Math.floor((MARGIN_TOP - 50) / LINE_HEIGHT);

/** Map common Unicode to ASCII so Helvetica can encode the text layer. */
export function toPdfSafeText(input: string): string {
  return input
    .replace(/\u00b7/g, " | ")
    .replace(/[\u2022\u2023\u25e6]/g, "-")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfString(value: string): string {
  return toPdfSafeText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/** Wrap without dropping characters from long employment/skills lines. */
export function wrapPdfLines(plainText: string, maxChars = MAX_CHARS): string[] {
  const out: string[] = [];
  for (const raw of plainText.split(/\r?\n/)) {
    const line = toPdfSafeText(raw);
    if (!line) {
      out.push("");
      continue;
    }
    let remaining = line;
    while (remaining.length > maxChars) {
      let breakAt = remaining.lastIndexOf(" ", maxChars);
      if (breakAt < Math.floor(maxChars * 0.4)) breakAt = maxChars;
      out.push(remaining.slice(0, breakAt).trimEnd());
      remaining = remaining.slice(breakAt).trimStart();
    }
    if (remaining) out.push(remaining);
  }
  return out;
}

function buildContentStream(lines: string[]): string {
  const ops = ["BT", "/F1 11 Tf", `${MARGIN_X} ${MARGIN_TOP} Td`, `${LINE_HEIGHT} TL`];
  lines.forEach((line, index) => {
    const escaped = escapePdfString(line);
    if (index === 0) ops.push(`(${escaped}) Tj`);
    else ops.push("T*", `(${escaped}) Tj`);
  });
  ops.push("ET");
  return ops.join("\n");
}

function padOffset(offset: number): string {
  return offset.toString().padStart(10, "0");
}

/**
 * Build a valid multi-page PDF/1.4 with extractable Helvetica text and correct startxref.
 */
export function createExtractableTextPdf(plainText: string): Buffer {
  const wrapped = wrapPdfLines(plainText);
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += LINES_PER_PAGE) {
    pages.push(wrapped.slice(i, i + LINES_PER_PAGE));
  }
  if (!pages.length) pages.push(["(empty resume)"]);

  const objectBodies: string[] = [];
  const addObject = (body: string): number => {
    objectBodies.push(body);
    return objectBodies.length; // 1-based object id
  };

  const catalogId = addObject("PLACEHOLDER_CATALOG");
  const pagesId = addObject("PLACEHOLDER_PAGES");
  const pageIds: number[] = [];
  const contentIds: number[] = [];
  for (let i = 0; i < pages.length; i++) {
    pageIds.push(addObject("PLACEHOLDER_PAGE"));
    contentIds.push(addObject("PLACEHOLDER_CONTENT"));
  }
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  objectBodies[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objectBodies[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;

  for (let i = 0; i < pages.length; i++) {
    const stream = buildContentStream(pages[i]!);
    const streamBytes = Buffer.byteLength(stream, "utf8");
    objectBodies[pageIds[i]! - 1] =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
    objectBodies[contentIds[i]! - 1] = `<< /Length ${streamBytes} >> stream\n${stream}\nendstream`;
  }

  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let id = 1; id <= objectBodies.length; id++) {
    offsets[id] = Buffer.byteLength(body, "utf8");
    body += `${id} 0 obj\n${objectBodies[id - 1]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(body, "utf8");
  const size = objectBodies.length + 1;
  body += `xref\n0 ${size}\n`;
  body += "0000000000 65535 f \n";
  for (let id = 1; id <= objectBodies.length; id++) {
    body += `${padOffset(offsets[id]!)} 00000 n \n`;
  }
  body += `trailer << /Size ${size} /Root ${catalogId} 0 R >>\n`;
  body += `startxref\n${xrefStart}\n%%EOF\n`;

  if (body.includes("startxref\n0\n")) {
    throw new Error("Refusing to emit PDF with invalid startxref 0");
  }
  return Buffer.from(body, "utf8");
}
