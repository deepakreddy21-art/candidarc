import { expect, test } from "@playwright/test";

async function signup(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-up");
  await page.locator("#name").fill("Onboarding Tester");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("OnboardTest!123");
  await page.getByRole("button", { name: /create|sign up|register/i }).click();
  await page.waitForURL(/\/onboarding/, { timeout: 60_000 });
}

async function expectStep(page: import("@playwright/test").Page, n: number) {
  await expect(page.locator("header").getByText(new RegExp(`step ${n} of 4`, "i"))).toBeVisible({
    timeout: 30_000,
  });
}

async function fillStep1(page: import("@playwright/test").Page) {
  await expectStep(page, 1);
  await page.locator("#target-roles").click();
  await page.locator("#target-roles").type("Platform Engineer", { delay: 20 });
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("chip-Platform Engineer")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Senior", exact: true }).click();
  await expect(page.getByRole("button", { name: "Senior", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expectStep(page, 2);
}

async function fillStep2(page: import("@playwright/test").Page) {
  await expectStep(page, 2);
  await page.getByRole("group", { name: /job types/i }).getByRole("button", { name: "Full-time" }).click();
  await page.getByRole("group", { name: /workplace modes/i }).getByRole("button", { name: "Remote" }).click();
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expectStep(page, 3);
}

async function fillStep3Manual(page: import("@playwright/test").Page) {
  await expectStep(page, 3);
  await page.getByRole("button", { name: /enter manually/i }).click();
  await page.locator("#full-name").fill("Onboarding Tester");
  await page.locator("#skills").fill("TypeScript");
  await page.locator("#skills").press("Enter");
  await page.getByRole("button", { name: /add role/i }).click();
  await page.getByLabel(/job title 1/i).fill("Engineer");
  await page.getByLabel(/employer 1/i).fill("Example Co");
  await page.getByRole("button", { name: /^continue$/i }).click();
}

test.describe("onboarding v2", () => {
  test("password signup completes onboarding to Jobs", async ({ page }) => {
    const email = `onb-${Date.now()}@example.com`;
    await signup(page, email);
    await fillStep1(page);
    await fillStep2(page);
    await fillStep3Manual(page);
    await expectStep(page, 4);
    await page.getByRole("button", { name: /finish setup/i }).click();
    await page.waitForURL(/\/onboarding\/complete/, { timeout: 60_000 });
    await expect(page.getByRole("link", { name: /see jobs for you/i })).toBeVisible();
    await page.getByRole("link", { name: /see jobs for you/i }).click();
    await page.waitForURL(/\/app(\/radar)?/, { timeout: 60_000 });
  });

  test("incomplete login resumes exact saved step", async ({ page }) => {
    const email = `resume-${Date.now()}@example.com`;
    await signup(page, email);
    await fillStep1(page);
    await expectStep(page, 2);
    await page.getByRole("button", { name: /log out/i }).click();
    await page.waitForURL(/\/sign-in/, { timeout: 30_000 });
    await page.locator("#email").fill(email);
    await page.locator("#password").fill("OnboardTest!123");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/onboarding/, { timeout: 60_000 });
    await expectStep(page, 2);
    await expect(page.getByRole("button", { name: "Full-time" })).toBeVisible();
  });

  test("completed demo login bypasses onboarding", async ({ page }) => {
    await page.goto("/sign-in");
    await page.locator("#email").fill("deepak@candidarc.dev");
    await page.locator("#password").fill("CandidArc!Demo1");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/app/, { timeout: 60_000 });
    await page.goto("/onboarding");
    await page.waitForURL(/\/app/, { timeout: 60_000 });
  });

  test("responsive smoke at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const email = `mobile-${Date.now()}@example.com`;
    await signup(page, email);
    await expectStep(page, 1);
    await expect(page.getByRole("button", { name: /^continue$/i })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBeFalsy();
  });

  test("incomplete authenticated user opening /app is redirected to onboarding", async ({ page }) => {
    const email = `gate-app-${Date.now()}@example.com`;
    await signup(page, email);
    await fillStep1(page);
    await expectStep(page, 2);
    const sessionCookie = (await page.context().cookies()).find((c) => c.name === "candidarc_session");
    expect(sessionCookie?.value).toBeTruthy();
    const probe = await page.request.get("/api/v1/profile/onboarding");
    expect(probe.status()).toBe(200);
    // Authoritative server gate — do not rely on login redirectTo alone.
    await page.goto("/app");
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 60_000 });
    await expectStep(page, 2);
  });

  test("incomplete authenticated user opening /app/radar is redirected to onboarding", async ({ page }) => {
    const email = `gate-radar-${Date.now()}@example.com`;
    await signup(page, email);
    await fillStep1(page);
    await page.goto("/app/radar");
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 60_000 });
    await expectStep(page, 2);
  });

  test("direct /app stays blocked until onboarding completion finishes", async ({ page }) => {
    const email = `gate-finish-${Date.now()}@example.com`;
    await signup(page, email);
    await fillStep1(page);
    await fillStep2(page);
    await fillStep3Manual(page);
    await expectStep(page, 4);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 60_000 });
    await expectStep(page, 4);
    await page.getByRole("button", { name: /finish setup/i }).click();
    await page.waitForURL(/\/onboarding\/complete/, { timeout: 60_000 });
    await page.goto("/app");
    await page.waitForURL(/\/app(?:\/|$)/, { timeout: 60_000 });
    expect(page.url()).toMatch(/\/app/);
    expect(page.url()).not.toMatch(/\/onboarding/);
  });
});
