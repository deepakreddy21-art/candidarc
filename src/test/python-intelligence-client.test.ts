/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  mapProviderUsage,
  mapPythonResumeToTs,
  pythonResumeSchema,
  toSnakeEvidence,
  toSnakeFinding,
} from "../../server/intelligence/python-client";

describe("python intelligence client mapping", () => {
  it("maps python resume JSON into TypeScript resume schema fields", () => {
    const parsed = pythonResumeSchema.parse({
      absolute_version: 5,
      cycle_step: 0,
      version_number: 5,
      score: 70,
      score_breakdown: {
        atsCompatibility: 71,
        jobAlignment: 72,
        recruiterReadability: 73,
        impact: 74,
        quantification: 75,
        technicalDepth: 76,
        competencyCoverage: 77,
        evidenceConfidence: 78,
        writingQuality: 79,
        formatIntegrity: 80,
      },
      notes: "grounded",
      sections: [
        {
          type: "summary",
          title: "Professional Summary",
          order: 0,
          bullets: [
            {
              text: "Engineer with evidence",
              evidence_ids: ["ev-1"],
              matched_requirements: [],
              technologies: ["Python"],
              confidence: "high",
              claim_risk: "low",
              source_version: "career-evidence",
            },
          ],
        },
      ],
    });
    const mapped = mapPythonResumeToTs(parsed);
    expect(mapped.versionNumber).toBe(5);
    expect(mapped.scoreBreakdown.evidenceConfidence).toBe(78);
    expect(mapped.sections[0]?.bullets?.[0]?.evidenceIds).toEqual(["ev-1"]);
    expect(mapped.sections[0]?.bullets?.[0]?.claimRisk).toBe("low");
  });

  it("requires explicit evidence verification fields when mapping", () => {
    const mapped = toSnakeEvidence({
      id: "ev-1",
      tenantId: "t1",
      ownerUserId: "u1",
      title: "Ship API",
      verificationStatus: "user_attested",
      candidateConfirmationStatus: "confirmed",
      confidence: "high",
      metrics: [{ label: "latency", value: "40", unit: "%" }],
    });
    expect(mapped.verification_status).toBe("user_attested");
    expect(mapped.candidate_confirmation_status).toBe("confirmed");
    expect(mapped.confidence).toBe("high");
    expect(mapped.metrics?.[0]).toContain("latency");
  });

  it("maps nit severity to suggestion and preserves provider usage tokens", () => {
    const finding = toSnakeFinding({
      severity: "nit",
      section: "summary",
      title: "Tighten wording",
      explanation: "Prefer stronger verbs",
      beforeText: "Did stuff",
      suggestedText: "Delivered outcomes",
      expectedScoreImpact: 1,
    });
    expect(finding.severity).toBe("suggestion");

    const usage = mapProviderUsage({
        provider: "mock",
        model: "mock-generation-v1",
        prompt_version: "resume-generation@python-v2",
        latency_ms: 12,
        input_tokens: 120,
        output_tokens: 80,
        estimated_cost_cents: null,
        retry_count: 0,
      });
    expect(usage.inputTokens).toBe(120);
    expect(usage.outputTokens).toBe(80);
    expect(usage.estimatedCostCents).toBe(0);
  });
});
