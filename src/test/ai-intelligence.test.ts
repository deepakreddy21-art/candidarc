import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getProviderForRole, resetGenerationProvider } from "../../server/ai";
import { assertNoInventedTech, validateEvidenceIds } from "../../server/ai/evidence-guard";
import { MockGenerationProvider } from "../../server/ai/mock-provider";
import { researchSchema } from "../../server/ai/schemas";
import { resetEnvCache } from "../../server/config/env";
import { createEmptyMemoryStore, MemoryRepositories } from "../../server/database/repositories";
import { filterFindingsForNextGeneration } from "../../server/workflows/resume-pipeline";
import { assertAuditOrder } from "../../server/workflows/stages";

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
  resetGenerationProvider();
});

describe("AI intelligence safety", () => {
  it("never constructs mock providers for live production roles", () => {
    const env = {
      NODE_ENV: "production",
      APP_MODE: "production",
      AI_MODE: "live",
      AI_GENERATION_PROVIDER: "openai",
      AI_HR_AUDIT_PROVIDER: "anthropic",
      AI_EM_AUDIT_PROVIDER: "anthropic",
      AI_FINAL_REVIEW_PROVIDER: "openai",
      OPENAI_API_KEY: "test-openai",
      ANTHROPIC_API_KEY: "test-anthropic",
      CANDIDARC_DATA_MODE: "postgres",
      DATABASE_URL: "postgres://example",
      STORAGE_DRIVER: "s3",
      QUEUE_BACKEND: "redis",
      SESSION_SECRET: "a-unique-production-secret-that-is-long-enough",
    };
    Object.entries(env).forEach(([key, value]) => vi.stubEnv(key, value));
    vi.stubGlobal("window", undefined);
    resetEnvCache();

    expect(getProviderForRole("generation").name).toBe("openai");
    expect(getProviderForRole("hr-audit").name).toBe("anthropic");
    expect(getProviderForRole("em-audit")).not.toBeInstanceOf(MockGenerationProvider);
    expect(getProviderForRole("final-review")).not.toBeInstanceOf(MockGenerationProvider);
  });

  it("does not expose provider keys through NEXT_PUBLIC client variables", () => {
    const roots = ["src", "extension"].filter((path) => existsSync(join(process.cwd(), path)));
    const forbidden = [`NEXT_PUBLIC_${"OPENAI"}_API_KEY`, `NEXT_PUBLIC_${"ANTHROPIC"}_API_KEY`];
    const files: string[] = [];
    const visit = (path: string) => {
      for (const entry of readdirSync(path)) {
        const full = join(path, entry);
        if (statSync(full).isDirectory()) visit(full);
        else files.push(full);
      }
    };
    roots.forEach((root) => visit(join(process.cwd(), root)));
    const clientText = files.map((file) => readFileSync(file, "utf8")).join("\n");
    forbidden.forEach((name) => expect(clientText).not.toContain(name));
  });

  it("keeps unique company research free of Cisco fixtures", async () => {
    const provider = new MockGenerationProvider();
    const result = await provider.generateStructured({
      prompt: { id: "research-synthesis", version: "test" },
      system: "Return grounded research.",
      user: JSON.stringify({
        company: "Acme Robotics",
        role: "Platform Engineer",
        jobDescription: "Build warehouse robotics infrastructure with Go.",
        collectedSources: [{
          id: "src-acme",
          url: "https://careers.acme.example/platform",
          title: "Acme role",
          accessedAt: "2026-09-04T00:00:00.000Z",
          excerpt: "Platform Engineer at Acme Robotics",
          confidence: "high",
        }],
      }),
      schema: researchSchema,
    });
    expect(JSON.stringify(result.data).toLowerCase()).not.toContain("cisco");
  });

  it("rejects unknown evidence IDs and unsupported technologies", () => {
    expect(() => validateEvidenceIds({ bullets: [{ evidenceIds: ["ev-missing"] }] }, ["ev-known"]))
      .toThrow(/Unknown evidence IDs/);
    expect(() => assertNoInventedTech(["Kubernetes", "Rust"], ["Kubernetes", "Go"]))
      .toThrow(/Rust/);
  });

  it("passes only accepted and edited findings to regeneration", () => {
    const findings = [
      { id: "accepted", status: "accepted" },
      { id: "edited", status: "edited" },
      { id: "rejected", status: "rejected" },
      { id: "open", status: "open" },
    ];
    expect(filterFindingsForNextGeneration(findings).map((item) => item.id)).toEqual(["accepted", "edited"]);
  });

  it("retains strict audit order", () => {
    expect(() => assertAuditOrder({ stage: "V4_GENERATING", reviewsVersion: 3, producesVersion: 4 })).not.toThrow();
    expect(() => assertAuditOrder({ stage: "V4_GENERATING", reviewsVersion: 2, producesVersion: 4 })).toThrow();
  });

  it("stores immutable resume version sections", async () => {
    const repos = new MemoryRepositories(createEmptyMemoryStore());
    const sourceSections = [{ title: "Experience", bullets: [{ text: "Original" }] }];
    await repos.resumes.appendVersion({
      id: "rv-1",
      publicId: "rvp-1",
      tenantId: "tenant-1",
      resumeId: "resume-1",
      versionNumber: 0,
      versionLabel: "V0",
      score: 70,
      scoreBreakdown: {},
      notes: "",
      triggeredBy: "test",
      sections: sourceSections,
      idempotencyKey: "version-1",
    });
    sourceSections[0]!.bullets[0]!.text = "Mutated";
    const stored = await repos.resumes.findVersionByIdempotency("tenant-1", "version-1");
    expect((stored!.sections[0] as typeof sourceSections[0]).bullets[0]!.text).toBe("Original");
  });
});
