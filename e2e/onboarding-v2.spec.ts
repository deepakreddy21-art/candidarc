import { expect, test } from "@playwright/test";

async function signup(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel(/name/i).fill("Onboarding Tester");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill("OnboardTest!123");
  const confirm = page.getByLabel(/confirm password/i);
  if (await confirm.count()) await confirm.fill("OnboardTest!123");
  await page.getByRole("button", { name: /create|sign up|register/i }).click();
  await page.waitForURL(/\/onboarding/, { timeout: 60_000 });
}

async function fillStep1(page: import("@playwright/test").Page) {
  await expect(page.getByText(/step 1 of 4/i)).toBeVisible();
  await page.getByLabel(/target job titles/i).fill("Platform Engineer");
  await page.getByLabel(/target job titles/i).press("Enter");
  await page.getByRole("button", { name: "Senior" }).click();
  await page.getByRole("button", { name: /^continue$/i }).click();
}

async function fillStep2(page: import("@playwright/test").Page) {
  await expect(page.getByText(/step 2 of 4/i)).toBeVisible();
  await page.getByRole("button", { name: "Full-time" }).click();
  await page.getByRole("button", { name: "Remote" }).click();
  await page.getByRole("button", { name: /^continue$/i }).click();
}

async function fillStep3Manual(page: import("@playwright/test").Page) {
  await expect(page.getByText(/step 3 of 4/i)).toBeVisible();
  await page.getByRole("button", { name: /enter manually/i }).click();
  await page.getByLabel(/full name/i).fill("Onboarding Tester");
  await page.getByLabel(/^skills$/i).fill("TypeScript");
  await page.getByLabel(/^skills$/i).press("Enter");
  await page.getByRole("button", { name: /add role/i }).click();
  await page.getByLabel(/job title 1/i).fill("Engineer");
  await page.getByLabel(/employer 1/i).fill("Example Co");
  await page.getByRole("button", { name: /^continue$/i }).click();
}

test.describe("onboarding v2", () => {
  test("password signup completes onboarding to /app", async ({ page }) => {
    const email = `onb-${Date.now()}@example.com`;
    await signup(page, email);
    await fillStep1(page);
    await fillStep2(page);
    await fillStep3Manual(page);
    await expect(page.getByText(/step 4 of 4/i)).toBeVisible();
    await page.getByRole("button", { name: /finish setup/i }).click();
    await page.waitForURL(/\/onboarding\/complete/, { timeout: 60_000 });
    await expect(page.getByRole("link", { name: /tailor my first resume/i })).toBeVisible();
    await page.getByRole("button", { name: /go to home/i }).click();
    await page.waitForURL(/\/app/, { timeout: 60_000 });
  });

  test("incomplete login resumes exact saved step", async ({ page }) => {
    const email = `resume-${Date.now()}@example.com`;
    await signup(page, email);
    await fillStep1(page);
    await expect(page.getByText(/step 2 of 4/i)).toBeVisible();
    await page.getByRole("button", { name: /log out/i }).click();
    await page.waitForURL(/\/sign-in/, { timeout: 30_000 });
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill("OnboardTest!123");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/onboarding/, { timeout: 60_000 });
    await expect(page.getByText(/step 2 of 4/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Full-time" })).toBeVisible();
  });

  test("completed demo login bypasses onboarding", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel(/email/i).fill("deepak@candidarc.dev");
    await page.getByLabel(/password/i).fill("CandidArc!Demo1");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/app/, { timeout: 60_000 });
    await page.goto("/onboarding");
    await page.waitForURL(/\/app/, { timeout: 60_000 });
  });

  test("responsive smoke at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const email = `mobile-${Date.now()}@example.com`;
    await signup(page, email);
    await expect(page.getByText(/step 1 of 4/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^continue$/i })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBeFalsy();
  });
});
