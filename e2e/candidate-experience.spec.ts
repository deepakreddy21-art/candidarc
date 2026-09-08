import { expect, test } from "@playwright/test";

/**
 * Candidate experience journey (deterministic fixtures / demo mode).
 * Sign in → Jobs → open job → tailor → three progress phases → Applications tracker.
 */
test.describe("candidate experience journey", () => {
  test("jobs-first flow with tailor and applications tracker", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel(/email/i).fill("deepak@candidarc.dev");
    await page.getByLabel(/password/i).fill("CandidArc!Demo1");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/app/, { timeout: 60_000 });

    // /app should land on Jobs (radar)
    await page.goto("/app");
    await page.waitForURL(/\/app\/radar/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /jobs for you/i })).toBeVisible({ timeout: 30_000 });

    const primaryNav = page.getByRole("navigation", { name: "Primary" });
    await expect(primaryNav).toContainText(/Jobs/);
    await expect(primaryNav).toContainText(/Applications/);
    await expect(primaryNav).toContainText(/Resume/);
    await expect(primaryNav).not.toContainText(/Home|Research|Evidence|Audits|Find Jobs|My Applications/);

    // Filters drawer
    await page.getByRole("button", { name: /^filters$/i }).click();
    await expect(page.getByRole("heading", { name: /^filters$/i })).toBeVisible();
    await page.keyboard.press("Escape");

    // Open a job — desktop detail or navigate
    const jobRow = page.getByTestId("job-row").first();
    await expect(jobRow).toBeVisible({ timeout: 30_000 });
    await jobRow.getByRole("button").first().click();

    // Detail panel or detail page
    const detail = page.getByTestId("job-detail").first();
    await expect(detail).toBeVisible({ timeout: 15_000 });
    await expect(detail.getByText(/Why this job fits/i)).toBeVisible();
    await expect(detail.getByText(/Team signals/i)).toBeVisible();

    // Tailor from selected job (no JD repaste)
    await detail.getByRole("button", { name: /tailor my resume/i }).click();
    await page.waitForURL(/\/app\/resumes\//, { timeout: 60_000 });

    await expect(
      page
        .getByText(/Researching the role|Tailoring your resume|Quality checking|Your tailored resume is ready|We need a few details/i)
        .first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("body")).not.toContainText(/HR_AUDIT|EM_AUDIT|V0_GENERATING|Final QA/);

    const continueWithout = page.getByRole("button", { name: /continue without answering/i });
    if (await continueWithout.isVisible().catch(() => false)) {
      await continueWithout.click();
    }

    await expect(page.getByText(/Download|PDF|Word|Refine|ready/i).first()).toBeVisible({
      timeout: 90_000,
    });

    await page.goto("/app/opportunities");
    await expect(page.getByRole("heading", { name: /^Applications$/i })).toBeVisible();
    await expect(page.getByTestId("applications-table").or(page.getByTestId("applications-mobile"))).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/List\/Board|Kanban|Evidence coverage|Final QA/);
  });
});
