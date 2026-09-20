/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), env: { AI_MODE: "live", LOG_LEVEL: "silent", BRAVE_SEARCH_API_KEY: "test-key" } }));
vi.mock("@server/config/env", () => ({ getEnv: () => mocks.env }));
vi.mock("@server/security/ssrf-fetch", async (original) => ({ ...await original<typeof import("@server/security/ssrf-fetch")>(), ssrfFetch: mocks.fetch }));
import { TeamResearchCollector } from "@server/research/team-collector";
import { extractTeamContext, researchCacheKey } from "@server/research/team-context";
import { researchQueries } from "@server/research/sources";
import { customerResearchSummary } from "@server/resumes/research-summary";
import { mapPythonEvidenceMatchToTs, toSnakeEvidence, toSnakeResearchFinding } from "@server/intelligence/python-client";

const context = { company: "Harbor", role: "Platform Engineer", team: "Payments", jobDescription: "Build services.", researchDepth: "deep-team" };
beforeEach(() => {
  vi.useFakeTimers();
  mocks.env.AI_MODE = "live"; mocks.env.BRAVE_SEARCH_API_KEY = "test-key";
  mocks.fetch.mockImplementation(async (url: string) => ({ url, body: Buffer.from(url.includes("api.search.brave.com")
    ? JSON.stringify({ web: { results: [{ url: "https://engineering.example/harbor", title: "Harbor engineering" }] } })
    : '<meta property="article:published_time" content="2026-09-01"><p>Harbor Payments uses PostgreSQL for payment services.</p>') }));
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
async function collect(collector: TeamResearchCollector, input = context, user = "u1", tenant = "t1") {
  const promise = collector.collect(input, tenant, user);
  await vi.advanceTimersByTimeAsync(2300);
  return promise;
}

describe("automatic company/team source collection", () => {
  it("searches deeply, deduplicates references, retains dates and reuses recent same-context results", async () => {
    const collector = new TeamResearchCollector();
    const first = await collect(collector);
    expect(first.status).toBe("available");
    expect(first.sources).toHaveLength(1);
    expect(first.sources[0].publishedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(mocks.fetch.mock.calls.filter(([url]) => url.includes("api.search.brave.com"))).toHaveLength(3);
    mocks.fetch.mockClear();
    expect((await collect(collector)).cached).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect((await collect(collector)).cached).toBe(false);
  });

  it("does not share source snapshots across owners, tenants or adjacent teams", async () => {
    const collector = new TeamResearchCollector();
    await collect(collector);
    expect((await collect(collector, context, "other-user")).cached).toBe(false);
    expect((await collect(collector, context, "u1", "other-tenant")).cached).toBe(false);
    expect((await collect(collector, { ...context, team: "Compute" })).cached).toBe(false);
    expect(researchCacheKey(context)).not.toBe(researchCacheKey({ ...context, jobDescription: "Different job" }));
  });

  it("coalesces simultaneous identical collection and gives callers independent copies", async () => {
    const collector = new TeamResearchCollector();
    const one = collector.collect(context, "t", "u");
    const two = collector.collect(context, "t", "u");
    await vi.advanceTimersByTimeAsync(2300);
    const [a, b] = await Promise.all([one, two]);
    a.sources[0].excerpt = "changed";
    expect(b.sources[0].excerpt).not.toBe("changed");
    expect(mocks.fetch.mock.calls.filter(([url]) => url.includes("api.search.brave.com"))).toHaveLength(3);
  });

  it("reports absent credentials and upstream failures without fake findings", async () => {
    mocks.env.BRAVE_SEARCH_API_KEY = "";
    const collector = new TeamResearchCollector();
    const absent = await collect(collector);
    expect(absent.status).toBe("unavailable");
    expect(absent.notice).toMatch(/not configured/);
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.env.BRAVE_SEARCH_API_KEY = "test-key";
    mocks.fetch.mockRejectedValue(new Error("search down"));
    const failed = await collect(collector);
    expect(failed.cached).toBe(false);
    expect(failed.status).toBe("unavailable");
    expect(failed.sources).toEqual([]);
  });

  it("finishes source collection within the budget when upstream never completes", async () => {
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    const pending = new TeamResearchCollector().collect(context, "t", "u");
    await vi.advanceTimersByTimeAsync(20_001);
    expect((await pending).status).toBe("unavailable");
  });

  it("labels demo research and makes no internet request", async () => {
    mocks.env.AI_MODE = "mock";
    const result = await collect(new TeamResearchCollector());
    expect(result.status).toBe("demo");
    expect(result.notice).toMatch(/no live company research/);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("uses named JD teams but does not guess technologies or force engineering on other jobs", () => {
    expect(extractTeamContext("About the Payments team\nBuild reliable services.")).toMatchObject({ team: "Payments" });
    expect(extractTeamContext("You will join the Cloud Infrastructure team to improve services.")).toMatchObject({ team: "Cloud Infrastructure" });
    expect(extractTeamContext("Team: Compute\nProduct: Cloud Service")).toMatchObject({ team: "Compute", product: "Cloud Service" });
    expect(extractTeamContext("Oracle needs distributed systems experience.").team).toBeUndefined();
    expect(researchQueries({ company: "Harbor", role: "Accountant" }).join(" ")).not.toMatch(/Kubernetes|engineering|deployment/);
  });
});

it("preserves source scope and plan across the Python boundary", () => {
  const mapped = toSnakeResearchFinding({ title: "Reliability", scope: "team", relationship: "stack_usage", sourceIds: ["s1"], supportingQuotes: [{ source_id: "s1", quote: "Harbor team operates payment services." }] });
  expect(mapped.supporting_quotes).toHaveLength(1);
  expect(mapped.scope).toBe("team");
  const plan = mapPythonEvidenceMatchToTs({ rows: [], evidence_coverage: 0, resume_plan: [{ capability: "Testing", rationale: "Relevant", basis: "role_practice", emphasis: "Use existing tests", placement: "skills" }] });
  expect(plan.resumePlan[0]).toMatchObject({ capability: "Testing", candidate_technologies: [], evidence_ids: [] });
  expect(toSnakeEvidence({ id: "e", tenantId: "t", ownerUserId: "u", title: "API project", organization: "School", payload: { source: "career-profile", kind: "project" } })).toMatchObject({ source_type: "project", project_association: "API project" });
});

it("exposes references without private evidence IDs or stored raw source excerpts", () => {
  const dto = customerResearchSummary({
    researchCollection: { status: "available", notice: "Sources retrieved", collectedAt: "2026-09-20", cached: false,
      sources: [{ url: "https://example.com/engineering", title: "Harbor", type: "public-reference", excerpt: "DO_NOT_SEND_RAW", accessedAt: "2026-09-20" }] },
    researchReferences: [{ id: "s1", url: "https://example.com/engineering" }],
    researchFindings: [{ title: "Delivery", category: "team", summary: "Team delivery practices", scope: "team", status: "verified", confidence: "high", sourceIds: ["s1"] }],
    resumePlan: [{ capability: "Testing", rationale: "Job", basis: "job_description", research_source_ids: [], evidence_ids: ["PRIVATE_ID"], candidate_technologies: [], placement: "experience", emphasis: "Testing work", gap: null }],
  });
  expect(dto?.findings[0].sources[0].url).toBe("https://example.com/engineering");
  expect(JSON.stringify(dto)).not.toMatch(/PRIVATE_ID|DO_NOT_SEND_RAW/);
});
