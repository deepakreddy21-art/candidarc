import { describe, expect, it } from "vitest";
import {
  adjudicateFinding,
  buildAdjudicationContext,
} from "../../server/resumes/audit-adjudication";
import { computeCandidArcQualityScore } from "../../server/resumes/quality-score";

describe("audit adjudication", () => {
  const ctx = buildAdjudicationContext({
    evidence: [
      {
        publicId: "ev_1",
        technologies: ["Python", "AWS"],
        title: "Platform work",
        result: "Reduced latency 40%",
        actions: ["Built APIs"],
      },
    ],
    attestedTechnologies: ["Python", "AWS"],
  });

  it("auto-accepts grammar and clarity improvements", () => {
    const result = adjudicateFinding(
      {
        publicId: "f1",
        severity: "minor",
        section: "experience",
        title: "Improve clarity",
        explanation: "Fix grammar and formatting for readability",
        beforeText: "Helped with APIs",
        suggestedText: "Built APIs that served production traffic",
        evidenceSource: "ev_1",
        status: "open",
      },
      ctx,
    );
    expect(result.decision).toBe("accepted");
  });

  it("rejects unsupported technology claims", () => {
    const result = adjudicateFinding(
      {
        publicId: "f2",
        severity: "major",
        section: "experience",
        title: "Add Kubernetes",
        explanation: "Mention Kubernetes experience",
        beforeText: "Deployed services on AWS",
        suggestedText: "Deployed services on Kubernetes and AWS",
        evidenceSource: "ev_1",
        status: "open",
      },
      ctx,
    );
    expect(result.decision).toBe("rejected");
    expect(result.reason).toMatch(/Unsupported technology/i);
  });

  it("rejects converting team results into individual ownership", () => {
    const result = adjudicateFinding(
      {
        publicId: "f3",
        severity: "major",
        section: "experience",
        title: "Strengthen ownership",
        explanation: "Make ownership clearer with metrics",
        beforeText: "Our team reduced latency 40%",
        suggestedText: "I solely owned and reduced latency 40%",
        evidenceSource: "ev_1",
        status: "open",
      },
      ctx,
    );
    expect(result.decision).toBe("rejected");
  });
});

describe("CandidArc Quality Score", () => {
  it("labels deterministic checks as verified and AI values as estimates", () => {
    const report = computeCandidArcQualityScore({
      sections: [
        {
          type: "experience",
          items: [
            {
              bullets: [
                {
                  text: "Built Python APIs on AWS and reduced latency 40%",
                  evidenceIds: ["ev_1"],
                },
                {
                  text: "Responsible for various Kubernetes work",
                  unsupported: true,
                  claimRisk: "high",
                },
              ],
            },
          ],
        },
      ],
      contact: { email: "a@b.com", phone: "1", location: "Remote", linkedIn: "https://linkedin.com/in/a" },
      jobRequirements: ["python", "aws"],
      knownTechnologies: ["Python", "AWS"],
      aiRoleAlignment: 82,
      aiAtsReadability: 88,
    });

    expect(report.name).toBe("CandidArc Quality Score");
    expect(report.summary).toMatch(/not a VMock score/i);
    expect(report.checks.some((c) => c.kind === "verified")).toBe(true);
    expect(report.aiEstimates.some((line) => /AI estimate/i.test(line))).toBe(true);
    expect(report.score).toBeGreaterThan(0);
  });
});
