/** @vitest-environment node */
import { describe, expect, it, beforeEach } from "vitest";
import { ensureDemoUser, DEMO_USER } from "../../server/auth/demo-auth";
import type { AuthContext } from "../../server/auth/guards";
import {
  createEmptyMemoryStore,
  newId,
  type Repositories,
} from "../../server/database/repositories";
import { ApplicationsService } from "../../server/modules/applications/service";
import { DbWorkflowEngine } from "../../server/workflows/engine";
import { InProcessQueueAdapter } from "../../server/workflows/queues";
import { RadarService } from "../../server/radar/service";
import { getSharedCatalog, seedDemoCatalog } from "../../server/radar/catalog";
import { AppError } from "../../server/domain/types";

function authFor(userId: string, tenantId: string, repos: Repositories, email: string = DEMO_USER.email): AuthContext {
  return {
    requestId: "stab",
    user: { id: userId, publicId: "usp", email, name: "Tester" },
    memberships: [{ tenantId, tenantPublicId: "tep", role: "owner" }],
    activeTenantId: tenantId,
    repos: { applications: repos.applications, evidence: repos.evidence },
  };
}

describe("application status CAS", () => {
  it("rejects stale expectedVersion with 409 and accepts matching version", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    const queue = new InProcessQueueAdapter();
    const engine = new DbWorkflowEngine(repos.workflows, queue);
    const service = ApplicationsService.fromRepos(repos, engine);
    const auth = authFor(userId, tenantId, repos);

    const created = await service.create(auth, {
      company: "Acme",
      role: "Engineer",
      idempotencyKey: `cas-${newId("k")}`,
    });
    const app = created.application;
    const fresh = await service.get(auth, app.publicId);
    const v0 = fresh.version;

    const first = await service.update(auth, app.publicId, {
      candidateStatus: "Applied",
      expectedVersion: v0,
    });
    expect(first.metadata?.candidateStatus).toBe("Applied");
    expect(first.version).toBe(v0 + 1);

    await expect(
      service.update(auth, app.publicId, {
        candidateStatus: "Interviewing",
        expectedVersion: v0,
      }),
    ).rejects.toMatchObject({ code: "APPLICATION_VERSION_CONFLICT", status: 409 });

    const second = await service.update(auth, app.publicId, {
      candidateStatus: "Interviewing",
      expectedVersion: first.version,
    });
    expect(second.metadata?.candidateStatus).toBe("Interviewing");

    const again = await service.update(auth, app.publicId, {
      candidateStatus: "Interviewing",
      expectedVersion: second.version,
    });
    expect(again.version).toBe(second.version);
  });
});

describe("opportunity brief cache isolation", () => {
  beforeEach(() => {
    seedDemoCatalog();
  });

  it("scopes personalized briefs by tenant, user, and profile revision", async () => {
    const catalog = getSharedCatalog();
    const job = [...catalog.canonicalJobs.values()][0];
    expect(job).toBeTruthy();

    const storeA = createEmptyMemoryStore();
    const storeB = createEmptyMemoryStore();
    const a = await ensureDemoUser(storeA);
    const b = await ensureDemoUser(storeB);

    await a.repos.candidateProfiles.upsert({
      id: newId("cp"),
      publicId: newId("cpp"),
      tenantId: a.tenantId,
      userId: a.userId,
      fullName: "User A",
      preferredName: null,
      email: "a@example.com",
      phone: null,
      location: null,
      linkedIn: null,
      github: null,
      portfolio: null,
      headline: null,
      summary: null,
      experienceLevel: null,
      yearsExperience: 8,
      targetRoleFamilies: ["Platform"],
      preferredResumeLength: "one-page",
      careerGoal: "Platform leadership",
      avatarInitials: "UA",
      remoteOk: true,
      preferredLocations: [],
      workAuthorization: null,
      requiresSponsorship: null,
      targetCompanies: [],
      targetIndustries: [],
      jobTypes: [],
      workplaceModes: [],
      willingToRelocate: null,
      salaryPreference: null,
      seniority: "senior",
      onboardingStep: 3,
      onboardingCompletedAt: new Date().toISOString(),
      modelImprovementOptIn: false,
      sourceResumeFilePublicId: null,
      resumeImportStatus: "confirmed",
      resumeImportExtraction: {
        skills: ["TypeScript", "Kubernetes"],
        employment: [],
        education: [],
        projects: [],
        certifications: [],
        evidence: [],
        rawText: "",
        parseWarnings: [],
      },
    });

    await b.repos.candidateProfiles.upsert({
      id: newId("cp"),
      publicId: newId("cpp"),
      tenantId: b.tenantId,
      userId: b.userId,
      fullName: "User B",
      preferredName: null,
      email: "b@example.com",
      phone: null,
      location: null,
      linkedIn: null,
      github: null,
      portfolio: null,
      headline: null,
      summary: null,
      experienceLevel: null,
      yearsExperience: 1,
      targetRoleFamilies: ["Design"],
      preferredResumeLength: "one-page",
      careerGoal: "Product design",
      avatarInitials: "UB",
      remoteOk: true,
      preferredLocations: [],
      workAuthorization: null,
      requiresSponsorship: null,
      targetCompanies: [],
      targetIndustries: [],
      jobTypes: [],
      workplaceModes: [],
      willingToRelocate: null,
      salaryPreference: null,
      seniority: "entry",
      onboardingStep: 3,
      onboardingCompletedAt: new Date().toISOString(),
      modelImprovementOptIn: false,
      sourceResumeFilePublicId: null,
      resumeImportStatus: "confirmed",
      resumeImportExtraction: {
        skills: ["Figma"],
        employment: [],
        education: [],
        projects: [],
        certifications: [],
        evidence: [],
        rawText: "",
        parseWarnings: [],
      },
    });

    // Single service instance — previously keyed only by jobId (cross-user leak).
    const service = new RadarService(catalog, undefined, a.repos);
    // Swap repos per call by constructing with a shared cache map via one service that
    // uses getProfileForMatch from its repos — use two services that share the same Map:
    const shared = new RadarService(catalog, undefined, a.repos);
    const authA = authFor(a.userId, a.tenantId, a.repos, "a@example.com");
    const briefA1 = await shared.getOpportunityBrief(authA, job!.publicId);
    expect(briefA1.cached).toBe(false);
    const briefA2 = await shared.getOpportunityBrief(authA, job!.publicId);
    expect(briefA2.cached).toBe(true);

    // Inject B's repos into a second service that shares no cache — proves separation.
    // To prove same-Map isolation, attach B through a wrapper service that uses B repos
    // but we need same cachedBriefs Map. Expose via creating service then overwriting repos is hard.
    // Practical approach: spy that B's first fetch is uncached even after A was cached,
    // using a custom RadarService subclass... Simpler: put both profiles in one store.
    
    const sharedStore = createEmptyMemoryStore();
    const sharedDemo = await ensureDemoUser(sharedStore);
    const tenantB = newId("ten");
    const userB = newId("usr");
    await sharedDemo.repos.users.create({
      id: userB,
      publicId: newId("usp"),
      email: `iso-b-${newId("e")}@example.com`,
      emailVerified: true,
      passwordHash: "x",
      name: "Iso B",
    });
    // Create tenant B via createTenant
    const tenB = await sharedDemo.repos.users.createTenant({
      publicId: newId("tep"),
      name: "Tenant B",
      plan: "free",
    });
    await sharedDemo.repos.users.createMembership({
      tenantId: tenB.id,
      userId: userB,
      role: "owner",
    });
    await sharedDemo.repos.candidateProfiles.upsert({
      id: newId("cp"),
      publicId: newId("cpp"),
      tenantId: tenB.id,
      userId: userB,
      fullName: "Iso B",
      preferredName: null,
      email: "isob@example.com",
      phone: null,
      location: null,
      linkedIn: null,
      github: null,
      portfolio: null,
      headline: null,
      summary: null,
      experienceLevel: null,
      yearsExperience: 1,
      targetRoleFamilies: ["Design"],
      preferredResumeLength: "one-page",
      careerGoal: "Design",
      avatarInitials: "IB",
      remoteOk: true,
      preferredLocations: [],
      workAuthorization: null,
      requiresSponsorship: null,
      targetCompanies: [],
      targetIndustries: [],
      jobTypes: [],
      workplaceModes: [],
      willingToRelocate: null,
      salaryPreference: null,
      seniority: "entry",
      onboardingStep: 3,
      onboardingCompletedAt: new Date().toISOString(),
      modelImprovementOptIn: false,
      sourceResumeFilePublicId: null,
      resumeImportStatus: "confirmed",
      resumeImportExtraction: {
        skills: ["Figma"],
        employment: [],
        education: [],
        projects: [],
        certifications: [],
        evidence: [],
        rawText: "",
        parseWarnings: [],
      },
    });
    // Also ensure A profile on sharedDemo
    await sharedDemo.repos.candidateProfiles.upsert({
      id: newId("cp"),
      publicId: newId("cpp"),
      tenantId: sharedDemo.tenantId,
      userId: sharedDemo.userId,
      fullName: "Iso A",
      preferredName: null,
      email: "isoa@example.com",
      phone: null,
      location: null,
      linkedIn: null,
      github: null,
      portfolio: null,
      headline: null,
      summary: null,
      experienceLevel: null,
      yearsExperience: 8,
      targetRoleFamilies: ["Platform"],
      preferredResumeLength: "one-page",
      careerGoal: "Platform",
      avatarInitials: "IA",
      remoteOk: true,
      preferredLocations: [],
      workAuthorization: null,
      requiresSponsorship: null,
      targetCompanies: [],
      targetIndustries: [],
      jobTypes: [],
      workplaceModes: [],
      willingToRelocate: null,
      salaryPreference: null,
      seniority: "senior",
      onboardingStep: 3,
      onboardingCompletedAt: new Date().toISOString(),
      modelImprovementOptIn: false,
      sourceResumeFilePublicId: null,
      resumeImportStatus: "confirmed",
      resumeImportExtraction: {
        skills: ["TypeScript", "Kubernetes"],
        employment: [],
        education: [],
        projects: [],
        certifications: [],
        evidence: [],
        rawText: "",
        parseWarnings: [],
      },
    });

    const iso = new RadarService(catalog, undefined, sharedDemo.repos);
    const aCtx = authFor(sharedDemo.userId, sharedDemo.tenantId, sharedDemo.repos);
    const bCtx = authFor(userB, tenB.id, sharedDemo.repos, "isob@example.com");

    const a1 = await iso.getOpportunityBrief(aCtx, job!.publicId);
    expect(a1.cached).toBe(false);
    const a2 = await iso.getOpportunityBrief(aCtx, job!.publicId);
    expect(a2.cached).toBe(true);

    const b1 = await iso.getOpportunityBrief(bCtx, job!.publicId);
    expect(b1.cached).toBe(false);
    expect(b1.skillsAlignment.join(" ")).not.toEqual(a1.skillsAlignment.join(" "));

    void AppError;
    void tenantB;
  });
});

describe("radar filter contracts", () => {
  beforeEach(() => {
    seedDemoCatalog();
  });

  it("savedOnly returns only jobs saved by that user", async () => {
    const store = createEmptyMemoryStore();
    const demo = await ensureDemoUser(store);
    const catalog = getSharedCatalog();
    const service = new RadarService(catalog);
    const jobs = [...catalog.canonicalJobs.values()];
    expect(jobs.length).toBeGreaterThan(1);
    const auth = authFor(demo.userId, demo.tenantId, demo.repos);
    await service.save(auth, jobs[0]!.publicId);

    const saved = await service.search(auth, { savedOnly: true, limit: 50 });
    expect(saved.results.length).toBe(1);
    expect(saved.results[0]!.job.id).toBe(jobs[0]!.id);
    expect(saved.results.every((r) => r.saved)).toBe(true);

    const cleared = await service.search(auth, { limit: 50 });
    expect(cleared.results.length).toBeGreaterThan(saved.results.length);
  });

  it("remotePolicy hybrid does not include pure remote jobs", async () => {
    const catalog = getSharedCatalog();
    const hybrid = catalog.search({ remotePolicy: "hybrid", limit: 100 });
    expect(hybrid.results.every((r) => r.job.remotePolicy === "hybrid")).toBe(true);
    const remote = catalog.search({ remotePolicy: "remote", limit: 100 });
    expect(remote.results.every((r) => r.job.remotePolicy === "remote")).toBe(true);
  });

  it("applyHydratedSnapshot restores jobs and saved rows after restart simulation", () => {
    const catalog = getSharedCatalog();
    const job = [...catalog.canonicalJobs.values()][0]!;
    const snapshot = {
      companies: [...catalog.companies.values()],
      sources: [...catalog.sources.values()],
      jobs: [...catalog.canonicalJobs.values()],
      sightings: [...catalog.sightings.values()],
      savedJobs: [
        {
          id: "saved_test",
          tenantId: "ten_a",
          userId: "usr_a",
          canonicalJobId: job.id,
          createdAt: new Date().toISOString(),
        },
      ],
    };
    catalog.canonicalJobs.clear();
    catalog.savedJobs.clear();
    expect(catalog.canonicalJobs.size).toBe(0);
    catalog.applyHydratedSnapshot(snapshot);
    expect(catalog.canonicalJobs.get(job.id)?.publicId).toBe(job.publicId);
    expect(catalog.savedJobs.get(`ten_a:usr_a:${job.id}`)?.id).toBe("saved_test");
  });
});

describe("applications → resume navigation context", () => {
  it("stores workflowId on create and maps it for deep links", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    const queue = new InProcessQueueAdapter();
    const engine = new DbWorkflowEngine(repos.workflows, queue);
    const service = ApplicationsService.fromRepos(repos, engine);
    const auth = authFor(userId, tenantId, repos);

    const created = await service.create(auth, {
      company: "NavCo",
      role: "Engineer",
      idempotencyKey: `nav-${newId("k")}`,
    });
    expect(created.application.metadata?.customerWorkflowPublicId).toBe(created.workflow.publicId);

    const { mapApplicationToUi } = await import("../../server/bootstrap");
    const ui = mapApplicationToUi(created.application);
    expect(ui.workflowId).toBe(created.workflow.publicId);
    expect(ui.workflowId).not.toBe(ui.id);
  });
});
