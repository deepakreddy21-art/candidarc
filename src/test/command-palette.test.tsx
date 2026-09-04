import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette } from "@/components/command-palette";
import { TooltipProvider } from "@/components/ui/tabs";
import { useUiStore } from "@/stores/ui";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: "light",
    setTheme: vi.fn(),
    theme: "light",
  }),
}));

describe("CommandPalette", () => {
  it("navigates from a command selection", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ commandOpen: true });
    render(
      <TooltipProvider>
        <CommandPalette />
      </TooltipProvider>,
    );
    expect(screen.getByPlaceholderText(/search commands/i)).toBeInTheDocument();
    await user.click(screen.getByText("New application"));
    expect(push).toHaveBeenCalledWith("/app/resumes/new");
  });
});

