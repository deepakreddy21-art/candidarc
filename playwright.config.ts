import { defineConfig, devices } from "@playwright/test";

/**
 * Primary customer journey E2E.
 * Run with: npx playwright test
 * Requires: npm run dev (or webServer below) with CANDIDARC_DATA_MODE=memory APP_MODE=demo AI_MODE=mock
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  timeout: 120_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          ...process.env,
          CANDIDARC_DATA_MODE: "memory",
          APP_MODE: "demo",
          AI_MODE: "mock",
          NEXT_PUBLIC_APP_MODE: "demo",
        },
      },
});
