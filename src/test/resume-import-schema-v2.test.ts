import { describe, expect, it } from "vitest";
import { adaptResumeExtractionV1ToV2, normalizeResumeText } from "../../server/modules/resumes/text-extractor";
import { mapPythonResumeParseToExtraction } from "../../server/modules/resumes/python-extraction-mapper";
import { mergeExtractionPreservingPreferences, profileToForm } from "@/lib/onboarding-form-map";
import { emptyOnboardingForm, validateStepClient } from "@/components/onboarding/types";
import { RICH_STRUCTURED_RESUME, COMPOUND_NAME_RESUME, PROFESSIONAL_EXPERIENCE_RESUME } from "./fixtures/resume-samples";

describe("resume import schema v2", () => {
  it("structures rich résumé fields without inventing missing data", () => {
    const extraction = normalizeResumeText(RICH_STRUCTURED_RESUME);
    expect(extraction.schemaVersion).toBe(2);
    expect(extraction.contact?.fullName).toContain("Vasquez");
    expect(extraction.contact?.email).toBe("maria.vasquez@example.com");
    expect(extraction.professionalSummary).toMatch(/Platform engineer/i);
    expect(extraction.employment).toHaveLength(2);
    expect(extraction.employment[0]?.company).toBe("Riverbend Analytics");
    expect(extraction.employment[0]?.bullets.length).toBeGreaterThanOrEqual(2);
    expect(extraction.employment[0]?.technologies ?? []).not.toEqual(expect.arrayContaining(extraction.skills));
    expect(extraction.projects[0]?.name).toMatch(/Campus Lab Scheduler/i);
    expect(extraction.education.length).toBeGreaterThanOrEqual(1);
    expect(extraction.skills).toEqual(expect.arrayContaining(["TypeScript", "Python", "AWS"]));
    expect(extraction.certifications.some((c) => /AWS Solutions Architect/i.test(c))).toBe(true);
    expect(extraction.publications?.[0]?.title).toMatch(/Reliable Batch/i);
    // Global skills must not be copied onto every employer.
    for (const job of extraction.employment) {
      expect(job.technologies ?? []).not.toEqual(expect.arrayContaining(extraction.skills));
    }
  });

  it("adapts legacy v1 string certifications into v2 entries", () => {
    const adapted = adaptResumeExtractionV1ToV2({
      schemaVersion: 1,
      employment: [],
      education: [],
      projects: [],
      skills: ["Python"],
      certifications: ["AWS SAA"],
      evidence: [],
      rawText: "",
      parseWarnings: [],
    });
    expect(adapted?.schemaVersion).toBe(2);
    expect(adapted?.certificationEntries?.[0]?.name).toBe("AWS SAA");
    expect(adapted?.certifications).toEqual(["AWS SAA"]);
  });

  it("maps python parse payload including publications and name parts", () => {
    const mapped = mapPythonResumeParseToExtraction({
      schema_version: 2,
      text: COMPOUND_NAME_RESUME,
      contact: {
        full_name: "Jean-Luc O'Connor-Nguyen",
        first_name: "Jean-Luc",
        last_name: "O'Connor-Nguyen",
        email: "jean.oconnor@example.com",
        emails: ["jean.oconnor@example.com"],
      },
      professional_summary: null,
      employment: [],
      education: [{ institution: "Northern College", degree: "B.S. Mathematics", end_date: "2020" }],
      projects: [],
      skills: ["Python", "FastAPI"],
      certifications: [],
      certification_entries: [],
      publications: [
        {
          title: "Sample Paper",
          authors: ["Jean-Luc O'Connor-Nguyen"],
          publisher: "Demo Journal",
          publication_date: "2021",
          doi: "10.1000/demo.2021.1",
        },
      ],
      evidence: [],
      usable: true,
    });
    expect(mapped.contact?.firstName).toBe("Jean-Luc");
    expect(mapped.publications?.[0]?.doi).toBe("10.1000/demo.2021.1");
    expect(mapped.education[0]?.institution).toBe("Northern College");
  });

  it("hydrates onboarding form from extraction and skips re-asking employment when ready", () => {
    const extraction = normalizeResumeText(PROFESSIONAL_EXPERIENCE_RESUME);
    const form = profileToForm(
      {
        id: "cp_1",
        fullName: "",
        preferredName: "",
        email: "",
        phone: "",
        location: "",
        linkedIn: "",
        github: "",
        portfolio: "",
        headline: "",
        summary: "",
        experienceLevel: "experienced",
        yearsExperience: 0,
        targetRoleFamilies: ["Platform Engineer"],
        preferredResumeLength: "one-page",
        careerGoal: "",
        avatarInitials: "JB",
      },
      extraction,
    );
    expect(form.fullName).toMatch(/Jordan Blake/i);
    expect(form.employment.length).toBe(2);
    expect(form.employment[0]?.bullets?.length ?? 0).toBeGreaterThan(0);
    expect(validateStepClient(2, form, "ready_for_review")).toBeNull();
  });

  it("mergeExtractionPreservingPreferences keeps target roles", () => {
    const prev = emptyOnboardingForm();
    prev.targetRoles = ["ML Engineer"];
    prev.seniority = "senior";
    const merged = mergeExtractionPreservingPreferences(prev, normalizeResumeText(PROFESSIONAL_EXPERIENCE_RESUME));
    expect(merged.targetRoles).toEqual(["ML Engineer"]);
    expect(merged.employment.length).toBeGreaterThan(0);
  });
});
