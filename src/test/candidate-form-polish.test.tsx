import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChipInput } from "@/components/onboarding/chip-input";
import { CareerSections } from "@/components/onboarding/career-sections";
import { CareerReview } from "@/components/onboarding/career-review";
import { emptyOnboardingForm, formToPayload, type OnboardingFormState } from "@/components/onboarding/types";
import { ResumePreview } from "@/components/resumes/resume-preview";
import { buildResumeDocument } from "@/lib/resume-document";
import { customerNextAction } from "@/lib/application-presentation";

describe("candidate form interactions", () => {
  it("does not silently drop an attempted name clear from the save payload", () => {
    expect(formToPayload(emptyOnboardingForm())).toHaveProperty("fullName", "");
  });
  it("commits a complete location on blur before the Save click", async () => {
    const user = userEvent.setup(); const save = vi.fn();
    function Form() {
      const [values, setValues] = useState<string[]>([]);
      return <><ChipInput id="cities" label="Preferred locations" values={values} onChange={setValues} commitOnComma={false} /><button onClick={() => save(values)}>Save</button></>;
    }
    render(<Form />);
    await user.type(screen.getByLabelText("Preferred locations"), "Chicago, IL");
    await user.click(screen.getByText("Save"));
    expect(save).toHaveBeenCalledWith(["Chicago, IL"]);
    expect(screen.getByRole("button", { name: "Remove Chicago, IL" })).toBeInTheDocument();
  });

  it("choosing a suggestion does not also commit the partial query", async () => {
    const user = userEvent.setup();
    function Form() {
      const [values, setValues] = useState<string[]>([]);
      return <ChipInput id="roles" label="Roles" values={values} onChange={setValues} suggestions={["Financial Analyst"]} />;
    }
    render(<Form />);
    await user.type(screen.getByLabelText("Roles"), "Fin");
    await user.click(screen.getByRole("button", { name: "Financial Analyst" }));
    expect(screen.queryByRole("button", { name: "Remove Fin" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Financial Analyst" })).toBeInTheDocument();
  });

  it("preserves spaces and trailing commas during typing, normalizing only the payload", async () => {
    const user = userEvent.setup(); const submit = vi.fn();
    function Form() {
      const [form, setForm] = useState<OnboardingFormState>({ ...emptyOnboardingForm(), careerProfileMode: "manual" as const, employment: [{ title: "Engineer", company: "Harbor", technologies: [] as string[] }] });
      return <><CareerSections form={form} sectionKeys={["employment"]} onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))} /><button onClick={() => submit(formToPayload(form))}>Save</button></>;
    }
    render(<Form />);
    await user.type(screen.getByLabelText("Role technologies 1"), "Spring Boot, Machine Learning, ");
    expect(screen.getByLabelText("Role technologies 1")).toHaveValue("Spring Boot, Machine Learning, ");
    await user.click(screen.getByText("Save"));
    expect(submit.mock.calls[0][0].employment[0].technologies).toEqual(["Spring Boot", "Machine Learning"]);
  });

  it("lets keyboard users choose a suggestion without saving the unfinished query", async () => {
    const user = userEvent.setup();
    function Form() {
      const [values, setValues] = useState<string[]>([]);
      return <ChipInput id="keyboard-roles" label="Roles" values={values} onChange={setValues} suggestions={["Financial Analyst"]} />;
    }
    render(<Form />);
    await user.type(screen.getByLabelText("Roles"), "Fin");
    await user.tab();
    expect(screen.getByRole("button", { name: "Financial Analyst" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("button", { name: "Remove Fin" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Financial Analyst" })).toBeInTheDocument();
  });

  it("offers one editor and restores a removed record without reverting other edits", async () => {
    const user = userEvent.setup();
    function Form() {
      const [form, setForm] = useState<OnboardingFormState>({ ...emptyOnboardingForm(), employment: [{ title: "Engineer", company: "Harbor" }], projects: [{ name: "Atlas" }] });
      return <CareerReview form={form} onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))} />;
    }
    render(<Form />);
    expect(screen.queryByLabelText("Employer 1")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit role 1" }));
    await user.click(screen.getByRole("button", { name: "Remove role 1" }));
    await user.click(screen.getByRole("button", { name: "Edit project 1" }));
    await user.clear(screen.getByLabelText("Project name 1"));
    await user.type(screen.getByLabelText("Project name 1"), "Revised Atlas");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("Harbor")).toBeInTheDocument();
    expect(screen.getByLabelText("Project name 1")).toHaveValue("Revised Atlas");
  });

  it("reads selection from the preview document and removes listeners on unmount", () => {
    const onSelection = vi.fn();
    const doc = buildResumeDocument({ sections: [], candidateName: "Jordan", role: "Engineer", company: "Harbor" });
    const { unmount } = render(<ResumePreview document={doc} onSelectionChange={onSelection} />);
    const frame = screen.getByTitle("Resume preview") as HTMLIFrameElement;
    const inner = frame.contentDocument!;
    inner.body.innerHTML = "<p>Built a reporting tool</p>";
    fireEvent.load(frame);
    const range = inner.createRange(); range.selectNodeContents(inner.querySelector("p")!);
    const selection = inner.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    fireEvent.mouseUp(inner);
    expect(onSelection).toHaveBeenLastCalledWith("Built a reporting tool");
    fireEvent.load(frame);
    expect(onSelection).toHaveBeenLastCalledWith("");
    unmount(); onSelection.mockClear(); fireEvent.mouseUp(inner);
    expect(onSelection).not.toHaveBeenCalled();
  });

  it("prioritizes application follow-up even when no resume was generated here", () => {
    expect(customerNextAction({ status: "draft", resumeScore: 0, nextAction: "", candidateStatus: "Applied" })).toBe("Follow up");
  });
});
