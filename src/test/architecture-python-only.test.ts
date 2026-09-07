/** @vitest-environment node */
/**
 * Architecture boundary test: Python is the ONLY resume intelligence runtime.
 * This test reads the resume-pipeline.ts source and fails if TypeScript provider
 * paths remain for resume intelligence stages.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const PIPELINE_PATH = resolve(__dirname, "../../server/workflows/resume-pipeline.ts");

describe("architecture: Python-only resume intelligence", () => {
  const pipelineSource = readFileSync(PIPELINE_PATH, "utf-8");

  it("does not import getProviderForRole from ../ai", () => {
    // This import was used for TypeScript resume generation/audit fallback
    const importPattern = /import\s*\{[^}]*getProviderForRole[^}]*\}\s*from\s*["']\.\.\/ai["']/;
    expect(pipelineSource).not.toMatch(importPattern);
  });

  it("does not call getProviderForRole anywhere in the pipeline", () => {
    // If getProviderForRole is called, TypeScript AI is being used for resume stages
    expect(pipelineSource).not.toContain("getProviderForRole(");
  });

  it("does not reference shadow mode in pipeline logic", () => {
    // Shadow mode was removed — no backend === "shadow" checks should exist
    expect(pipelineSource).not.toMatch(/backend\s*===?\s*["']shadow["']/);
    expect(pipelineSource).not.toContain("shouldSampleShadow");
    expect(pipelineSource).not.toContain("shadowSeed");
    expect(pipelineSource).not.toContain("shadow comparison");
  });

  it("does not have resolveBackend method calls (always python)", () => {
    // resolveBackend was removed — all stages use Python directly
    expect(pipelineSource).not.toMatch(/await\s+this\.resolveBackend\(/);
    expect(pipelineSource).not.toContain("const backend = await this.resolveBackend");
  });

  it("does not import from ../ai for providers (schemas allowed)", () => {
    // Only specific imports from ../ai are allowed (schemas, mistake-memory, research-collector)
    const aiImportLines = pipelineSource
      .split("\n")
      .filter((line) => /from\s+["']\.\.\/ai["']/.test(line));
    
    // If any imports from "../ai" exist, they must not include provider functions
    for (const line of aiImportLines) {
      expect(line).not.toContain("getProviderForRole");
      expect(line).not.toContain("Provider");
    }
  });

  it("uses ensureExecutionBackendPersisted for backend tracking", () => {
    // The pipeline should persist executionBackend on run start
    expect(pipelineSource).toContain("ensureExecutionBackendPersisted");
    expect(pipelineSource).toContain('executionBackend: "python"');
  });

  it("all intelligence stages record python as backend", () => {
    // recordStageBackend should only ever be called with "python"
    // Match actual calls (await this.recordStageBackend...) not the method definition
    const stageBackendCalls = pipelineSource.match(/await\s+this\.recordStageBackend\([^)]+\)/g) ?? [];
    expect(stageBackendCalls.length).toBeGreaterThan(0);
    for (const call of stageBackendCalls) {
      // All calls should have "python" as the third argument
      expect(call).toContain('"python"');
      expect(call).not.toContain('"typescript"');
    }
  });

  it("Final QA repair logic exists with bounded retry", () => {
    // Final QA should have bounded repair logic
    expect(pipelineSource).toContain("finalQaRepairAttempted");
    expect(pipelineSource).toContain("Bounded repair");
  });
});
