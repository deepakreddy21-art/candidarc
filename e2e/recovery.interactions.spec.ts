import { expect, test } from "@playwright/test";
import { DEFAULT_PASSWORD, generateResumeViaApi, openJobs, seedOnboardedUser, uniqueEmail, waitForResumeReady } from "./helpers/session";

test.describe("loading and failure recovery", () => {
  test("onboarding load failure blocks blank edits and Retry restores the saved step", async ({ page }) => {
    await page.goto("/sign-up");
    await page.locator("#name").fill("Onboarding Recovery Tester");
    await page.locator("#email").fill(uniqueEmail("onboarding-load-retry"));
    await page.locator("#password").fill(DEFAULT_PASSWORD);
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByTestId("onboarding-step")).toHaveText(/step 1 of 3/i);
    await page.locator("#target-roles").fill("Platform Engineer");
    await page.locator("#target-roles").press("Enter");
    await page.getByRole("button", { name: "Senior", exact: true }).click();
    await page.getByRole("group", { name: /job types/i }).getByRole("button", { name: "Full-time" }).click();
    await page.getByRole("group", { name: /workplace modes/i }).getByRole("button", { name: "Remote" }).click();
    await page.getByRole("button", { name: /^continue$/i }).click();
    await expect(page.getByTestId("onboarding-step")).toHaveText(/step 2 of 3/i);

    await page.route("**/api/v1/profile/resume/import", (route) => route.fulfill({
      status: 503, json: { error: { message: "Import status unavailable" } },
    }));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Could not load onboarding" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^continue$/i })).toHaveCount(0);
    await expect(page.locator("#target-roles")).toHaveCount(0);
    await page.unroute("**/api/v1/profile/resume/import");
    await page.getByRole("button", { name: /^retry$/i }).click();
    await expect(page.getByTestId("onboarding-step")).toHaveText(/step 2 of 3/i);
    await page.getByRole("button", { name: /^back$/i }).click();
    await expect(page.getByTestId("onboarding-step")).toHaveText(/step 1 of 3/i);
    await expect(page.getByRole("button", { name: /remove platform engineer/i })).toBeVisible();
  });

  test("navigation shows pending feedback before usable content", async ({ page }) => {
    await seedOnboardedUser(page, "nav-pending");
    await page.goto("/app/radar");
    await expect(page.getByRole("heading", { name: /jobs for you/i })).toBeVisible();
    const started = Date.now();
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Applications" }).click();
    await expect(page.getByTestId("nav-pending").or(page.getByRole("heading", { name: /^Applications$/i }))).toBeVisible({
      timeout: 2_000,
    });
    const feedbackMs = Date.now() - started;
    expect(feedbackMs).toBeLessThan(1_000);
    await expect(page.getByRole("heading", { name: /^Applications$/i })).toBeVisible({ timeout: 10_000 });
  });

  test("Profile recovers through Retry when import-status fails independently", async ({ page }) => {
    await seedOnboardedUser(page, "profile-import-fail");
    await page.route("**/api/v1/profile/resume/import", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Import status unavailable" } }),
      });
    });
    await page.goto("/app/profile");
    await expect(page.getByRole("heading", { name: /^Profile$/i })).toBeVisible();
    await expect(page.locator("#full-name")).toBeVisible();
    await expect(page.locator("#full-name")).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Import status unavailable", exact: true })).toBeVisible();
    await page.unroute("**/api/v1/profile/resume/import");
    await page.getByRole("button", { name: /^retry$/i }).click();
    await expect(page.getByText(/import status unavailable/i)).toHaveCount(0);
    await expect(page.locator("#full-name")).toBeEnabled();
  });

  test("Applications shows a recoverable error instead of spinning forever", async ({ page }) => {
    await seedOnboardedUser(page, "apps-fail");
    await page.route("**/api/v1/applications**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Applications unavailable" } }),
      });
    });
    await page.goto("/app/opportunities");
    await expect(page.getByRole("heading", { name: /^Applications$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^retry$/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /couldn’t load this view/i })).toBeVisible();
    await expect(page.getByText("Applications unavailable", { exact: true })).toBeVisible();
    await page.unroute("**/api/v1/applications**");
    await page.getByRole("button", { name: /^retry$/i }).click();
    await expect(page.getByText(/no applications yet/i)).toBeVisible();
  });

  test("a stale Profile GET does not replace a newer route", async ({ page }) => {
    await seedOnboardedUser(page, "stale-profile");
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/profile/onboarding", async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto("/app/profile", { waitUntil: "domcontentloaded" });
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Jobs" }).click();
    release?.();
    await expect(page.getByRole("heading", { name: /jobs for you/i })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/app\/radar/);
  });

  test("closing Filters restores pointer events on the feed", async ({ page }) => {
    await seedOnboardedUser(page, "filters-overlay");
    await openJobs(page);
    await page.getByRole("button", { name: /^filters$/i }).click();
    await expect(page.getByRole("heading", { name: /^filters$/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: /^filters$/i })).toHaveCount(0);
    await page.getByRole("textbox", { name: /search jobs/i }).click();
    await page.getByRole("textbox", { name: /search jobs/i }).fill("Example");
    await expect(page.getByRole("textbox", { name: /search jobs/i })).toHaveValue("Example");
  });

  test("closing the account menu does not trap clicks", async ({ page }) => {
    await seedOnboardedUser(page, "menu-overlay");
    await page.goto("/app/radar");
    await page.getByRole("button", { name: /user menu/i }).click();
    await expect(page.getByRole("menuitem", { name: /^settings$/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: /^settings$/i })).toHaveCount(0);
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Resumes" }).click();
    await expect(page).toHaveURL(/\/app\/resumes/);
  });

  test("tailoring a job shows Starting immediately and completes a single workflow", async ({ page }) => {
    test.setTimeout(180_000);
    await seedOnboardedUser(page, "tailor-pending");
    await openJobs(page);
    let posts = 0;
    await page.route("**/api/v1/jobs/**/tailor-resume", async (route) => {
      posts += 1;
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });
    await expect(page.getByTestId("job-detail")).toBeVisible();
    const tailor = page.getByTestId("job-detail").getByRole("button", { name: /tailor my resume/i });
    await expect(tailor).toBeEnabled();
    await tailor.click({ noWaitAfter: true });
    await expect(page.getByRole("button", { name: /starting/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/app\/resumes\/(?!new(?:\/|$))/, { timeout: 90_000 });
    expect(posts).toBe(1);
  });

  test("Resumes shows a recoverable error instead of spinning forever", async ({ page }) => {
    await seedOnboardedUser(page, "resumes-fail");
    await page.route("**/api/v1/applications**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Applications unavailable" } }),
      });
    });
    await page.goto("/app/resumes");
    await expect(page.getByRole("heading", { name: /^Resumes$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^retry$/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /couldn’t load this view/i })).toBeVisible();
    await expect(page.getByText("resumes unavailable", { exact: true })).toBeVisible();
  });

  test("Radar Retry restores jobs after a failed search", async ({ page }) => {
    await seedOnboardedUser(page, "radar-fail");
    let blocked = true;
    await page.route("**/api/v1/jobs/search**", async (route) => {
      if (blocked) {
        blocked = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "Jobs unavailable" } }),
        });
        return;
      }
      await route.continue();
    });
    await page.goto("/app/radar");
    await expect(page.getByRole("button", { name: /^retry$/i })).toBeVisible();
    await page.getByRole("button", { name: /^retry$/i }).click();
    await expect(page.getByTestId("job-row").first()).toBeVisible();
  });

  test("failed Profile autosave preserves input and can be retried", async ({ page }) => {
    await seedOnboardedUser(page, "profile-slow");
    await page.goto("/app/profile");
    await expect(page.locator("#full-name")).toBeVisible();
    await page.route("**/api/v1/profile/onboarding", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Profile save failed" } }) });
    });
    await page.locator("#full-name").fill("Kept Input");
    await expect(page.getByText(/save failed — your edits remain here/i)).toBeVisible();
    await expect(page.locator("#full-name")).toHaveValue("Kept Input");
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.getByRole("button", { name: "Retry save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await page.reload();
    await expect(page.locator("#full-name")).toHaveValue("Kept Input");
  });

  test("generate starts a single workflow with pending feedback", async ({ page }) => {
    await seedOnboardedUser(page, "generate-dbl");
    await page.goto("/app/resumes/new");
    await page.getByRole("textbox", { name: /job description/i }).fill(
      "Senior Platform Engineer\nCompany: Northwind Labs\nTypeScript Kubernetes.",
    );
    let posts = 0;
    await page.route("**/api/v1/resumes/generate", async (route) => {
      posts += 1;
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    const button = page.getByRole("button", { name: /generate tailored resume/i });
    await button.click({ noWaitAfter: true });
    await expect(page.getByRole("button", { name: /starting/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("heading", { name: /your tailored resume|preparing|generating/i })).toBeVisible({
      timeout: 90_000,
    });
    expect(posts).toBe(1);
  });

  test("rapid navigation between Jobs and Profile stays usable", async ({ page }) => {
    await seedOnboardedUser(page, "rapid-nav");
    await page.goto("/app/radar");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Profile" }).click();
    await nav.getByRole("link", { name: "Jobs" }).click();
    await nav.getByRole("link", { name: "Resumes" }).click();
    await expect(page.getByRole("heading", { name: /^Resumes$/i })).toBeVisible({ timeout: 15_000 });
  });

  test("Applications recovers from request timeout with Retry", async ({ page }) => {
    test.setTimeout(90_000);
    await seedOnboardedUser(page, "apps-timeout");
    let attempt = 0;
    await page.route("**/api/v1/applications**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      attempt += 1;
      if (attempt === 1) {
        await new Promise(() => {
          /* hang until client timeout */
        });
        return;
      }
      await route.continue();
    });
    await page.goto("/app/opportunities");
    await expect(page.getByRole("heading", { name: /^Applications$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^retry$/i })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/timed out|could not load applications/i)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await page.getByRole("button", { name: /^retry$/i }).click();
    await expect(page.getByRole("button", { name: /^retry$/i })).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /^Applications$/i })).toBeVisible();
  });

  test("intentional cancel while navigating away does not trap loading", async ({ page }) => {
    await seedOnboardedUser(page, "nav-cancel");
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/applications**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await gate;
      await route.continue();
    });
    await page.goto("/app/opportunities", { waitUntil: "domcontentloaded" });
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Jobs" }).click();
    release?.();
    await expect(page.getByRole("heading", { name: /jobs for you/i })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/app\/radar/);
  });

  test("shell stays usable while a resume is generating", async ({ page }) => {
    await seedOnboardedUser(page, "bg-gen");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Jobs" }).click();
    await expect(page.getByRole("heading", { name: /jobs for you/i })).toBeVisible();
    await openJobs(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
  });
});
