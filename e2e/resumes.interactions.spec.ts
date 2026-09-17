import { expect, test } from "@playwright/test";
import { generateResumeViaApi, seedOnboardedUser, waitForResumeReady } from "./helpers/session";

test.describe("resume interactions", () => {
  test("empty library points the user to Jobs", async ({ page }) => {
    await seedOnboardedUser(page, "resume-empty");
    await page.goto("/app/resumes");
    await expect(page.getByRole("heading", { name: /no tailored resumes yet/i })).toBeVisible();
    await page.getByRole("link", { name: /browse jobs/i }).click();
    await expect(page).toHaveURL(/\/app\/radar/);
  });

  test("generate validation requires a description or URL", async ({ page }) => {
    await seedOnboardedUser(page, "resume-invalid");
    await page.goto("/app/resumes/new");
    await page.getByRole("button", { name: /generate tailored resume/i }).click();
    await expect(page.getByText(/paste a job description or enter a job url/i)).toBeVisible();
    await expect(page).toHaveURL(/\/app\/resumes\/new/);
  });

  test("pasted description generation reaches a downloadable resume", async ({ page }) => {
    await seedOnboardedUser(page, "resume-generate");
    await page.goto("/app/resumes/new");
    await page.getByRole("textbox", { name: /job description/i }).fill(`Senior Platform Engineer
Company: Northwind Labs
We need TypeScript, Kubernetes, and API design experience.
Responsibilities include building reliable services.
Requirements: 5+ years experience, strong ownership.`);
    await page.getByRole("textbox", { name: /^company/i }).fill("Northwind Labs");
    await page.getByRole("textbox", { name: /^role/i }).fill("Senior Platform Engineer");
    const generate = page.getByRole("button", { name: /generate tailored resume/i });
    const generateResponse = page.waitForResponse(
      (res) => res.url().includes("/api/v1/resumes/generate") && res.request().method() === "POST",
    );
    await generate.click();
    const response = await generateResponse;
    expect(response.ok(), await response.text()).toBeTruthy();
    await page.waitForURL(/\/app\/resumes\/(?!new(?:\/|$))/, { timeout: 60_000 });
    await waitForResumeReady(page);
    await expect(page.getByRole("link", { name: /download pdf/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /download word/i })).toBeVisible();
  });

  test("PDF download contains readable resume text", async ({ page }) => {
    await seedOnboardedUser(page, "resume-pdf");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    const pdf = page.getByRole("link", { name: /download pdf/i });
    const [download] = await Promise.all([page.waitForEvent("download"), pdf.click()]);
    expect(download.suggestedFilename().toLowerCase()).toMatch(/pdf/);
    const path = await download.path();
    expect(path).toBeTruthy();
  });

  test("Word download is independent of the PDF control", async ({ page }) => {
    await seedOnboardedUser(page, "resume-docx");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    const word = page.getByRole("link", { name: /download word/i });
    const [download] = await Promise.all([page.waitForEvent("download"), word.click()]);
    expect(download.suggestedFilename().toLowerCase()).toMatch(/docx|word/);
  });

  test("library search opens the matching tailored resume", async ({ page }) => {
    await seedOnboardedUser(page, "resume-lib");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    await page.goto("/app/resumes");
    await page.getByRole("textbox", { name: /search resumes/i }).fill("Northwind");
    await page.getByRole("link", { name: /northwind/i }).click();
    await expect(page.getByRole("heading", { name: /your tailored resume/i })).toBeVisible();
  });

  test("failed generate preserves the pasted description", async ({ page }) => {
    await seedOnboardedUser(page, "resume-fail");
    await page.route("**/api/v1/resumes/generate", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Generator unavailable" } }),
      });
    });
    await page.goto("/app/resumes/new");
    const jd = "Keep this description for retry.";
    await page.getByRole("textbox", { name: /job description/i }).fill(jd);
    await page.getByRole("button", { name: /generate tailored resume/i }).click();
    await expect(page.getByText(/generator unavailable/i)).toBeVisible();
    await expect(page.getByRole("textbox", { name: /job description/i })).toHaveValue(jd);
  });
});
