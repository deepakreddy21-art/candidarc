import { expect, test } from "@playwright/test";

/**
 * Google button UX without contacting Google.
 * Exercises local start handling / not-configured return flow only.
 */
test.describe("Google auth button (local only)", () => {
  test("sign-in and sign-up place Google above the divider and handle local start", async ({ page }) => {
    await page.goto("/sign-up");
    const signUpGoogle = page.getByRole("button", { name: /continue with google/i });
    await expect(signUpGoogle).toBeVisible();
    const signUpDivider = page.getByRole("separator");
    await expect(signUpDivider).toBeVisible();
    const googleBox = await signUpGoogle.boundingBox();
    const dividerBox = await signUpDivider.boundingBox();
    expect(googleBox && dividerBox && googleBox.y < dividerBox.y).toBeTruthy();

    await page.goto("/sign-in");
    const signInGoogle = page.getByRole("button", { name: /continue with google/i });
    await expect(signInGoogle).toBeVisible();
    const signInDivider = page.getByRole("separator");
    const g2 = await signInGoogle.boundingBox();
    const d2 = await signInDivider.boundingBox();
    expect(g2 && d2 && g2.y < d2.y).toBeTruthy();

    // Click begins navigation to the local start endpoint (no Google credentials in CI).
    await Promise.all([
      page.waitForURL(/\/(sign-in\?google_error=|api\/v1\/auth\/google\/start)/, { timeout: 30_000 }),
      signInGoogle.click(),
    ]);

    // Not-configured environments return to sign-in with a friendly banner.
    if (page.url().includes("google_error=")) {
      const banner = page.locator('[role="alert"]').filter({ hasText: /google/i });
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(/not available|failed|try again/i);
    }

    await page.goto("/sign-in");
    await page.getByLabel(/email/i).fill("deepak@candidarc.dev");
    await page.getByLabel(/password/i).fill("CandidArc!Demo1");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/(app|onboarding)/, { timeout: 60_000 });
  });
});
