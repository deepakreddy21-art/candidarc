import { expect, test } from "@playwright/test";
import { generateResumeViaApi, seedOnboardedUser, waitForResumeReady } from "./helpers/session";

test.describe("application interactions", () => {
  test("searching applications filters the table", async ({ page }) => {
    await seedOnboardedUser(page, "app-search");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    await page.goto("/app/opportunities");
    await expect(page.getByTestId("applications-table")).toBeVisible();
    await page.locator("#apps-search").fill("Northwind");
    await expect(page.getByRole("link", { name: /platform engineer/i })).toBeVisible();
    await page.locator("#apps-search").fill("zzzz-no-match");
    await expect(page.getByText(/no applications match/i)).toBeVisible();
  });

  test("status change persists after reload", async ({ page }) => {
    await seedOnboardedUser(page, "app-status");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    await page.goto("/app/opportunities");
    const status = page.getByLabel(/status for/i);
    await status.selectOption("Applied");
    await expect(page.getByText(/status updated/i)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(/status for/i)).toHaveValue("Applied");
  });

  test("archive then restore returns the application to the tracker", async ({ page }) => {
    await seedOnboardedUser(page, "app-archive");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    await page.goto("/app/opportunities");
    await page.getByRole("button", { name: /more actions/i }).click();
    await page.getByRole("button", { name: /^archive$/i }).click();
    await page.getByRole("button", { name: /^archive$/i }).click();
    await expect(page.getByText(/application archived/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /platform engineer/i })).toHaveCount(0);
    await page.getByRole("button", { name: /show archived/i }).click();
    await expect(page.getByRole("link", { name: /platform engineer/i })).toBeVisible();
    await page.getByRole("button", { name: /more actions/i }).click();
    await page.getByRole("button", { name: /^restore$/i }).click();
    await expect(page.getByText(/application restored/i)).toBeVisible();
    await page.getByRole("button", { name: /show active/i }).click();
    await expect(page.getByRole("link", { name: /platform engineer/i })).toBeVisible();
  });

  test("workspace notes persist and cancel leaves saved notes unchanged", async ({ page }) => {
    await seedOnboardedUser(page, "app-notes");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    await page.goto("/app/opportunities");
    await page.getByRole("link", { name: /platform engineer/i }).click();
    await page.locator("#notes").fill("Follow up Thursday");
    await page.getByRole("button", { name: /save workspace/i }).click();
    await expect(page.getByText(/application workspace saved/i)).toBeVisible();
    await page.reload();
    await expect(page.locator("#notes")).toHaveValue("Follow up Thursday");
    await page.locator("#notes").fill("should not persist");
    await page.goto("/app/opportunities");
    await page.getByRole("link", { name: /platform engineer/i }).click();
    await expect(page.locator("#notes")).toHaveValue("Follow up Thursday");
  });

  test("drafting a cover letter fills the editor from evidence", async ({ page }) => {
    await seedOnboardedUser(page, "app-cover");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    await page.goto("/app/opportunities");
    await page.getByRole("link", { name: /platform engineer/i }).click();
    await page.getByRole("button", { name: /draft from career evidence/i }).click();
    await expect(page.locator("#cover-letter")).not.toHaveValue("", { timeout: 30_000 });
    await expect(page.locator("#cover-letter")).not.toHaveValue(/notes i keep for myself/i);
  });

  test("interview practice responses persist after reload", async ({ page }) => {
    await seedOnboardedUser(page, "app-prep");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    await page.goto("/app/opportunities");
    await page.getByRole("link", { name: /platform engineer/i }).click();
    await page.getByRole("link", { name: /prepare for interview/i }).click();
    await page.locator("#practice-response").fill("I led the TypeScript migration.");
    await page.getByRole("button", { name: /save practice response/i }).click();
    await expect(page.getByText(/practice response saved/i)).toBeVisible();
    await page.reload();
    await expect(page.locator("#practice-response")).toHaveValue("I led the TypeScript migration.");
  });
});
