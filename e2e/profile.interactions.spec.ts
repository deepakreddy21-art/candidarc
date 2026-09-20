import { expect, test } from "@playwright/test";
import { seedOnboardedUser } from "./helpers/session";

test.describe("profile interactions", () => {
  test("one contact editor autosaves headline and preferred name after reload", async ({ page }) => {
    await seedOnboardedUser(page, "profile-save");
    await page.goto("/app/profile");
    await expect(page.getByLabel("Full name", { exact: true })).toHaveCount(1);
    await page.locator("#headline").fill("Staff platform engineer");
    await page.locator("#preferred-name").fill("Jordan");
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await page.reload();
    await expect(page.locator("#headline")).toHaveValue("Staff platform engineer");
    await expect(page.locator("#preferred-name")).toHaveValue("Jordan");
  });

  test("removing a populated role can be undone and survives reload", async ({ page }) => {
    await seedOnboardedUser(page, "profile-undo");
    await page.goto("/app/profile");
    const original = await page.getByLabel("Employer 1", { exact: true }).inputValue();
    await page.getByRole("button", { name: "Remove role 1", exact: true }).click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByLabel("Employer 1", { exact: true })).toHaveValue(original);
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Employer 1", { exact: true })).toHaveValue(original);
  });

  test("optional professional links persist through the shared editor", async ({ page }) => {
    await seedOnboardedUser(page, "profile-links");
    await page.goto("/app/profile");
    await page.locator("#github").fill("github.com/audit-tester");
    await page.locator("#portfolio").fill("https://example.com/portfolio");
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await page.reload();
    await expect(page.locator("#github")).toHaveValue("github.com/audit-tester");
    await expect(page.locator("#portfolio")).toHaveValue("https://example.com/portfolio");
  });
});
