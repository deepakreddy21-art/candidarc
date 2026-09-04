import { expect, test } from "@playwright/test";

/**
 * Complete primary customer journey (happy path against mock AI + memory mode).
 */
test.describe("primary customer journey", () => {
  test("landing → sign-in → generate resume → see customer-friendly loading → preview", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/V0|HR1|EM1|interview readiness/i);
    await expect(page.locator("body")).toContainText(/Paste a job description|job description/i);

    await page.goto("/sign-in");
    await page.getByLabel(/email/i).fill("deepak@candidarc.dev");
    await page.getByLabel(/password/i).fill("CandidArc!Demo1");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/(app|onboarding)/, { timeout: 60_000 });

    // Skip incomplete onboarding if redirected there
    if (page.url().includes("/onboarding")) {
      await page.goto("/app/resumes/new");
    } else {
      await page.goto("/app/resumes/new");
    }

    await expect(page.getByRole("navigation", { name: "Primary" })).toContainText(
      /Home|Find Jobs|My Applications|Career Profile|Settings/,
    );
    await expect(page.getByRole("navigation", { name: "Primary" })).not.toContainText(
      /Resume Studio|Application Copilot|Interview/,
    );

    const jd = `Senior Platform Engineer
Company: Acme Robotics
We need someone with Python, AWS, and API design experience.
Responsibilities include building reliable services and mentoring engineers.
Requirements: 5+ years experience, strong ownership, measurable impact.`;

    const textarea = page.getByRole("textbox").first();
    await textarea.fill(jd);
    await page.getByRole("button", { name: /create|generate|tailor/i }).first().click();

    await expect(
      page.getByText(/Understanding role|Tailoring experience|Preparing documents|Working on your resume/i).first(),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("body")).not.toContainText(/HR_AUDIT|EM_AUDIT|V0_GENERATING/);

    // Wait for completion (mock pipeline is fast)
    await expect(
      page.getByText(/Version|Download|PDF|Word|Refine|Quality/i).first(),
    ).toBeVisible({ timeout: 90_000 });
  });
});
