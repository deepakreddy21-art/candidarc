import { expect, test } from "@playwright/test";
import { seedOnboardedUser } from "./helpers/session";

test.describe("profile interactions", () => {
  test("saving identity persists after reload", async ({ page }) => {
    await seedOnboardedUser(page, "profile-save");
    await page.goto("/app/profile");
    await page.locator("#identity-headline").fill("Staff platform engineer");
    await page.getByRole("button", { name: /save identity/i }).click();
    await expect(page.getByText(/identity saved/i)).toBeVisible();
    await page.reload();
    await expect(page.locator("#identity-headline")).toHaveValue("Staff platform engineer");
  });

  test("cancel restores the last saved identity", async ({ page }) => {
    await seedOnboardedUser(page, "profile-cancel");
    await page.goto("/app/profile");
    const original = await page.locator("#identity-fullName").inputValue();
    await page.locator("#identity-fullName").fill("Temporary Name");
    await page.getByRole("button", { name: /^cancel$/i }).click();
    await expect(page.locator("#identity-fullName")).toHaveValue(original);
    await page.reload();
    await expect(page.locator("#identity-fullName")).toHaveValue(original);
  });

  test("external professional fields are editable links-in-waiting", async ({ page }) => {
    await seedOnboardedUser(page, "profile-links");
    await page.goto("/app/profile");
    await page.locator("#identity-github").fill("github.com/audit-tester");
    await page.locator("#identity-portfolio").fill("https://example.com/portfolio");
    await page.getByRole("button", { name: /save identity/i }).click();
    await expect(page.getByText(/identity saved/i)).toBeVisible();
    await page.reload();
    await expect(page.locator("#identity-github")).toHaveValue("github.com/audit-tester");
    await expect(page.locator("#identity-portfolio")).toHaveValue("https://example.com/portfolio");
  });
});
