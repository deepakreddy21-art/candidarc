import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuditWorkspace } from "@/components/audits/audit-workspace";
import { ResumeStudio } from "@/components/resume/resume-studio";
import { audits, mistakeMemory, resumes, finalQAChecks } from "@/data/seed";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/api", () => ({
  api: {
    listAudits: vi.fn(async () => structuredClone(audits)),
    listMistakeMemory: vi.fn(async () => structuredClone(mistakeMemory)),
    updateFinding: vi.fn(async (id: string, status: string) => ({
      id,
      status,
      auditId: "audit-hr1",
      severity: "major",
      section: "Summary",
      title: "Test",
      explanation: "Test",
      beforeText: "before",
      suggestedText: "after",
      expectedScoreImpact: 1,
    })),
    overrideMistakeMemory: vi.fn(async () => ({
      ...mistakeMemory[0],
      status: "overridden",
      userOverride: true,
    })),
    getResume: vi.fn(async () => structuredClone(resumes[0])),
    setResumeVersion: vi.fn(async (_app: string, versionId: string) => ({
      ...structuredClone(resumes[0]),
      currentVersionId: versionId,
    })),
    getFinalQA: vi.fn(async () => structuredClone(finalQAChecks)),
    getProfile: vi.fn(async () => ({
      id: "cand-deepak",
      fullName: "Deepak Reddy Kilaru",
      preferredName: "Deepak",
      email: "deepak.kilaru@email.com",
      phone: "",
      location: "",
      headline: "",
      summary: "",
      experienceLevel: "experienced" as const,
      yearsExperience: 5,
      targetRoleFamilies: [],
      preferredResumeLength: "one-page" as const,
      careerGoal: "",
      avatarInitials: "DR",
    })),
    getWorkflow: vi.fn(async () => ({ workflow: null, events: [] })),
  },
}));

describe("AuditWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads mistake memory and accepts a finding", async () => {
    const user = userEvent.setup();
    render(<AuditWorkspace applicationId="app-cisco" />);

    await waitFor(() => {
      expect(screen.getByText(/Avoid generic ownership language/i)).toBeInTheDocument();
    });

    const acceptButtons = await screen.findAllByRole("button", { name: /accept/i });
    await user.click(acceptButtons[0]);
    const { api } = await import("@/services/api");
    await waitFor(() => {
      expect(api.updateFinding).toHaveBeenCalled();
    });
  });
});

describe("ResumeStudio", () => {
  it("renders candidate resume and switches versions", async () => {
    const user = userEvent.setup();
    render(<ResumeStudio applicationId="app-cisco" />);

    await waitFor(() => {
      expect(screen.getByText(/Deepak Reddy Kilaru/i)).toBeInTheDocument();
    });

    const select = screen.getByLabelText(/resume version/i);
    await user.selectOptions(select, "rv-v2");
    const { api } = await import("@/services/api");
    await waitFor(() => {
      expect(api.setResumeVersion).toHaveBeenCalledWith("app-cisco", "rv-v2");
    });
  });
});

