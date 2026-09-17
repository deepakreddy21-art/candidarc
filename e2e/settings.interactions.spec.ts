import { expect, test } from "@playwright/test";
import { seedOnboardedUser } from "./helpers/session";

test.describe("settings interactions", () => {
  test("saving preferences persists after reload", async ({ page }) => {
    await seedOnboardedUser(page, "prefs");
    await page.goto("/app/settings/preferences");
    await page.getByRole("switch", { name: /email digest/i }).click();
    await page.getByRole("button", { name: /save preferences/i }).click();
    await expect(page.getByText(/preferences saved/i)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("switch", { name: /email digest/i })).toHaveAttribute("aria-checked", "false");
  });

  test("billing portal controls stay disabled with a reason", async ({ page }) => {
    await seedOnboardedUser(page, "billing");
    await page.goto("/app/settings/billing");
    await expect(page.getByRole("button", { name: /manage billing/i })).toBeDisabled();
    await expect(page.getByRole("button", { name: /download latest invoice/i })).toBeDisabled();
    await expect(page.locator("#billing-unavailable")).toBeVisible();
  });

  test("privacy controls persist after reload", async ({ page }) => {
    await seedOnboardedUser(page, "privacy");
    await page.goto("/app/settings/privacy");
    await page.getByLabel("Retention window").selectOption("6");
    await page.getByRole("button", { name: /save retention/i }).click();
    await expect(page.getByText(/retention preference saved/i)).toBeVisible();
    await page.getByRole("switch", { name: /model improvement/i }).click();
    await page.getByRole("button", { name: /save privacy controls/i }).click();
    await page.reload();
    await expect(page.getByLabel("Retention window")).toHaveValue("6");
    await expect(page.getByRole("switch", { name: /model improvement/i })).toHaveAttribute("aria-checked", "false");
  });

  test("delete documents stays disabled because the action is unsupported", async ({ page }) => {
    await seedOnboardedUser(page, "docs");
    await page.goto("/app/settings/privacy");
    await expect(page.getByRole("button", { name: /delete documents/i })).toBeDisabled();
    await expect(page.getByText(/per-document deletion is not available/i)).toBeVisible();
  });

  test("export downloads account JSON", async ({ page }) => {
    await seedOnboardedUser(page, "export");
    await page.goto("/app/settings/privacy");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /export my data/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/candidarc-export/i);
  });

  test("integrations list disabled live connectors instead of fake connect buttons", async ({ page }) => {
    await seedOnboardedUser(page, "integrations");
    await page.goto("/app/settings/integrations");
    await expect(page.getByRole("heading", { name: "LinkedIn" })).toBeVisible();
    await expect(page.getByRole("button", { name: /connect/i })).toHaveCount(0);
  });
});
