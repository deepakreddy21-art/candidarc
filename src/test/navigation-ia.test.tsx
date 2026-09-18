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
    getApplication: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("primary information architecture", () => {
  it("shows Jobs, Applications, Resumes, and Profile as separate primary destinations", () => {
    render(
      <TooltipProvider>
        <AppShell>
          <div>content</div>
        </AppShell>
      </TooltipProvider>,
    );
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toHaveTextContent("Jobs");
    expect(nav).toHaveTextContent("Applications");
    expect(nav).toHaveTextContent("Resumes");
    expect(nav).toHaveTextContent("Profile");
    expect(nav.querySelector('a[href="/app/resumes"]')).toBeTruthy();
    expect(nav.querySelector('a[href="/app/profile"]')).toBeTruthy();
    expect(nav.querySelector('a[href="/app/settings"]')).toBeNull();
    expect(nav.querySelector('a[href="/app/settings/profile"]')).toBeNull();
    expect(screen.queryByText("Home")).not.toBeInTheDocument();
    expect(screen.queryByText("Find Jobs")).not.toBeInTheDocument();
    expect(screen.queryByText("My Applications")).not.toBeInTheDocument();
    expect(screen.queryByText("Research")).not.toBeInTheDocument();
    expect(screen.queryByText("Evidence")).not.toBeInTheDocument();
    expect(screen.queryByText("Audits")).not.toBeInTheDocument();
  });
});
