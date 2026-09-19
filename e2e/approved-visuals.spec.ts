import { expect, test } from "@playwright/test";
import { DEFAULT_PASSWORD, generateResumeViaApi, seedOnboardedUser, uniqueEmail, waitForResumeReady } from "./helpers/session";
import { importResumePdf } from "./helpers/documents";

for (const width of [1536, 390]) {
  test(`approved homepage and interactive storyboard at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Get noticed for what you can do\./ })).toBeVisible();
    await expect(page.getByText("Your experience, in focus.")).toBeVisible();
    await expect(page.locator(".focus-insight-title")).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.focus-hero-paper')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`homepage-${width}.png`), fullPage: false, animations: "disabled" });
    await page.getByRole("button", { name: "See it in action" }).click();
    const dialog = page.getByRole("dialog", { name: "Product demo" });
    for (const [stage, title] of [["understanding", "Understanding the role"], ["tailoring", "Tailoring your résumé"], ["ready", "Ready for your review"]]) {
      await dialog.getByRole("button", { name: new RegExp(title) }).click();
      await expect(dialog.locator(".resume-motion-scene")).toHaveAttribute("data-stage", stage);
      await page.screenshot({ path: testInfo.outputPath(`storyboard-${stage}-${width}.png`), animations: "disabled" });
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "See it in action" })).toBeFocused();
  });
}

test("approved onboarding review keeps real import fields editable on desktop and mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto("/sign-up");
  await page.locator("#name").fill("Jordan Blake");
  await page.locator("#email").fill(uniqueEmail("approved-review"));
  await page.locator("#password").fill(DEFAULT_PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/onboarding/);
  await page.locator("#target-roles").fill("Platform Engineer");
  await page.locator("#target-roles").press("Enter");
  await page.getByRole("button", { name: "Senior", exact: true }).click();
  await page.getByRole("group", { name: /job types/i }).getByRole("button", { name: "Full-time" }).click();
  await page.getByRole("group", { name: /workplace modes/i }).getByRole("button", { name: "Remote" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: /upload a resume/i }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "Jordan_Blake_Resume.pdf", mimeType: "application/pdf", buffer: importResumePdf() });
  await expect(page.getByRole("heading", { name: "Review your experience" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("import-summary")).toContainText("Imported 1 role, 1 education entry and 1 project");
  await expect(page.getByText("Jordan_Blake_Resume.pdf", { exact: true })).toBeVisible();
  // The fixture intentionally has no phone. The real required-field gate must hold.
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByTestId("onboarding-step")).toHaveText("Step 2 of 3");
  await page.locator("#phone").pressSequentially("+1 312 555 0111");
  await expect(page.locator("#phone")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  const contact = page.locator(".focus-review-section").filter({ has: page.locator("#phone") });
  await contact.locator(":scope > summary").click();
  await expect(page.getByText("Add your phone number", { exact: true })).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("onboarding-review-1536.png"), animations: "disabled" });
  await page.getByText("Edit role 1", { exact: true }).click();
  await page.getByRole("textbox", { name: "Employer 1", exact: true }).fill("Reviewed Employer");
  await expect.poll(() => page.evaluate(async () => {
    const state = await (await fetch("/api/v1/profile/resume/import", { credentials: "include" })).json();
    return state.extraction?.employment?.[0]?.company;
  })).toBe("Reviewed Employer");
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  await page.reload();
  await expect(page.getByText(/Reviewed Employer/).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("onboarding-review-390.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByTestId("onboarding-step")).toHaveText("Step 3 of 3");
});

test("live generation scenes follow responses and completed résumé retains downloads", async ({ page }, testInfo) => {
  await seedOnboardedUser(page, "approved-generation");
  let stage = "understanding";
  await page.route("**/api/v1/resumes/workflows/visual-stage-proof", (route) => route.fulfill({ json: { workflowId: "visual-stage-proof", applicationId: "visual-app", status: "creating", pipelineStage: stage, downloads: { pdfReady: false, docxReady: false } } }));
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto("/app/resumes/visual-stage-proof");
  for (const next of ["understanding", "tailoring", "preparing"]) {
    stage = next;
    await expect(page.locator(".resume-motion-scene")).toHaveAttribute("data-stage", stage);
    await expect(page.getByText("Ready for your review", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`generation-${stage}.png`), animations: "disabled" });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("generation-390.png"), animations: "disabled" });
  const generated = await generateResumeViaApi(page);
  await page.goto(`/app/resumes/${generated.workflowId}`);
  await waitForResumeReady(page);
  await expect(page.getByText("Ready for your review", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download DOCX", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.screenshot({ path: testInfo.outputPath("resume-ready.png"), animations: "disabled" });
});

test("reduced motion keeps all information without timed animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".focus-hero-art")).toHaveCSS("animation-name", "none");
  await page.getByRole("button", { name: "See it in action" }).click();
  await expect(page.getByRole("button", { name: "Play storyboard" })).toHaveCount(0);
  await page.getByRole("button", { name: /02.*Tailoring your résumé/ }).click();
  await expect(page.locator(".assembly-strip").first()).toHaveCSS("animation-name", "none");
});
