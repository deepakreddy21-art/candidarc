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
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join(outDir, "jobs-empty-390.png"), fullPage: true });

    // Radar load failure + Retry (deterministic via route abort)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route("**/api/v1/jobs/search**", (route) => route.abort());
    await page.goto("/app/radar");
    await expect(page.getByRole("button", { name: /retry/i })).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: join(outDir, "radar-load-failure-1440.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join(outDir, "radar-load-failure-390.png"), fullPage: true });
    await page.unroute("**/api/v1/jobs/search**");

    // Tailoring / workflow failure
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route("**/api/v1/resumes/workflows/**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            workflowId: "wf_fail_demo",
            applicationId: "app_fail_demo",
            status: "failed",
            message: "Tailoring failed — fictional demo error for screenshots.",
            pipelineStage: "failed",
            downloads: { pdfReady: false, docxReady: false },
          }),
        });
        return;
      }
      await route.continue();
    });
    await page.goto("/app/resumes/wf_fail_demo");
    await expect(page.getByRole("button", { name: /retry/i }).or(page.getByText(/failed|try again/i)).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: join(outDir, "tailoring-failure-1440.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join(outDir, "tailoring-failure-390.png"), fullPage: true });
    await page.unroute("**/api/v1/resumes/workflows/**");

    // Application version conflict toast (keep selection)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/opportunities");
    await page.route("**/api/v1/applications/**", async (route) => {
      if (route.request().method() === "PATCH" || route.request().method() === "PUT") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "APPLICATION_VERSION_CONFLICT",
              message: "Application was updated elsewhere. Reload and try again.",
            },
          }),
        });
        return;
      }
      await route.continue();
    });
    const statusSelect = page.locator("select").first();
    if (await statusSelect.isVisible().catch(() => false)) {
      await statusSelect.selectOption({ label: "Interviewing" }).catch(async () => {
        await statusSelect.selectOption({ index: 2 });
      });
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(outDir, "application-version-conflict-1440.png"), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: join(outDir, "application-version-conflict-390.png"), fullPage: true });
    }
    await page.unroute("**/api/v1/applications/**");
  });
});
