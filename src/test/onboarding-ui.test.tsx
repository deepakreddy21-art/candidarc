/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChipInput, MultiToggle } from "@/components/onboarding/chip-input";
import {
  formToPayload,
  normalizeList,
  validateStepClient,
  emptyOnboardingForm,
} from "@/components/onboarding/types";
import { mergeExtractionPreservingPreferences } from "@/lib/onboarding-form-map";

describe("onboarding helpers", () => {
  it("normalizes whitespace and duplicate titles", () => {
    expect(normalizeList(["  Platform  Engineer ", "platform engineer", "ML Engineer"])).toEqual([
      "Platform Engineer",
      "ML Engineer",
    ]);
  });

  it("requires target roles and seniority on step 0", () => {
    const form = emptyOnboardingForm();
    expect(validateStepClient(0, form)).toMatch(/target role/i);
    form.targetRoles = ["Backend Engineer"];
    expect(validateStepClient(0, form)).toMatch(/seniority/i);
    form.seniority = "senior";
    expect(validateStepClient(0, form)).toBeNull();
  });

  it("requires job types and workplace modes on step 1", () => {
    const form = emptyOnboardingForm();
    form.jobTypes = ["full-time"];
    expect(validateStepClient(1, form)).toMatch(/workplace/i);
    form.workplaceModes = ["remote"];
    expect(validateStepClient(1, form)).toBeNull();
  });

  it("allows confirmed upload path without manual employment", () => {
    const form = emptyOnboardingForm();
    form.fullName = "";
    expect(validateStepClient(2, form, "confirmed")).toBeNull();
  });

  it("maps form payload for persistence", () => {
    const form = emptyOnboardingForm();
    form.targetRoles = ["  SWE ", "swe"];
    form.seniority = "mid";
    form.jobTypes = ["full-time"];
    form.workplaceModes = ["hybrid"];
    const payload = formToPayload(form);
    expect(payload.targetRoles).toEqual(["SWE"]);
    expect(payload.seniority).toBe("mid");
  });

  it("upload extraction merge does not overwrite role or work-preference fields", () => {
    const form = emptyOnboardingForm();
    form.targetRoles = ["Platform Engineer"];
    form.seniority = "senior";
    form.jobTypes = ["full-time"];
    form.workplaceModes = ["remote"];
    form.preferredLocations = ["Austin"];
    form.fullName = "Keep Me";
    const merged = mergeExtractionPreservingPreferences(form, {
      contact: { fullName: "Parsed Name", email: "parsed@example.com" },
      skills: ["Go"],
      employment: [{ title: "Parsed", company: "Corp", bullets: [] }],
      education: [],
      projects: [],
      certifications: [],
      evidence: [],
    });
    expect(merged.targetRoles).toEqual(["Platform Engineer"]);
    expect(merged.seniority).toBe("senior");
    expect(merged.jobTypes).toEqual(["full-time"]);
    expect(merged.workplaceModes).toEqual(["remote"]);
    expect(merged.preferredLocations).toEqual(["Austin"]);
    expect(merged.fullName).toBe("Keep Me");
    expect(merged.skills).toContain("Go");
  });
});

describe("ChipInput", () => {
  it("adds and removes chips with accessible labels", async () => {
    const user = userEvent.setup();
    const values: string[] = [];
    const onChange = (next: string[]) => {
      values.splice(0, values.length, ...next);
      rerender(
        <ChipInput id="roles" label="Target job titles" values={[...values]} onChange={onChange} />,
      );
    };
    const { rerender } = render(
      <ChipInput id="roles" label="Target job titles" values={values} onChange={onChange} />,
    );
    expect(screen.getByLabelText("Target job titles")).toBeTruthy();
    await user.type(screen.getByLabelText("Target job titles"), "Platform Engineer{Enter}");
    expect(values).toContain("Platform Engineer");
    await user.click(screen.getByRole("button", { name: /remove platform engineer/i }));
    expect(values).not.toContain("Platform Engineer");
  });
});

describe("MultiToggle", () => {
  it("supports multi-select", async () => {
    const user = userEvent.setup();
    let values: string[] = [];
    const onChange = (next: string[]) => {
      values = next;
      rerender(
        <MultiToggle
          legend="Job types"
          options={[
            { value: "full-time", label: "Full-time" },
            { value: "contract", label: "Contract" },
          ]}
          values={values}
          onChange={onChange}
        />,
      );
    };
    const { rerender } = render(
      <MultiToggle
        legend="Job types"
        options={[
          { value: "full-time", label: "Full-time" },
          { value: "contract", label: "Contract" },
        ]}
        values={values}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Full-time" }));
    await user.click(screen.getByRole("button", { name: "Contract" }));
    expect(values).toEqual(["full-time", "contract"]);
  });
});
