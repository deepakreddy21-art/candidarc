import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { completeOnboardingViaApi, seedOnboardedUser, signupViaApi, uniqueEmail } from "./helpers/session";

test.describe("settings interactions", () => {
  test("unsupported preferences are disabled and job preferences persist", async ({ page }) => {
    await seedOnboardedUser(page, "prefs");
    await page.goto("/app/settings/preferences");
    await expect(page.getByRole("switch", { name: /email digest/i })).toBeDisabled();
    await page.getByRole("link", { name: /edit job preferences/i }).click();
    await expect(page).toHaveURL(/settings\/job-preferences/);
    await page.getByRole("textbox", { name: /^Preferred locations/ }).fill("Chicago, IL");
    await page.getByRole("button", { name: "Save job preferences", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Saved");
    await page.reload();
    await expect(page.getByTestId("chip-Chicago, IL")).toBeVisible();
    await expect(page.getByTestId("chip-Chicago")).toHaveCount(0);
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

  test("account deletion is disabled and explains unavailability", async ({ page }) => {
    await seedOnboardedUser(page, "delete-unavailable");
    await page.goto("/app/settings/privacy");
    const deleteBtn = page.getByRole("button", { name: /^delete account$/i });
    await expect(deleteBtn).toBeDisabled();
    await expect(page.getByTestId("account-delete-unavailable")).toContainText(
      /complete account deletion is not available/i,
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/app\/settings\/privacy/);
  });

  test("authenticated DELETE /api/v1/account is unavailable and leaves data intact", async ({ page }) => {
    const user = await seedOnboardedUser(page, "delete-api");
    await page.goto("/app/settings/privacy");
    await expect(page.getByRole("heading", { name: /^Privacy$/i })).toBeVisible();
    const result = await page.evaluate(async () => {
      const csrf =
        document.cookie.split("; ").find((item) => item.startsWith("candidarc_csrf="))?.split("=")[1] ??
        document.cookie.split("; ").find((item) => item.startsWith("csrf_token="))?.split("=")[1] ??
        "";
      const res = await fetch("/api/v1/account", {
        method: "DELETE",
        credentials: "include",
        headers: { "x-csrf-token": decodeURIComponent(csrf) },
      });
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    });
    expect(result.status).toBe(501);
    expect(result.body?.error?.code ?? result.body?.code).toMatch(/ACCOUNT_DELETION_UNAVAILABLE/i);
    await page.goto("/app/settings/privacy");
    await expect(page.getByRole("heading", { name: /^Privacy$/i })).toBeVisible();
    await page.goto("/app/profile");
    await expect(page.getByRole("heading", { name: /^Profile$/i })).toBeVisible();
    await expect(page.locator("#email")).toHaveValue(user.email);
  });

  test("integrations list disabled live connectors instead of fake connect buttons", async ({ page }) => {
    await seedOnboardedUser(page, "integrations");
    await page.goto("/app/settings/integrations");
    await expect(page.getByRole("heading", { name: "LinkedIn" })).toBeVisible();
    await expect(page.getByRole("button", { name: /connect/i })).toHaveCount(0);
  });
});
