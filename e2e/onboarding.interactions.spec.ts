import { expect, test } from "@playwright/test";
import { DEFAULT_PASSWORD, uniqueEmail } from "./helpers/session";

async function startOnboarding(page: import("@playwright/test").Page) {
  const email = uniqueEmail("onb");
  await page.goto("/sign-up");
  await page.locator("#name").fill("Onboarding Tester");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(DEFAULT_PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/onboarding/, { timeout: 60_000 });
  await expect(page.getByTestId("onboarding-step")).toHaveText(/step 1 of 3/i);
  return email;
}

test.describe("onboarding interactions", () => {
  test("Back is disabled on the first step", async ({ page }) => {
    await startOnboarding(page);
    await expect(page.getByRole("button", { name: /^back$/i })).toBeDisabled();
  });

  test("Continue without required preferences keeps the user on step 1", async ({ page }) => {
    await startOnboarding(page);
    await page.getByRole("button", { name: /^continue$/i }).click();
    await expect(page.getByTestId("onboarding-step")).toHaveText(/step 1 of 3/i);
  });

  test("Continue advances after required preferences", async ({ page }) => {
    await startOnboarding(page);
    await page.locator("#target-roles").click();
    await page.locator("#target-roles").type("Platform Engineer", { delay: 15 });
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("chip-Platform Engineer")).toBeVisible();
    await page.getByRole("button", { name: "Senior", exact: true }).click();
    await page.getByRole("group", { name: /job types/i }).getByRole("button", { name: "Full-time" }).click();
    await page.getByRole("group", { name: /workplace modes/i }).getByRole("button", { name: "Remote" }).click();
    await page.getByRole("button", { name: /^continue$/i }).click();
    await expect(page.getByTestId("onboarding-step")).toHaveText(/step 2 of 3/i);
  });

  test("Back from career profile returns to preferences", async ({ page }) => {
    await startOnboarding(page);
    await page.locator("#target-roles").type("Platform Engineer");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Senior", exact: true }).click();
    await page.getByRole("group", { name: /job types/i }).getByRole("button", { name: "Full-time" }).click();
    await page.getByRole("group", { name: /workplace modes/i }).getByRole("button", { name: "Remote" }).click();
    await page.getByRole("button", { name: /^continue$/i }).click();
    await expect(page.getByTestId("onboarding-step")).toHaveText(/step 2 of 3/i);
    await page.getByRole("button", { name: /^back$/i }).click();
    await expect(page.getByTestId("onboarding-step")).toHaveText(/step 1 of 3/i);
    await expect(page.getByTestId("chip-Platform Engineer")).toBeVisible();
  });

  test("manual career entry appears without requiring a second job form", async ({ page }) => {
    await startOnboarding(page);
    await page.locator("#target-roles").type("Platform Engineer");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Senior", exact: true }).click();
    await page.getByRole("group", { name: /job types/i }).getByRole("button", { name: "Full-time" }).click();
    await page.getByRole("group", { name: /workplace modes/i }).getByRole("button", { name: "Remote" }).click();
    await page.getByRole("button", { name: /^continue$/i }).click();
    await page.getByRole("button", { name: /enter manually/i }).click();
    await page.getByRole("button", { name: /add role/i }).click();
    await page.getByLabel(/job title 1/i).fill("Engineer");
    await page.getByLabel(/employer 1/i).fill("Harbor Systems");
    await expect(page.getByLabel(/job title 2/i)).toHaveCount(0);
    await expect(page.getByLabel(/employer 1/i)).toHaveValue("Harbor Systems");
  });

  test("onboarding logout returns to sign-in", async ({ page }) => {
    await startOnboarding(page);
    await page.getByRole("button", { name: /log out/i }).click();
    await page.waitForURL(/\/sign-in/, { timeout: 30_000 });
  });
});
