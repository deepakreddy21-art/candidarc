/** @vitest-environment node */
import { randomUUID } from "crypto";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  createEmptyMemoryStore,
  MemoryRepositories,
  newId,
} from "../../server/database/repositories";
import { resetRuntimeForTests, setRuntimeForTests, type Runtime } from "../../server/bootstrap";
import { ProfileService } from "../../server/modules/profile/service";
import { hashPassword } from "../../server/auth/password";
import { createSession, hashToken } from "../../server/auth/session";
import { ensureCsrfCookie } from "../../server/http/csrf";

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

async function seedAuthedUser(runtime: Runtime) {
  const passwordHash = await hashPassword("OnboardTest!123");
  const user = await runtime.repos.users.create({
    id: newId("usr"),
    publicId: newId("usp"),
    email: `route-${newId("e")}@example.com`,
    emailVerified: true,
    passwordHash,
    name: "Route Candidate",
  });
  const tenant = await runtime.repos.users.createTenant({
    publicId: newId("tep"),
    name: "Route Tenant",
    plan: "free",
  });
  await runtime.repos.users.createMembership({
    tenantId: tenant.id,
    userId: user.id,
    role: "owner",
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
  const csrfProbe = new Response();
  const csrf = ensureCsrfCookie(csrfProbe);
  const cookie = `${session.cookie.split(";")[0]}; candidarc_csrf=${encodeURIComponent(csrf)}`;
  return { user, tenant, cookie, csrf };
}

describe("onboarding route handlers", () => {
  beforeEach(() => {
    process.env.CSRF_SECRET = "candidarc-dev-csrf-secret-change-me!!!!";
    resetRuntimeForTests();
    setRuntimeForTests(buildRuntime());
  });

  afterEach(() => {
    resetRuntimeForTests();
    setRuntimeForTests(null);
  });

  it("loads and patches onboarding progress for the session owner", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const { cookie, csrf } = await seedAuthedUser(runtime);
    const { GET, PATCH } = await import("../../src/app/api/v1/profile/onboarding/route");

    const getRes = await GET(
      new Request("http://localhost:3000/api/v1/profile/onboarding", {
        headers: { cookie },
      }),
    );
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.step).toBe(0);
    expect(getBody.completedAt).toBeNull();
    expect(getBody.version).toBeGreaterThan(0);

    const patchRes = await PATCH(
      new Request("http://localhost:3000/api/v1/profile/onboarding", {
        method: "PATCH",
        headers: {
          cookie,
          "content-type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({
          step: 1,
          expectedVersion: getBody.version,
          data: { targetRoles: ["Platform Engineer"], seniority: "senior" },
        }),
      }),
    );
    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.step).toBe(1);
    expect(patchBody.profile.targetRoleFamilies).toEqual(["Platform Engineer"]);
  });

  it("rejects unauthenticated access", async () => {
    const { GET } = await import("../../src/app/api/v1/profile/onboarding/route");
    const res = await GET(new Request("http://localhost:3000/api/v1/profile/onboarding"));
    expect(res.status).toBeGreaterThanOrEqual(401);
  });

  it("rejects completion when validation fails without writing completedAt", async () => {
    const runtime = await (await import("../../server/bootstrap")).getRuntime();
    const { cookie, csrf, user, tenant } = await seedAuthedUser(runtime);
    const { PATCH, GET } = await import("../../src/app/api/v1/profile/onboarding/route");

    const res = await PATCH(
      new Request("http://localhost:3000/api/v1/profile/onboarding", {
        method: "PATCH",
        headers: {
          cookie,
          "content-type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({ completed: true }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error?.code).toBe("ONBOARDING_VALIDATION");

    const getRes = await GET(
      new Request("http://localhost:3000/api/v1/profile/onboarding", {
        headers: { cookie },
      }),
    );
    const getBody = await getRes.json();
    expect(getBody.completedAt).toBeNull();
    const profile = await runtime.repos.candidateProfiles.getByUser(tenant.id, user.id);
    expect(profile?.onboardingCompletedAt ?? null).toBeNull();
  });
});
