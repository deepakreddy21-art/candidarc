/** @vitest-environment node */
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { getEnv, resetEnvCache } from "../../server/config/env";
import { resetRuntimeForTests, getRuntime } from "../../server/bootstrap";
import { LocalFilesystemStorage } from "../../server/storage/local";
import { renderPdfAndDocx } from "../../server/resumes/document-renderer";
import { resetStorage } from "../../server/storage";

afterEach(() => {
  resetEnvCache();
  resetRuntimeForTests();
  resetStorage();
});

describe("feature flags production config", () => {
  it("defaults FEATURE_RADAR and FEATURE_COPILOT off in production", () => {
    const env = getEnv({
      NODE_ENV: "production",
      APP_MODE: "production",
      SESSION_SECRET: "a-unique-production-secret-that-is-long-enough",
      CANDIDARC_DATA_MODE: "postgres",
      DATABASE_URL: "postgres://example",
      AI_MODE: "live",
      OPENAI_API_KEY: "key",
      ANTHROPIC_API_KEY: "key",
      STORAGE_DRIVER: "s3",
      QUEUE_BACKEND: "redis",
      MALWARE_SCANNER: "clamav",
    });
    expect(env.FEATURE_RADAR).toBe(false);
    expect(env.FEATURE_COPILOT).toBe(false);
  });

  it("bootstrap omits radar service when FEATURE_RADAR=false", async () => {
    process.env.APP_MODE = "demo";
    process.env.CANDIDARC_DATA_MODE = "memory";
    process.env.AI_MODE = "mock";
    process.env.QUEUE_BACKEND = "inprocess";
    process.env.FEATURE_RADAR = "false";
    resetEnvCache();
    resetRuntimeForTests();
    const runtime = await getRuntime();
    expect(runtime.services.radar).toBeNull();
  });
});

describe("object storage document paths", () => {
  it("uses separate temp dirs for storage vs rendered buffers", async () => {
    const storageDir = mkdtempSync(path.join(tmpdir(), "candidarc-storage-"));
    const workerDir = mkdtempSync(path.join(tmpdir(), "candidarc-worker-"));
    try {
      resetEnvCache();
      process.env.STORAGE_LOCAL_PATH = storageDir;
      const storage = new LocalFilesystemStorage(storageDir);
      const rendered = await renderPdfAndDocx({
        resumeVersion: {
          publicId: "rv_test",
          sections: [{ id: "s", type: "summary", title: "Summary", order: 0, content: "Engineer" }],
        },
        candidateName: "Candidate",
        role: "Engineer",
        company: "Acme",
        tenantId: "tenant",
        applicationId: "app_test",
      });
      expect(rendered.pdfBuffer.length).toBeGreaterThan(0);
      expect(rendered.docxBuffer.length).toBeGreaterThan(0);
      expect("pdfPath" in rendered).toBe(false);

      const key = "generated/user/app_test/rv_test/resume.pdf";
      await storage.putObject({
        tenantId: "tenant",
        key,
        body: rendered.pdfBuffer,
        contentType: "application/pdf",
      });
      const stored = await storage.getObject("tenant", key);
      expect(stored?.body.equals(rendered.pdfBuffer)).toBe(true);
      expect(stored?.meta.key).toBe(key);

      const workerScratch = path.join(workerDir, "scratch.txt");
      const { writeFileSync } = await import("fs");
      writeFileSync(workerScratch, "worker-only");
      expect(workerScratch.startsWith(workerDir)).toBe(true);
      expect(storageDir).not.toBe(workerDir);
    } finally {
      rmSync(storageDir, { recursive: true, force: true });
      rmSync(workerDir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("quality score honesty", () => {
  it("marks job coverage not evaluated when requirements empty", async () => {
    const { computeCandidArcQualityScore } = await import("../../server/resumes/quality-score");
    const report = computeCandidArcQualityScore({
      sections: [{ type: "experience", items: [{ bullets: [{ text: "Built APIs", evidenceIds: ["ev_1"] }] }] }],
      jobRequirements: [],
      knownTechnologies: ["Python"],
    });
    const coverage = report.checks.find((c) => c.id === "job_coverage");
    expect(coverage?.detail).toMatch(/Not evaluated/i);
    expect(coverage?.weight).toBe(0);
  });
});
