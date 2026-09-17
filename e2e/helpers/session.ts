import { expect, type Page } from "@playwright/test";

let seq = 0;

export function uniqueEmail(prefix = "audit"): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export const DEFAULT_PASSWORD = "AuditTest!123";

function csrfFromCookies(cookies: Array<{ name: string; value: string }>): string {
  const raw = cookies.find((cookie) => cookie.name === "candidarc_csrf")?.value ?? "";
  return decodeURIComponent(raw);
}

async function csrf(page: Page): Promise<string> {
  return csrfFromCookies(await page.context().cookies());
}

export async function signupViaApi(
  page: Page,
  input?: { name?: string; email?: string; password?: string },
): Promise<{ name: string; email: string; password: string }> {
  const name = input?.name ?? "Audit Tester";
  const email = input?.email ?? uniqueEmail();
  const password = input?.password ?? DEFAULT_PASSWORD;
  const response = await page.request.post("/api/v1/auth/signup", {
    data: { name, email, password },
  });
  if (!response.ok()) {
    throw new Error(`signup failed ${response.status()}: ${await response.text()}`);
  }
  return { name, email, password };
}

export async function completeOnboardingViaApi(page: Page, user: { name: string; email: string }): Promise<void> {
  const token = await csrf(page);
  const headers = { "x-csrf-token": token, "content-type": "application/json" };
  const progress = await page.request.get("/api/v1/profile/onboarding");
  if (!progress.ok()) throw new Error(`onboarding get failed ${progress.status()}: ${await progress.text()}`);
  const body = (await progress.json()) as { version?: number; data?: { version?: number } };
  const expectedVersion = body.version ?? body.data?.version;
  if (typeof expectedVersion !== "number") throw new Error("onboarding version missing");

  const save = await page.request.patch("/api/v1/profile/onboarding", {
    headers,
    data: {
      expectedVersion,
      step: 1,
      data: {
        onboardingFlowVersion: 3,
        targetRoles: ["Platform Engineer"],
        seniority: "senior",
        jobTypes: ["full-time"],
        workplaceModes: ["remote"],
        fullName: user.name,
        email: user.email,
        phone: "+1 555 0100",
        location: "Austin, TX",
        linkedIn: "linkedin.com/in/audit",
        skills: ["TypeScript", "Kubernetes"],
        employment: [{ title: "Engineer", company: "Harbor Systems", bullets: ["Built APIs"] }],
        careerProfileMode: "manual",
      },
    },
  });
  if (!save.ok()) throw new Error(`onboarding save failed ${save.status()}: ${await save.text()}`);
  const saved = (await save.json()) as { version?: number };
  const complete = await page.request.patch("/api/v1/profile/onboarding", {
    headers,
    data: { expectedVersion: saved.version ?? expectedVersion + 1, step: 2, completed: true },
  });
  if (!complete.ok()) throw new Error(`onboarding complete failed ${complete.status()}: ${await complete.text()}`);
}

export async function seedOnboardedUser(page: Page, prefix = "audit") {
  const user = await signupViaApi(page, { email: uniqueEmail(prefix) });
  await completeOnboardingViaApi(page, user);
  return user;
}

export async function loginViaUi(page: Page, email: string, password = DEFAULT_PASSWORD) {
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(app|onboarding)/, { timeout: 60_000 });
}

export async function openJobs(page: Page) {
  await page.goto("/app/radar");
  await expect(page.getByRole("heading", { name: /jobs for you/i })).toBeVisible({ timeout: 30_000 });
}

export async function generateResumeViaApi(page: Page) {
  const token = await csrf(page);
  const response = await page.request.post("/api/v1/resumes/generate", {
    headers: { "x-csrf-token": token, "content-type": "application/json" },
    data: {
      company: "Northwind Labs",
      role: "Senior Platform Engineer",
      jobDescription: `Senior Platform Engineer
Company: Northwind Labs
We need TypeScript, Kubernetes, and API design experience.
Responsibilities include building reliable services.
Requirements: 5+ years experience, strong ownership.`,
    },
  });
  if (!response.ok()) {
    throw new Error(`generate failed ${response.status()}: ${await response.text()}`);
  }
  return (await response.json()) as { workflowId: string; applicationId?: string };
}

export async function waitForResumeReady(page: Page) {
  const continueWithout = page.getByRole("button", { name: /continue without answering/i });
  if (await continueWithout.isVisible().catch(() => false)) {
    await continueWithout.click();
  }
  await expect(page.getByRole("heading", { name: /your tailored resume/i })).toBeVisible({ timeout: 90_000 });
}
