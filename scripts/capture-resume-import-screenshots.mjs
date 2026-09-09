/**
 * Manual proof screenshots for onboarding resume import (gitignored output).
 * Requires: npm run dev:stack on :3000 with worker + Python.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("resume-import-screenshots");
mkdirSync(OUT, { recursive: true });

const RESUME = `Jordan Blake
jordan.blake@example.com | (555) 010-2244 | Seattle, WA

PROFESSIONAL EXPERIENCE

Platform Engineer | Harbor Systems | Seattle, WA
Jan 2021 - Present
- Built Kubernetes-based deployment pipelines for 12 services
- Reduced mean recovery time from 45 minutes to 8 minutes

Software Engineer | Northwind Labs
Jun 2018 - Dec 2020
- Designed REST APIs in TypeScript and Node.js

EDUCATION
B.S. Computer Science | Cascadia University | 2018

SKILLS
TypeScript, Node.js, Kubernetes, PostgreSQL, AWS, React

CERTIFICATIONS
AWS Solutions Architect Associate
`;

function textPdf(text) {
  const lines = text
    .split(/\r?\n/)
    .map((ln) => ln.replace(/[()\\]/g, " ").slice(0, 90))
    .filter((ln) => ln.trim());
  const ops = ["BT /F1 10 Tf 50 750 Td 12 TL"];
  lines.forEach((line, i) => {
    ops.push(i === 0 ? `(${line}) Tj` : `T* (${line}) Tj`);
  });
  ops.push("ET");
  const stream = ops.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
  ];
  const pdf = ["%PDF-1.4"];
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.reduce((n, line) => n + line.length + 1, 0));
    pdf.push(obj);
  }
  const xrefPos = pdf.reduce((n, line) => n + line.length + 1, 0);
  pdf.push("xref", `0 ${objects.length + 1}`, "0000000000 65535 f ");
  for (const off of offsets.slice(1)) pdf.push(`${String(off).padStart(10, "0")} 00000 n `);
  pdf.push(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>`, "startxref", String(xrefPos), "%%EOF");
  return Buffer.from(pdf.join("\n") + "\n");
}

function imageOnlyPdf() {
  const stream = "q 200 0 0 200 100 400 cm /Im0 Do Q";
  return Buffer.from(`%PDF-1.4
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
`);
}

const email = `import-proof-${Date.now()}@example.com`;
const password = "OnboardTest!123";
const pdfPath = path.join(OUT, "jordan-blake.pdf");
const scanPath = path.join(OUT, "scan.pdf");
writeFileSync(pdfPath, textPdf(RESUME));
writeFileSync(scanPath, imageOnlyPdf());

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto("http://127.0.0.1:3000/sign-up");
await page.locator("#name").fill("Import Proof");
await page.locator("#email").fill(email);
await page.locator("#password").fill(password);
await page.getByRole("button", { name: /create|sign up|register/i }).click();
await page.waitForURL(/onboarding/, { timeout: 60_000 });

await page.locator("#target-roles").click();
await page.locator("#target-roles").type("Platform Engineer", { delay: 20 });
await page.keyboard.press("Enter");
await page.getByRole("button", { name: "Senior", exact: true }).click();
await page.getByRole("button", { name: /^Continue$/i }).click();

await page.getByRole("group", { name: /job types/i }).getByRole("button", { name: "Full-time" }).click();
await page.getByRole("group", { name: /workplace modes/i }).getByRole("button", { name: "Remote" }).click();
await page.getByRole("button", { name: /^Continue$/i }).click();

await page.getByRole("button", { name: /Upload a resume/i }).click();
await page.getByRole("button", { name: /Choose PDF or DOCX/i }).waitFor({ timeout: 15_000 });
await page.locator('input[type="file"]').setInputFiles(pdfPath);
await page.screenshot({ path: path.join(OUT, "01-processing.png"), fullPage: true });

await page.getByTestId("import-summary").waitFor({ timeout: 90_000 });
await page.screenshot({ path: path.join(OUT, "02-import-summary.png"), fullPage: true });
await page.getByTestId("imported-employment-cards").waitFor();
await page.screenshot({ path: path.join(OUT, "03-employment-review.png"), fullPage: true });

await page.getByRole("button", { name: /^Continue$/i }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(OUT, "04-review-after-continue.png"), fullPage: true });

await page.getByRole("button", { name: /Back/i }).click();
await page.waitForTimeout(800);
await page.locator('input[type="file"]').setInputFiles(scanPath);
await page.getByRole("alert").filter({ hasText: /scanned images/i }).waitFor({ timeout: 90_000 });
await page.screenshot({ path: path.join(OUT, "05-image-only-error.png"), fullPage: true });

await browser.close();
console.log(`Screenshots written to ${OUT}`);
console.log(`Used account ${email}`);
