import { expect, test } from "@playwright/test";
import { seedOnboardedUser } from "./helpers/session";

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
    await expect(page.getByTestId("job-row").first().getByRole("button", { name: /save job/i })).toBeVisible();
    const box = await page.getByRole("button", { name: /^filters$/i }).boundingBox();
    expect(box).toBeTruthy();
    expect((box?.width ?? 0) + (box?.x ?? 0)).toBeLessThanOrEqual(400);
  });

  test("landing mobile menu reaches sign-in", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /open menu/i }).click();
    await page.getByRole("link", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
