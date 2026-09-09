/** Deterministic non-copyrighted résumé fixtures for import regression tests. */

export const PROFESSIONAL_EXPERIENCE_RESUME = `Jordan Blake
jordan.blake@example.com | (555) 010-2244 | Seattle, WA
linkedin.com/in/jordanblake | github.com/jordanblake

PROFESSIONAL EXPERIENCE

Platform Engineer | Harbor Systems | Seattle, WA
Jan 2021 - Present
- Built Kubernetes-based deployment pipelines for 12 services
- Reduced mean recovery time from 45 minutes to 8 minutes
- Mentored three engineers on observability practices

Software Engineer | Northwind Labs
Jun 2018 - Dec 2020
- Designed REST APIs in TypeScript and Node.js
- Migrated billing workflows to PostgreSQL with zero downtime

EDUCATION
B.S. Computer Science | Cascadia University | 2018

SKILLS
TypeScript, Node.js, Kubernetes, PostgreSQL, AWS, React

CERTIFICATIONS
AWS Solutions Architect Associate
`;

export const WORK_HISTORY_RESUME = PROFESSIONAL_EXPERIENCE_RESUME.replace(
  "PROFESSIONAL EXPERIENCE",
  "WORK HISTORY",
);

export const NO_EMPLOYMENT_RESUME = `Sam Rivera
sam.rivera@example.com

PROJECTS
Campus Course Planner
- Built a Next.js app for course planning used by 200 students
- Stack: TypeScript, PostgreSQL

EDUCATION
B.A. Information Systems | Lakeside College | 2024

SKILLS
TypeScript, React, SQL, Figma
`;

/** Minimal text PDF that pypdf can extract. */
export function textToSimplePdf(text: string, pages = 1): Buffer {
  const allLines = text
    .split(/\r?\n/)
    .map((ln) => ln.replace(/[()\\]/g, " ").slice(0, 90))
    .filter((ln) => ln.trim());
  const pageCount = Math.max(1, pages);
  const perPage = Math.max(1, Math.ceil(allLines.length / pageCount));

  const objects: string[] = [];
  // 1: Catalog, 2: Pages, then alternating content+page, then font
  const pageRefs: string[] = [];
  const contentStreams: string[] = [];
  for (let p = 0; p < pageCount; p++) {
    const chunk = allLines.slice(p * perPage, (p + 1) * perPage);
    const ops = ["BT /F1 10 Tf 50 750 Td 12 TL"];
    chunk.forEach((line, i) => {
      ops.push(i === 0 ? `(${line}) Tj` : `T* (${line}) Tj`);
    });
    ops.push("ET");
    contentStreams.push(ops.join("\n"));
  }

  const fontObjNum = 3 + pageCount * 2;
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  // Pages kids filled after we know page object numbers
  for (let p = 0; p < pageCount; p++) {
    const contentNum = 3 + p * 2;
    const pageNum = 4 + p * 2;
    const stream = contentStreams[p]!;
    objects.push(`${contentNum} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`);
    objects.push(
      `${pageNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentNum} 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> >> endobj`,
    );
    pageRefs.push(`${pageNum} 0 R`);
  }
  objects.splice(
    1,
    0,
    `2 0 obj << /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageCount} >> endobj`,
  );
  objects.push(`${fontObjNum} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`);

  const pdf: string[] = ["%PDF-1.4"];
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
  return Buffer.from(pdf.join("\n") + "\n");
}

export function imageOnlyPdf(): Buffer {
  const stream = "q 200 0 0 200 100 400 cm /Im0 Do Q";
  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >> endobj
4 0 obj << /Length ${stream.length} >> stream
${stream}
endstream endobj
xref
0 5
0000000000 65535 f 
trailer << /Size 5 /Root 1 0 R >>
startxref
0
%%EOF
`;
  return Buffer.from(pdf);
}
