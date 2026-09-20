import { expect, test } from "@playwright/test";
import { seedOnboardedUser, generateResumeViaApi, waitForResumeReady } from "./helpers/session";

test("external application saves without generation and Cancel restores every workspace field", async ({ page }) => {
  await seedOnboardedUser(page, "track-only");
  let generationRequests = 0;
  page.on("request", (request) => { if (request.method() === "POST" && /resumes\/generate|\/research$/.test(request.url())) generationRequests++; });
  await page.goto("/app/opportunities/track");
  await page.getByLabel("Company", { exact: true }).fill("Acme Finance");
  await page.getByLabel("Job title", { exact: true }).fill("Financial Analyst");
  await page.getByLabel("Date applied (optional)").fill("2026-09-18");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page.getByRole("heading", { name: "Financial Analyst", exact: true })).toBeVisible();
  await expect(page.getByText("Not started", { exact: true })).toBeVisible();
  await expect(page.getByText("Follow up", { exact: true })).toBeVisible();
  const fields = ["notes", "follow-up", "interview-at", "contact-name", "cover-letter", "outreach-draft"];
  const saved = ["Call Friday", "2026-10-01", "2026-10-02T10:00", "Alex", "My cover letter", "My outreach"];
  for (let i = 0; i < fields.length; i++) await page.locator(`#${fields[i]}`).fill(saved[i]);
  await page.getByRole("button", { name: "Save workspace", exact: true }).click();
  await expect(page.getByText("Application workspace saved")).toBeVisible();
  for (const field of fields) await page.locator(`#${field}`).fill("");
  await page.locator("#connection-basis").fill("Transient draft context");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  for (let i = 0; i < fields.length; i++) await expect(page.locator(`#${fields[i]}`)).toHaveValue(saved[i]);
  await expect(page.locator("#connection-basis")).toHaveValue("");
  await page.reload();
  for (let i = 0; i < fields.length; i++) await expect(page.locator(`#${fields[i]}`)).toHaveValue(saved[i]);
  expect(generationRequests).toBe(0);
});

test("status conflicts stay visibly unsaved until the server state is reloaded", async ({ page }) => {
  await seedOnboardedUser(page, "status-conflict");
  await page.goto("/app/opportunities/track");
  await page.getByLabel("Company", { exact: true }).fill("Acme");
  await page.getByLabel("Job title", { exact: true }).fill("Analyst");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page.getByRole("heading", { name: "Analyst", exact: true })).toBeVisible();
  await page.goto("/app/opportunities");
  await page.route("**/api/v1/applications/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    return route.fulfill({ status: 409, json: { error: { code: "APPLICATION_STALE", message: "Changed elsewhere" } } });
  });
  await page.getByLabel("Status for Analyst").selectOption("Interviewing");
  const table = page.getByTestId("applications-table");
  await expect(table.getByRole("alert")).toContainText("Not saved");
  await expect(page.getByLabel("Status for Analyst")).toHaveValue("Interviewing");
  await expect(page.getByLabel("Status for Analyst")).toBeDisabled();
  await table.getByRole("button", { name: "Load saved status" }).click();
  await expect(page.getByLabel("Status for Analyst")).toHaveValue("Applied");
  await expect(page.getByLabel("Status for Analyst")).toBeEnabled();
  await expect(table.getByRole("alert")).toHaveCount(0);
});

test("preview text stays selectable without promising an unavailable rewrite", async ({ page }) => {
  await seedOnboardedUser(page, "preview-selection");
  const generated = await generateResumeViaApi(page);
  await page.goto(`/app/resumes/${generated.workflowId}`);
  await waitForResumeReady(page);
  const iframe = page.frameLocator('iframe[title="Resume preview"]');
  await expect(iframe.locator("body")).toContainText("Harbor");
  const selected = await iframe.locator("body").evaluate((body) => {
    const node = body.querySelector("p, li")!;
    const range = body.ownerDocument.createRange(); range.selectNodeContents(node);
    const selection = body.ownerDocument.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return selection.toString().trim();
  });
  expect(selected.length).toBeGreaterThan(0);
  await expect(page.getByText(/Improving selected text only/)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /what would you like to improve/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /download pdf/i })).toBeVisible();
});
