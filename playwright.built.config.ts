import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

const TOKEN = process.env.PYTHON_BACKEND_TOKEN || "dev-python-backend-token-change-me";
const PYTHON_URL = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8090";

/**
 * Built-application browser pass (`next start`).
 * Run `npm run build` with the same NEXT_PUBLIC_* values first.
 */
export default defineConfig({
  ...base,
  testDir: "./e2e",
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report-built" }],
  ],
  use: {
    ...base.use,
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "built-desktop",
      testMatch:
        /approved-visuals\.spec\.ts|navigation\.performance\.spec\.ts|recovery\.interactions\.spec\.ts|auth\.interactions\.spec\.ts|jobs\.interactions\.spec\.ts|import\.interactions\.spec\.ts|resumes\.interactions\.spec\.ts|applications\.interactions\.spec\.ts|settings\.interactions\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "built-mobile",
      testMatch: /mobile\.interactions\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
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
          command: "npx next start --port 3000",
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
