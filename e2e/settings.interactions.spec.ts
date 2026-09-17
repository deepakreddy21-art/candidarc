import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { completeOnboardingViaApi, seedOnboardedUser, signupViaApi, uniqueEmail } from "./helpers/session";

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

  test("privacy model-improvement persists on the account, not in shared localStorage", async ({ page, context }) => {
    const user = await seedOnboardedUser(page, "privacy-a");
    await page.goto("/app/settings/privacy");
    await expect(page.getByLabel("Retention window")).toBeDisabled();
    await expect(page.getByRole("switch", { name: /evidence visibility/i })).toBeDisabled();
    await expect(page.getByRole("switch", { name: /model improvement/i })).toBeEnabled();
    await page.getByRole("switch", { name: /model improvement/i }).click();
    await page.getByRole("button", { name: /save privacy controls/i }).click();
    await expect(page.getByText(/saved to your account/i)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("switch", { name: /model improvement/i })).toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: /user menu/i }).click();
    await page.getByRole("menuitem", { name: /log out/i }).click();
    await page.waitForURL(/\/sign-in/);

    const other = await signupViaApi(page, { email: uniqueEmail("privacy-b") });
    await completeOnboardingViaApi(page, other);
    await page.goto("/app/settings/privacy");
    await expect(page.getByRole("switch", { name: /model improvement/i })).toHaveAttribute("aria-checked", "false");

    const fresh = await context.browser()?.newContext();
    if (!fresh) throw new Error("could not open a fresh browser context");
    const isolated = await fresh.newPage();
    await isolated.goto("/sign-in");
    await isolated.locator("#email").fill(user.email);
    await isolated.locator("#password").fill(user.password);
    await isolated.getByRole("button", { name: /sign in/i }).click();
    await isolated.waitForURL(/\/(app|onboarding)/);
    await isolated.goto("/app/settings/privacy");
    await expect(isolated.getByRole("switch", { name: /model improvement/i })).toHaveAttribute("aria-checked", "true");
    await fresh.close();
  });

  test("delete documents stays disabled because the action is unsupported", async ({ page }) => {
    await seedOnboardedUser(page, "docs");
    await page.goto("/app/settings/privacy");
    await expect(page.getByRole("button", { name: /delete documents/i })).toBeDisabled();
    await expect(page.getByText(/per-document deletion is not available/i)).toBeVisible();
  });

  test("export downloads account JSON", async ({ page }) => {
    const user = await seedOnboardedUser(page, "export");
    await page.goto("/app/settings/privacy");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /export my data/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/candidarc-export/i);
    const path = await download.path();
    expect(path).toBeTruthy();
    const payload = JSON.parse(await readFile(path!, "utf8")) as {
      user?: { email?: string };
      profile?: { email?: string };
    };
    expect(payload.user?.email ?? payload.profile?.email).toBe(user.email);
    expect(payload).toHaveProperty("exportedAt");
    expect(payload).toHaveProperty("applications");
    expect(payload).toHaveProperty("profile");
  });

  test("account delete cancel leaves the account signed in", async ({ page }) => {
    await seedOnboardedUser(page, "delete-cancel");
    await page.goto("/app/settings/privacy");
    await page.getByRole("button", { name: /^delete account$/i }).click();
    await expect(page.getByRole("heading", { name: /delete your account/i })).toBeVisible();
    await page.getByRole("button", { name: /^cancel$/i }).click();
    await expect(page.getByRole("heading", { name: /delete your account/i })).toHaveCount(0);
    await expect(page).toHaveURL(/\/app\/settings\/privacy/);
    await expect(page.getByRole("heading", { name: /^Privacy$/i })).toBeVisible();
  });

  test("account delete confirmation signs a disposable user out", async ({ page }) => {
    await seedOnboardedUser(page, "delete-confirm");
    await page.goto("/app/settings/privacy");
    await page.getByRole("button", { name: /^delete account$/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^delete account$/i }).click();
    await page.waitForURL(/\/sign-in/, { timeout: 30_000 });
    await page.goto("/app/radar");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("integrations list disabled live connectors instead of fake connect buttons", async ({ page }) => {
    await seedOnboardedUser(page, "integrations");
    await page.goto("/app/settings/integrations");
    await expect(page.getByRole("heading", { name: "LinkedIn" })).toBeVisible();
    await expect(page.getByRole("button", { name: /connect/i })).toHaveCount(0);
  });
});
