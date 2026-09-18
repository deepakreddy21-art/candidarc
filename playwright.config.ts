import { defineConfig, devices } from "@playwright/test";

const TOKEN = process.env.PYTHON_BACKEND_TOKEN || "dev-python-backend-token-change-me";
const PYTHON_URL = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8090";

/**
 * Interaction audit + customer journey E2E.
 * Starts FastAPI (mock AI) + Next.js unless PLAYWRIGHT_SKIP_WEBSERVER=1.
 * One failed test does not stop the rest of the suite.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  maxFailures: 0,
  reporter: process.env.CI
    ? [
        ["list"],
        ["github"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ]
    : [
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-first-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /mobile\.interactions\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testMatch: /mobile\.interactions\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : [
        {
          command: "node scripts/python.mjs -m uvicorn app.main:app --host 127.0.0.1 --port 8090",
          url: `${PYTHON_URL}/health/live`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            ...process.env,
            AI_MODE: "mock",
            APP_MODE: "demo",
            PYTHON_BACKEND_TOKEN: TOKEN,
          },
        },
        {
          command: "npm run dev:web",
          url: "http://127.0.0.1:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: {
            ...process.env,
            CANDIDARC_DATA_MODE: "memory",
            APP_MODE: "demo",
            AI_MODE: "mock",
            NEXT_PUBLIC_APP_MODE: "demo",
            RESUME_INTELLIGENCE_BACKEND: "python",
            PYTHON_BACKEND_URL: PYTHON_URL,
            PYTHON_BACKEND_TOKEN: TOKEN,
            QUEUE_BACKEND: "inprocess",
          },
        },
      ],
});
