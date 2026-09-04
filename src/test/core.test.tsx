import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowJourney } from "@/components/applications/workflow-journey";
import { ApplicationFilters } from "@/components/applications/application-filters";
import { ThemeToggle } from "@/components/theme-toggle";
import { TooltipProvider } from "@/components/ui/tabs";
import { product } from "@/config/product";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: "light",
    setTheme: vi.fn(),
    theme: "light",
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe("product config", () => {
  it("centralizes the working product name", () => {
    expect(product.name).toBe("CandidArc");
  });
});

describe("WorkflowJourney", () => {
  it("renders generation journey stages for final QA", () => {
    render(<WorkflowJourney currentStage="final-qa" />);
    expect(screen.getByText("Final QA")).toBeInTheDocument();
    expect(screen.getByText("HR Audit 1 completed")).toBeInTheDocument();
    expect(screen.getByText("Draft V0 generated")).toBeInTheDocument();
  });
});

describe("ApplicationFilters", () => {
  it("updates search query through onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ApplicationFilters
        value={{
          query: "",
          status: "all",
          company: "all",
          roleFamily: "all",
          readiness: "all",
          interview: "all",
        }}
        onChange={onChange}
        companies={["Cisco", "Superhuman"]}
        roleFamilies={["AI/ML Engineering"]}
      />,
    );
    await user.type(screen.getByLabelText("Search"), "C");
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ query: "C" });
  });
});

describe("ThemeToggle", () => {
  it("exposes an accessible theme control", () => {
    render(
      <TooltipProvider>
        <ThemeToggle />
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: /switch to dark theme/i })).toBeInTheDocument();
  });
});
