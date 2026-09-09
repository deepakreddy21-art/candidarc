/**
 * Deterministic UAT error/retry screenshots (gitignored under candidate-screenshots/).
 * Run: npx playwright test e2e/candidate-screenshots.spec.ts
 * Requires dev stack (Next + FastAPI) unless PLAYWRIGHT_SKIP_WEBSERVER is set with app already up.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("candidate-screenshots");
mkdirSync(OUT, { recursive: true });

const matrix = [
  "jobs-list-1440 / jobs-list-390 — normal jobs state",
  "jobs-empty-1440 / jobs-empty-390 — empty results",
  "radar-load-failure-1440 / radar-load-failure-390 — ErrorState + Retry",
  "resume-upload-failure-1440 / resume-upload-failure-390 — upload API failure",
  "resume-parse-failure-1440 / resume-parse-failure-390 — PARSE_FAILED + Retry",
  "tailoring-failure-1440 / tailoring-failure-390 — failed workflow + Retry",
  "pdf-render-failure-1440 / pdf-render-failure-390 — PDF_RENDER_FAILED + Retry",
  "application-version-conflict-1440 / application-version-conflict-390 — 409 keeps selection",
  "resume-result-1440 / resume-result-390 — successful preview/download",
];

writeFileSync(path.join(OUT, "REQUIRED_MATRIX.txt"), matrix.join("\n") + "\n", "utf8");
console.log(`Wrote ${path.join(OUT, "REQUIRED_MATRIX.txt")}`);
console.log("Run: npx playwright test e2e/candidate-screenshots.spec.ts");
