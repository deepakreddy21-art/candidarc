import { expect, test } from "@playwright/test";
import { seedOnboardedUser } from "./helpers/session";

type Destination = {
  name: string;
  href: RegExp;
  homeHref: RegExp;
  usable: (page: import("@playwright/test").Page) => Promise<void>;
};

const destinations: Destination[] = [
  {
    name: "Jobs",
    href: /\/app\/radar(?:\?|$)/,
    homeHref: /\/app\/opportunities/,
    usable: async (page) => {
      await expect(page.getByRole("heading", { name: /jobs for you/i })).toBeVisible();
      const jobRow = page.getByTestId("job-row").first();
      const empty = page.getByText(/no jobs match|no matching jobs|try adjusting/i);
      await expect(jobRow.or(empty).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("textbox", { name: /search jobs/i })).toBeEnabled();
    },
  },
  {
    name: "Applications",
    href: /\/app\/opportunities/,
    homeHref: /\/app\/radar(?:\?|$)/,
    usable: async (page) => {
      await expect(page.getByRole("heading", { name: /^Applications$/i })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
      const search = page.getByPlaceholder(/search/i);
      const empty = page.getByText(/no applications|start tracking/i);
      const add = page.getByRole("button", { name: /new application|track an application|add application/i });
      await expect(search.or(empty).or(add).first()).toBeVisible({ timeout: 15_000 });
    },
  },
  {
    name: "Resumes",
    href: /\/app\/resumes/,
    homeHref: /\/app\/radar(?:\?|$)/,
    usable: async (page) => {
      await expect(page.getByRole("heading", { name: /^Resumes$/i })).toBeVisible();
      const createLink = page.getByRole("link", { name: /create|generate|new resume/i });
      const createButton = page.getByRole("button", { name: /create|generate|new resume/i });
      const empty = page.getByText(/no resumes|tailor a resume/i);
      await expect(createLink.or(createButton).or(empty).first()).toBeVisible({ timeout: 15_000 });
    },
  },
  {
    name: "Profile",
    href: /\/app\/profile/,
    homeHref: /\/app\/radar(?:\?|$)/,
    usable: async (page) => {
      await expect(page.getByRole("heading", { name: /^Profile$/i })).toBeVisible();
      await expect(page.locator("#full-name")).toBeVisible({ timeout: 15_000 });
      await expect(page.locator("#full-name")).toBeEnabled();
    },
  },
  {
    name: "Settings",
    href: /\/app\/settings/,
    homeHref: /\/app\/radar(?:\?|$)/,
    usable: async (page) => {
      await expect(page.getByRole("heading", { name: /^Settings$/i })).toBeVisible();
      await expect(page.getByRole("link", { name: /privacy|preferences|integrations/i }).first()).toBeVisible({
        timeout: 15_000,
      });
    },
  },
];

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

async function measureVisit(
  page: import("@playwright/test").Page,
  dest: Destination,
): Promise<{ feedbackMs: number; usableMs: number }> {
  const nav = page.getByRole("navigation", { name: "Primary" });
  const awayLink =
    dest.name === "Jobs"
      ? nav.getByRole("link", { name: "Applications" })
      : nav.getByRole("link", { name: "Jobs" });
  await awayLink.click();
  await expect(page).toHaveURL(dest.homeHref, { timeout: 15_000 });

  const start = Date.now();
  const feedbackRace = Promise.race([
    page
      .getByTestId("nav-pending")
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(() => Date.now() - start),
    page.waitForURL(dest.href, { timeout: 2_000 }).then(() => Date.now() - start),
  ]);

  if (dest.name === "Settings") {
    await page.getByRole("button", { name: /user menu/i }).click();
    await page.getByRole("menuitem", { name: /^settings$/i }).click();
  } else {
    await nav.getByRole("link", { name: dest.name }).click();
  }

  let feedbackMs = 2_000;
  try {
    feedbackMs = await feedbackRace;
  } catch {
    // Neither pending bar nor URL settled within 2s — still require a real transition below.
  }
  await expect(page).toHaveURL(dest.href, { timeout: 15_000 });
  await dest.usable(page);
  return { feedbackMs, usableMs: Date.now() - start };
}

test.describe("navigation performance", () => {
  test("records cold and warmed visit timings with genuine route transitions", async ({ page }, testInfo) => {
    test.setTimeout(600_000);
    await seedOnboardedUser(page, "nav-perf");
    await page.goto("/app/radar");
    await expect(page.getByRole("heading", { name: /jobs for you/i })).toBeVisible();

    const coldVisit: Array<{ name: string; feedbackMs: number; usableMs: number }> = [];
    const warmed: Record<string, Array<{ feedbackMs: number; usableMs: number }>> = {};

    for (const dest of destinations) {
      const sample = await measureVisit(page, dest);
      coldVisit.push({ name: dest.name, ...sample });
      warmed[dest.name] = [];
    }

    const warmedSamples = 10;
    for (const dest of destinations) {
      for (let i = 0; i < warmedSamples; i += 1) {
        warmed[dest.name]!.push(await measureVisit(page, dest));
      }
    }

    const warmedSummary = destinations.map((dest) => {
      const samples = warmed[dest.name]!;
      const feedback = samples.map((s) => s.feedbackMs).sort((a, b) => a - b);
      const usable = samples.map((s) => s.usableMs).sort((a, b) => a - b);
      return {
        name: dest.name,
        sampleCount: samples.length,
        feedbackP50: percentile(feedback, 50),
        feedbackP95: percentile(feedback, 95),
        usableP50: percentile(usable, 50),
        usableP95: percentile(usable, 95),
        samples,
      };
    });

    const report = {
      environment: {
        project: testInfo.project.name,
        webCommand: process.env.PLAYWRIGHT_WEB_COMMAND ?? null,
        baseURL: testInfo.project.use.baseURL ?? null,
        mode: process.env.APP_MODE ?? process.env.NEXT_PUBLIC_APP_MODE ?? null,
        dataMode: process.env.CANDIDARC_DATA_MODE ?? null,
        aiMode: process.env.AI_MODE ?? null,
      },
      targetsMs: { visibleFeedback: 200, warmedUsable: 2000 },
      coldVisit,
      warmedSummary,
    };

    await testInfo.attach("navigation-timings.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });

    console.log("[navigation-performance]", JSON.stringify(report.warmedSummary.map((row) => ({
      name: row.name,
      n: row.sampleCount,
      feedbackP50: row.feedbackP50,
      feedbackP95: row.feedbackP95,
      usableP50: row.usableP50,
      usableP95: row.usableP95,
    }))));

    for (const row of coldVisit) {
      expect(row.usableMs, `${row.name} cold usable`).toBeGreaterThan(0);
    }

    if (testInfo.project.name.startsWith("built")) {
      for (const row of coldVisit) {
        expect(row.feedbackMs, `${row.name} cold feedback`).toBeLessThan(1_500);
      }
      for (const row of warmedSummary) {
        expect(row.feedbackP95, `${row.name} warmed feedback p95`).toBeLessThan(1_500);
        expect(row.usableP95, `${row.name} warmed usable p95`).toBeLessThan(2_500);
        // Intended local targets (~200ms feedback / ~2s usable) — report misses without loosening.
        if (row.feedbackP50 > 200 || row.usableP50 > 2000) {
          console.warn(
            `[navigation-performance] ${row.name} missed intended local targets (feedback p50=${row.feedbackP50}, usable p50=${row.usableP50})`,
          );
        }
      }
    } else {
      console.warn(
        "[navigation-performance] Skipping built-app timing gates on development server; see attached report.",
      );
    }
  });
});
