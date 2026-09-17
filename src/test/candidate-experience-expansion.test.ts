/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  draftCoverLetter,
  draftOutreach,
  interviewPrepFromEvidence,
  AssistantService,
} from "../../server/modules/assistant/service";
import { detectAts, fieldsReadyToFill, mapApprovedFields } from "../../server/copilot/ats-adapters";
import { matchesSponsorshipFilter } from "../../server/radar/sponsorship";
import { coerceJobSearchQueryInput, jobAlertBodySchema } from "../../server/radar/http";
import { refineResumeInputSchema } from "../../server/modules/resumes/customer-generate";
import { getSharedCatalog, resetSharedCatalogForTests, seedDemoCatalog } from "../../server/radar/catalog";
import type { ReusableAnswer } from "../../server/copilot/types";

describe("grounded cover letters and interview prep", () => {
  it("does not invent employment or a personal connection", () => {
    const drafted = draftCoverLetter({
      candidateName: "Ada",
      company: "Acme",
      role: "Engineer",
      extraction: {
        employment: [],
        education: [],
        projects: [],
        skills: [],
        certifications: [],
        evidence: [],
      },
    });
    expect(drafted.letter).toContain("Acme");
    expect(drafted.letter.toLowerCase()).not.toContain("my friend on the team");
    expect(drafted.caveats.some((c) => /no employment or project/i.test(c))).toBe(true);
  });

  it("uses attested employment when present", () => {
    const drafted = draftCoverLetter({
      candidateName: "Ada",
      company: "Acme",
      role: "Engineer",
      extraction: {
        employment: [{ title: "Platform engineer", company: "Globex", bullets: ["Shipped an API gateway"] }],
        education: [],
        projects: [],
        skills: ["TypeScript"],
        certifications: [],
        evidence: [],
      },
    });
    expect(drafted.letter).toContain("Globex");
    expect(drafted.letter).toContain("API gateway");
  });

  it("keeps outreach drafts from claiming an invented alumni match", () => {
    const drafted = draftOutreach({
      contactName: "Jordan",
      company: "Acme",
      role: "Engineer",
    });
    expect(drafted.draft).toContain("Jordan");
    expect(drafted.caveats.some((c) => /does not send/i.test(c))).toBe(true);
    expect(drafted.draft.toLowerCase()).not.toContain("we were classmates");
  });

  it("labels interview questions as generated, not sourced company questions", () => {
    const prep = interviewPrepFromEvidence({
      company: "Acme",
      role: "Engineer",
      extraction: {
        employment: [{ title: "SWE", company: "Globex", bullets: ["Built search"] }],
        education: [],
        projects: [],
        skills: [],
        certifications: [],
        evidence: [],
      },
    });
    expect(prep.sourced[0]).toMatch(/does not currently have a verified interview-question database/i);
    expect(prep.star[0]?.outline.situation).toContain("Globex");
  });
});

describe("assistant copilot isolation", () => {
  it("stores threads per tenant/user/context and requires approval for writes", () => {
    const service = new AssistantService();
    const ctxA = {
      requestId: "a",
      user: { id: "u1", publicId: "u1", email: "a@x.com", name: "A" },
      memberships: [{ tenantId: "t1", tenantPublicId: "t1", role: "owner" as const }],
      activeTenantId: "t1",
    };
    const ctxB = {
      requestId: "b",
      user: { id: "u2", publicId: "u2", email: "b@x.com", name: "B" },
      memberships: [{ tenantId: "t2", tenantPublicId: "t2", role: "owner" as const }],
      activeTenantId: "t2",
    };
    service.ask(ctxA, { contextType: "job", contextId: "job-1", message: "Why does this fit?" });
    service.ask(ctxA, { contextType: "job", contextId: "job-1", message: "Please edit my resume" });
    expect(service.getThread(ctxB, "job", "job-1").messages).toHaveLength(0);
    const thread = service.getThread(ctxA, "job", "job-1");
    expect(thread.messages.some((m) => m.proposedWrite)).toBe(true);
  });
});

describe("ATS autofill mapping", () => {
  const answers: ReusableAnswer[] = [
    {
      id: "a1",
      tenantId: "t",
      userId: "u",
      intent: "email",
      label: "Email",
      answer: "ada@example.com",
      confidence: "VERIFIED",
      source: "profile",
      sensitive: false,
      requiresApproval: false,
      approvedForOpportunityIds: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: "a2",
      tenantId: "t",
      userId: "u",
      intent: "sponsorship",
      label: "Sponsorship",
      answer: false,
      confidence: "SENSITIVE",
      source: "user",
      sensitive: true,
      requiresApproval: true,
      approvedForOpportunityIds: [],
      updatedAt: new Date().toISOString(),
    },
  ];

  it("maps Greenhouse fields and withholds unapproved sensitive answers", () => {
    expect(detectAts("boards.greenhouse.io")).toBe("greenhouse");
    const mapped = mapApprovedFields(answers, "greenhouse", "opp-1");
    expect(fieldsReadyToFill(mapped).some((f) => f.intent === "email")).toBe(true);
    expect(fieldsReadyToFill(mapped).some((f) => f.intent === "sponsorship")).toBe(false);
  });
});

describe("selected-text refine contract", () => {
  it("accepts selectedText without a Change template action", () => {
    const parsed = refineResumeInputSchema.parse({
      instruction: "Make this bullet more specific",
      selectedText: "Built APIs",
    });
    expect(parsed.selectedText).toBe("Built APIs");
  });
});

describe("sponsorship filters", () => {
  it("keeps historical company evidence distinct from stated posting sponsorship", () => {
    resetSharedCatalogForTests();
    seedDemoCatalog();
    const catalog = getSharedCatalog();
    const historical = catalog.search({ sponsorship: "historical", limit: 50 });
    const stated = catalog.search({ sponsorship: "stated", limit: 50 });
    expect(historical.results.some((r) => r.job.title.toLowerCase().includes("cx ai"))).toBe(true);
    expect(stated.results.some((r) => r.job.visaSponsorship === true)).toBe(true);
    expect(matchesSponsorshipFilter({ visaSponsorship: true }, "historical")).toBe(false);
  });
});

describe("alert payloads from Jobs filters", () => {
  it("accepts UI sort aliases and extra feed fields", () => {
    const parsed = jobAlertBodySchema.parse({
      name: "Hourly in-app matches",
      cadence: "hourly",
      channels: ["in_app"],
      query: {
        q: "AI",
        tab: "best",
        sort: "best_match",
        arrangement: "any",
        freshnessPreset: "7d",
        limit: 20,
      },
    });
    expect(parsed.query.keywords).toBe("AI");
    expect(parsed.query.sort).toBe("match");
    expect(coerceJobSearchQueryInput({ sort: "recently_discovered" })).toEqual({ sort: "discovered" });
  });
});
