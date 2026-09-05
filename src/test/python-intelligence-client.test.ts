/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { mapPythonResumeToTs, pythonResumeSchema } from "../../server/intelligence/python-client";

describe("python intelligence client mapping", () => {
  it("maps python resume JSON into TypeScript resume schema fields", () => {
    const parsed = pythonResumeSchema.parse({
      version_number: 0,
      score: 70,
      score_breakdown: { atsCompatibility: 70 },
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
    expect(mapped.versionNumber).toBe(0);
    expect(mapped.sections[0]?.bullets?.[0]?.evidenceIds).toEqual(["ev-1"]);
    expect(mapped.sections[0]?.bullets?.[0]?.claimRisk).toBe("low");
  });
});
