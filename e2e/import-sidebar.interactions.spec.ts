import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { seedOnboardedUser } from "./helpers/session";

for (const format of ["pdf", "docx"] as const) {
  test(`${format} sidebar import preserves contact, separate jobs and education after reload`, async ({ page }) => {
    const backendRoot = path.resolve("services/python-backend");
    const python = path.join(backendRoot, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    const fixture = spawnSync(python, ["-c", "import sys; from tests.fixtures.sidebar_resume import sidebar_resume_bytes; sys.stdout.buffer.write(sidebar_resume_bytes(sys.argv[1]))", format], {
      cwd: backendRoot, timeout: 10_000,
    });
    expect(fixture.status, fixture.stderr?.toString()).toBe(0);
    await seedOnboardedUser(page, `sidebar-${format}`);
    await page.goto("/app/profile");
    await page.getByRole("button", { name: /upload a resume/i }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: `sidebar.${format}`,
      mimeType: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: fixture.stdout,
    });
    await expect(page.getByText(/ready — review|resume ready/i)).toBeVisible({ timeout: 90_000 });

    async function assertImportedFields() {
      await expect(page.getByTestId("imported-full-name")).toHaveValue("Avery Ramos");
      await expect(page.getByTestId("imported-email")).toHaveValue("avery.ramos@example.com");
      await expect(page.locator("#location")).toHaveValue("Chicago, IL");
      await expect(page.locator("#phone")).toHaveValue("+1 312 555 0199");
      const edits = page.getByRole("button", { name: /^Edit (role|education) \d+$/ });
      while (await edits.count()) await edits.first().click();
      await expect(page.getByLabel("Employer 1", { exact: true })).toHaveValue("Cedar Freight");
      await expect(page.getByLabel("Employer 2", { exact: true })).toHaveValue("Harbor Retail");
      await expect(page.getByLabel("Job title 1", { exact: true })).toHaveValue("Senior Supply Chain Analyst");
      await expect(page.getByLabel("Job title 2", { exact: true })).toHaveValue("Supply Chain Analyst");
      await expect(page.getByLabel("Job title 3", { exact: true })).toHaveCount(0);
      await expect(page.getByTestId("imported-education-0")).toHaveValue("Cascadia Institute of Technology");
      await expect(page.getByTestId("imported-education-degree-0")).toHaveValue("Master's");
      await expect(page.getByTestId("imported-education-field-0")).toHaveValue("Industrial Engineering and Operations");
      await expect(page.getByTestId("imported-education-1")).toHaveCount(0);
    }

    await assertImportedFields();
    await page.getByRole("button", { name: /confirm import/i }).click();
    await expect(page.getByText(/imported career details confirmed/i)).toBeVisible();
    await page.reload();
    await assertImportedFields();
  });
}
