/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { ensureDemoUser, DEMO_USER } from "../../server/auth/demo-auth";
import type { AuthContext } from "../../server/auth/guards";
import { createEmptyMemoryStore, newId, type Repositories } from "../../server/database/repositories";
import { AppError } from "../../server/domain/types";
import { CustomerGenerateService } from "../../server/modules/resumes/customer-generate";
import {
  applyTechAnswers,
  claimableTechnologies,
  excludedTechnologies,
  extractTechQuestions,
  validateTechAnswers,
} from "../../server/resumes/tech-questions";
import { getStorage } from "../../server/storage";
import { DbWorkflowEngine } from "../../server/workflows/engine";
import type { QueueAdapter } from "../../server/workflows/queues";
import { InProcessQueueAdapter } from "../../server/workflows/queues";

function context(userId: string, tenantId: string, repos: Repositories): AuthContext {
  return {
    requestId: "tech_confirmation_test",
    user: { id: userId, publicId: "customer", email: DEMO_USER.email, name: DEMO_USER.name },
    memberships: [{ tenantId, tenantPublicId: "tenant", role: "owner" }],
    activeTenantId: tenantId,
    repos: { applications: repos.applications, evidence: repos.evidence },
  };
}

describe("tech confirmation", () => {
  it("requires evidence for yes answers at validation time", () => {
    expect(() =>
      validateTechAnswers([{ id: "tech_1", answer: "yes_professional" }]),
    ).toThrow(AppError);
    expect(() =>
      validateTechAnswers([{ id: "tech_1", answer: "yes_project", evidence: "Built dashboards" }]),
    ).not.toThrow();
  });

  it("tracks excluded technologies for negative or uncertain answers", () => {
    const questions = extractTechQuestions({
      jobDescription: "Must know Kubernetes and Kafka in production.",
      candidateTechnologies: [],
    });
    const answered = applyTechAnswers(questions, [
      { id: questions[0]!.id, answer: "no" },
      { id: questions[1]!.id, answer: "similar", evidence: "Used Docker Compose locally" },
    ]);
    expect(claimableTechnologies(answered)).toEqual([]);
    expect(excludedTechnologies(answered)).toEqual(expect.arrayContaining([questions[0]!.technology, questions[1]!.technology]));
  });

  it("persists attested evidence and resumes evidence matching when paused", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
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

    const noopQueue = {
      enqueue: async <T>() => ({
        id: "noop",
        queue: "research" as const,
        name: "noop",
        payload: {} as T,
        attempt: 1,
        maxAttempts: 1,
        availableAt: Date.now(),
        createdAt: Date.now(),
      }),
      start: async () => {},
      stop: async () => {},
      registerHandler: () => {},
      onExhaustedRetries: () => {},
    } as QueueAdapter;
    const engine = new DbWorkflowEngine(repos.workflows, noopQueue);
    const service = new CustomerGenerateService(repos, engine, getStorage());
    const ctx = context(userId, tenantId, repos);
    const created = await service.generate(ctx, {
      jobDescription: "Platform role requiring Kubernetes and Redis experience in production systems.",
      idempotencyKey: "tech-confirm",
    });

    const app = await repos.applications.getByPublicId(tenantId, created.applicationId);
    const questions = extractTechQuestions({
      jobDescription: String(app?.metadata?.jobDescription ?? ""),
      candidateTechnologies: ["TypeScript"],
    });
    await repos.applications.update(tenantId, app!.publicId, {
      workflowStage: "RESEARCH_COMPLETED",
      stage: "RESEARCH_COMPLETED",
      metadata: { ...app!.metadata, techQuestions: questions },
    });
    const run = await repos.workflows.getByPublicId(tenantId, created.workflowId);
    await repos.workflows.updateRun(run!.id, {
      stage: "RESEARCH_COMPLETED",
      status: "waiting_review",
    });

    const target = questions.find((question) => question.technology === "Kubernetes") ?? questions[0]!;
    const answers = questions.map((question) =>
      question.id === target.id
        ? { id: question.id, answer: "yes_professional" as const, evidence: "Operated production Kubernetes clusters at Acme." }
        : { id: question.id, answer: "not_sure" as const },
    );
    await service.submitTechAnswers(ctx, created.workflowId, answers);

    const evidence = await repos.evidence.list(tenantId, { ownerUserId: userId });
    expect(evidence.some((item) => item.technologies.includes(target.technology))).toBe(true);

    const refreshedApp = await repos.applications.getByPublicId(tenantId, created.applicationId);
    expect(refreshedApp?.metadata?.excludedTechnologies).toEqual(expect.arrayContaining(["Redis"]));
    expect(refreshedApp?.metadata?.knownTechnologies).toEqual([target.technology]);

    const refreshedRun = await repos.workflows.getByPublicId(tenantId, created.workflowId);
    expect(refreshedRun?.stage).toBe("EVIDENCE_MATCHING_RUNNING");
  });

  it("treats duplicate submissions idempotently", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
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

    const engine = new DbWorkflowEngine(repos.workflows, new InProcessQueueAdapter());
    const service = new CustomerGenerateService(repos, engine, getStorage());
    const ctx = context(userId, tenantId, repos);
    const created = await service.generate(ctx, {
      jobDescription: "Role requiring Kubernetes experience in distributed systems.",
      idempotencyKey: "tech-dup",
    });
    const app = await repos.applications.getByPublicId(tenantId, created.applicationId);
    const questions = extractTechQuestions({
      jobDescription: String(app?.metadata?.jobDescription ?? ""),
      candidateTechnologies: ["TypeScript"],
    });
    const target = questions[0]!;
    const payload = [{ id: target.id, answer: "yes_project" as const, evidence: "Built a cluster for a class project." }];
    const first = await service.submitTechAnswers(ctx, created.workflowId, payload);
    const second = await service.submitTechAnswers(ctx, created.workflowId, payload);
    expect(first.accepted).toBe(true);
    expect(second).toMatchObject({ accepted: true, duplicate: true });
  });
});
