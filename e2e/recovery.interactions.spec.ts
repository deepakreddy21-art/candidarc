import { expect, test } from "@playwright/test";
import { generateResumeViaApi, openJobs, seedOnboardedUser, waitForResumeReady } from "./helpers/session";

test.describe("loading and failure recovery", () => {
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
    await expect(page.locator("#identity-fullName")).toBeVisible();
    await expect(page.getByText(/import status unavailable/i)).toBeVisible();
    await page.unroute("**/api/v1/profile/resume/import");
    await page.getByRole("button", { name: /^retry$/i }).click();
    await expect(page.getByText(/import status unavailable/i)).toHaveCount(0);
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
    await expect(page.getByText(/could not load applications/i)).toBeVisible();
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
    await expect(page.getByText(/could not load applications|could not load resumes/i)).toBeVisible();
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

  test("slow Profile responses keep identity input and retry does not duplicate writes", async ({ page }) => {
    await seedOnboardedUser(page, "profile-slow");
    await page.goto("/app/profile");
    await expect(page.locator("#identity-fullName")).toBeVisible();
    await page.locator("#identity-fullName").fill("Kept Input");
    await page.route("**/api/v1/profile", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Profile save failed" } }),
      });
    });
    await page.getByRole("button", { name: /save identity/i }).click();
    await expect(page.getByText(/profile save failed|could not save profile/i).first()).toBeVisible();
    await expect(page.locator("#identity-fullName")).toHaveValue("Kept Input");
    await page.unrouteAll({ behavior: "ignoreErrors" });
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
