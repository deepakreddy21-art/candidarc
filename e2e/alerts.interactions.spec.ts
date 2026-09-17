import { expect, test } from "@playwright/test";
import { seedOnboardedUser } from "./helpers/session";

test.describe("alerts and saved-search interactions", () => {
  test("pause and resume keep the alert without duplicating it", async ({ page }) => {
    await seedOnboardedUser(page, "alert-pause");
    await page.goto("/app/radar/alerts");
    const name = `Pause me ${Date.now()}`;
    await page.locator("#alert-name").fill(name);
    await page.getByRole("button", { name: /create alert/i }).click();
    await expect(page.getByText(/alert saved/i)).toBeVisible();
    await expect(page.getByText(name).first()).toBeVisible();
    await page.getByRole("button", { name: /^pause$/i }).click();
    await expect(page.getByText(/alert paused/i)).toBeVisible();
    await expect(page.getByText(name).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^resume$/i })).toBeVisible();
    await expect(page.getByText(name)).toHaveCount(1);
    await page.getByRole("button", { name: /^resume$/i }).click();
    await expect(page.getByText(/alert resumed/i)).toBeVisible();
    await page.reload();
    await expect(page.getByText(name)).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^pause$/i })).toBeVisible();
  });

  test("deleting an alert removes it after reload", async ({ page }) => {
    await seedOnboardedUser(page, "alert-delete");
    await page.goto("/app/radar/alerts");
    const name = `Delete me ${Date.now()}`;
    await page.locator("#alert-name").fill(name);
    await page.getByRole("button", { name: /create alert/i }).click();
    await expect(page.getByText(name).first()).toBeVisible();
    await page.getByRole("button", { name: /^delete$/i }).click();
    await expect(page.getByText(/alert deleted/i)).toBeVisible();
    await page.reload();
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test("renaming a saved search persists after reload", async ({ page }) => {
    await seedOnboardedUser(page, "search-rename");
    await page.goto("/app/radar/saved");
    const original = `Preset ${Date.now()}`;
    await page.locator("#saved-search-name").fill(original);
    await page.getByRole("button", { name: /^save search$/i }).click();
    await expect(page.getByText(/search saved/i)).toBeVisible();
    await expect(page.getByText(original).first()).toBeVisible();
    const renamed = `${original} edited`;
    const nameField = page.getByLabel(new RegExp(`saved search name for ${original}`, "i"));
    await nameField.fill(renamed);
    await nameField.blur();
    await expect(page.getByText(/search renamed/i)).toBeVisible();
    await page.reload();
    await expect(page.getByText(renamed).first()).toBeVisible();
  });
});
