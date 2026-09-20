import { expect, test } from "@playwright/test";
import { generateResumeViaApi, seedOnboardedUser, waitForResumeReady } from "./helpers/session";
import { docxContains, pdfContains } from "./helpers/documents";
import { readFile } from "node:fs/promises";

test.describe("resume interactions", () => {
  test("empty library points the user to Jobs", async ({ page }) => {
    await seedOnboardedUser(page, "resume-empty");
    await page.goto("/app/resumes");
    await expect(page.getByRole("heading", { name: /no tailored resumes yet/i })).toBeVisible();
    await page.getByRole("link", { name: /browse jobs/i }).click();
    await expect(page).toHaveURL(/\/app\/radar/);
  });

  test("generate validation requires a description or URL", async ({ page }) => {
    await seedOnboardedUser(page, "resume-invalid");
    await page.goto("/app/resumes/new");
    await page.getByRole("button", { name: /generate tailored resume/i }).click();
    await expect(page.getByText(/paste a job description or enter a job url/i)).toBeVisible();
    await expect(page).toHaveURL(/\/app\/resumes\/new/);
  });

  test("pasted description generation reaches a downloadable resume", async ({ page }) => {
    await seedOnboardedUser(page, "resume-generate");
    await page.goto("/app/resumes/new");
    await page.getByRole("textbox", { name: /job description/i }).fill(`Senior Platform Engineer
Company: Northwind Labs
We need TypeScript, Kubernetes, and API design experience.
Responsibilities include building reliable services.
Requirements: 5+ years experience, strong ownership.`);
    await page.getByRole("textbox", { name: /^company/i }).fill("Northwind Labs");
    await page.getByRole("textbox", { name: /^role/i }).fill("Senior Platform Engineer");
    const generate = page.getByRole("button", { name: /generate tailored resume/i });
    const generateResponse = page.waitForResponse(
      (res) => res.url().includes("/api/v1/resumes/generate") && res.request().method() === "POST",
    );
    await generate.click();
    const response = await generateResponse;
    expect(response.ok(), await response.text()).toBeTruthy();
    await page.waitForURL(/\/app\/resumes\/(?!new(?:\/|$))/, { timeout: 60_000 });
    await waitForResumeReady(page);
    await expect(page.getByRole("link", { name: /download pdf/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /download docx/i })).toBeVisible();
    await page.getByText("Research and résumé approach", { exact: true }).click();
    await expect(page.getByTestId("resume-research")).toContainText("no live company research was performed");
  });

  test("PDF download contains readable resume text", async ({ page }) => {
    await seedOnboardedUser(page, "resume-pdf");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    const pdf = page.getByRole("link", { name: /download pdf/i });
    const [download] = await Promise.all([page.waitForEvent("download"), pdf.click()]);
    expect(download.suggestedFilename().toLowerCase()).toMatch(/pdf/);
    const path = await download.path();
    expect(path).toBeTruthy();
    const bytes = await readFile(path!);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const text = await pdfContains(bytes, ["Harbor Systems", "Audit Tester", "Engineer"]);
    expect(text).toMatch(/S[aã?]o Paulo|Paulo/);
    expect(text).toMatch(/na[iï?]ve clustering/i);
    expect(text).not.toMatch(/impact narrative|systems ownership/i);
    expect(text).not.toMatch(/I worked at Northwind Labs as /i);
  });

  test("Word download contains independent readable content", async ({ page }) => {
    await seedOnboardedUser(page, "resume-docx");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    await page.route("**/api/v1/resumes/generate", async (route) => {
      await route.abort();
    });
    const word = page.getByRole("link", { name: /download docx/i });
    const [download] = await Promise.all([page.waitForEvent("download"), word.click()]);
    expect(download.suggestedFilename().toLowerCase()).toMatch(/docx|word/);
    const path = await download.path();
    expect(path).toBeTruthy();
    const bytes = await readFile(path!);
    expect(bytes.length).toBeGreaterThan(100);
    expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
    const text = await docxContains(bytes, ["Harbor Systems", "Audit Tester", "Engineer"]);
    expect(text).toMatch(/São Paulo|Sao Paulo/i);
    expect(text).toMatch(/na[iï]ve clustering/i);
    expect(text).not.toMatch(/impact narrative|systems ownership/i);
    expect(text).not.toMatch(/I worked at Northwind Labs as /i);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("Retry PDF does not start a new generation while Word remains downloadable", async ({ page }) => {
    await seedOnboardedUser(page, "pdf-retry");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    await page.route(`**/api/v1/resumes/workflows/${generated.workflowId}`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      body.downloads = { pdfReady: false, docxReady: true };
      body.documentRetryAvailable = true;
      body.status = "completed";
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: /your tailored resume/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /retry pdf/i })).toBeVisible();
    const word = page.getByRole("link", { name: /download docx/i });
    const [download] = await Promise.all([page.waitForEvent("download"), word.click()]);
    expect(download.suggestedFilename().toLowerCase()).toMatch(/docx|word/);
    let generates = 0;
    let retries = 0;
    await page.route("**/api/v1/resumes/generate", async (route) => {
      generates += 1;
      await route.continue();
    });
    await page.route(`**/api/v1/resumes/workflows/${generated.workflowId}/retry`, async (route) => {
      retries += 1;
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ workflowId: generated.workflowId, status: "queued" }),
      });
    });
    await page.getByRole("button", { name: /retry pdf/i }).click();
    await expect.poll(() => retries).toBe(1);
    expect(generates).toBe(0);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("local capability notice does not advertise a paid rewrite", async ({ page }) => {
    await seedOnboardedUser(page, "resume-local");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    await expect(page.getByRole("heading", { name: /version history/i })).toBeVisible();
    await expect(page.getByText(/Free-form rewriting is not available yet/)).toBeVisible();
    await expect(page.getByRole("button", { name: /create new version/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /download pdf/i })).toBeVisible();
  });

  test("local writing review exposes ten criteria without an unsupported edit action", async ({ page }) => {
    await seedOnboardedUser(page, "resume-writing-review");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    await page.locator("summary").filter({ hasText: /^Résumé quality review$/ }).click();
    const review = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: /^Résumé quality review$/ }) });
    await expect(review.locator("details")).toHaveCount(10);
    await expect(review).toContainText("not a VMock score");
    // This fixture has no stated outcome or scope. Test that specific warning
    // instead of relying on an incidental action-verb flag from another section.
    const outcomes = review.locator("details").filter({ has: page.locator("summary").filter({ hasText: /^Outcomes and scope/ }) });
    await expect(outcomes).toContainText("Review suggested");
    await outcomes.locator("summary").click();
    const finding = outcomes.locator("li").first();
    await expect(finding.locator("blockquote")).toBeVisible();
    await expect(finding.getByRole("button", { name: "Review this text" })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: /what would you like to improve/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /download pdf/i })).toBeVisible();
  });

  test("a direct unsupported rewrite preserves the current version and downloads", async ({ page }) => {
    await seedOnboardedUser(page, "resume-no-change");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    const result = await page.evaluate(async id => {
      const csrf = decodeURIComponent(document.cookie.split("; ").find(v => v.startsWith("candidarc_csrf="))?.split("=")[1] ?? "");
      const response = await fetch(`/api/v1/resumes/workflows/${id}/refine`, { method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ instruction: "Make it more concise" }) });
      return { status: response.status, body: await response.json() };
    }, generated.workflowId);
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe("LOCAL_REWRITE_UNAVAILABLE");
    await page.reload();
    await waitForResumeReady(page);
    await expect(page.getByRole("button", { name: /^compare$/i })).toHaveCount(0);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /download pdf/i }).click()]);
    await pdfContains(await readFile((await download.path())!), ["Harbor Systems", "Audit Tester"]);
  });

  test("library search opens the matching tailored resume", async ({ page }) => {
    await seedOnboardedUser(page, "resume-lib");
    const generated = await generateResumeViaApi(page);
    await page.goto(`/app/resumes/${generated.workflowId}`);
    await waitForResumeReady(page);
    await page.goto("/app/resumes");
    await page.getByRole("textbox", { name: /search resumes/i }).fill("Northwind");
    await page.getByRole("link", { name: /northwind/i }).click();
    await expect(page.getByRole("heading", { name: /your tailored resume/i })).toBeVisible();
  });

  test("failed generate preserves the pasted description", async ({ page }) => {
    await seedOnboardedUser(page, "resume-fail");
    await page.route("**/api/v1/resumes/generate", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Generator unavailable" } }),
      });
    });
    await page.goto("/app/resumes/new");
    const jd = "Keep this description for retry.";
    await page.getByRole("textbox", { name: /job description/i }).fill(jd);
    await page.getByRole("button", { name: /generate tailored resume/i }).click();
    await expect(page.getByText(/generator unavailable/i)).toBeVisible();
    await expect(page.getByRole("textbox", { name: /job description/i })).toHaveValue(jd);
  });
});
