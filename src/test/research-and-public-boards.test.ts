import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), env: { APP_MODE: "production", LOG_LEVEL: "silent", BRAVE_SEARCH_API_KEY: "test-search-key" } }));
vi.mock("@server/security/ssrf-fetch", async (original) => ({ ...await original<typeof import("@server/security/ssrf-fetch")>(), ssrfFetch: mocks.fetch }));
vi.mock("@server/config/env", () => ({ getEnv: () => mocks.env }));
import { ConfiguredSearchAdapter, UrlFetchResearchAdapter, collectFromResearchAdapters } from "@server/research/sources";
import { LeverProvider } from "@server/radar/providers/lever";
import { AshbyProvider } from "@server/radar/providers/ashby";
import { GreenhouseProvider } from "@server/radar/providers/greenhouse";

afterEach(() => vi.clearAllMocks());
const context = { company: "Acme", role: "Engineer", jobUrl: "https://careers.example/job", researchDepth: "deep-team" };
const response = (body: unknown, url = "https://engineering.example/article") => ({ body: Buffer.from(typeof body === "string" ? body : JSON.stringify(body)), url });

describe("real source boundaries", () => {
  it("excludes failed and empty fetches instead of manufacturing source excerpts", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("network failure"));
    expect(await new UrlFetchResearchAdapter().collect(context)).toEqual([]);
    mocks.fetch.mockResolvedValueOnce(response(" "));
    expect(await new UrlFetchResearchAdapter().collect(context)).toEqual([]);
  });
  it("retrieves result pages without forwarding the search token", async () => {
    mocks.fetch.mockResolvedValueOnce(response({ web: { results: [{ url: "https://engineering.example/article", title: "Acme engineering" }] } }))
      .mockResolvedValueOnce(response("<p>Acme engineering uses PostgreSQL for its reporting service.</p>"));
    const sources = await new ConfiguredSearchAdapter().collect(context);
    expect(sources[0]).toMatchObject({ type: "public-reference", url: "https://engineering.example/article", confidence: "medium" });
    expect(sources[0].excerpt).toContain("PostgreSQL");
    expect(mocks.fetch.mock.calls[0][1].headers["X-Subscription-Token"]).toBe("test-search-key");
    expect(mocks.fetch.mock.calls[1][0]).toBe("https://engineering.example/article");
    expect(mocks.fetch.mock.calls[1][1]).not.toHaveProperty("headers");
    expect(mocks.fetch.mock.calls[1][1]).toMatchObject({ timeoutMs: 5000, maxRedirects: 1 });
  });
  it("rejects non-HTTP placeholder sources at the collector boundary", async () => {
    const sources = await collectFromResearchAdapters(context, [{ name: "old", collect: async () => [{ url: "search://roles/acme", title: "fake", excerpt: "would search", confidence: "low", accessedAt: "today", type: "search" }] }]);
    expect(sources).toEqual([]);
  });
});

describe("public ATS adapters", () => {
  it.each([new LeverProvider(), new AshbyProvider(), new GreenhouseProvider()])("does not substitute fixtures after a live $id fetch fails", async (provider) => {
    mocks.fetch.mockRejectedValueOnce(new Error("ATS unavailable"));
    await expect(provider.fetchBoard({ boardToken: "acme" })).rejects.toThrow("ATS unavailable");
  });
  it("normalizes Lever descriptions and preserves unknown publication time", async () => {
    mocks.fetch.mockResolvedValueOnce(response([{ id: "real-id", text: "Engineer", hostedUrl: "https://jobs.lever.co/acme/real-id", categories: { location: "Austin", commitment: "Full-time" }, descriptionPlain: "Build software", lists: [{ text: "Requirements", content: "<li>Python</li>" }] }]));
    const result = await new LeverProvider().fetchBoard({ boardToken: "acme", companyName: "Acme" });
    expect(result.listings[0]).toMatchObject({ sourceListingId: "real-id", companyName: "Acme", postedAt: null, demoData: false, remotePolicy: "unknown" });
    expect(result.listings[0].description).toContain("Python");
  });
  it("excludes unlisted Ashby jobs and respects explicit hybrid work", async () => {
    mocks.fetch.mockResolvedValueOnce(response({ jobs: [{ title: "Engineer", jobUrl: "https://jobs.ashbyhq.com/acme/real-id", isListed: true, workplaceType: "Hybrid", descriptionPlain: "Build software", employmentType: "FullTime" }, { title: "Private", jobUrl: "https://jobs.ashbyhq.com/acme/private", isListed: false }] }));
    const result = await new AshbyProvider().fetchBoard({ boardToken: "acme" });
    expect(result.listings).toHaveLength(1);
    expect(result.listings[0]).toMatchObject({ remotePolicy: "hybrid", employmentType: "Full-time" });
  });
});
