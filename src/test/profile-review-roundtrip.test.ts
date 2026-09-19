import { describe, expect, it } from "vitest";
import { mergeExtraction, onboardingStepDataSchema } from "@server/modules/profile/onboarding";
import { adaptResumeExtractionV1ToV2 } from "@server/modules/resumes/text-extractor";
import { formToPatch, formToPayload } from "@/components/onboarding/types";
import { profileToForm } from "@/lib/onboarding-form-map";
import type { CandidateProfile, ResumeImportExtraction } from "@/types/domain";

const profile = { fullName: "Account Name", email: "account@example.com", phone: "old phone", location: "Old city", portfolio: "https://old.example", summary: "Old summary" } as CandidateProfile;
const original = {
  contact: { fullName: "Jordan Blake | Engineer", email: "resume@example.com", portfolio: "https://old.example" },
  professionalSummary: "Original summary",
  employment: [{ title: "Engineer", company: "Harbor", bullets: ["Built APIs"] }],
  education: [{ institution: "Northbridge University", degree: "MSc", field: "Computer Science", startDate: "2019", endDate: "2021" }],
  certificationEntries: [{ name: "Old certificate", issuer: "Issuer", issueDate: "2020", credentialId: "old" }],
  certifications: ["Old certificate"],
  skills: Array.from({ length: 64 }, (_, i) => `Skill ${i + 1}`),
  rawText: "resume@example.com",
};

function load(raw: Record<string, unknown>) {
  return profileToForm(profile, adaptResumeExtractionV1ToV2(raw) as ResumeImportExtraction);
}

describe("candidate review survives save, adapter and reload", () => {
  it("round-trips all 64 skills, school, dates, edited contact, summary and certificates", () => {
    const form = load(original);
    form.fullName = "Jordan Blake";
    form.email = "reviewed@example.com";
    form.portfolio = "";
    form.summary = "Reviewed summary";
    form.education[0].school = "Correct University";
    form.certifications[0] = { name: "New certificate", issuer: "New issuer", date: "2025", credentialId: "new" };
    const saved = mergeExtraction(original, onboardingStepDataSchema.parse(formToPayload(form)));
    const reloaded = load(saved);
    expect(reloaded.fullName).toBe("Jordan Blake");
    expect(reloaded.email).toBe("reviewed@example.com");
    expect(reloaded.portfolio).toBe("");
    expect(reloaded.summary).toBe("Reviewed summary");
    expect(reloaded.education[0]).toMatchObject({ school: "Correct University", field: "Computer Science", endDate: "2021" });
    expect(reloaded.certifications[0]).toMatchObject({ name: "New certificate", date: "2025", issuer: "New issuer", credentialId: "new" });
    expect(reloaded.skills).toHaveLength(64);
  });

  it("does not resurrect cleared sections, contact or summary from raw text and legacy aliases", () => {
    const saved = mergeExtraction(original, { email: "", phone: null, portfolio: null, summary: null, education: [], certifications: [], employment: [], skills: [] });
    const reloaded = load(saved);
    expect(reloaded.email).toBe("");
    expect(reloaded.phone).toBe("");
    expect(reloaded.summary).toBe("");
    expect(reloaded.education).toEqual([]);
    expect(reloaded.certifications).toEqual([]);
    expect(reloaded.employment).toEqual([]);
    expect(reloaded.skills).toEqual([]);
  });

  it("does not send untouched empty career controls during a preference save", () => {
    const baseline = profileToForm(profile, null);
    const form = { ...baseline, targetRoles: ["Engineer"] };
    const patch = formToPatch(form, baseline);
    expect(patch).toEqual({ onboardingFlowVersion: 3, targetRoles: ["Engineer"] });
    expect(mergeExtraction(original, onboardingStepDataSchema.parse(patch)).employment).toEqual(original.employment);
  });

  it("reads legacy school/date aliases without confusing a degree field with an institution", () => {
    const reloaded = load({ education: [{ school: "Legacy University", field: "Physics" }], certifications: [{ name: "Legacy", issuer: "Issuer", date: "2024" }] });
    expect(reloaded.education[0]).toMatchObject({ school: "Legacy University", field: "Physics" });
    expect(reloaded.certifications[0]).toMatchObject({ name: "Legacy", date: "2024", issuer: "Issuer" });
  });
});
