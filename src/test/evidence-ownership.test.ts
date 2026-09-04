/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { ensureDemoUser, DEMO_USER } from "../../server/auth/demo-auth";
import type { AuthContext } from "../../server/auth/guards";
import { AppError } from "../../server/domain/types";
import {
  createEmptyMemoryStore,
  MemoryRepositories,
  newId,
  type Repositories,
} from "../../server/database/repositories";
import { MockGenerationProvider } from "../../server/ai/mock-provider";
import { resumeSchema } from "../../server/ai/schemas";
import { getPrompt } from "../../server/ai/prompt-registry";
import { ProfileService } from "../../server/modules/profile/service";
import { CustomerGenerateService } from "../../server/modules/resumes/customer-generate";
import { getStorage } from "../../server/storage";
import { ResumeImportService } from "../../server/modules/resumes/import-service";
import { LocalFilesystemStorage } from "../../server/storage/local";
import { resetStorage } from "../../server/storage";
import { DbWorkflowEngine } from "../../server/workflows/engine";
import { InProcessQueueAdapter } from "../../server/workflows/queues";

function context(userId: string, tenantId: string, repos: Repositories): AuthContext {
  return {
    requestId: "evidence_ownership_test",
    user: { id: userId, publicId: "owner", email: DEMO_USER.email, name: DEMO_USER.name },
    memberships: [{ tenantId, tenantPublicId: "tenant", role: "owner" }],
    activeTenantId: tenantId,
    repos: { applications: repos.applications, evidence: repos.evidence },
  };
}

describe("evidence ownership", () => {
  it("creates owned career notes evidence from onboarding", async () => {
    resetStorage();
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    const profileService = ProfileService.fromRepos(repos);
    const ctx = context(userId, tenantId, repos);

    await profileService.updateOnboarding(ctx, {
      step: 2,
      data: { evidenceNotes: "Led platform modernization and mentored junior engineers." },
    });

    const owned = await repos.evidence.list(tenantId, { ownerUserId: userId });
    expect(owned).toHaveLength(1);
    expect(owned[0]?.title).toBe("Career notes");
    expect(owned[0]?.ownerUserId).toBe(userId);
    expect(owned[0]?.verificationStatus).toBe("user_attested");

    await profileService.updateOnboarding(ctx, {
      step: 2,
      data: { evidenceNotes: "Updated notes about leadership and delivery." },
    });
    const afterUpdate = await repos.evidence.list(tenantId, { ownerUserId: userId });
    expect(afterUpdate).toHaveLength(1);
    expect(afterUpdate[0]?.situation).toContain("Updated notes");
  });

  it("creates employment evidence on import confirm", async () => {
    resetStorage();
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    const profile = await repos.candidateProfiles.upsert({
      id: newId("cp"),
      publicId: newId("cpp"),
      tenantId,
      userId,
      fullName: "Ada Lovelace",
      preferredName: null,
      email: "ada@example.com",
      phone: null,
      location: null,
      linkedIn: null,
      github: null,
      portfolio: null,
      headline: null,
      summary: null,
      experienceLevel: null,
      yearsExperience: null,
      targetRoleFamilies: [],
      preferredResumeLength: "one-page",
      careerGoal: null,
      avatarInitials: "AL",
      remoteOk: true,
      preferredLocations: [],
      workAuthorization: null,
      requiresSponsorship: null,
      onboardingStep: 0,
      onboardingCompletedAt: null,
      modelImprovementOptIn: false,
      sourceResumeFilePublicId: "file-resume-1",
      resumeImportStatus: "ready_for_review",
      resumeImportExtraction: {
        contact: { fullName: "Ada Lovelace", email: "ada@example.com" },
        employment: [
          {
            title: "Senior Engineer",
            company: "Analytical Engines Inc",
            bullets: ["Built inference pipeline", "Reduced latency 35%"],
          },
        ],
        education: [],
        projects: [{ name: "Diff Engine UI", description: "Built operator dashboard", technologies: ["TypeScript"] }],
        skills: ["TypeScript", "Python"],
        certifications: [],
        evidence: [],
        rawText: "",
        parseWarnings: [],
      },
    });

    const importService = ResumeImportService.fromRepos(
      repos,
      new LocalFilesystemStorage(),
      new InProcessQueueAdapter(),
    );
    const ctx = context(userId, tenantId, repos);
    await importService.confirmImport(ctx);

    const owned = await repos.evidence.list(tenantId, { ownerUserId: userId });
    expect(owned.length).toBeGreaterThanOrEqual(2);
    expect(owned.some((item) => item.title.includes("Senior Engineer"))).toBe(true);
    expect(owned.every((item) => item.ownerUserId === userId)).toBe(true);
    expect(owned.every((item) => item.candidateProfileId === profile.id)).toBe(true);
    void profile;
  });

  it("does not duplicate evidence on repeated import confirm", async () => {
    resetStorage();
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    await repos.candidateProfiles.upsert({
      id: newId("cp"),
      publicId: newId("cpp"),
      tenantId,
      userId,
      fullName: "Ada Lovelace",
      preferredName: null,
      email: "ada@example.com",
      phone: null,
      location: null,
      linkedIn: null,
      github: null,
      portfolio: null,
      headline: null,
      summary: null,
      experienceLevel: null,
      yearsExperience: null,
      targetRoleFamilies: [],
      preferredResumeLength: "one-page",
      careerGoal: null,
      avatarInitials: "AL",
      remoteOk: true,
      preferredLocations: [],
      workAuthorization: null,
      requiresSponsorship: null,
      onboardingStep: 0,
      onboardingCompletedAt: null,
      modelImprovementOptIn: false,
      sourceResumeFilePublicId: "file-resume-dup",
      resumeImportStatus: "ready_for_review",
      resumeImportExtraction: {
        employment: [{ title: "Engineer", company: "Acme", bullets: ["Shipped feature"] }],
        education: [],
        projects: [],
        skills: ["Go"],
        certifications: [],
        evidence: [],
        rawText: "",
        parseWarnings: [],
      },
    });

    const importService = ResumeImportService.fromRepos(
      repos,
      new LocalFilesystemStorage(),
      new InProcessQueueAdapter(),
    );
    const ctx = context(userId, tenantId, repos);
    await importService.confirmImport(ctx);
    const afterFirst = await repos.evidence.list(tenantId, { ownerUserId: userId });
    await importService.confirmImport(ctx);
    const afterSecond = await repos.evidence.list(tenantId, { ownerUserId: userId });
    expect(afterSecond).toHaveLength(afterFirst.length);
  });

  it("blocks customer generation when owned evidence is empty", async () => {
    resetStorage();
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    const service = new CustomerGenerateService(repos, new DbWorkflowEngine(repos.workflows, new InProcessQueueAdapter()), getStorage());
    const ctx = context(userId, tenantId, repos);

    await expect(
      service.generate(ctx, {
        jobDescription: "Requires production experience with distributed systems and APIs.",
        idempotencyKey: "empty-evidence",
      }),
    ).rejects.toMatchObject({
      code: "PROFILE_EVIDENCE_REQUIRED",
      status: 422,
    } satisfies Partial<AppError>);
  });

  it("mock provider never emits ev-unknown evidence ids", async () => {
    const provider = new MockGenerationProvider();
    const prompt = getPrompt("resume-generation");
    const withoutEvidence = await provider.generateStructured({
      prompt: { id: prompt.id, version: prompt.version, rubricVersion: prompt.rubricVersion },
      system: prompt.system,
      user: JSON.stringify({ versionNumber: 0, evidence: [] }),
      schema: resumeSchema,
      metadata: { allowedEvidenceIds: [], allowedTechnologies: [] },
    });
    const bullets = withoutEvidence.data.sections.flatMap((section) => section.bullets ?? []);
    for (const bullet of bullets) {
      expect(bullet.evidenceIds ?? []).not.toContain("ev-unknown");
    }

    const withEvidence = await provider.generateStructured({
      prompt: { id: prompt.id, version: prompt.version, rubricVersion: prompt.rubricVersion },
      system: prompt.system,
      user: JSON.stringify({
        versionNumber: 0,
        evidence: [{ id: "evp-owned-1", title: "Delivery", technologies: ["TypeScript"] }],
      }),
      schema: resumeSchema,
      metadata: { allowedEvidenceIds: ["evp-owned-1"], allowedTechnologies: ["TypeScript"] },
    });
    const ownedBullets = withEvidence.data.sections.flatMap((section) => section.bullets ?? []);
    expect(ownedBullets.some((bullet) => bullet.evidenceIds?.includes("evp-owned-1"))).toBe(true);
    for (const bullet of ownedBullets) {
      expect(bullet.evidenceIds ?? []).not.toContain("ev-unknown");
    }
  });

  it("does not leak another user's evidence within the same tenant", async () => {
    resetStorage();
    const store = createEmptyMemoryStore();
    const repos = new MemoryRepositories(store);
    const tenantId = newId("ten");
    const userA = newId("usr");
    const userB = newId("usr");

    await repos.evidence.create({
      id: newId("ev"),
      publicId: newId("evp-a"),
      tenantId,
      ownerUserId: userA,
      candidateProfileId: null,
      title: "User A evidence",
      organization: "A",
      situation: "Private",
      task: "Task",
      actions: [],
      result: "Result",
      technologies: [],
      confidence: "high",
      verificationStatus: "user_attested",
      privacyLevel: "private",
      excludedFromApplicationIds: [],
      matchedApplicationIds: [],
      payload: {},
    });
    await repos.evidence.create({
      id: newId("ev"),
      publicId: newId("evp-b"),
      tenantId,
      ownerUserId: userB,
      candidateProfileId: null,
      title: "User B evidence",
      organization: "B",
      situation: "Private",
      task: "Task",
      actions: [],
      result: "Result",
      technologies: [],
      confidence: "high",
      verificationStatus: "user_attested",
      privacyLevel: "private",
      excludedFromApplicationIds: [],
      matchedApplicationIds: [],
      payload: {},
    });

    const listedForB = await repos.evidence.list(tenantId, { ownerUserId: userB });
    expect(listedForB).toHaveLength(1);
    expect(listedForB[0]?.title).toBe("User B evidence");
    expect(listedForB.some((item) => item.ownerUserId === userA)).toBe(false);
  });
});
