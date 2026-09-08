/** @vitest-environment node */
import { describe, expect, it, beforeEach } from "vitest";
import { ensureDemoUser, DEMO_USER } from "../../server/auth/demo-auth";
import type { AuthContext } from "../../server/auth/guards";
import {
  createEmptyMemoryStore,
  MemoryRepositories,
  newId,
  type Repositories,
} from "../../server/database/repositories";
import { ProfileService } from "../../server/modules/profile/service";
import { AppError } from "../../server/domain/types";
import { normalizeTitleList } from "../../server/modules/profile/onboarding";

function context(userId: string, tenantId: string, repos: Repositories): AuthContext {
  return {
    requestId: "onboarding_test",
    user: { id: userId, publicId: "onb_user", email: "onb@example.com", name: "Onb User" },
    memberships: [{ tenantId, tenantPublicId: "tenant", role: "owner" }],
    activeTenantId: tenantId,
    repos: { applications: repos.applications, evidence: repos.evidence },
  };
}

async function freshUser() {
  const store = createEmptyMemoryStore();
  const repos = new MemoryRepositories(store);
  const passwordHash = "x";
  const user = await repos.users.create({
    id: newId("usr"),
    publicId: newId("usp"),
    email: `user-${newId("e")}@example.com`,
    emailVerified: true,
    passwordHash,
    name: "Fresh Candidate",
  });
  const tenant = {
    id: newId("ten"),
    publicId: newId("tep"),
    name: "Fresh Tenant",
    plan: "free",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.tenants.set(tenant.id, tenant);
  store.memberships.push({
    id: newId("mem"),
    tenantId: tenant.id,
    userId: user.id,
    role: "owner",
    createdAt: new Date().toISOString(),
  });
  return { store, repos, userId: user.id, tenantId: tenant.id };
}

describe("onboarding persistence", () => {
  it("creates a new profile at step 0", async () => {
    const { repos, userId, tenantId } = await freshUser();
    const service = ProfileService.fromRepos(repos);
    const ctx = context(userId, tenantId, repos);
    const profile = await service.getOrCreate(ctx);
    expect(profile.onboardingStep).toBe(0);
    expect(profile.onboardingCompletedAt).toBeNull();
  });

  it("persists steps and resumes exact step", async () => {
    const { repos, userId, tenantId } = await freshUser();
    const service = ProfileService.fromRepos(repos);
    const ctx = context(userId, tenantId, repos);
    let profile = await service.getOrCreate(ctx);

    profile = await service.updateOnboarding(ctx, {
      expectedVersion: profile.version,
      step: 1,
      data: {
        targetRoles: ["Platform Engineer", " platform engineer "],
        seniority: "senior",
        targetCompanies: ["Acme"],
      },
    });
    expect(profile.onboardingStep).toBe(1);
    expect(profile.targetRoleFamilies).toEqual(["Platform Engineer"]);

    profile = await service.updateOnboarding(ctx, {
      expectedVersion: profile.version,
      step: 2,
      data: {
        jobTypes: ["full-time"],
        workplaceModes: ["remote"],
        preferredLocations: ["Remote"],
      },
    });
    expect(profile.onboardingStep).toBe(2);
    expect(profile.jobTypes).toEqual(["full-time"]);
    expect(profile.workplaceModes).toEqual(["remote"]);
  });

  it("rejects completing without required data and does not set completedAt", async () => {
    const { repos, userId, tenantId } = await freshUser();
    const service = ProfileService.fromRepos(repos);
    const ctx = context(userId, tenantId, repos);
    const created = await service.getOrCreate(ctx);
    await expect(
      service.updateOnboarding(ctx, { completed: true, expectedVersion: created.version }),
    ).rejects.toBeInstanceOf(AppError);
    const profile = await service.get(ctx);
    expect(profile.onboardingCompletedAt).toBeNull();
    expect(profile.version).toBe(created.version);
  });

  it("completes idempotently after valid career profile", async () => {
    const { repos, userId, tenantId } = await freshUser();
    const service = ProfileService.fromRepos(repos);
    const ctx = context(userId, tenantId, repos);
    let profile = await service.getOrCreate(ctx);

    profile = await service.updateOnboarding(ctx, {
      expectedVersion: profile.version,
      step: 3,
      data: {
        targetRoles: ["ML Engineer"],
        seniority: "mid",
        jobTypes: ["full-time"],
        workplaceModes: ["hybrid"],
        fullName: "Ada Lovelace",
        skills: ["Python"],
        employment: [{ title: "Engineer", company: "Analytical", bullets: ["Built engines"] }],
        careerProfileMode: "manual",
      },
    });

    const first = await service.updateOnboarding(ctx, {
      expectedVersion: profile.version,
      completed: true,
    });
    expect(first.onboardingCompletedAt).toBeTruthy();
    const stamp = first.onboardingCompletedAt;
    const second = await service.updateOnboarding(ctx, {
      expectedVersion: first.version,
      completed: true,
    });
    expect(second.onboardingCompletedAt).toBe(stamp);
    expect(second.version).toBe(first.version);
  });

  it("uses atomic compare-and-swap for concurrent same-version updates", async () => {
    const { repos, userId, tenantId } = await freshUser();
    const service = ProfileService.fromRepos(repos);
    const ctx = context(userId, tenantId, repos);
    const created = await service.getOrCreate(ctx);

    const results = await Promise.allSettled([
      service.updateOnboarding(ctx, {
        expectedVersion: created.version,
        step: 1,
        data: { targetRoles: ["Winner Role"], seniority: "senior" },
      }),
      service.updateOnboarding(ctx, {
        expectedVersion: created.version,
        step: 1,
        data: { targetRoles: ["Loser Role"], seniority: "mid" },
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "ONBOARDING_STALE",
      status: 409,
    });
    const finalProfile = await service.get(ctx);
    expect(finalProfile.targetRoleFamilies).toEqual(
      (fulfilled[0] as PromiseFulfilledResult<{ targetRoleFamilies: string[] }>).value.targetRoleFamilies,
    );
  });

  it("protects against stale versions", async () => {
    const { repos, userId, tenantId } = await freshUser();
    const service = ProfileService.fromRepos(repos);
    const ctx = context(userId, tenantId, repos);
    const created = await service.getOrCreate(ctx);
    await service.updateOnboarding(ctx, {
      step: 0,
      data: { targetRoles: ["SWE"], seniority: "entry" },
      expectedVersion: created.version,
    });
    await expect(
      service.updateOnboarding(ctx, {
        step: 1,
        expectedVersion: created.version,
        data: { targetRoles: ["SWE"], seniority: "entry" },
      }),
    ).rejects.toMatchObject({ code: "ONBOARDING_STALE", status: 409 });
  });

  it("isolates onboarding by tenant and owner", async () => {
    const a = await freshUser();
    const b = await freshUser();
    const service = ProfileService.fromRepos(a.repos);
    const ctxA = context(a.userId, a.tenantId, a.repos);
    const createdA = await service.getOrCreate(ctxA);
    await service.updateOnboarding(ctxA, {
      expectedVersion: createdA.version,
      step: 1,
      data: { targetRoles: ["Secret Role"], seniority: "senior" },
    });

    const serviceB = ProfileService.fromRepos(b.repos);
    const ctxB = context(b.userId, b.tenantId, b.repos);
    const profileB = await serviceB.get(ctxB);
    expect(profileB.targetRoleFamilies).not.toContain("Secret Role");

    const unauthorized: AuthContext = {
      requestId: "onboarding_test",
      user: { id: a.userId, publicId: "onb_user", email: "onb@example.com", name: "Onb User" },
      memberships: [],
      activeTenantId: b.tenantId,
      repos: { applications: b.repos.applications, evidence: b.repos.evidence },
    };
    await expect(
      serviceB.updateOnboarding(unauthorized, { step: 1, expectedVersion: 1 }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("normalizes duplicate titles", () => {
    expect(normalizeTitleList(["A", " a ", "B", "A"])).toEqual(["A", "B"]);
  });

  it("resume profile update bumps version so stale onboarding cannot overwrite", async () => {
    const { repos, userId, tenantId } = await freshUser();
    const service = ProfileService.fromRepos(repos);
    const ctx = context(userId, tenantId, repos);
    const created = await service.getOrCreate(ctx);
    const afterOnboarding = await service.updateOnboarding(ctx, {
      expectedVersion: created.version,
      step: 1,
      data: { targetRoles: ["Platform Engineer"], seniority: "senior" },
    });
    const afterUpload = await repos.candidateProfiles.update(tenantId, userId, {
      resumeImportStatus: "ready_for_review",
      fullName: "From Upload",
    });
    expect(afterUpload.version).toBe(afterOnboarding.version + 1);
    await expect(
      service.updateOnboarding(ctx, {
        expectedVersion: afterOnboarding.version,
        step: 1,
        data: { targetRoles: ["Should Not Win"], seniority: "mid" },
      }),
    ).rejects.toMatchObject({ code: "ONBOARDING_STALE", status: 409 });
    const finalProfile = await service.get(ctx);
    expect(finalProfile.targetRoleFamilies).toEqual(["Platform Engineer"]);
    expect(finalProfile.fullName).toBe("From Upload");
  });
});

describe("demo user onboarding", () => {
  beforeEach(() => {
    // ensure isolated store via fresh ensureDemoUser cache is sticky; use empty store param
  });

  it("marks demo seed profile complete for app access", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    const profile = await repos.candidateProfiles.getByUser(tenantId, userId);
    expect(profile?.onboardingCompletedAt).toBeTruthy();
    expect(DEMO_USER.email).toContain("@");
  });
});
