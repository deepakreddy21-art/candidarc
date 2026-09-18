import { expect, test } from "@playwright/test";
import { seedOnboardedUser } from "./helpers/session";

test.describe("navigation interactions", () => {
  test("primary nav reaches every destination", async ({ page }) => {
    await seedOnboardedUser(page, "nav");
    await page.goto("/app/radar");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Applications" }).click();
    await expect(page).toHaveURL(/\/app\/opportunities/);
    await expect(page.getByRole("heading", { name: /^Applications$/i })).toBeVisible();
    await nav.getByRole("link", { name: "Resumes" }).click();
    await expect(page).toHaveURL(/\/app\/resumes/);
    await expect(page.getByRole("heading", { name: /^Resumes$/i })).toBeVisible();
    await nav.getByRole("link", { name: "Profile" }).click();
    await expect(page).toHaveURL(/\/app\/profile/);
    await expect(page.getByRole("heading", { name: /^Profile$/i })).toBeVisible();
    await nav.getByRole("link", { name: "Jobs" }).click();
    await expect(page).toHaveURL(/\/app\/radar/);
    await expect(page.getByRole("heading", { name: /jobs for you/i })).toBeVisible();
  });

  test("account menu opens Profile and Settings", async ({ page }) => {
    await seedOnboardedUser(page, "menu");
    await page.goto("/app/radar");
    await page.getByRole("button", { name: /user menu/i }).click();
    await page.getByRole("menuitem", { name: /^profile$/i }).click();
    await expect(page).toHaveURL(/\/app\/profile/);
    await page.getByRole("button", { name: /user menu/i }).click();
    await page.getByRole("menuitem", { name: /^settings$/i }).click();
    await expect(page).toHaveURL(/\/app\/settings/);
    await expect(page.getByRole("heading", { name: /^Settings$/i })).toBeVisible();
  });

  test("command palette navigates to Resumes", async ({ page }) => {
    await seedOnboardedUser(page, "cmd");
    await page.goto("/app/radar");
    await page.getByRole("button", { name: /open command palette/i }).click();
    await expect(page.getByPlaceholder(/search commands/i)).toBeVisible();
    await page.getByRole("option", { name: /^Resumes$/i }).click();
    await expect(page).toHaveURL(/\/app\/resumes/);
  });

  test("notifications destination opens from the bell", async ({ page }) => {
    await seedOnboardedUser(page, "bell");
    await page.goto("/app/radar");
    await page.getByRole("link", { name: /notifications/i }).click();
    await expect(page).toHaveURL(/\/app\/notifications/);
    await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
  });

  test("settings cards open each section", async ({ page }) => {
    await seedOnboardedUser(page, "settings");
    const destinations = [
      { name: /open profile/i, url: /\/app\/profile/, heading: /^Profile$/ },
      { name: /open preferences/i, url: /\/app\/settings\/preferences/, heading: /Preferences/ },
      { name: /open integrations/i, url: /\/app\/settings\/integrations/, heading: /Integrations/ },
      { name: /open privacy/i, url: /\/app\/settings\/privacy/, heading: /Privacy/ },
      { name: /open billing/i, url: /\/app\/settings\/billing/, heading: /Billing/ },
    ];
    for (const dest of destinations) {
      await page.goto("/app/settings");
      await page.getByRole("link", { name: dest.name }).click();
      await expect(page).toHaveURL(dest.url);
      await expect(page.getByRole("heading", { name: dest.heading })).toBeVisible();
    }
  });

  test("legacy Evidence URL redirects to Profile", async ({ page }) => {
    await seedOnboardedUser(page, "legacy-evidence");
    await page.goto("/app/evidence");
    await expect(page).toHaveURL(/\/app\/profile/);
    await expect(page.getByRole("heading", { name: /^Profile$/i })).toBeVisible();
  });

  test("legacy Applications URL redirects to the tracker", async ({ page }) => {
    await seedOnboardedUser(page, "legacy-apps");
    await page.goto("/app/applications");
    await expect(page).toHaveURL(/\/app\/opportunities/);
    await expect(page.getByRole("heading", { name: /^Applications$/i })).toBeVisible();
  });

  test("Insights remains reachable outside primary nav", async ({ page }) => {
    await seedOnboardedUser(page, "insights");
    await page.goto("/app/insights");
    await expect(page).toHaveURL(/\/app\/insights/);
    await expect(page.getByRole("heading", { name: /Insights/i })).toBeVisible();
  });

  test("breadcrumbs remain usable on nested settings", async ({ page }) => {
    await seedOnboardedUser(page, "crumb");
    await page.goto("/app/settings/privacy");
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs).toContainText(/Privacy/i);
    await crumbs.getByRole("link", { name: /settings/i }).click();
    await expect(page).toHaveURL(/\/app\/settings$/);
  });
});
