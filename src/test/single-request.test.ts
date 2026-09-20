/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensureDemoUser } from "../../server/auth/demo-auth";
import { createEmptyMemoryStore, newId } from "../../server/database/repositories";
import { ResumeWorkStore, contentHash } from "../../server/database/resume-work-store";
import { CustomerGenerateService } from "../../server/modules/resumes/customer-generate";
import { DbWorkflowEngine } from "../../server/workflows/engine";
import { InProcessQueueAdapter } from "../../server/workflows/queues";
import { ResumePipeline } from "../../server/workflows/resume-pipeline";
import { preserveLegacyCustomerRun } from "../../server/workflows/single-request-pipeline";
import { LocalFilesystemStorage } from "../../server/storage/local";
import { exportFormat, exportIdentity } from "../../server/resumes/export-cache";
import * as python from "../../server/intelligence/python-client";
import type { AuthContext } from "../../server/auth/guards";
import { RadarService } from "../../server/radar/service";
import { getSharedCatalog, seedDemoCatalog } from "../../server/radar/catalog";

const tempDirs: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function setup() {
  const { repos, userId, tenantId } = await ensureDemoUser(createEmptyMemoryStore());
  const dir = await mkdtemp(path.join(tmpdir(), "candidarc-one-")); tempDirs.push(dir);
  const storage = new LocalFilesystemStorage(dir, "test-only-local-storage-secret");
  const queue = new InProcessQueueAdapter();
  const engine = new DbWorkflowEngine(repos.workflows, queue);
  const service = new CustomerGenerateService(repos, engine, storage);
  const ctx: AuthContext = { requestId: "one-test", user: { id: userId, publicId: "u", email: "fiction@example.com", name: "Fiction" },
    memberships: [{ tenantId, tenantPublicId: "t", role: "owner" }], activeTenantId: tenantId,
    repos: { evidence: repos.evidence, applications: repos.applications } };
  return { repos, userId, tenantId, storage, queue, engine, service, ctx };
}
const jd = { company: "Example Inc", role: "Software Engineer", jobDescription: "Company: Example Inc\nRole: Software Engineer\nDevelop Python APIs and maintain services." };

describe("single-request customer operations", () => {
  it("dedupes retry nonces, keeps snapshots private, and contact changes create a distinct revision", async () => {
    const { service, ctx, repos, tenantId, userId } = await setup();
    const first = await service.generate(ctx, { ...jd, idempotencyKey: "nonce-111111" });
    const retry = await service.generate(ctx, { ...jd, idempotencyKey: "nonce-222222" });
    expect(retry).toEqual(first);
    const app = (await repos.applications.getByPublicId(tenantId, first.applicationId))!;
    const work = new ResumeWorkStore(repos, tenantId, userId);
    const op = (await work.get("operation", String(app.metadata?.generationOperationId)))!;
    expect((await work.get("profile", String(op.data.profileKey)))?.data.evidence).toBeTruthy();
    expect(await new ResumeWorkStore(repos, tenantId, "another-user").get("operation", String(app.metadata?.generationOperationId))).toBeNull();
    await repos.candidateProfiles.update(tenantId, userId, { phone: "+1 312 555 0199" });
    const changed = await service.generate(ctx, jd);
    expect(changed.workflowId).not.toBe(first.workflowId);
    expect((await work.get("operation", String(app.metadata?.generationOperationId)))?.data.profileKey).toBe(op.data.profileKey);
  });

  it.each(["jd", "radar"])("%s creates one version without audits, paid research, or final review", async entry => {
    const { repos, engine, queue, service, ctx, tenantId } = await setup();
    const client = python.getPythonIntelligenceClient();
    const parse = vi.spyOn(client, "parseJob").mockResolvedValue({ company: jd.company, role: jd.role, title: jd.role, required_qualifications: ["Python"], responsibilities: [] } as never);
    const forbidden = ["synthesizeResearch", "matchEvidence", "regenerateResume", "auditResume", "finalQa"] as const;
    const spies = forbidden.map(name => vi.spyOn(client, name).mockRejectedValue(new Error(`forbidden:${name}`)));
    const generate = vi.spyOn(client, "generateResumeOnce").mockImplementation(async input => ({
      resume: { versionNumber: 0, score: 0, scoreBreakdown: Object.fromEntries(["atsCompatibility", "jobAlignment", "recruiterReadability", "impact", "quantification", "technicalDepth", "competencyCoverage", "evidenceConfidence", "writingQuality", "formatIntegrity"].map(k => [k, 0])), notes: "Initial",
        sections: [{ type: "experience", title: "Experience", items: [{ heading: String(input.evidence[0]!.organization), bullets: [{ text: "Maintained existing services", evidenceIds: [String(input.evidence[0]!.id)], matchedRequirements: [], technologies: [], confidence: "high", claimRisk: "low", sourceVersion: "source" }] }] }] },
      usage: { inputTokens: 100, outputTokens: 200, estimatedCostCents: 0.03 }, provider: "test", model: "test", promptVersion: "test", latencyMs: 1,
      localValidation: { passed: true, violations: [], latency_ms: 1 },
    }) as never);
    seedDemoCatalog();
    const result = entry === "radar" ? await new RadarService(getSharedCatalog(), undefined, repos, service).tailorResume(ctx, [...getSharedCatalog().canonicalJobs.values()][0]!.publicId) : await service.generate(ctx, jd);
    const pipeline = ResumePipeline.fromRepos(repos, engine, queue);
    for (let i = 0; i < 3; i++) await pipeline.handleStage((await repos.workflows.getByPublicId(tenantId, result.workflowId))!);
    const run = (await repos.workflows.getByPublicId(tenantId, result.workflowId))!;
    expect(run.stage).toBe("FINAL_READY");
    const resume = (await repos.resumes.getByApplication(tenantId, result.applicationId))!;
    expect(await repos.resumes.listVersions(tenantId, resume.publicId)).toHaveLength(1);
    expect(parse).toHaveBeenCalledTimes(1); expect(generate).toHaveBeenCalledTimes(1);
    spies.forEach(spy => expect(spy).not.toHaveBeenCalled());
    const opId = run.payload.generationOperationId;
    const usageKey = `${tenantId}:single:${opId}:resume_generation`;
    expect((await repos.usage.findByIdempotency(tenantId, `${usageKey}:input_tokens`))?.units).toBe("100");
    expect((await repos.usage.findByIdempotency(tenantId, `${usageKey}:output_tokens`))?.units).toBe("200");
    expect((await repos.usage.findByIdempotency(tenantId, `${usageKey}:cost`))?.costCents).toBe("0.03");
    expect((await repos.usage.findByIdempotency(tenantId, usageKey))?.costCents).toBe("0");
    await repos.applications.update(tenantId, result.applicationId, { workflowStage: "FINAL_READY" });
    await expect(service.refine(ctx, result.workflowId, { instruction: "Make it more impressive" })).rejects.toMatchObject({ code: "LOCAL_REWRITE_UNAVAILABLE" });
    expect(await repos.resumes.listVersions(tenantId, resume.publicId)).toHaveLength(1);
  });

  it("fences leases and preserves legacy queued work without paid dispatch", async () => {
    const { repos, service, ctx, engine, queue, tenantId, userId } = await setup();
    const work = new ResumeWorkStore(repos, tenantId, userId);
    await work.put("export", "key", { checksum: "x" });
    const tokens = await Promise.all(Array.from({ length: 20 }, () => work.claim("export", "key")));
    expect(tokens.filter(Boolean)).toHaveLength(1);
    expect(await work.patch("export", "key", { bad: true }, "not-owner")).toBe(false);
    const result = await service.generate(ctx, jd);
    const run = (await repos.workflows.getByPublicId(tenantId, result.workflowId))!;
    await preserveLegacyCustomerRun({ ...repos, engine, queue }, run);
    expect((await repos.workflows.getById(run.id))?.status).toBe("waiting_review");
    expect((await repos.applications.getByPublicId(tenantId, result.applicationId))?.metadata?.legacyMigrationRequired).toBe(true);
  });

  it("reuses format bytes and metadata; content/contact/owner changes invalidate exports", async () => {
    const { repos, storage, tenantId, userId } = await setup();
    const render = vi.fn(async () => ({ pdfBuffer: Buffer.from("test-pdf"), docxBuffer: Buffer.from("test-docx"), pageCount: 1 }) as never);
    const input = { tenantId, candidateName: "Fiction", company: "Example", role: "Engineer", resumeVersion: { publicId: newId("version"), sections: [] } };
    const first = await exportFormat(input, userId, "pdf", { repos, storage, render });
    const second = await exportFormat(input, userId, "pdf", { repos, storage, render });
    expect(second.fileId).toBe(first.fileId); expect(second.reused).toBe(true); expect(render).toHaveBeenCalledTimes(1);
    await exportFormat(input, userId, "docx", { repos, storage, render });
    expect(render).toHaveBeenCalledTimes(2);
    expect(exportIdentity({ ...input, candidateName: "Changed" }, userId, "pdf")).not.toBe(exportIdentity(input, userId, "pdf"));
    expect(exportIdentity(input, "other", "pdf")).not.toBe(exportIdentity(input, userId, "pdf"));
    expect(contentHash({ b: 2, a: 1 })).toBe(contentHash({ a: 1, b: 2 }));
  });

  it("concurrent exports render once and recover an uploaded object after metadata failure", async () => {
    const { repos, storage, tenantId, userId } = await setup();
    let finishRender!: () => void;
    let started!: () => void;
    const rendering = new Promise<void>(resolve => { started = resolve; });
    const release = new Promise<void>(resolve => { finishRender = resolve; });
    const render = vi.fn(async () => { started(); await release;
      return { pdfBuffer: Buffer.from("test-pdf"), docxBuffer: Buffer.from("test-docx"), pageCount: 1 }; });
    const input = { tenantId, candidateName: "Fiction", company: "Example", role: "Engineer", resumeVersion: { publicId: newId("version"), sections: [] } };
    const create = vi.spyOn(repos.files, "create").mockRejectedValueOnce(new Error("metadata unavailable"));
    const put = vi.spyOn(storage, "putObject");
    const first = exportFormat(input, userId, "pdf", { repos, storage, render });
    // Attach rejection handling before releasing the first renderer.
    const firstFailure = expect(first).rejects.toThrow("metadata unavailable");
    await rendering;
    await expect(exportFormat(input, userId, "pdf", { repos, storage, render })).rejects.toMatchObject({ code: "EXPORT_IN_PROGRESS" });
    finishRender(); await firstFailure;
    const recovered = await exportFormat(input, userId, "pdf", { repos, storage, render });
    expect(recovered.reused).toBe(true);
    expect(render).toHaveBeenCalledTimes(1); expect(put).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(2);
    const identity = exportIdentity(input, userId, "pdf");
    expect((await repos.usage.findByIdempotency(tenantId, `export:${identity}`))?.status).toBe("committed");
  });
});

it("deduplicates private upload bytes while each deliberate re-import can parse again", async () => {
  const { repos, storage, queue, ctx, tenantId } = await setup();
  const { ResumeImportService } = await import("../../server/modules/resumes/import-service");
  const imports = ResumeImportService.fromRepos(repos, storage, queue, async () => true);
  const put = vi.spyOn(storage, "putObject");
  const enqueue = vi.spyOn(queue, "enqueue");
  const buffer = Buffer.from("%PDF-1.4\nfictional upload bytes\n%%EOF");
  const input = { filename: "resume.pdf", mimeType: "application/pdf", buffer, size: buffer.length };
  const first = await imports.upload(ctx, input);
  const second = await imports.upload(ctx, input);
  expect(first.file.id).toBe(second.file.id);
  expect(put).toHaveBeenCalledTimes(1);
  expect(enqueue.mock.calls[0]![3]?.idempotencyKey).not.toBe(enqueue.mock.calls[1]![3]?.idempotencyKey);
  const file = (await repos.files.getByPublicId(tenantId, first.file.id))!;
  const { FilesService } = await import("../../server/modules/files/service");
  const files = FilesService.fromRepos(repos, storage, queue);
  const peer = { ...ctx, user: { ...ctx.user!, id: "peer" } };
  await expect(files.signedDownload(peer, file.publicId)).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
  await expect(files.softDelete(peer, file.publicId)).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
});

it("retention dry-run protects originals, finals, recovery state and unknown categories", async () => {
  const { retentionDecision } = await import("../../server/storage/retention-policy");
  const base = { purpose: "temporary-render", createdAt: "2020-01-01", size: 100, referenced: false, original: false, final: false, recovery: false, protected: false };
  expect(retentionDecision(base).action).toBe("review");
  for (const flag of ["referenced", "original", "final", "recovery", "protected"]) {
    expect(retentionDecision({ ...base, [flag]: true }).action).toBe("retain");
  }
  expect(retentionDecision({ ...base, purpose: "unknown" }).action).toBe("retain");
});
