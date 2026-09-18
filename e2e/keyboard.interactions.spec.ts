import { expect, test } from "@playwright/test";
import { seedOnboardedUser } from "./helpers/session";

test.describe("keyboard interactions", () => {
  test("Ctrl/Cmd+K opens the command palette and Escape closes it", async ({ page }) => {
    await seedOnboardedUser(page, "kbd-cmd");
    await page.goto("/app/radar");
    await page.keyboard.press("Control+K");
    await expect(page.getByPlaceholder(/search commands/i)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByPlaceholder(/search commands/i)).toHaveCount(0);
  });

  test("Filters can be opened and closed from the keyboard", async ({ page }) => {
    await seedOnboardedUser(page, "kbd-filters");
    await page.goto("/app/radar");
    await page.getByRole("button", { name: /^filters$/i }).focus();
    await expect(page.getByRole("button", { name: /^filters$/i })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: /^filters$/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: /^filters$/i })).toHaveCount(0);
  });
});
