import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";
import { TooltipProvider } from "@/components/ui/tabs";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
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
  it("shows simplified customer navigation", () => {
    render(<TooltipProvider><AppShell><div>content</div></AppShell></TooltipProvider>);
    expect(screen.getAllByText("Home").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Find Jobs").length).toBeGreaterThan(0);
    expect(screen.getAllByText("My Applications").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Career Profile").length).toBeGreaterThan(0);
  });
});
