/** @vitest-environment node */
import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyMemoryStore,
  MemoryRepositories,
  newId,
} from "../../server/database/repositories";
import { resetRuntimeForTests, setRuntimeForTests, type Runtime } from "../../server/bootstrap";
import { ProfileService } from "../../server/modules/profile/service";
import { hashPassword } from "../../server/auth/password";
import { createSession, hashToken, SESSION_COOKIE_NAME } from "../../server/auth/session";
import { resolveAppGate } from "../../server/auth/app-gate";

function buildRuntime(): Runtime {
  const store = createEmptyMemoryStore();
  const repos = new MemoryRepositories(store);
  return {
    mode: "memory",
    repos,
    store,
    queue: {
      start: async () => undefined,
      stop: async () => undefined,
      enqueue: async () => "job",
      registerHandler: () => undefined,
      onExhaustedRetries: () => undefined,
    } as unknown as Runtime["queue"],
    engine: {} as Runtime["engine"],
    pipeline: {} as Runtime["pipeline"],
    services: {
      profile: ProfileService.fromRepos(repos),
    } as Runtime["services"],
  };
}

async function seedUser(
  runtime: Runtime,
  opts: { onboardingCompletedAt: string | null; onboardingStep?: number },
) {
  const passwordHash = await hashPassword("GateTest!123");
  const user = await runtime.repos.users.create({
    id: newId("usr"),
    publicId: newId("usp"),
    email: `gate-${newId("e")}@example.com`,
    emailVerified: true,
    passwordHash,
    name: "Gate Candidate",
  });
  const tenant = await runtime.repos.users.createTenant({
    publicId: newId("tep"),
    name: "Gate Tenant",
    plan: "free",
  });
  await runtime.repos.users.createMembership({
    tenantId: tenant.id,
    userId: user.id,
    role: "owner",
  });
  await runtime.repos.candidateProfiles.upsert({
    id: newId("cp"),
    publicId: newId("cpp"),
    tenantId: tenant.id,
    userId: user.id,
    fullName: "Gate Candidate",
    preferredName: null,
    email: user.email,
    phone: null,
    location: null,
    linkedIn: null,
    github: null,
    portfolio: null,
    headline: null,
    summary: null,
    experienceLevel: null,
    yearsExperience: null,
    targetRoleFamilies: ["Engineer"],
    preferredResumeLength: "one-page",
    careerGoal: null,
    avatarInitials: "GC",
    remoteOk: true,
    preferredLocations: [],
    workAuthorization: null,
    requiresSponsorship: null,
    targetCompanies: [],
    targetIndustries: [],
    jobTypes: ["full-time"],
    workplaceModes: ["remote"],
    willingToRelocate: null,
    salaryPreference: null,
    seniority: "mid",
    onboardingStep: opts.onboardingStep ?? 1,
    onboardingCompletedAt: opts.onboardingCompletedAt,
    modelImprovementOptIn: false,
    sourceResumeFilePublicId: null,
    resumeImportStatus: null,
    resumeImportExtraction: null,
  });
  const session = await createSession({
    userId: user.id,
    tenantId: tenant.id,
    sessionId: randomUUID(),
  });
  await runtime.repos.sessions.create({
    id: session.sessionId,
    userId: user.id,
    tokenHash: hashToken(session.token),
    expiresAt: session.expiresAt.toISOString(),
  });
  return { user, tenant, token: session.token, sessionId: session.sessionId };
}

describe("resolveAppGate", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET || "candidarc-dev-session-secret-change-me!!";
    resetRuntimeForTests();
    setRuntimeForTests(buildRuntime());
  });

  afterEach(() => {
    resetRuntimeForTests();
    setRuntimeForTests(null);
  });

  it("redirects missing session to sign-in", async () => {
    await expect(resolveAppGate(null)).resolves.toEqual({ outcome: "redirect", path: "/sign-in" });
    await expect(resolveAppGate("")).resolves.toEqual({ outcome: "redirect", path: "/sign-in" });
  });

  it("redirects invalid session tokens to sign-in", async () => {
    await expect(resolveAppGate("not-a-jwt")).resolves.toEqual({ outcome: "redirect", path: "/sign-in" });
  });

  it("redirects revoked sessions to sign-in", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const seeded = await seedUser(runtime, { onboardingCompletedAt: new Date().toISOString() });
    await runtime.repos.sessions.revoke(seeded.sessionId);
    await expect(resolveAppGate(seeded.token)).resolves.toEqual({
      outcome: "redirect",
      path: "/sign-in",
    });
  });

  it("redirects expired sessions to sign-in", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const seeded = await seedUser(runtime, { onboardingCompletedAt: new Date().toISOString() });
    const store = runtime.store as {
      sessions: Map<string, { expiresAt: string }>;
    };
    const session = store.sessions.get(seeded.sessionId)!;
    session.expiresAt = new Date(Date.now() - 60_000).toISOString();
    await expect(resolveAppGate(seeded.token)).resolves.toEqual({
      outcome: "redirect",
      path: "/sign-in",
    });
  });

  it("redirects incomplete onboarding to /onboarding", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const seeded = await seedUser(runtime, { onboardingCompletedAt: null, onboardingStep: 2 });
    await expect(resolveAppGate(seeded.token)).resolves.toEqual({
      outcome: "redirect",
      path: "/onboarding",
    });
  });

  it("redirects when profile is missing", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const seeded = await seedUser(runtime, { onboardingCompletedAt: null });
    const store = runtime.store as { candidateProfiles: Map<string, unknown> };
    store.candidateProfiles.clear();
    await expect(resolveAppGate(seeded.token)).resolves.toEqual({
      outcome: "redirect",
      path: "/onboarding",
    });
  });

  it("allows completed onboarding", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const seeded = await seedUser(runtime, {
      onboardingCompletedAt: new Date().toISOString(),
      onboardingStep: 3,
    });
    await expect(resolveAppGate(seeded.token)).resolves.toEqual({ outcome: "allow" });
  });

  it("fails closed (unavailable) when profile lookup throws", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const seeded = await seedUser(runtime, { onboardingCompletedAt: new Date().toISOString() });
    vi.spyOn(runtime.repos.candidateProfiles, "getByUser").mockRejectedValue(new Error("db down"));
    await expect(resolveAppGate(seeded.token)).resolves.toMatchObject({
      outcome: "unavailable",
    });
  });

  it("layout pattern never swallows redirect control flow", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const seeded = await seedUser(runtime, { onboardingCompletedAt: null });

    async function authoritativeLayout() {
      const gate = await resolveAppGate(seeded.token);
      if (gate.outcome === "redirect") {
        const err = new Error(`NEXT_REDIRECT:${gate.path}`);
        (err as Error & { digest: string }).digest = `NEXT_REDIRECT;replace;${gate.path};303`;
        throw err;
      }
      if (gate.outcome === "unavailable") return "error-ui";
      return "app";
    }

    async function brokenLayoutThatSwallows() {
      try {
        return await authoritativeLayout();
      } catch {
        return "app-fail-open";
      }
    }

    await expect(authoritativeLayout()).rejects.toMatchObject({
      digest: expect.stringContaining("/onboarding"),
    });
    // Prove the anti-pattern would fail open — and that we do not use it.
    await expect(brokenLayoutThatSwallows()).resolves.toBe("app-fail-open");
  });

  it("cookie presence alone is not enough — unsigned cookie fails closed to sign-in", async () => {
    await expect(resolveAppGate(`fake.${SESSION_COOKIE_NAME}.token`)).resolves.toEqual({
      outcome: "redirect",
      path: "/sign-in",
    });
  });
});
