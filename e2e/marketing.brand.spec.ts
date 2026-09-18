import { expect, test } from "@playwright/test";

test.describe("marketing brand motion", () => {
  test("homepage is light-only with forest Python panel and working CTAs", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("theme", "dark");
      document.documentElement.classList.add("dark");
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Get noticed for/i })).toBeVisible();
    await expect(page.getByText(/what you can do\./i).first()).toBeVisible();
    const forest = page.getByText(/The team uses Python\. So have you\./i).first();
    await expect(forest).toBeVisible();
    const color = await forest.evaluate((el) => getComputedStyle(el).color);
    // white-ish on forest
    expect(color).toMatch(/rgb\(\s*255,\s*255,\s*255\s*\)|#fff/i);
    await expect(page.getByRole("link", { name: /Build my resume|Get started/i }).first()).toHaveAttribute(
      "href",
      "/sign-up",
    );
    await expect(page.getByRole("button", { name: /See it in action/i })).toBeVisible();
    await page.getByRole("button", { name: /See it in action/i }).click();
    await expect(page.getByRole("dialog", { name: /Product demo/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
