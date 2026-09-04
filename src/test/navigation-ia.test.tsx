import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";
import { TooltipProvider } from "@/components/ui/tabs";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ push: vi.fn() }),
}));

describe("primary information architecture", () => {
  it("shows Today and Opportunities navigation", () => {
    render(<TooltipProvider><AppShell><div>content</div></AppShell></TooltipProvider>);
    expect(screen.getAllByText("Today").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Opportunities").length).toBeGreaterThan(0);
  });
});
