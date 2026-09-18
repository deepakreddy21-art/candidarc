import { expect, test } from "@playwright/test";
import { attachPageGuards } from "./helpers/observe";
import { DEFAULT_PASSWORD, uniqueEmail } from "./helpers/session";

test.describe("auth interactions", () => {
  test("signup validation keeps the form on invalid input", async ({ page }) => {
    const guards = attachPageGuards(page);
    await page.goto("/sign-up");
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText(/name, email, and a password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up/);
    guards.assertClean();
  });

  test("signup creates an account and opens onboarding", async ({ page }) => {
    const guards = attachPageGuards(page);
    const email = uniqueEmail("signup");
    await page.goto("/sign-up");
    await page.locator("#name").fill("Signup Tester");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(DEFAULT_PASSWORD);
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL(/\/onboarding/, { timeout: 60_000 });
    await expect(page.getByTestId("onboarding-step")).toBeVisible();
    guards.assertClean();
  });

  test("password visibility toggles the password input type", async ({ page }) => {
    await page.goto("/sign-in");
    const password = page.locator("#password");
    await password.fill("secret-value");
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: /show password/i }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue("secret-value");
    await page.getByRole("button", { name: /hide password/i }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("sign-in with invalid credentials shows an error and stays on the form", async ({ page }) => {
    await page.goto("/sign-in");
    await page.locator("#email").fill("missing@example.com");
    await page.locator("#password").fill("WrongPass!123");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/invalid|failed|incorrect|not found/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.locator("#email")).toHaveValue("missing@example.com");
  });

  test("sign-in with the demo account reaches Jobs", async ({ page }) => {
    await page.goto("/sign-in");
    await page.locator("#email").fill("deepak@candidarc.dev");
    await page.locator("#password").fill("CandidArc!Demo1");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/app/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: /jobs for you/i })).toBeVisible({ timeout: 30_000 });
  });

  test("Google initiation stays on the local start contract", async ({ page }) => {
    await page.goto("/sign-in");
    const google = page.getByRole("button", { name: /continue with google/i });
    await expect(google).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/(sign-in\?google_error=|api\/v1\/auth\/google\/start)/, { timeout: 30_000 }),
      google.click(),
    ]);
    if (page.url().includes("google_error=")) {
      await expect(page.getByRole("alert").filter({ hasText: /google/i })).toBeVisible();
    }
  });

  test("logout returns to sign-in and blocks the app shell", async ({ page }) => {
    await page.goto("/sign-in");
    await page.locator("#email").fill("deepak@candidarc.dev");
    await page.locator("#password").fill("CandidArc!Demo1");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/app/, { timeout: 60_000 });
    await page.getByRole("button", { name: /user menu/i }).click();
    await page.getByRole("menuitem", { name: /log out/i }).click();
    await page.waitForURL(/\/sign-in/, { timeout: 30_000 });
    await page.goto("/app/radar");
    await page.waitForURL(/\/sign-in/, { timeout: 30_000 });
  });

  test("sign-in submit works from the keyboard", async ({ page }) => {
    await page.goto("/sign-in");
    await page.locator("#email").fill("deepak@candidarc.dev");
    await page.locator("#password").fill("CandidArc!Demo1");
    await page.locator("#password").press("Enter");
    await page.waitForURL(/\/app/, { timeout: 60_000 });
  });
});
