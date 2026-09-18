/** Minimal text PDF for e2e resume import. Not a production renderer. */
export function textToSimplePdf(text: string): Buffer {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[()\\]/g, " ").slice(0, 90))
    .filter((line) => line.trim());
  const ops = ["BT /F1 10 Tf 50 750 Td 12 TL"];
  lines.forEach((line, index) => {
    ops.push(index === 0 ? `(${line}) Tj` : `T* (${line}) Tj`);
  });
  ops.push("ET");
  const stream = ops.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [4 0 R] /Count 1 >> endobj",
    `3 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
    "4 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 3 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
  ];
  const pdf = ["%PDF-1.4"];
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.reduce((n, line) => n + line.length + 1, 0));
    pdf.push(obj);
  }
  const xrefPos = pdf.reduce((n, line) => n + line.length + 1, 0);
  pdf.push("xref");
  pdf.push(`0 ${objects.length + 1}`);
  pdf.push("0000000000 65535 f ");
  for (const off of offsets.slice(1)) {
    pdf.push(`${String(off).padStart(10, "0")} 00000 n `);
  }
  pdf.push(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>`);
  pdf.push("startxref");
  pdf.push(String(xrefPos));
  pdf.push("%%EOF");
  return Buffer.from(`${pdf.join("\n")}\n`);
}

export const E2E_IMPORT_RESUME = `Jordan Blake
jordan.blake@example.com | (555) 010-2244 | Seattle, WA
linkedin.com/in/jordanblake

PROFESSIONAL EXPERIENCE
Platform Engineer | Harbor Systems | Seattle, WA
Jan 2021 - Present
- Built Kubernetes-based deployment pipelines for 12 services
- Reduced mean recovery time from 45 minutes to 8 minutes

SKILLS
TypeScript, Node.js, Kubernetes, PostgreSQL
`;
