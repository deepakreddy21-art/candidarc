import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";
import { TooltipProvider } from "@/components/ui/tabs";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/radar",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/services/api", () => ({
  api: {
    getProfile: vi.fn().mockResolvedValue({
      fullName: "Test User",
      preferredName: "Test",
      email: "test@example.com",
      avatarInitials: "TU",
    }),
  },
}));

describe("primary information architecture", () => {
  it("shows Jobs / Applications / Resume navigation only", () => {
    render(
      <TooltipProvider>
        <AppShell>
          <div>content</div>
        </AppShell>
      </TooltipProvider>,
    );
    expect(screen.getAllByText("Jobs").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Applications").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Resume").length).toBeGreaterThan(0);
    expect(screen.queryByText("Home")).not.toBeInTheDocument();
    expect(screen.queryByText("Find Jobs")).not.toBeInTheDocument();
    expect(screen.queryByText("My Applications")).not.toBeInTheDocument();
    expect(screen.queryByText("Research")).not.toBeInTheDocument();
    expect(screen.queryByText("Evidence")).not.toBeInTheDocument();
    expect(screen.queryByText("Audits")).not.toBeInTheDocument();
  });
});
