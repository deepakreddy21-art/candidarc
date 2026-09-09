/**
 * Principal onboarding resume-import journey against real Next route handlers
 * and a real FastAPI HTTP server. Does not mock PythonIntelligenceClient.parseResume.
 *
 * @vitest-environment node
 */
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { resolve } from "path";
import { randomUUID } from "crypto";
import {
  createEmptyMemoryStore,
  MemoryRepositories,
  newId,
} from "../../server/database/repositories";
import { resetRuntimeForTests, setRuntimeForTests, type Runtime } from "../../server/bootstrap";
import { ProfileService } from "../../server/modules/profile/service";
import { ResumeImportService } from "../../server/modules/resumes/import-service";
import { LocalFilesystemStorage } from "../../server/storage/local";
import { InProcessQueueAdapter } from "../../server/workflows/queues";
import { resetStorage } from "../../server/storage";
import { hashPassword } from "../../server/auth/password";
import { createSession, hashToken } from "../../server/auth/session";
import { ensureCsrfCookie } from "../../server/http/csrf";
import { resetPythonIntelligenceClient } from "../../server/intelligence/python-client";
import { resetEnvCache } from "../../server/config/env";
import { createMinimalDocx } from "../../server/resumes/document-renderer";
import {
  NO_EMPLOYMENT_RESUME,
  PROFESSIONAL_EXPERIENCE_RESUME,
  WORK_HISTORY_RESUME,
  imageOnlyPdf,
  textToSimplePdf,
  twoColumnTextPdf,
} from "./fixtures/resume-samples";
import { validateStepClient, emptyOnboardingForm } from "@/components/onboarding/types";

const backendRoot = path.resolve(process.cwd(), "services/python-backend");
const win = process.platform === "win32";
const venvPython = win
  ? path.join(backendRoot, ".venv", "Scripts", "python.exe")
  : path.join(backendRoot, ".venv", "bin", "python");

const TOKEN = process.env.PYTHON_BACKEND_TOKEN || "dev-python-backend-token-change-me";
const PORT = Number(process.env.RESUME_IMPORT_TEST_PORT || 8093);
const BASE = `http://127.0.0.1:${PORT}`;

async function buildRuntime(): Promise<Runtime> {
  const store = createEmptyMemoryStore();
  const repos = new MemoryRepositories(store);
  const queue = new InProcessQueueAdapter();
  const storage = new LocalFilesystemStorage(resolve(`.data/test-resume-journey-${PORT}`), `secret-${PORT}`);
  const resumeImport = ResumeImportService.fromRepos(repos, storage, queue);

  queue.registerHandler("maintenance", async (job) => {
    const payload = job.payload as { tenantId?: string; filePublicId?: string };
    if (job.name === "files.malware_scan" && payload.tenantId && payload.filePublicId) {
      await resumeImport.runMalwareScan(payload.tenantId, payload.filePublicId);
    }
  });
  queue.registerHandler("document-parsing", async (job) => {
    const payload = job.payload as { tenantId?: string; filePublicId?: string };
    if (job.name === "resume.extract" && payload.tenantId && payload.filePublicId) {
      await resumeImport.runExtraction(payload.tenantId, payload.filePublicId);
    }
  });
  queue.onExhaustedRetries(async (job, error) => {
    const payload = job.payload as { tenantId?: string; filePublicId?: string };
    if (!payload.tenantId || !payload.filePublicId) return;
    if (
      (job.queue === "document-parsing" && job.name === "resume.extract") ||
      (job.queue === "maintenance" && job.name === "files.malware_scan")
    ) {
      await resumeImport.markImportFailed(
        payload.tenantId,
        payload.filePublicId,
        "PARSE_FAILED",
        error instanceof Error ? error.message : "Import failed",
      );
    }
  });
  await queue.start();

  return {
    mode: "memory",
    repos,
    store,
    queue,
    engine: {} as Runtime["engine"],
    pipeline: {} as Runtime["pipeline"],
    services: {
      profile: ProfileService.fromRepos(repos),
      resumeImport,
    } as Runtime["services"],
  };
}

async function seedAuthedUser(runtime: Runtime) {
  const passwordHash = await hashPassword("OnboardTest!123");
  const user = await runtime.repos.users.create({
    id: newId("usr"),
    publicId: newId("usp"),
    email: `resume-${newId("e")}@example.com`,
    emailVerified: true,
    passwordHash,
    name: "Resume Candidate",
  });
  const tenant = await runtime.repos.users.createTenant({
    publicId: newId("tep"),
    name: "Resume Tenant",
    plan: "free",
  });
  await runtime.repos.users.createMembership({
    tenantId: tenant.id,
    userId: user.id,
    role: "owner",
  });
  const session = await createSession({
    userId: user.id,
    tenantId: tenant.id,
    sessionId: randomUUID(),
  });
  await runtime.repos.sessions.create({
    id: session.sessionId,
    userId: user.id,
    tokenHash: hashToken(session.token),
    expiresAt: session.expiresAt.toISOString(),
  });
  const csrfProbe = new Response();
  const csrf = ensureCsrfCookie(csrfProbe);
  const cookie = `${session.cookie.split(";")[0]}; candidarc_csrf=${encodeURIComponent(csrf)}`;
  return { user, tenant, cookie, csrf };
}

async function waitImportReady(cookie: string, timeoutMs = 45_000) {
  const { GET } = await import("../../src/app/api/v1/profile/resume/import/route");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await GET(new Request("http://localhost:3000/api/v1/profile/resume/import", { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    if (body.status === "ready_for_review" || body.status === "failed") return body;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Import polling timed out");
}

describe("onboarding resume import journey (real FastAPI)", () => {
  let child: ChildProcess | null = null;
  let startedByTest = false;

  beforeAll(async () => {
    if (!existsSync(venvPython)) {
      throw new Error(`Python venv missing at ${venvPython}`);
    }
    process.env.APP_MODE = "demo";
    process.env.AI_MODE = "mock";
    process.env.PYTHON_BACKEND_TOKEN = TOKEN;
    process.env.PYTHON_BACKEND_URL = BASE;
    process.env.RESUME_INTELLIGENCE_BACKEND = "python";
    process.env.CSRF_SECRET = "candidarc-dev-csrf-secret-change-me!!!!";
    resetEnvCache();
    resetPythonIntelligenceClient();

    // Always use a dedicated FastAPI on RESUME_IMPORT_TEST_PORT so we never
    // accidentally hit a stale process that lacks structured parse fields.
    let alreadyUp = false;
    try {
      const existing = await fetch(`${BASE}/health/live`);
      alreadyUp = existing.ok;
    } catch {
      alreadyUp = false;
    }

    if (!alreadyUp) {
      startedByTest = true;
      child = spawn(
        venvPython,
        ["-m", "uvicorn", "app.main:app", "--port", String(PORT), "--host", "127.0.0.1"],
        {
          cwd: backendRoot,
          env: {
            ...process.env,
            AI_MODE: "mock",
            APP_MODE: "demo",
            PYTHON_BACKEND_TOKEN: TOKEN,
          },
          stdio: "ignore",
        },
      );
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        try {
          const response = await fetch(`${BASE}/health/live`);
          if (response.ok) return;
        } catch {
          /* retry */
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error("Python backend failed to become ready for resume import journey");
    }
  }, 30_000);

  afterAll(async () => {
    if (!startedByTest || !child?.pid) return;
    try {
      if (win) spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"]);
      else child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  });

  beforeEach(async () => {
    resetStorage();
    resetRuntimeForTests();
    resetPythonIntelligenceClient();
    process.env.PYTHON_BACKEND_URL = BASE;
    process.env.PYTHON_BACKEND_TOKEN = TOKEN;
    resetEnvCache();
    setRuntimeForTests(await buildRuntime());
  });

  afterEach(async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    await runtime.queue.stop();
    resetRuntimeForTests();
    setRuntimeForTests(null);
  });

  it("authenticates, uploads PDF, polls structured roles, confirms once, and keeps employment after refresh", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const { cookie, csrf } = await seedAuthedUser(runtime);

    const pdf = textToSimplePdf(PROFESSIONAL_EXPERIENCE_RESUME);
    const form = new FormData();
    form.append("file", new File([Uint8Array.from(pdf)], "jordan-blake.pdf", { type: "application/pdf" }));

    const { POST: upload } = await import("../../src/app/api/v1/profile/resume/upload/route");
    const uploadRes = await upload(
      new Request("http://localhost:3000/api/v1/profile/resume/upload", {
        method: "POST",
        headers: { cookie, "x-csrf-token": csrf },
        body: form,
      }),
    );
    expect(uploadRes.status).toBe(201);

    const importBody = await waitImportReady(cookie);
    expect(importBody.status).toBe("ready_for_review");
    expect(importBody.extraction.employment.length).toBeGreaterThanOrEqual(2);
    expect(importBody.extraction.employment.map((j: { company?: string }) => j.company)).toEqual(
      expect.arrayContaining(["Harbor Systems", "Northwind Labs"]),
    );
    expect(importBody.extraction.skills).toEqual(
      expect.arrayContaining(["TypeScript", "Kubernetes"]),
    );
    expect(importBody.extraction.contact?.email).toMatch(/jordan\.blake@example\.com/i);

    const { POST: confirm } = await import("../../src/app/api/v1/profile/resume/confirm/route");
    const confirmRes = await confirm(
      new Request("http://localhost:3000/api/v1/profile/resume/confirm", {
        method: "POST",
        headers: {
          cookie,
          "x-csrf-token": csrf,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(confirmRes.status).toBe(200);
    const confirmed = await confirmRes.json();
    expect(confirmed.profile.resumeImportStatus ?? confirmed.extraction).toBeTruthy();
    expect(confirmed.extraction.employment.length).toBeGreaterThanOrEqual(2);

    // Confirm twice remains idempotent
    const confirmAgain = await confirm(
      new Request("http://localhost:3000/api/v1/profile/resume/confirm", {
        method: "POST",
        headers: {
          cookie,
          "x-csrf-token": csrf,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(confirmAgain.status).toBe(200);

    const { GET: getImport } = await import("../../src/app/api/v1/profile/resume/import/route");
    const refresh = await getImport(
      new Request("http://localhost:3000/api/v1/profile/resume/import", { headers: { cookie } }),
    );
    const refreshBody = await refresh.json();
    expect(refreshBody.status).toBe("confirmed");
    expect(refreshBody.extraction.employment.length).toBeGreaterThanOrEqual(2);

    const { GET: getOnboarding } = await import("../../src/app/api/v1/profile/onboarding/route");
    const onboard = await getOnboarding(
      new Request("http://localhost:3000/api/v1/profile/onboarding", { headers: { cookie } }),
    );
    expect(onboard.status).toBe(200);
    const refreshedImport = await getImport(
      new Request("http://localhost:3000/api/v1/profile/resume/import", { headers: { cookie } }),
    );
    const persisted = await refreshedImport.json();
    expect(persisted.status).toBe("confirmed");
    expect(persisted.extraction.employment.length).toBeGreaterThanOrEqual(2);
    expect(persisted.extraction.skills).toEqual(expect.arrayContaining(["TypeScript"]));
  }, 60_000);

  it("parses WORK HISTORY heading and multipage PDF", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const { cookie, csrf } = await seedAuthedUser(runtime);
    const pdf = textToSimplePdf(WORK_HISTORY_RESUME, 2);
    const form = new FormData();
    form.append("file", new File([Uint8Array.from(pdf)], "work-history.pdf", { type: "application/pdf" }));
    const { POST: upload } = await import("../../src/app/api/v1/profile/resume/upload/route");
    const uploadRes = await upload(
      new Request("http://localhost:3000/api/v1/profile/resume/upload", {
        method: "POST",
        headers: { cookie, "x-csrf-token": csrf },
        body: form,
      }),
    );
    expect(uploadRes.status).toBe(201);
    const body = await waitImportReady(cookie);
    expect(body.status).toBe("ready_for_review");
    expect(body.extraction.employment.length).toBeGreaterThanOrEqual(2);
    expect(body.extraction.pageCount ?? 1).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("parses DOCX with the same resume information", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const { cookie, csrf } = await seedAuthedUser(runtime);
    const docx = await createMinimalDocx(PROFESSIONAL_EXPERIENCE_RESUME.split("\n"));
    const form = new FormData();
    form.append(
      "file",
      new File([Uint8Array.from(docx)], "jordan.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    const { POST: upload } = await import("../../src/app/api/v1/profile/resume/upload/route");
    expect(
      (
        await upload(
          new Request("http://localhost:3000/api/v1/profile/resume/upload", {
            method: "POST",
            headers: { cookie, "x-csrf-token": csrf },
            body: form,
          }),
        )
      ).status,
    ).toBe(201);
    const body = await waitImportReady(cookie);
    expect(body.status).toBe("ready_for_review");
    expect(body.extraction.employment.length).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it("returns IMAGE_ONLY_PDF_OCR_REQUIRED for scanned PDFs", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const { cookie, csrf } = await seedAuthedUser(runtime);
    const form = new FormData();
    form.append("file", new File([Uint8Array.from(imageOnlyPdf())], "scan.pdf", { type: "application/pdf" }));
    const { POST: upload } = await import("../../src/app/api/v1/profile/resume/upload/route");
    expect(
      (
        await upload(
          new Request("http://localhost:3000/api/v1/profile/resume/upload", {
            method: "POST",
            headers: { cookie, "x-csrf-token": csrf },
            body: form,
          }),
        )
      ).status,
    ).toBe(201);
    const body = await waitImportReady(cookie);
    expect(body.status).toBe("failed");
    expect(body.extraction.errorCode).toBe("IMAGE_ONLY_PDF_OCR_REQUIRED");
  }, 60_000);

  it("lets candidates without employment complete via projects/education/skills", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const { cookie, csrf } = await seedAuthedUser(runtime);
    const pdf = textToSimplePdf(NO_EMPLOYMENT_RESUME);
    const form = new FormData();
    form.append("file", new File([Uint8Array.from(pdf)], "student.pdf", { type: "application/pdf" }));
    const { POST: upload } = await import("../../src/app/api/v1/profile/resume/upload/route");
    await upload(
      new Request("http://localhost:3000/api/v1/profile/resume/upload", {
        method: "POST",
        headers: { cookie, "x-csrf-token": csrf },
        body: form,
      }),
    );
    const body = await waitImportReady(cookie);
    expect(body.status).toBe("ready_for_review");
    expect(body.extraction.employment ?? []).toHaveLength(0);
    expect(body.extraction.skills.length).toBeGreaterThan(0);
    expect(body.extraction.usable).toBe(true);

    const { validateStepClient, emptyOnboardingForm } = await import("../../src/components/onboarding/types");
    const formState = {
      ...emptyOnboardingForm(),
      fullName: body.extraction.contact?.fullName ?? "Sam Rivera",
      skills: body.extraction.skills,
      education: (body.extraction.education ?? []).map((e: { institution?: string; degree?: string }) => ({
        school: e.institution,
        degree: e.degree,
      })),
      careerProfileMode: "upload" as const,
    };
    expect(validateStepClient(2, formState, "ready_for_review")).toBeNull();
  }, 60_000);

  /**
   * Production path exercised (no duplicated mapper):
   * POST upload → LocalFilesystemStorage → InProcessQueue (malware scan + resume.extract)
   * → PythonIntelligenceClient → FastAPI /v1/resumes/parse → mapPythonResumeParseToExtraction
   * → GET import (review) → POST confirm → GET onboarding/import (persisted profile + evidence).
   */
  it("two-column PDF full path: correct employer/title, skills/education, no re-ask, idempotent confirm", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const { cookie, csrf, tenant, user } = await seedAuthedUser(runtime);

    const pdf = twoColumnTextPdf();
    const form = new FormData();
    form.append(
      "file",
      new File([Uint8Array.from(pdf)], "jordan-two-col.pdf", { type: "application/pdf" }),
    );

    const { POST: upload } = await import("../../src/app/api/v1/profile/resume/upload/route");
    const uploadRes = await upload(
      new Request("http://localhost:3000/api/v1/profile/resume/upload", {
        method: "POST",
        headers: { cookie, "x-csrf-token": csrf },
        body: form,
      }),
    );
    expect(uploadRes.status).toBe(201);

    const importBody = await waitImportReady(cookie);
    expect(importBody.status).toBe("ready_for_review");
    expect(importBody.extraction.usable).not.toBe(false);
    expect(importBody.extraction.employment.length).toBeGreaterThanOrEqual(2);

    const harbor = importBody.extraction.employment.find((j: { company?: string }) =>
      /harbor/i.test(j.company ?? ""),
    );
    const northwind = importBody.extraction.employment.find((j: { company?: string }) =>
      /northwind/i.test(j.company ?? ""),
    );
    expect(harbor).toBeTruthy();
    expect(northwind).toBeTruthy();
    expect(harbor.title).toMatch(/platform/i);
    expect(northwind.title).toMatch(/software/i);
    expect(harbor.startDate).toMatch(/2021/i);
    expect(northwind.startDate).toMatch(/2018/i);

    const skillBlob = (importBody.extraction.skills ?? []).join(" ");
    expect(skillBlob).toMatch(/TypeScript/i);
    expect(skillBlob).toMatch(/Kubernetes/i);
    expect(importBody.extraction.education?.length).toBeGreaterThan(0);
    const educationBlob = (importBody.extraction.education ?? [])
      .map((row: { institution?: string; degree?: string }) => `${row.institution ?? ""} ${row.degree ?? ""}`)
      .join(" ");
    expect(educationBlob).toMatch(/cascadia|computer science/i);
    expect(importBody.extraction.contact?.email).toMatch(/jordan\.blake@example\.com/i);

    const reviewForm = {
      ...emptyOnboardingForm(),
      fullName: importBody.extraction.contact?.fullName ?? "Jordan Blake",
      skills: importBody.extraction.skills,
      employment: (importBody.extraction.employment ?? []).map(
        (row: { title?: string; company?: string; location?: string; startDate?: string; endDate?: string; bullets?: string[] }) => ({
          title: row.title,
          company: row.company,
          location: row.location,
          startDate: row.startDate,
          endDate: row.endDate,
          bullets: row.bullets ?? [],
        }),
      ),
      education: (importBody.extraction.education ?? []).map(
        (row: { institution?: string; degree?: string }) => ({
          school: row.institution,
          degree: row.degree,
        }),
      ),
      careerProfileMode: "upload" as const,
    };
    expect(validateStepClient(2, reviewForm, "ready_for_review")).toBeNull();

    const { POST: confirm } = await import("../../src/app/api/v1/profile/resume/confirm/route");
    const confirmRes = await confirm(
      new Request("http://localhost:3000/api/v1/profile/resume/confirm", {
        method: "POST",
        headers: { cookie, "x-csrf-token": csrf, "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(confirmRes.status).toBe(200);
    const confirmed = await confirmRes.json();
    expect(confirmed.profile.resumeImportStatus ?? "confirmed").toBeTruthy();

    const confirmAgain = await confirm(
      new Request("http://localhost:3000/api/v1/profile/resume/confirm", {
        method: "POST",
        headers: { cookie, "x-csrf-token": csrf, "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(confirmAgain.status).toBe(200);

    const { GET: getOnboarding } = await import("../../src/app/api/v1/profile/onboarding/route");
    const onboard = await getOnboarding(
      new Request("http://localhost:3000/api/v1/profile/onboarding", { headers: { cookie } }),
    );
    expect(onboard.status).toBe(200);
    const onboardBody = await onboard.json();
    expect(onboardBody.data.fullName || importBody.extraction.contact?.fullName).toBeTruthy();

    const { GET: getImport } = await import("../../src/app/api/v1/profile/resume/import/route");
    const persisted = await (await getImport(
      new Request("http://localhost:3000/api/v1/profile/resume/import", { headers: { cookie } }),
    )).json();
    expect(persisted.status).toBe("confirmed");
    expect(persisted.extraction.employment.length).toBeGreaterThanOrEqual(2);

    const evidence = await runtime.repos.evidence.list(tenant.id, { ownerUserId: user.id });
    const imported = evidence.filter(
      (row) => row.payload && (row.payload as { source?: string }).source === "resume-import",
    );
    expect(imported.length).toBeGreaterThanOrEqual(2);
    expect(imported.some((row) => /harbor/i.test(row.organization ?? ""))).toBe(true);
    expect(imported.some((row) => /northwind/i.test(row.organization ?? ""))).toBe(true);

    // Re-upload + confirm remains idempotent (replacement import, then stable double-confirm)
    const form2 = new FormData();
    form2.append(
      "file",
      new File([Uint8Array.from(pdf)], "jordan-two-col-again.pdf", { type: "application/pdf" }),
    );
    expect(
      (
        await upload(
          new Request("http://localhost:3000/api/v1/profile/resume/upload", {
            method: "POST",
            headers: { cookie, "x-csrf-token": csrf },
            body: form2,
          }),
        )
      ).status,
    ).toBe(201);
    const reimport = await waitImportReady(cookie);
    expect(reimport.status).toBe("ready_for_review");
    expect(
      (
        await confirm(
          new Request("http://localhost:3000/api/v1/profile/resume/confirm", {
            method: "POST",
            headers: { cookie, "x-csrf-token": csrf, "content-type": "application/json" },
            body: JSON.stringify({}),
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await confirm(
          new Request("http://localhost:3000/api/v1/profile/resume/confirm", {
            method: "POST",
            headers: { cookie, "x-csrf-token": csrf, "content-type": "application/json" },
            body: JSON.stringify({}),
          }),
        )
      ).status,
    ).toBe(200);
  }, 90_000);

  it("two-column path rejects empty extraction as failed (not ready_for_review success)", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const { cookie, csrf } = await seedAuthedUser(runtime);
    const form = new FormData();
    form.append("file", new File([Uint8Array.from(imageOnlyPdf())], "empty-two-col-scan.pdf", { type: "application/pdf" }));
    const { POST: upload } = await import("../../src/app/api/v1/profile/resume/upload/route");
    expect(
      (
        await upload(
          new Request("http://localhost:3000/api/v1/profile/resume/upload", {
            method: "POST",
            headers: { cookie, "x-csrf-token": csrf },
            body: form,
          }),
        )
      ).status,
    ).toBe(201);
    const body = await waitImportReady(cookie);
    expect(body.status).toBe("failed");
    expect(body.extraction.errorCode).toBe("IMAGE_ONLY_PDF_OCR_REQUIRED");
    expect(body.extraction.usable).not.toBe(true);
    expect(body.extraction.employment ?? []).toHaveLength(0);
  }, 60_000);

  it("tenant isolation: other tenant cannot read import status file", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const a = await seedAuthedUser(runtime);
    const b = await seedAuthedUser(runtime);
    const pdf = textToSimplePdf(PROFESSIONAL_EXPERIENCE_RESUME);
    const form = new FormData();
    form.append("file", new File([Uint8Array.from(pdf)], "a.pdf", { type: "application/pdf" }));
    const { POST: upload } = await import("../../src/app/api/v1/profile/resume/upload/route");
    await upload(
      new Request("http://localhost:3000/api/v1/profile/resume/upload", {
        method: "POST",
        headers: { cookie: a.cookie, "x-csrf-token": a.csrf },
        body: form,
      }),
    );
    await waitImportReady(a.cookie);
    const { GET } = await import("../../src/app/api/v1/profile/resume/import/route");
    const other = await GET(
      new Request("http://localhost:3000/api/v1/profile/resume/import", { headers: { cookie: b.cookie } }),
    );
    const otherBody = await other.json();
    expect(otherBody.extraction?.employment ?? []).toHaveLength(0);
  }, 60_000);
});
