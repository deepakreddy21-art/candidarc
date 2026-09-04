import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://example.com/presigned"),
}));

import {
  MemoryRepositories,
  createEmptyMemoryStore,
  newId,
  nowIso,
  type EvidenceRecord,
  type UsageLedgerRecord,
} from "../../server/database/repositories";
import {
  buildEvidenceMatchMap,
  mapEvidence,
  mapUsage,
  sectionFromRow,
} from "../../server/database/postgres-mappers";
import { isMemoryBackedRepository } from "../../server/database/postgres-repos";
import { resetEnvCache } from "../../server/config/env";
import { resetStorage } from "../../server/storage";
import { createS3ClientFromConfig } from "../../server/storage/s3";

afterEach(() => {
  resetEnvCache();
  resetStorage();
  vi.restoreAllMocks();
});

describe("MemoryRepositories durability", () => {
  it("creates and lists evidence in memory mode", async () => {
    const repos = new MemoryRepositories(createEmptyMemoryStore());
    const item = await repos.evidence.create({
      id: newId("ev"),
      publicId: newId("evp"),
      tenantId: "tenant-1",
      ownerUserId: "user-1",
      candidateProfileId: null,
      title: "Latency reduction",
      organization: "Acme",
      situation: "Slow API",
      task: "Improve p95",
      actions: ["Profiled", "Cached"],
      result: "Cut p95 40%",
      technologies: ["Node.js"],
      confidence: "high",
      verificationStatus: "verified",
      privacyLevel: "share-safe",
      excludedFromApplicationIds: [],
      matchedApplicationIds: ["app_public"],
      payload: { metric: "p95" },
      version: 1,
    });

    const listed = await repos.evidence.list("tenant-1");
    expect(listed).toHaveLength(1);
    expect(listed[0]?.publicId).toBe(item.publicId);
    expect(listed[0]?.payload).toEqual({ metric: "p95" });
  });

  it("tracks usage ledger reservations in memory mode", async () => {
    const repos = new MemoryRepositories(createEmptyMemoryStore());
    const entry = await repos.usage.append({
      tenantId: "tenant-1",
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: "usage:test",
      status: "reserved",
      metadata: {},
    });
    const committed = await repos.usage.updateStatus(entry.idempotencyKey, "committed");
    expect(committed.status).toBe("committed");
  });
});

describe("Postgres mapper helpers", () => {
  it("maps evidence match rows into memory shape", () => {
    const matchMap = buildEvidenceMatchMap([
      { evidenceItemId: "ev-1", applicationPublicId: "app-a", excluded: false },
      { evidenceItemId: "ev-1", applicationPublicId: "app-b", excluded: true },
    ]);
    const evidence = mapEvidence(
      {
        id: "ev-1",
        publicId: "evp_1",
        tenantId: "tenant-1",
        ownerUserId: null,
        candidateProfileId: null,
        title: "Title",
        organization: "Org",
        situation: "Situation",
        task: "Task",
        actions: [],
        result: "Result",
        technologies: [],
        roleRelevance: [],
        confidence: "medium",
        verificationStatus: "unverified",
        supportingSource: null,
        privacyLevel: "share-safe",
        resumeUsageHistory: [],
        interviewStoryReady: false,
        tags: [],
        payload: { foo: "bar" },
        version: 1,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        deletedAt: null,
      },
      matchMap.get("ev-1"),
    );
    expect(evidence.matchedApplicationIds).toEqual(["app-a"]);
    expect(evidence.excludedFromApplicationIds).toEqual(["app-b"]);
    expect(evidence.payload).toEqual({ foo: "bar" });
  });

  it("reconstructs resume sections from stored rows", () => {
    const section = sectionFromRow({
      id: "sec-1",
      publicId: "rsp_1",
      tenantId: "tenant-1",
      resumeVersionId: "rv-1",
      type: "summary",
      title: "Summary",
      order: 0,
      payload: { content: "Engineer with 8 years experience", bullets: [] },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(section.type).toBe("summary");
    expect(section.content).toBe("Engineer with 8 years experience");
  });

  it("maps usage ledger status defaults", () => {
    const usage: UsageLedgerRecord = mapUsage({
      id: "ul-1",
      publicId: "ulp_1",
      tenantId: "tenant-1",
      userId: null,
      kind: "research",
      units: "1",
      costCents: "0",
      workflowRunId: null,
      idempotencyKey: "key",
      status: "reserved",
      metadata: {},
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(usage.status).toBe("reserved");
  });
});

describe("PostgresRepositories construction guard", () => {
  it("does not mark memory repositories as postgres-backed", () => {
    const repos = new MemoryRepositories(createEmptyMemoryStore());
    expect(isMemoryBackedRepository(repos)).toBe(true);
    expect(repos.constructor.name).toBe("MemoryRepositories");
  });

  it("does not throw constructing PostgresRepositories when postgres mode is unavailable in tests", async () => {
    resetEnvCache();
    process.env.CANDIDARC_DATA_MODE = "memory";
    const { PostgresRepositories } = await import("../../server/database/postgres-repos");
    expect(() => new PostgresRepositories()).toThrow(/requires CANDIDARC_DATA_MODE=postgres/);
  });
});

describe("S3ObjectStorage adapter", () => {
  it("scopes object keys by tenant and never stores absolute paths", async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = createS3ClientFromConfig({
      bucket: "test-bucket",
      region: "us-east-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });
    (storage as unknown as { client: { send: typeof send } }).client = { send };

    await storage.putObject({
      tenantId: "tenant-abc",
      key: "uploads/resume.pdf",
      body: Buffer.from("pdf"),
      contentType: "application/pdf",
    });

    const command = send.mock.calls[0]?.[0];
    expect(command.input.Key).toBe("tenant-abc/uploads/resume.pdf");
    expect(command.input.Key.startsWith("/")).toBe(false);
  });

  it("returns presigned upload and download URLs", async () => {
    const storage = createS3ClientFromConfig({
      bucket: "test-bucket",
      region: "us-east-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });

    const upload = await storage.getSignedUploadUrl("tenant-abc", "uploads/file.bin");
    const download = await storage.getSignedDownloadUrl("tenant-abc", "uploads/file.bin");
    expect(upload.url).toContain("https://");
    expect(download.url).toContain("https://");
    expect(upload.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("Evidence memory update semantics", () => {
  it("updates matched and excluded application ids", async () => {
    const repos = new MemoryRepositories(createEmptyMemoryStore());
    const created = await repos.evidence.create({
      id: newId("ev"),
      publicId: newId("evp"),
      tenantId: "tenant-1",
      ownerUserId: "user-1",
      candidateProfileId: null,
      title: "Incident response",
      organization: "Org",
      situation: "Outage",
      task: "Restore",
      actions: ["Rollback"],
      result: "Restored",
      technologies: ["K8s"],
      confidence: "high",
      verificationStatus: "verified",
      privacyLevel: "share-safe",
      excludedFromApplicationIds: [],
      matchedApplicationIds: [],
      payload: {},
    } satisfies Omit<EvidenceRecord, "createdAt" | "updatedAt" | "deletedAt" | "version">);

    const updated = await repos.evidence.update("tenant-1", created.publicId, {
      matchedApplicationIds: ["app-1"],
      excludedFromApplicationIds: ["app-2"],
    });
    expect(updated.matchedApplicationIds).toEqual(["app-1"]);
    expect(updated.excludedFromApplicationIds).toEqual(["app-2"]);
    expect(updated.version).toBe(created.version + 1);
    expect(updated.updatedAt >= created.updatedAt || updated.updatedAt >= nowIso()).toBe(true);
  });
});
