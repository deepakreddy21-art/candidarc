import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Capture candidate-experience screenshots at required widths.
 * Artifacts land in candidate-screenshots/ (gitignored).
 */
const widths = [1440, 1024, 768, 390] as const;
const outDir = join(process.cwd(), "candidate-screenshots");

test.describe("candidate screenshots", () => {
  test("capture jobs, detail, filters, resume, applications states", async ({ page }) => {
    mkdirSync(outDir, { recursive: true });

    await page.goto("/sign-in");
    await page.getByLabel(/email/i).fill("deepak@candidarc.dev");
    await page.getByLabel(/password/i).fill("CandidArc!Demo1");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/app/, { timeout: 60_000 });

    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.goto("/app/radar");
      await expect(page.getByRole("heading", { name: /jobs for you/i })).toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: join(outDir, `jobs-list-${width}.png`), fullPage: true });

      await page.getByRole("button", { name: /^filters$/i }).click();
      await expect(page.getByRole("heading", { name: /^filters$/i })).toBeVisible();
      await page.screenshot({ path: join(outDir, `filter-drawer-${width}.png`), fullPage: true });
      await page.keyboard.press("Escape");

      const row = page.getByTestId("job-row").first();
      await row.click();
      if (width < 1024) {
        await page.waitForURL(/\/app\/radar\/jobs\//, { timeout: 15_000 });
      }
      await expect(page.getByTestId("job-detail").first()).toBeVisible({ timeout: 15_000 });
      await page.screenshot({ path: join(outDir, `job-detail-${width}.png`), fullPage: true });
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/radar");
    await page.getByTestId("job-row").first().getByRole("button", { name: /tailor/i }).click();
    await page.waitForURL(/\/app\/resumes\//, { timeout: 60_000 });
    await page.screenshot({ path: join(outDir, "resume-progress-1440.png"), fullPage: true });

    const continueWithout = page.getByRole("button", { name: /continue without answering/i });
    if (await continueWithout.isVisible().catch(() => false)) await continueWithout.click();
    await expect(page.getByText(/Download|PDF|Word|ready/i).first()).toBeVisible({ timeout: 90_000 });
    await page.screenshot({ path: join(outDir, "resume-result-1440.png"), fullPage: true });

    await page.goto("/app/opportunities");
    await expect(page.getByRole("heading", { name: /^Applications$/i })).toBeVisible();
    await page.screenshot({ path: join(outDir, "applications-1440.png"), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join(outDir, "applications-390.png"), fullPage: true });

    // Empty / error honest states via URL with no matches
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/radar?q=__no_such_role_zzzz__");
    await expect(page.getByText(/no matching roles/i)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: join(outDir, "jobs-empty-1440.png"), fullPage: true });
  });
});
