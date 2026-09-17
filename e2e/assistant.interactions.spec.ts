import { expect, test } from "@playwright/test";
import { generateResumeViaApi, seedOnboardedUser, waitForResumeReady } from "./helpers/session";

test.describe("assistant interactions", () => {
  test("open and close the copilot panel", async ({ page }) => {
    await seedOnboardedUser(page, "ask-open");
    await page.goto("/app/radar");
    await page.getByTestId("job-row").first().getByRole("button").first().click();
    await page.getByRole("button", { name: /ask about this job/i }).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: /ask about this job/i }).click();
    await expect(page.getByRole("complementary", { name: /career copilot/i })).toBeVisible();
    await page.getByRole("button", { name: /^close$/i }).click();
    await expect(page.getByRole("complementary", { name: /career copilot/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /ask about this job/i })).toBeVisible();
  });

  test("send persists the conversation after reload", async ({ page }) => {
    await seedOnboardedUser(page, "ask-send");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    await page.getByRole("button", { name: /ask about this resume/i }).click();
    await page.getByRole("textbox", { name: /ask the copilot/i }).fill("Summarize my strongest evidence.");
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect(page.getByText("Summarize my strongest evidence.", { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await page.getByRole("button", { name: /ask about this resume/i }).click();
    await expect(page.getByText("Summarize my strongest evidence.", { exact: true })).toBeVisible();
  });

  test("a failed send shows an error and retry recovers", async ({ page }) => {
    await seedOnboardedUser(page, "ask-retry");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    await page.getByRole("button", { name: /ask about this resume/i }).click();
    let blocked = true;
    await page.route("**/api/v1/assistant", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      if (blocked) {
        blocked = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "Assistant unavailable" } }),
        });
        return;
      }
      await route.continue();
    });
    await page.getByRole("textbox", { name: /ask the copilot/i }).fill("What should I emphasize?");
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: /assistant unavailable/i })).toBeVisible();
    await page.getByRole("button", { name: /^retry$/i }).click();
    await expect(page.getByText("What should I emphasize?", { exact: true })).toBeVisible({ timeout: 30_000 });
  });
});
