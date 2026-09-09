/**
 * Deterministic UAT error/retry screenshots (gitignored under candidate-screenshots/).
 * Prefer `npx playwright test e2e/candidate-screenshots.spec.ts` with the app running.
 * This helper documents the required matrix for Defect 6.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("candidate-screenshots");
mkdirSync(OUT, { recursive: true });

const matrix = [
  "jobs-list-1440 / jobs-list-390 — normal jobs",
  "jobs-empty-1440 / jobs-empty-390 — empty results",
  "radar-load-failure-1440 / 390 — ErrorState + Retry",
  "tailoring-failure-1440 / 390 — failed workflow + Retry",
  "application-version-conflict-1440 / 390 — 409 keeps selection",
  "resume-result-1440 — successful preview/download",
  "Also capture via onboarding flows: upload failure, parse failure, PDF_RENDER_FAILED",
];

writeFileSync(path.join(OUT, "REQUIRED_MATRIX.txt"), matrix.join("\n") + "\n", "utf8");
console.log(`Wrote ${path.join(OUT, "REQUIRED_MATRIX.txt")}`);
console.log("Run: npx playwright test e2e/candidate-screenshots.spec.ts");
