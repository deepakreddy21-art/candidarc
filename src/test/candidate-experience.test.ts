import { describe, expect, it } from "vitest";
import {
  assertHonestClaims,
  decideTechnologyClaim,
} from "@/lib/resume-evidence-policy";
import {
  customerNextAction,
  defaultCandidateStatus,
  mapResumeProgress,
} from "@/lib/application-presentation";
import { buildTeamSignals } from "@/lib/team-signals";
import { radarJobs } from "@/data/radar-seed";

describe("resume evidence policy", () => {
  it("exact evidence may ground skills and experience", () => {
    const d = decideTechnologyClaim({
      technology: "Kubernetes",
      hasExactEvidence: true,
      hasTransferableEvidence: true,
    });
    expect(d.placement).toBe("skills_and_experience");
    expect(d.mayClaimProductionUse).toBe(true);
    expect(d.mayInventEmployerOrProject).toBe(false);
    expect(assertHonestClaims(d)).toEqual([]);
  });

  it("public tech with transferable evidence stays skills-only", () => {
    const d = decideTechnologyClaim({
      technology: "Kafka",
      hasExactEvidence: false,
      hasTransferableEvidence: true,
      publicOrOpenSource: true,
    });
    expect(d.kind).toBe("transferable_public");
    expect(d.placement).toBe("skills_only");
    expect(d.mayClaimProductionUse).toBe(false);
  });

  it("proprietary signal uses transferable substitute", () => {
    const d = decideTechnologyClaim({
      technology: "AcmeInternalOrchestrator",
      hasExactEvidence: false,
      hasTransferableEvidence: true,
      transferableTechnology: "Kubernetes",
      proprietary: true,
    });
    expect(d.kind).toBe("proprietary");
    expect(d.placement).toBe("transferable_substitute");
    expect(d.substitute).toBe("Kubernetes");
    expect(d.mayClaimProductionUse).toBe(false);
  });

  it("no evidence becomes target skill / interview gap", () => {
    const d = decideTechnologyClaim({
      technology: "Rust",
      hasExactEvidence: false,
      hasTransferableEvidence: false,
      publicOrOpenSource: true,
    });
    expect(d.placement).toBe("target_skill_and_interview");
    expect(d.interviewGap).toBe(true);
    expect(d.mayInventMetrics).toBe(false);
  });
});

describe("application presentation", () => {
  it("maps workflow statuses to resume progress", () => {
    expect(mapResumeProgress({ status: "draft", resumeScore: 0, stage: "research" })).toBe("Not started");
    expect(mapResumeProgress({ status: "auditing", resumeScore: 40, stage: "hr-audit-1" })).toBe("Preparing");
    expect(mapResumeProgress({ status: "ready", resumeScore: 90, stage: "ready" })).toBe("Ready");
  });

  it("maps candidate application status without exposing audits", () => {
    expect(
      defaultCandidateStatus({
        status: "ready",
        interviewStatus: "not-started",
        archived: false,
        resumeScore: 90,
      }),
    ).toBe("Ready to apply");
    expect(
      customerNextAction({
        status: "ready",
        resumeScore: 90,
        nextAction: "Complete Final QA",
        candidateStatus: "Ready to apply",
      }),
    ).toBe("Apply on company site");
  });
});

describe("team signals", () => {
  it("builds source-backed signals and labels inferred results", () => {
    const job = radarJobs[0]!;
    const signals = buildTeamSignals(job);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => s.confidence === "high" || s.confidence === "medium" || s.confidence === "low")).toBe(
      true,
    );
  });
});
