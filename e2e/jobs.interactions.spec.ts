import { expect, test } from "@playwright/test";
import { openJobs, seedOnboardedUser } from "./helpers/session";

test.describe("jobs interactions", () => {
  test("opening Filters displays the drawer", async ({ page }) => {
    await seedOnboardedUser(page, "filters-open");
    await openJobs(page);
    await page.getByRole("button", { name: /^filters$/i }).click();
    await expect(page.getByRole("heading", { name: /^filters$/i })).toBeVisible();
    await expect(page.getByLabel("Work arrangement")).toBeVisible();
  });

  test("Escape closes the Filters drawer", async ({ page }) => {
    await seedOnboardedUser(page, "filters-esc");
    await openJobs(page);
    await page.getByRole("button", { name: /^filters$/i }).click();
    await expect(page.getByRole("heading", { name: /^filters$/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: /^filters$/i })).toHaveCount(0);
  });

  test("applying Remote updates the actual results", async ({ page }) => {
    await seedOnboardedUser(page, "filters-remote");
    await openJobs(page);
    await expect(page.getByTestId("job-row").first()).toBeVisible();
    const before = await page.getByTestId("job-row").count();
    expect(before).toBeGreaterThan(0);
    await page.getByRole("button", { name: /^filters$/i }).click();
    await page.getByLabel("Work arrangement").selectOption("remote");
    await page.getByRole("button", { name: /apply filters/i }).click();
    await expect(page).toHaveURL(/arrangement=remote/);
    await expect(page.getByTestId("job-row").first()).toBeVisible();
    const rows = page.getByTestId("job-row");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(before);
    for (let i = 0; i < count; i += 1) {
      await expect(rows.nth(i)).toContainText(/remote/i);
    }
  });

  test("Reset clears the applied filters", async ({ page }) => {
    await seedOnboardedUser(page, "filters-reset");
    await openJobs(page);
    await page.getByRole("button", { name: /^filters$/i }).click();
    await page.getByLabel("Work arrangement").selectOption("remote");
    await page.getByRole("button", { name: /apply filters/i }).click();
    await expect(page).toHaveURL(/arrangement=remote/);
    await page.getByRole("button", { name: /reset filters/i }).click();
    await expect(page).not.toHaveURL(/arrangement=remote/);
    await expect(page.getByTestId("job-row").first()).toBeVisible();
  });

  test("keyword search filters the visible jobs", async ({ page }) => {
    await seedOnboardedUser(page, "jobs-search");
    await openJobs(page);
    const firstTitle = (await page.getByTestId("job-row").first().locator("h3").innerText()).trim();
    const token = firstTitle.split(/\s+/)[0] ?? firstTitle;
    await page.getByRole("textbox", { name: /search jobs/i }).fill(token);
    await page.getByRole("button", { name: /^search$/i }).click();
    await expect(page.getByTestId("job-row").first()).toContainText(new RegExp(token, "i"));
  });

  test("Saved tab only shows saved jobs", async ({ page }) => {
    await seedOnboardedUser(page, "jobs-save");
    await openJobs(page);
    const row = page.getByTestId("job-row").first();
    const title = (await row.locator("h3").innerText()).trim();
    await row.getByRole("button", { name: /save job/i }).click();
    await expect(row.getByRole("button", { name: /unsave job/i })).toBeVisible();
    await page.getByRole("tab", { name: /^saved$/i }).click();
    await expect(page.getByTestId("job-row").filter({ hasText: title })).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: /^saved$/i }).click();
    await expect(page.getByTestId("job-row").filter({ hasText: title })).toBeVisible();
  });

  test("unsaving removes that job from Saved", async ({ page }) => {
    await seedOnboardedUser(page, "jobs-unsave");
    await openJobs(page);
    const row = page.getByTestId("job-row").first();
    const title = (await row.locator("h3").innerText()).trim();
    await row.getByRole("button", { name: /save job/i }).click();
    await expect(row.getByRole("button", { name: /unsave job/i })).toBeVisible();
    await page.getByRole("tab", { name: /^saved$/i }).click();
    await page
      .getByTestId("job-row")
      .filter({ hasText: title })
      .getByRole("button", { name: /unsave job/i })
      .click();
    await expect(page.getByTestId("job-row").filter({ hasText: title })).toHaveCount(0);
  });

  test("hide removes the job and undo restores it", async ({ page }) => {
    await seedOnboardedUser(page, "jobs-hide");
    await openJobs(page);
    const row = page.getByTestId("job-row").first();
    const title = (await row.locator("h3").innerText()).trim();
    await row.getByRole("button", { name: /hide job/i }).click();
    await expect(page.getByTestId("job-row").filter({ hasText: title })).toHaveCount(0);
    await page.getByRole("button", { name: /undo hide/i }).click();
    await expect(page.getByTestId("job-row").filter({ hasText: title })).toBeVisible();
  });

  test("selecting a job opens the detail panel", async ({ page }) => {
    await seedOnboardedUser(page, "jobs-select");
    await openJobs(page);
    const title = (await page.getByTestId("job-row").first().locator("h3").innerText()).trim();
    await page.getByTestId("job-row").first().getByRole("button").first().click();
    const detail = page.getByTestId("job-detail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText(title);
    await expect(detail.getByText(/Why this job fits/i)).toBeVisible();
  });

  test("opening a company site does not mark the application Applied", async ({ page }) => {
    await seedOnboardedUser(page, "jobs-apply-link");
    await openJobs(page);
    await page.getByTestId("job-row").first().getByRole("button").first().click();
    const apply = page.getByTestId("job-detail").getByRole("link", { name: /apply on company site/i });
    if (await apply.count()) {
      await expect(apply).toHaveAttribute("target", "_blank");
    }
    await page.goto("/app/opportunities");
    await expect(page.getByRole("heading", { name: /^Applications$/i })).toBeVisible();
    await expect(page.getByText(/no applications yet/i)).toBeVisible();
  });

  test("saving a search persists on Saved searches", async ({ page }) => {
    await seedOnboardedUser(page, "save-search");
    await openJobs(page);
    await page.getByRole("button", { name: /save search/i }).click();
    await expect(page.getByRole("heading", { name: /save this search/i })).toBeVisible();
    const name = `Remote AI ${Date.now()}`;
    await page.locator("#saved-search-name").fill(name);
    await page.getByRole("dialog").getByRole("button", { name: /^save search$/i }).click();
    await expect(page.getByText(/search saved/i)).toBeVisible();
    await page.goto("/app/radar/saved");
    await expect(page.getByText(name)).toBeVisible();
  });

  test("creating an alert persists on the alerts page", async ({ page }) => {
    await seedOnboardedUser(page, "create-alert");
    await openJobs(page);
    await page.getByRole("button", { name: /create alert/i }).click();
    await expect(page.getByRole("heading", { name: /create alert/i })).toBeVisible();
    const name = `New matches ${Date.now()}`;
    await page.getByRole("dialog").locator("#alert-name").fill(name);
    await page.getByRole("dialog").getByRole("button", { name: /create alert/i }).click();
    await expect(page.getByText(/in-app alert created/i)).toBeVisible();
    await page.goto("/app/radar/alerts");
    await expect(page.getByText(name)).toBeVisible();
  });

  test("Load more stays hidden when the catalog fits on one page", async ({ page }) => {
    await seedOnboardedUser(page, "pagination");
    await openJobs(page);
    await expect(page.getByTestId("job-row").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /load more/i })).toHaveCount(0);
  });
});
