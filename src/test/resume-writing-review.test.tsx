import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { languageReviewForVersion, reviewResumeWriting } from "@/lib/resume-writing-review";
import { QualityReport } from "@/components/resumes/quality-report";
import { computeCandidArcQualityScore, attachQualityProvenance, selectFreshQualityReport } from "../../server/resumes/quality-score";
import { getPrompt } from "../../server/ai/prompt-registry";
import { adjudicateFinding, buildAdjudicationContext } from "../../server/resumes/audit-adjudication";

const sections = (texts: string[]) => [{ id: "work", type: "experience", title: "Professional Experience", items: [{ heading: "Harbor", subheading: "Engineer", bullets: texts.map((text) => ({ text, evidenceIds: ["ev_1"] })) }] }];

describe("resume writing review", () => {
  it("shows contextual AI feedback only for the reviewed version and keeps its warning visible", () => {
    const saved = { versionPublicId: "v1", checks: [
      { code: "NATURAL_PHRASING", status: "warn", detail: "Experience, bullet 1: use the ordinary implementation verb." },
    ] };
    expect(languageReviewForVersion(saved, "v2")).toEqual([]);
    expect(languageReviewForVersion(undefined, "v1")).toEqual([]);
    const languageReview = languageReviewForVersion(saved, "v1");
    expect(languageReview).toHaveLength(1);
    render(<QualityReport report={{ languageReview }} />);
    expect(screen.getByText(/Meaning and phrasing · AI review/)).toBeInTheDocument();
    expect(screen.getByText(saved.checks[0].detail).closest("details")).toHaveAttribute("open");
  });
  it("reviews all ten criteria without pretending missing competencies are failures", () => {
    const report = reviewResumeWriting({ sections: sections(["Diagnosed slow queries to reduce processing delays."]) });
    expect(report.criteria.map((item) => item.id)).toEqual(["repetition", "action_verbs", "specifics", "avoided_words", "length", "analytical", "communication", "leadership", "teamwork", "initiative"]);
    expect(report.criteria.find((item) => item.id === "leadership")?.status).toBe("not_observed");
    expect(report.criteria.find((item) => item.id === "analytical")?.status).toBe("signal_found");
    expect(report.findings).toEqual([]);
  });

  it("prefers precise opening verbs, allows accurate ordinary verbs, and never treats a mid-bullet verb as the opening", () => {
    const report = reviewResumeWriting({ sections: sections(["Responsible for work that optimized queries.", "Built Python services.", "Reconciled accounts for 3 departments.", "Supported customer accounts."]) });
    expect(report.findings.filter((item) => item.criterion === "action_verbs").map((item) => item.bulletIndex)).toEqual([0]);
    expect(report.findings.filter((item) => item.criterion === "action_verbs" && item.bulletIndex === 1)).toEqual([]);
  });

  it("flags repeated openings and duplicate prose, not repeated technology names", () => {
    const report = reviewResumeWriting({ sections: sections(["Diagnosed Python failures.", "Automated Python checks.", "Documented Python services.", "Optimized Python queries."]) });
    expect(report.findings.filter((item) => item.criterion === "repetition")).toEqual([]);
    const repeated = reviewResumeWriting({ sections: sections(["Implemented queue workers.", "Implemented billing checks.", "Implemented reporting jobs."]) });
    expect(repeated.findings.filter((item) => item.criterion === "repetition")).toHaveLength(3);
    expect(reviewResumeWriting({ sections: sections(["Resolved support cases.", "Resolved support cases."]) }).findings.filter((item) => item.criterion === "repetition")).toHaveLength(2);
  });

  it("recognizes genuine scope and qualitative outcomes, not versions or dates as impact", () => {
    const report = reviewResumeWriting({ sections: sections(["Implemented Java 21 services in 2024.", "Evaluated Python 3.12 libraries.", "Reduced reconciliation time by 25%.", "Supported three departments.", "Streamlined reporting to prevent duplicated work.", "Reconciled $40,000 in expenses."]) });
    expect(report.findings.filter((item) => item.criterion === "specifics").map((item) => item.bulletIndex)).toEqual([0, 1]);
  });

  it("reviews flat bullets and summary filler, excluding skills and duplicate mirrors", () => {
    const entry = sections(["Built API services."])[0];
    const report = reviewResumeWriting({ sections: [
      { ...entry, bullets: entry.items[0].bullets },
      { type: "projects", title: "Projects", bullets: [{ text: "Presented model findings." }] },
      { type: "skills", bullets: [{ text: "Python Java AWS" }] },
      { type: "summary", title: "Summary", content: "I am a results-driven engineer." },
    ] });
    expect(report.bulletCount).toBe(2);
    expect(report.findings.some((item) => item.section === "Summary" && item.criterion === "avoided_words")).toBe(true);
    expect(report.findings.some((item) => item.section === "skills")).toBe(false);
  });

  it("never rewrites source data or invents a measured page count", () => {
    const input = { sections: sections(["Built a reporting system."]), preferredLength: "two-page" };
    const before = JSON.stringify(input);
    const result = computeCandidArcQualityScore(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(result.checks.find((item) => item.id === "page_count")?.kind).toBe("not_evaluated");
    expect(result.checks.find((item) => item.id === "ats_order")?.passed).toBe(false);
    expect(reviewResumeWriting({ ...input, pageCount: 3 }).criteria.find((item) => item.id === "length")?.status).toBe("suggestion");
    expect(reviewResumeWriting({ sections: [] }).criteria.every((item) => item.status === "not_evaluated")).toBe(true);
  });

  it("does not treat requirement matches as candidate evidence or optional links as missing contact", () => {
    const report = computeCandidArcQualityScore({ sections: [{ type: "experience", bullets: [{ text: "Engineered a service.", matchedRequirements: ["API"] }] }], contact: { email: "j@example.com", phone: "+1 555 0100", location: "Chicago" } });
    expect(report.verifiedClaims).toBe(0);
    expect(report.checks.find((item) => item.id === "contact")?.score).toBe(100);
  });

  it("invalidates feedback for content, export length, and rubric changes even when version ID stays the same", () => {
    const make = (texts: string[], pageCount?: number) => attachQualityProvenance(computeCandidArcQualityScore({ sections: sections(texts), pageCount }), { versionPublicId: "v1" });
    const old = make(["Built services."]);
    const edited = make(["Diagnosed service failures."]);
    const exported = make(["Diagnosed service failures."], 3);
    expect(selectFreshQualityReport(old, edited)).toBe(edited);
    expect(selectFreshQualityReport(edited, exported)).toBe(exported);
    expect(selectFreshQualityReport({ ...exported, rubricVersion: "old" }, exported)).toBe(exported);
    expect(selectFreshQualityReport(exported, { ...exported })).toBe(exported);
  });

  it("passes the same grounded writing preferences through generation, all audits, and final QA", () => {
    for (const id of ["resume-generation", "hr-audit-1", "em-audit-1", "hr-audit-2", "em-audit-2", "final-qa"]) {
      expect(getPrompt(id).system).toContain("Choose the most accurate, natural action verb");
      expect(getPrompt(id).system).toContain("never invent percentages");
      expect(getPrompt(id).system).toContain("selected-text edit scope");
    }
  });

  it("blocks ownership inflation disguised as a minor style edit", () => {
    const ctx = buildAdjudicationContext({ evidence: [{ publicId: "ev_1", actions: ["Supported reporting implementation"], technologies: [] }, { publicId: "ev_2", actions: ["Led billing delivery"], technologies: [] }] });
    const finding = { publicId: "f1", severity: "minor", section: "experience", title: "Improve wording", explanation: "Stronger opening verb", beforeText: "Supported reporting implementation", suggestedText: "Spearheaded reporting implementation", evidenceSource: "ev_1", status: "open" };
    expect(adjudicateFinding(finding, ctx).decision).toBe("rejected");
    expect(adjudicateFinding({ ...finding, beforeText: "Led billing delivery", suggestedText: "Spearheaded billing delivery", evidenceSource: "ev_2" }, ctx).decision).toBe("accepted");
  });

  it("shows contextual feedback and hands the exact text to refinement without editing it", async () => {
    const user = userEvent.setup();
    const onReviewText = vi.fn();
    const report = computeCandidArcQualityScore({ sections: sections(["Responsible for reporting services."]) });
    render(<QualityReport report={report} onReviewText={onReviewText} />);
    await user.click(screen.getByText("Résumé quality review"));
    await user.click(screen.getByText("Action verbs"));
    const finding = screen.getByText(/Check the opening:/);
    expect(finding).toBeVisible();
    const button = finding.parentElement!.querySelector("button")!;
    await user.click(button);
    expect(onReviewText).toHaveBeenCalledWith("Responsible for reporting services.");
    expect(screen.queryByText(/Verified claims:/)).not.toBeInTheDocument();
  });
});
