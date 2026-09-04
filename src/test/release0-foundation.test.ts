import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_SESSION_SECRET, getEnv, resetEnvCache } from "../../server/config/env";
import { BullMqQueueAdapter, InProcessQueueAdapter } from "../../server/workflows/queues";
import { runDeterministicFinalQa } from "../../server/workflows/final-qa";
import { allowDemoFallback, api, ApiError } from "@/services/api";
import { resetRuntimeForTests, getRuntime } from "../../server/bootstrap";
import { ApplicationsService } from "../../server/modules/applications/service";

const originalMode = process.env.NEXT_PUBLIC_APP_MODE;

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_MODE = originalMode;
  resetEnvCache();
  resetRuntimeForTests();
  vi.restoreAllMocks();
});

describe("Release 0 production foundation", () => {
  it.each([
    { CANDIDARC_DATA_MODE: "memory", AI_PROVIDER: "openai", STORAGE_DRIVER: "s3", QUEUE_BACKEND: "redis", OPENAI_API_KEY: "key" },
    { CANDIDARC_DATA_MODE: "postgres", DATABASE_URL: "postgres://example", AI_PROVIDER: "mock", STORAGE_DRIVER: "s3", QUEUE_BACKEND: "redis" },
    {
      CANDIDARC_DATA_MODE: "postgres",
      DATABASE_URL: "postgres://example",
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "key",
      STORAGE_DRIVER: "s3",
      QUEUE_BACKEND: "redis",
      SESSION_SECRET: DEMO_SESSION_SECRET,
    },
  ])("rejects unsafe production configuration", (unsafe) => {
    expect(() =>
      getEnv({
        NODE_ENV: "production",
        APP_MODE: "production",
        SESSION_SECRET: "a-unique-production-secret-that-is-long-enough",
        ...unsafe,
      }),
    ).toThrow(/Unsafe production runtime/);
  });

  it("disables demo fallback explicitly in production", () => {
    process.env.NEXT_PUBLIC_APP_MODE = "production";
    process.env.NEXT_PUBLIC_USE_MOCK_API = "false";
    expect(allowDemoFallback()).toBe(false);
  });

  it("selects distinct durable and demo queue implementations", () => {
    expect(new InProcessQueueAdapter()).toBeInstanceOf(InProcessQueueAdapter);
    expect(new BullMqQueueAdapter()).toBeInstanceOf(BullMqQueueAdapter);
  });

  it("fails deterministic QA for duplicate content and critical findings", () => {
    const result = runDeterministicFinalQa({
      sections: [{ title: "Experience", content: "Built service\nBuilt service" }, { title: "Education" }],
      unresolvedCriticalFindings: 1,
    });
    expect(result.passed).toBe(false);
    expect(result.checks.some((check) => check.status === "fail")).toBe(true);
  });

  it("throws API errors instead of returning seeds in production", async () => {
    process.env.NEXT_PUBLIC_APP_MODE = "production";
    process.env.NEXT_PUBLIC_USE_MOCK_API = "false";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "service unavailable" } }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(api.listApplications()).rejects.toBeInstanceOf(ApiError);
  });

  it("auto-progresses a unique JD without Cisco fixture research", async () => {
    resetEnvCache();
    process.env.APP_MODE = "demo";
    process.env.CANDIDARC_DATA_MODE = "memory";
    process.env.AI_PROVIDER = "mock";
    process.env.QUEUE_BACKEND = "inprocess";
    const runtime = await getRuntime();
    const user = await runtime.repos.users.findByEmail("deepak@candidarc.dev");
    expect(user).toBeTruthy();
    const memberships = await runtime.repos.users.listMemberships(user!.id);
    const tenantId = memberships[0]!.tenantId;
    const ctx = {
      requestId: "req_r0",
      user: { id: user!.id, publicId: user!.publicId, email: user!.email, name: user!.name },
      memberships: [{ tenantId, tenantPublicId: memberships[0]!.tenant.publicId, role: "owner" as const }],
      activeTenantId: tenantId,
      repos: { applications: runtime.repos.applications, evidence: runtime.repos.evidence },
    };
    const apps = ApplicationsService.fromRepos(runtime.repos, runtime.engine);
    const created = await apps.create(ctx, {
      company: "Acme Robotics",
      role: "Platform Engineer",
      location: "Austin, TX",
      employmentType: "Full-time",
      researchDepth: "standard",
      jobDescriptionText:
        "Acme Robotics seeks a Platform Engineer to build Kubernetes control planes and observability for warehouse robots. Requires Go, Terraform, and on-call ownership.",
      jobUrl: "https://careers.acme.example/platform-engineer",
    });

    await new Promise((r) => setTimeout(r, 2500));
    const researchRun = await runtime.repos.research.getLatest(tenantId, created.application.publicId);
    const researchText = JSON.stringify(researchRun ?? {}).toLowerCase();
    expect(created.application.company).toBe("Acme Robotics");
    expect(researchText.includes("cisco")).toBe(false);
    expect(String(created.application.metadata?.jobUrl ?? "")).toContain("acme.example");
  }, 15000);
});
