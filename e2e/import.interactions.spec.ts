import { expect, test } from "@playwright/test";
import { DEFAULT_PASSWORD, seedOnboardedUser, uniqueEmail } from "./helpers/session";
import { imageOnlyPdf, importResumeDocx, importResumePdf } from "./helpers/documents";

async function completePreferences(page: import("@playwright/test").Page) {
  await page.locator("#target-roles").click();
  await page.locator("#target-roles").type("Platform Engineer", { delay: 15 });
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Senior", exact: true }).click();
  await page.getByRole("group", { name: /job types/i }).getByRole("button", { name: "Full-time" }).click();
    await page.getByRole("group", { name: /workplace modes/i }).getByRole("button", { name: "Remote" }).click();
    await page.getByRole("button", { name: /^continue$/i }).click();
    await expect(page.getByTestId("onboarding-step")).toHaveText(/step 2 of 3/i, { timeout: 30_000 });
}

test.describe("resume import interactions", () => {
  test("PDF upload reviews fixture fields without fabricating missing publications extras", async ({ page }) => {
    const email = uniqueEmail("import-pdf");
    await page.goto("/sign-up");
    await page.locator("#name").fill("Jordan Blake");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(DEFAULT_PASSWORD);
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL(/\/onboarding/);
    await completePreferences(page);
    await page.getByRole("button", { name: /upload a resume/i }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: importResumePdf(),
    });
    await expect(page.getByText(/ready — review|resume ready/i)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("imported-full-name")).toHaveValue(/Jordan Blake/i);
    // Prefer API extraction email (authoritative) before asserting the controlled input.
    await expect
      .poll(async () => {
        const body = await page.evaluate(async () => {
          const res = await fetch("/api/v1/profile/resume/import", { credentials: "include" });
          return res.json();
        });
        const email = String(body?.extraction?.contact?.email ?? body?.extraction?.rawText ?? "");
        const roles = Array.isArray(body?.extraction?.employment) ? body.extraction.employment : [];
        const title = String(roles[0]?.title ?? roles[0]?.company ?? "");
        return `${email}::${title}::${roles.length}`;
      }, { timeout: 45_000 })
      .toMatch(/jordan\.blake@example\.com::.*Platform Engineer::[1-9]/i);
    await expect
      .poll(async () => page.getByTestId("imported-email").inputValue(), { timeout: 45_000 })
      .toMatch(/jordan\.blake@example\.com/i);
    await expect(page.locator("#linkedin")).toHaveValue(/linkedin\.com\/in\/jordanblake/i);
    await expect(page.locator("#github")).toHaveValue(/github\.com\/jordanblake/i);
    const phone = await page.locator("#phone").inputValue();
    if (phone) expect(phone).toMatch(/555/);
    await expect(page.getByLabel(/job title 1/i)).toHaveValue(/Platform Engineer/i);
    await expect(page.getByLabel(/employer 1/i)).toHaveValue(/Harbor Systems/i);
    await expect(page.getByRole("textbox", { name: "Bullets 1", exact: true })).toHaveValue(
      /Kubernetes-based deployment pipelines/i,
    );
    await expect(page.getByLabel("Employment start date 1", { exact: true })).toHaveValue(/Jan 2021|2021-01/i);
    await expect(page.getByTestId("imported-project-0")).toHaveValue(/Observability Fabric/i);
    await expect(page.getByTestId("imported-education-0")).toHaveValue(/Cascadia University/i);
    await expect(page.getByTestId("imported-education-degree-0")).toHaveValue(/B\.?S\.?/i);
    await expect(page.getByTestId("imported-education-field-0")).toHaveValue(/Computer Science/i);
    await expect(page.getByTestId("imported-cert-0")).toHaveValue(/AWS Solutions Architect Associate/i);
    await expect(page.getByTestId("imported-publication-0")).toHaveValue(/Reliable Rollouts/i);
    await expect(page.getByLabel(/job title 2/i)).toHaveCount(0);
    await page.getByTestId("imported-full-name").fill("Jordan B. Blake");
    await page.getByTestId("imported-email").fill("reviewed@example.com");
    await page.getByTestId("imported-portfolio").fill("");
    await page.getByTestId("imported-education-0").fill("Reviewed University");
    await page.getByRole("button", { name: "Remove certification 1", exact: true }).click();
    await expect.poll(async () => page.evaluate(async () => {
      const state = await (await fetch("/api/v1/profile/resume/import", { credentials: "include" })).json();
      return [state.extraction?.contact?.fullName, state.extraction?.contact?.email,
        state.extraction?.education?.[0]?.institution, state.extraction?.certificationEntries?.length];
    })).toEqual(["Jordan B. Blake", "reviewed@example.com", "Reviewed University", 0]);
    await page.reload();
    await expect(page.getByTestId("imported-full-name")).toHaveValue("Jordan B. Blake");
    await expect(page.getByTestId("imported-email")).toHaveValue("reviewed@example.com");
    await expect(page.getByTestId("imported-portfolio")).toHaveValue("");
    await expect(page.getByTestId("imported-education-0")).toHaveValue("Reviewed University");
    await expect(page.getByTestId("imported-cert-0")).toHaveCount(0);
  });

  test("DOCX upload on Profile confirms imported employment after reload", async ({ page }) => {
    await seedOnboardedUser(page, "import-docx");
    const docx = await importResumeDocx();
    await page.goto("/app/profile");
    await expect(page.getByRole("heading", { name: /^profile$/i })).toBeVisible();
    await page.getByRole("button", { name: /upload a resume/i }).click();
    await expect(page.getByRole("button", { name: /choose pdf or docx|replace file/i })).toBeVisible();
    const uploadResponse = page.waitForResponse(
      (res) => res.url().includes("/api/v1/profile/resume/upload") && res.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: "resume.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: docx,
    });
    expect((await uploadResponse).ok()).toBeTruthy();
    await expect(page.getByText(/ready — review|resume ready/i)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByLabel(/job title 1/i)).toHaveValue(/Platform Engineer/i);
    await expect(page.getByLabel(/employer 1/i)).toHaveValue(/Harbor Systems/i);
    await expect(page.getByRole("textbox", { name: "Bullets 1", exact: true })).toHaveValue(
      /São Paulo liaison|naïve clustering latency/i,
    );
    await page.getByRole("button", { name: /confirm import/i }).click();
    await expect(page.getByText(/imported career details confirmed/i)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(/employer 1/i)).toHaveValue(/Harbor Systems/i);
    await expect(page.getByLabel(/job title 1/i)).toHaveValue(/Platform Engineer/i);
    await expect(page.getByLabel(/job title 2/i)).toHaveCount(0);
    await expect(page.locator("#identity-portfolio")).toHaveValue(/jordanblake\.dev/i);
  });

  test("image-only PDF stays failed with an OCR-unsupported message", async ({ page }) => {
    await seedOnboardedUser(page, "import-scan");
    await page.goto("/app/profile");
    await page.getByRole("button", { name: /upload a resume/i }).click();
    await expect(page.getByRole("button", { name: /choose pdf or docx|replace file/i })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({
      name: "scan.pdf",
      mimeType: "application/pdf",
      buffer: imageOnlyPdf(),
    });
    await expect(page.getByRole("alert").filter({ hasText: /scanned images|OCR is not available|text-based PDF/i })).toBeVisible({
      timeout: 90_000,
    });
  });
});
