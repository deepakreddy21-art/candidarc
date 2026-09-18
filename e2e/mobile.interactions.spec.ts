import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { generateResumeViaApi, seedOnboardedUser, waitForResumeReady } from "./helpers/session";
import { importResumePdf, pdfContains } from "./helpers/documents";

test.describe("mobile interactions @mobile", () => {
  test("mobile navigation opens and reaches Applications", async ({ page }) => {
    await seedOnboardedUser(page, "mobile-nav");
    await page.goto("/app/radar");
    await page.getByRole("button", { name: /open navigation/i }).click();
    const drawer = page.getByRole("dialog").or(page.locator("body"));
    await page.getByRole("link", { name: /^Applications$/i }).first().click();
    await expect(page).toHaveURL(/\/app\/opportunities/);
    await expect(drawer.getByRole("button", { name: /close menu/i })).toHaveCount(0);
  });

  test("mobile bottom nav reaches Profile", async ({ page }) => {
    await seedOnboardedUser(page, "mobile-bottom");
    await page.goto("/app/radar");
    await page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: /^Profile$/i }).click();
    await expect(page).toHaveURL(/\/app\/profile/);
    await expect(page.getByRole("heading", { name: /^Profile$/i })).toBeVisible();
  });

  test("jobs on a 390px viewport keep filters and save reachable", async ({ page }) => {
    await seedOnboardedUser(page, "mobile-jobs");
    await page.goto("/app/radar");
    await expect(page.getByRole("button", { name: /^filters$/i })).toBeVisible();
    await page.getByRole("button", { name: /^filters$/i }).click();
    await expect(page.getByRole("heading", { name: /^filters$/i })).toBeVisible();
    await page.getByLabel("Work arrangement").selectOption("remote");
    await page.getByRole("button", { name: /apply filters/i }).click();
    await expect(page).toHaveURL(/arrangement=remote/);
    const row = page.getByTestId("job-row").first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(/remote/i);
    const title = (await row.locator("h3").innerText()).trim();
    const saveResponse = page.waitForResponse(
      (res) => res.url().includes("/save") && res.request().method() === "POST" && res.ok(),
    );
    await row.getByRole("button", { name: /save job/i }).click();
    await saveResponse;
    // Observable outcome: Saved tab lists the job after a successful save.
    await page.getByRole("tab", { name: /^saved$/i }).click();
    await expect(page.getByTestId("job-row").filter({ hasText: title })).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await page.getByRole("tab", { name: /^saved$/i }).click();
    await expect(page.getByTestId("job-row").filter({ hasText: title })).toBeVisible({ timeout: 30_000 });
  });

  test("landing mobile menu reaches sign-in", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /open menu/i }).click();
    const menu = page.getByRole("navigation", { name: "Mobile menu", exact: true });
    await expect(menu).toBeVisible();
    await menu.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("profile import review works at 390px", async ({ page }) => {
    await seedOnboardedUser(page, "mobile-import");
    await page.goto("/app/profile");
    await page.getByRole("button", { name: /upload a resume/i }).click();
    await expect(page.getByRole("button", { name: /choose pdf or docx|replace file/i })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: importResumePdf(),
    });
    await expect(page.getByText(/ready — review|resume ready/i)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("imported-role-title-0")).toContainText(/Harbor Systems/i);
  });

  test("tailor and PDF download work at 390px", async ({ page }) => {
    await seedOnboardedUser(page, "mobile-tailor");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    const pdf = page.getByRole("link", { name: /download pdf/i });
    const [download] = await Promise.all([page.waitForEvent("download"), pdf.click()]);
    const path = await download.path();
    expect(path).toBeTruthy();
    await pdfContains(await readFile(path!), ["Harbor Systems", "Audit Tester", "Engineer"]);
  });
});
