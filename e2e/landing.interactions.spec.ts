import { expect, test } from "@playwright/test";

test.describe("landing interactions", () => {
  test("Build my resume opens signup", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /build my resume/i }).first().click();
    await expect(page).toHaveURL(/\/sign-up/);
    await expect(page.getByRole("heading", { name: /build my application/i })).toBeVisible();
  });

  test("Sign in from the header reaches the form", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /^sign in$/i }).first().click();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("marketing anchors reveal the matching sections", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /see the difference/i }).first().click();
    await expect(page.locator("#difference")).toBeVisible();
  });
});
