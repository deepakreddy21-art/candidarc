import { expect, test } from "@playwright/test";

test.describe("startup readiness", () => {
  test("Next.js serves the marketing homepage", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("application health endpoint is live", async ({ request }) => {
    const response = await request.get("/api/v1/health");
    expect(response.ok()).toBeTruthy();
  });
});
