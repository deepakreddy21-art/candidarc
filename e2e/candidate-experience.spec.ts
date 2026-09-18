import { expect, test } from "@playwright/test";
import { E2E_IMPORT_RESUME, textToSimplePdf } from "./helpers/simple-pdf";

/**
 * Candidate experience journey (deterministic fixtures / demo mode).
 * Sign in → Jobs → open job → tailor → three progress phases → Applications tracker.
 */
test.describe("candidate experience journey", () => {
  test("jobs-first flow with tailor and applications tracker", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel(/email/i).fill("deepak@candidarc.dev");
    await page.locator("#password").fill("CandidArc!Demo1");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/app/, { timeout: 60_000 });

    // /app should land on Jobs (radar)
    await page.goto("/app");
    await page.waitForURL(/\/app\/radar/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /jobs for you/i })).toBeVisible({ timeout: 30_000 });

    const primaryNav = page.getByRole("navigation", { name: "Primary" });
    await expect(primaryNav).toContainText(/Jobs/);
    await expect(primaryNav).toContainText(/Applications/);
    await expect(primaryNav).toContainText(/Resumes/);
    await expect(primaryNav).toContainText(/Profile/);
    await expect(primaryNav).not.toContainText(/Home|Research|Evidence|Audits|Find Jobs|My Applications/);

    await primaryNav.getByRole("link", { name: "Resumes" }).click();
    await page.waitForURL(/\/app\/resumes/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /^Resumes$|^Resume$/i })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Settings" })).toHaveCount(0);

    await primaryNav.getByRole("link", { name: "Profile" }).click();
    await page.waitForURL(/\/app\/profile/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /^Profile$/i })).toBeVisible();

    await page.goto("/app/radar");
    await expect(page.getByRole("heading", { name: /jobs for you/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /save search/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /create alert/i })).toBeVisible();

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

    await page.goto("/app/notifications");
    await expect(page.getByRole("heading", { name: /notifications/i })).toBeVisible();

    await page.goto("/app/opportunities");
    await expect(page.getByRole("heading", { name: /^Applications$/i })).toBeVisible();
    await expect(page.getByTestId("applications-table")).toBeAttached();
    await expect(page.getByTestId("applications-mobile")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/List\/Board|Kanban|Evidence coverage|Final QA/);
  });

  test("new user signup, manual profile, tailoring, downloads, and tracker", async ({ page }) => {
    test.setTimeout(180_000);
    const email = `journey-${Date.now()}@example.com`;
    await page.goto("/sign-up");
    await page.locator("#name").fill("Journey Tester");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill("JourneyTest!123");
    await page.getByRole("button", { name: /create|sign up|register/i }).click();
    await page.waitForURL(/\/onboarding/, { timeout: 60_000 });

    await expect(page.getByTestId("onboarding-step")).toHaveText(/step 1 of 3/i, { timeout: 30_000 });
    await page.locator("#target-roles").click();
    await page.locator("#target-roles").type("Platform Engineer", { delay: 20 });
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("chip-Platform Engineer")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Senior", exact: true }).click();
    await page.getByRole("group", { name: /job types/i }).getByRole("button", { name: "Full-time" }).click();
    await page.getByRole("group", { name: /workplace modes/i }).getByRole("button", { name: "Remote" }).click();
    await page.getByRole("button", { name: /^continue$/i }).click();

    await expect(page.getByTestId("onboarding-step")).toHaveText(/step 2 of 3/i, { timeout: 30_000 });
    await page.getByRole("button", { name: /enter manually/i }).click();
    await page.locator("#full-name").fill("Journey Tester");
    await page.locator("#email").fill(email);
    await page.locator("#phone").fill("+1 555 0100");
    await page.locator("#location").fill("Austin, TX");
    await page.locator("#linkedin").fill("linkedin.com/in/journey");
    await page.locator("#skills").scrollIntoViewIfNeeded();
    await page.locator("#skills").fill("TypeScript");
    await page.locator("#skills").press("Enter");
    await page.getByRole("button", { name: /add role/i }).click();
    await page.getByLabel(/job title 1/i).fill("Engineer");
    await page.getByLabel(/employer 1/i).fill("Example Co");
    await page.getByRole("button", { name: /^continue$/i }).click();

    await expect(page.getByTestId("onboarding-step")).toHaveText(/step 3 of 3/i, { timeout: 30_000 });
    await page.getByRole("button", { name: /finish setup/i }).click();
    await page.waitForURL(/\/onboarding\/complete/, { timeout: 60_000 });
    await page.getByRole("link", { name: /see jobs for you/i }).click();
    await page.waitForURL(/\/app/, { timeout: 60_000 });

    await page.goto("/app/resumes/new");
    const jd = `Senior Platform Engineer
Company: Northwind Labs
We need TypeScript, Kubernetes, and API design experience.
Responsibilities include building reliable services.
Requirements: 5+ years experience, strong ownership.`;
    await page.getByRole("textbox", { name: /job description/i }).fill(jd);
    await page.getByRole("textbox", { name: /^company/i }).fill("Northwind Labs");
    await page.getByRole("textbox", { name: /^role/i }).fill("Senior Platform Engineer");
    const generateResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/v1/resumes/generate") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: /generate tailored resume/i }).click();
    const generateResponse = await generateResponsePromise;
    if (!generateResponse.ok()) {
      throw new Error(`generate failed ${generateResponse.status()}: ${await generateResponse.text()}`);
    }
    await page.waitForURL(/\/app\/resumes\/(?!new(?:\/|$))/, { timeout: 60_000 });
    const continueWithout = page.getByRole("button", { name: /continue without answering/i });
    if (await continueWithout.isVisible().catch(() => false)) {
      await continueWithout.click();
    }
    await expect(page.getByText(/Your tailored resume|Download PDF|Download Word/i).first()).toBeVisible({
      timeout: 90_000,
    });

    const pdfLink = page.getByRole("link", { name: /download pdf/i });
    await expect(pdfLink).toBeVisible({ timeout: 30_000 });
    const [pdfDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      pdfLink.click(),
    ]);
    expect(pdfDownload.suggestedFilename().toLowerCase()).toMatch(/pdf/);

    const wordLink = page.getByRole("link", { name: /download word/i });
    const [wordDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      wordLink.click(),
    ]);
    expect(wordDownload.suggestedFilename().toLowerCase()).toMatch(/docx|doc/);

    await page.goto("/app/opportunities");
    await expect(page.getByRole("heading", { name: /^Applications$/i })).toBeVisible();
    await expect(page.getByTestId("applications-table")).toBeAttached();
    await page.reload();
    await expect(page.getByTestId("applications-table")).toBeAttached();
  });

  test("new user PDF import during onboarding", async ({ page }) => {
    test.setTimeout(180_000);
    const email = `import-${Date.now()}@example.com`;
    await page.goto("/sign-up");
    await page.locator("#name").fill("Import Tester");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill("ImportTest!123");
    await page.getByRole("button", { name: /create|sign up|register/i }).click();
    await page.waitForURL(/\/onboarding/, { timeout: 60_000 });

    await expect(page.getByTestId("onboarding-step")).toHaveText(/step 1 of 3/i, { timeout: 30_000 });
    await page.locator("#target-roles").click();
    await page.locator("#target-roles").type("Platform Engineer", { delay: 20 });
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("chip-Platform Engineer")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Senior", exact: true }).click();
    await page.getByRole("group", { name: /job types/i }).getByRole("button", { name: "Full-time" }).click();
    await page.getByRole("group", { name: /workplace modes/i }).getByRole("button", { name: "Remote" }).click();
    await page.getByRole("button", { name: /^continue$/i }).click();

    await expect(page.getByTestId("onboarding-step")).toHaveText(/step 2 of 3/i, { timeout: 30_000 });
    await page.getByRole("button", { name: /upload a resume/i }).click();
    const pdf = textToSimplePdf(E2E_IMPORT_RESUME);
    await page.locator('input[type="file"]').setInputFiles({
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await expect(page.getByText(/ready — review/i)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/Harbor Systems/i)).toBeVisible();
    const location = page.locator("#location");
    if (!(await location.inputValue()).trim()) {
      await location.fill("Seattle, WA, USA");
    }
    const phone = page.locator("#phone");
    if (!(await phone.inputValue()).trim()) {
      await phone.fill("+1 555 0100");
    }
    await page.getByRole("button", { name: /^continue$/i }).click();
    await expect(page.getByTestId("onboarding-step")).toHaveText(/step 3 of 3/i, { timeout: 30_000 });
    await page.getByRole("button", { name: /finish setup/i }).click();
    await page.waitForURL(/\/onboarding\/complete/, { timeout: 60_000 });
  });
});
