import { expect, test } from "@playwright/test";
import { seedOnboardedUser } from "./helpers/session";

test.describe("navigation performance", () => {
  const destinations = [
    { name: "Applications", heading: /^Applications$/i, url: /\/app\/opportunities/ },
    { name: "Resumes", heading: /^Resumes$/i, url: /\/app\/resumes/ },
    { name: "Profile", heading: /^Profile$/i, url: /\/app\/profile/ },
    { name: "Jobs", heading: /jobs for you/i, url: /\/app\/radar/ },
  ] as const;

  test("records first-visit and repeat-visit click timings", async ({ page }, testInfo) => {
    await seedOnboardedUser(page, "nav-perf");
    await page.goto("/app/radar");
    await expect(page.getByRole("heading", { name: /jobs for you/i })).toBeVisible();

    const nav = page.getByRole("navigation", { name: "Primary" });
    const firstVisit: Array<{ name: string; feedbackMs: number; usableMs: number }> = [];
    const repeatVisit: Array<{ name: string; feedbackMs: number; usableMs: number }> = [];

    for (const dest of destinations) {
      const start = Date.now();
      await nav.getByRole("link", { name: dest.name }).click();
      await expect(page.getByTestId("nav-pending").or(page.getByRole("heading", { name: dest.heading }))).toBeVisible({
        timeout: 2_000,
      });
      const feedbackMs = Date.now() - start;
      await expect(page.getByRole("heading", { name: dest.heading })).toBeVisible({ timeout: 15_000 });
      firstVisit.push({ name: dest.name, feedbackMs, usableMs: Date.now() - start });
    }

    for (const dest of destinations) {
      const samples: Array<{ feedbackMs: number; usableMs: number }> = [];
      for (let i = 0; i < 3; i += 1) {
        const start = Date.now();
        await nav.getByRole("link", { name: dest.name }).click();
        await expect(page.getByTestId("nav-pending").or(page.getByRole("heading", { name: dest.heading }))).toBeVisible({
          timeout: 2_000,
        });
        const feedbackMs = Date.now() - start;
        await expect(page.getByRole("heading", { name: dest.heading })).toBeVisible({ timeout: 10_000 });
        samples.push({ feedbackMs, usableMs: Date.now() - start });
      }
      samples.sort((a, b) => a.usableMs - b.usableMs);
      const p50 = samples[Math.floor(samples.length / 2)]!;
      repeatVisit.push({ name: dest.name, feedbackMs: p50.feedbackMs, usableMs: p50.usableMs });
    }

    await testInfo.attach("navigation-timings.json", {
      body: JSON.stringify(
        {
          firstVisit,
          repeatVisit,
          mode: process.env.PLAYWRIGHT_WEB_COMMAND ?? testInfo.project.name,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });

    for (const row of [...firstVisit, ...repeatVisit]) {
      expect(row.feedbackMs, `${row.name} feedback`).toBeLessThan(1_500);
    }
    if (testInfo.project.name.startsWith("built")) {
      for (const row of repeatVisit) {
        expect(row.usableMs, `${row.name} warmed usable`).toBeLessThan(2_500);
      }
    }
  });
});
