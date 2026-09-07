import { defineConfig, devices } from "@playwright/test";

const TOKEN = process.env.PYTHON_BACKEND_TOKEN || "dev-python-backend-token-change-me";
const PYTHON_URL = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8090";

/**
 * Primary customer journey E2E.
 * Starts FastAPI (mock AI) + Next.js. Memory mode uses in-process queues in the web process.
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
            RESUME_INTELLIGENCE_BACKEND: "python",
            PYTHON_BACKEND_URL: PYTHON_URL,
            PYTHON_BACKEND_TOKEN: TOKEN,
            QUEUE_BACKEND: "inprocess",
          },
        },
      ],
});
