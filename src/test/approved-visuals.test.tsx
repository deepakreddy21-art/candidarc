import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreatingState } from "@/components/resumes/creating-state";
import { StepCareerProfile } from "@/components/onboarding/step-career-profile";
import { emptyOnboardingForm } from "@/components/onboarding/types";
import { OnboardingShell } from "@/components/onboarding/shell";

function importedForm() {
  return { ...emptyOnboardingForm(), careerProfileMode: "upload" as const, fullName: "Actual Candidate", email: "candidate@example.com", phone: "+1 312 555 0111", location: "Chicago, IL", employment: [{ title: "Engineer", company: "Real Employer", bullets: ["Built a reporting tool"], startDate: "2022", endDate: "2024" }], education: [{ school: "Real University", degree: "M.S.", field: "Computer Science" }], projects: [{ name: "My project", bullets: ["Built a tool"], technologies: ["Python"] }] };
}

describe("approved visual workflows", () => {
  it("ties artwork and progress to server state without showing sample candidate claims", () => {
    const { container, rerender } = render(<CreatingState pipelineStage="understanding" />);
    expect(container.querySelector(".resume-motion-scene")).toHaveAttribute("data-stage", "understanding");
    expect(screen.queryByText("Jordan Lee")).not.toBeInTheDocument();
    expect(screen.queryByText("Ready for your review")).not.toBeInTheDocument();
    rerender(<CreatingState pipelineStage="preparing" elapsedMs={60_000} />);
    expect(container.querySelector(".resume-motion-scene")).toHaveAttribute("data-stage", "preparing");
    expect(screen.getByText("Checking your résumé").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.queryByText("Ready for your review")).not.toBeInTheDocument();
    rerender(<CreatingState pipelineStage="tailoring" needsInput><button>Submit details</button></CreatingState>);
    expect(screen.getByRole("heading", { name: "We need a few details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit details" })).toBeInTheDocument();
  });

  it("reviews actual imported records and keeps every editor reachable", async () => {
    const user = userEvent.setup(); const onChange = vi.fn();
    render(<StepCareerProfile compactReview form={importedForm()} onChange={onChange} errors={{}} importStatus="ready_for_review" uploading={false} onUpload={() => undefined} statusMessage={null} />);
    expect(screen.getByTestId("import-summary")).toHaveTextContent("Imported 1 role, 1 education entry and 1 project");
    expect(screen.queryByText("Jordan Lee")).not.toBeInTheDocument();
    expect(screen.getByText("Real Employer")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit role 1" }));
    await user.clear(screen.getByRole("textbox", { name: /^Employer 1$/ }));
    expect(onChange).toHaveBeenLastCalledWith({ employment: [expect.objectContaining({ company: "", title: "Engineer", startDate: "2022", endDate: "2024" })] });
    await user.click(screen.getByRole("button", { name: "Edit education 1" }));
    expect(screen.getByTestId("imported-education-field-0")).toHaveValue("Computer Science");
    expect(screen.getByTestId("imported-portfolio")).toBeInTheDocument();
  });

  it("never substitutes a saved success for a failed save", () => {
    const props = { step: 1, saving: false, onBack: vi.fn(), onContinue: vi.fn(), onLogout: vi.fn(), reviewingImport: true, children: <p>Content</p> };
    const { rerender } = render(<OnboardingShell {...props} saveStatus="Save failed" />);
    expect(screen.getByRole("status")).toHaveTextContent("Save failed");
    expect(screen.queryByText("All changes saved")).not.toBeInTheDocument();
    rerender(<OnboardingShell {...props} saveStatus="Saved" />);
    expect(screen.getByRole("status")).toHaveTextContent("All changes saved");
    expect(screen.getByRole("heading", { name: "Review your experience" })).toBeInTheDocument();
  });
});
