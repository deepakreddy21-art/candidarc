/** @vitest-environment node */
import { readFile } from "fs/promises";
import { describe, expect, it } from "vitest";
import { ensureDemoUser, DEMO_USER } from "../../server/auth/demo-auth";
import type { AuthContext } from "../../server/auth/guards";
import { createEmptyMemoryStore, newId, type Repositories } from "../../server/database/repositories";
import { CustomerGenerateService } from "../../server/modules/resumes/customer-generate";
import { createMinimalDocx, createMinimalPdf } from "../../server/resumes/document-renderer";
import { mapInternalStageToCustomer } from "../../server/resumes/customer-status";
import {
  applyTechAnswers,
  claimableTechnologies,
  excludedTechnologies,
  extractTechQuestions,
  type TechQuestion,
} from "../../server/resumes/tech-questions";
import { getStorage } from "../../server/storage";
import { DbWorkflowEngine } from "../../server/workflows/engine";
import { InProcessQueueAdapter } from "../../server/workflows/queues";

function makeService(repos: Repositories) {
  return new CustomerGenerateService(repos, new DbWorkflowEngine(repos.workflows, new InProcessQueueAdapter()), getStorage());
}

function context(userId: string, tenantId: string, repos: Repositories): AuthContext {
  return {
    requestId: "customer_test",
    user: { id: userId, publicId: "customer", email: DEMO_USER.email, name: DEMO_USER.name },
    memberships: [{ tenantId, tenantPublicId: "tenant", role: "owner" }],
    activeTenantId: tenantId,
    repos: { applications: repos.applications, evidence: repos.evidence },
  };
}

async function seedOwnedEvidence(repos: Repositories, tenantId: string, userId: string) {
  await repos.evidence.create({
    id: newId("ev"),
    publicId: newId("evp"),
    tenantId,
    ownerUserId: userId,
    candidateProfileId: null,
    title: "Platform delivery",
    organization: "Acme",
    situation: "Scaled API platform",
    task: "Improve reliability",
    actions: ["Added caching"],
    result: "Reduced incidents",
    technologies: ["TypeScript"],
    confidence: "high",
    verificationStatus: "user_attested",
    privacyLevel: "share-safe",
    excludedFromApplicationIds: [],
    matchedApplicationIds: [],
    payload: {},
  });
}

describe("customer resume generation", () => {
  it("is idempotent so double-submit does not create duplicate workflows", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    await seedOwnedEvidence(repos, tenantId, userId);
    const service = makeService(repos);
    const ctx = context(userId, tenantId, repos);
    const input = { jobDescription: "Build production systems using TypeScript and React.", idempotencyKey: "same-request-key" };
    const first = await service.generate(ctx, input);
    const second = await service.generate(ctx, input);
    expect(second).toEqual(first);
    const apps = await repos.applications.list(tenantId);
    expect(apps.filter((app) => app.metadata?.sourceHash)).toHaveLength(1);
  });

  it("restores an existing workflow after reload without depending on the browser", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    await seedOwnedEvidence(repos, tenantId, userId);
    const service = makeService(repos);
    const ctx = context(userId, tenantId, repos);
    const created = await service.generate(ctx, {
      jobDescription: "Senior engineer role requiring distributed systems experience and careful delivery.",
      idempotencyKey: "restore-key",
    });
    const restored = await service.getCustomerWorkflow(ctx, created.workflowId);
    expect(restored.workflowId).toBe(created.workflowId);
    expect(restored).not.toEqual(expect.objectContaining({ stage: expect.anything() }));
    expect(JSON.stringify(restored)).not.toMatch(/V0|HR_AUDIT|EM_AUDIT|RESEARCH_QUEUED|token|prompt/i);
  });

  it("never exposes internal stage names in customer status copy", () => {
    for (const stage of ["V0_GENERATING", "HR_AUDIT_1_REVIEW", "EM_AUDIT_2_RUNNING", "RESEARCH_QUEUED", "REVISING"]) {
      const mapped = mapInternalStageToCustomer(stage);
      expect(JSON.stringify(mapped)).not.toMatch(/V0|HR_AUDIT|EM_AUDIT|RESEARCH_QUEUED|REVISING/);
      expect(["Understanding role", "Tailoring experience", "Preparing documents"]).toContain(mapped.pipelineLabel);
    }
  });

  it("requires both rendered documents before reporting completion", () => {
    expect(mapInternalStageToCustomer("FINAL_READY", { documentsReady: false }).status).toBe("creating");
    expect(mapInternalStageToCustomer("FINAL_READY", { documentsReady: true }).status).toBe("completed");
  });

  it("maps failed workflows to a human-readable failure state", () => {
    const failed = mapInternalStageToCustomer("FAILED", { failed: true });
    expect(failed.status).toBe("failed");
    expect(failed.message).toMatch(/try again/i);
  });

  it("enforces technology evidence rules for researched tools", () => {
    const researched = extractTechQuestions({
      jobDescription: "We use Kubernetes, Kafka, and OpenSearch heavily.",
      candidateTechnologies: [],
    });
    expect(researched.map((item) => item.technology)).toEqual(expect.arrayContaining(["Kubernetes", "Kafka"]));
    expect(claimableTechnologies(researched)).toEqual([]);
    expect(excludedTechnologies(researched)).toEqual(expect.arrayContaining(["Kubernetes", "Kafka"]));

    const declined = applyTechAnswers(researched, [
      { id: researched[0]!.id, answer: "no" as const },
      { id: researched[1]!.id, answer: "not_sure" as const },
      ...(researched[2] ? [{ id: researched[2].id, answer: "similar" as const, evidence: "Used ECS" }] : []),
    ]);
    expect(claimableTechnologies(declined)).toEqual([]);

    const attested = applyTechAnswers(researched, [
      { id: researched[0]!.id, answer: "yes_project" as const, evidence: "Deployed a Kubernetes cluster for a university project." },
    ]);
    expect(attested[0]?.evidenceStatus).toBe("user_attested");
    expect(claimableTechnologies(attested)).toEqual([researched[0]!.technology]);

    const yesWithoutEvidence = () =>
      applyTechAnswers(researched, [{ id: researched[0]!.id, answer: "yes_professional" as const }]);
    expect(yesWithoutEvidence).toThrow(/Evidence is required/);
  });

  it("ignoring optional tech questions does not block generation start", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    await seedOwnedEvidence(repos, tenantId, userId);
    const service = makeService(repos);
    const ctx = context(userId, tenantId, repos);
    const created = await service.generate(ctx, {
      jobDescription: "Role using Kubernetes and Redis for platform reliability work.",
      idempotencyKey: "ignore-tech",
    });
    const status = await service.getCustomerWorkflow(ctx, created.workflowId);
    expect(["queued", "creating", "completed"]).toContain(status.status);
    expect(status).not.toHaveProperty("blocked");
  });

  it("late evidence marks enhancement available without overwriting prior versions", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    await seedOwnedEvidence(repos, tenantId, userId);
    const service = makeService(repos);
    const ctx = context(userId, tenantId, repos);
    const generated = await service.generate(ctx, {
      jobDescription: "Platform role using Kubernetes and Redis.",
      idempotencyKey: "late-evidence",
    });
    const app = await repos.applications.getByPublicId(tenantId, generated.applicationId);
    const questions: TechQuestion[] = [
      { id: "tech_k8s", technology: "Kubernetes", reason: "Required", evidenceStatus: "unanswered" },
    ];
    await repos.applications.update(tenantId, app!.publicId, {
      workflowStage: "FINAL_READY",
      stage: "FINAL_READY",
      status: "ready",
      metadata: {
        ...app!.metadata,
        techQuestions: questions,
        customerFiles: { pdfStorageKey: "generated/x/y/resume.pdf", docxStorageKey: "generated/x/y/resume.docx" },
        customerFinalVersions: ["rv-final-1"],
      },
    });
    const answered = await service.submitTechAnswers(ctx, generated.workflowId, [
      { id: "tech_k8s", answer: "yes_professional", evidence: "Ran production clusters at Acme." },
    ]);
    expect(answered.enhancementAvailable).toBe(true);
    const enhanced = await service.createEnhancedVersion(ctx, generated.workflowId);
    expect(enhanced.workflowId).not.toBe(generated.workflowId);
    expect(enhanced.status).toBe("queued");
  });

  it("creates non-empty, correctly identified PDF and DOCX documents", async () => {
    const pdf = await createMinimalPdf(["Candidate", "Engineer"]);
    const docx = await createMinimalDocx(["Candidate", "Engineer"]);
    expect(pdf.length).toBeGreaterThan(100);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(docx.length).toBeGreaterThan(100);
    expect(docx.readUInt32LE(0)).toBe(0x04034b50);
  }, 60_000);

  it("refinement preserves old versions and allocates a new pipeline cycle", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    await seedOwnedEvidence(repos, tenantId, userId);
    const service = makeService(repos);
    const ctx = context(userId, tenantId, repos);
    const generated = await service.generate(ctx, { jobDescription: "A sufficiently detailed engineering job description.", idempotencyKey: "refine-original" });
    const app = await repos.applications.getByPublicId(tenantId, generated.applicationId);
    const resume = await repos.resumes.createResume({ id: newId("res"), publicId: newId("resp"), tenantId, applicationId: app!.id, applicationPublicId: app!.publicId, title: "Resume", templateId: "clean", length: "one-page", currentVersionPublicId: null });
    const old = await repos.resumes.appendVersion({ id: newId("rv"), publicId: newId("rvp"), tenantId, resumeId: resume.id, versionNumber: 4, versionLabel: "V4", score: 80, scoreBreakdown: {}, notes: "", triggeredBy: "initial", sections: [], idempotencyKey: "old" });
    const refined = await service.refine(ctx, generated.workflowId, { instruction: "Emphasize leadership" });
    expect((await repos.resumes.getVersion(tenantId, old.publicId))?.publicId).toBe(old.publicId);
    const run = await repos.workflows.getByPublicId(tenantId, refined.workflowId);
    expect(run?.payload.cycleBase).toBe(5);
  });

  it("worker restart re-enqueues unfinished workflows safely", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    await seedOwnedEvidence(repos, tenantId, userId);
    const service = makeService(repos);
    const ctx = context(userId, tenantId, repos);
    const created = await service.generate(ctx, {
      jobDescription: "Durable generation must survive worker restarts.",
      idempotencyKey: "recover-me",
    });
    const before = await repos.workflows.getByPublicId(tenantId, created.workflowId);
    expect(before?.status).toBe("queued");
    // Simulate process restart: new queue adapter, recover from durable workflow records.
    const restarted = new DbWorkflowEngine(repos.workflows, new InProcessQueueAdapter());
    const recovered = await restarted.recoverIncomplete();
    expect(recovered).toBeGreaterThanOrEqual(1);
  });

  it("does not use timeout-based generation in customer components and hides internal labels", async () => {
    const files = [
      "src/components/resumes/generate-form.tsx",
      "src/components/resumes/creating-state.tsx",
      "src/components/resumes/resume-ready.tsx",
      "src/components/resumes/refine-panel.tsx",
      "src/components/resumes/tech-confirm-card.tsx",
      "src/app/app/resumes/new/page.tsx",
      "src/app/app/resumes/[workflowId]/page.tsx",
    ];
    const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
    expect(source).not.toContain("setTimeout(");
    expect(source).not.toMatch(/You may close this page/i);
    expect(source).not.toMatch(/HR Audit|EM Audit|HR_AUDIT|EM_AUDIT|\bV0\b|token usage|BullMQ|OpenAI|Anthropic/i);
    expect(source).toContain("Understanding role");
    expect(source).toContain("Refine this resume");
    expect(source).toContain("Create new version");
  });
});
