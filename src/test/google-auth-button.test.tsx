import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";
import {
  AuthDivider,
  GoogleAuthButton,
  GoogleAuthErrorBanner,
  googleErrorMessage,
} from "@/components/auth/google-auth-button";
import SignInPage from "@/app/sign-in/page";
import SignUpPage from "@/app/sign-up/page";

const searchParams = new URLSearchParams();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/sign-in",
  useSearchParams: () => searchParams,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => null,
}));

vi.mock("@/components/brand/logo", () => ({
  Logo: () => <span>Logo</span>,
}));

describe("GoogleAuthButton behavior", () => {
  const assign = vi.fn();

  beforeEach(() => {
    searchParams.delete("google_error");
    assign.mockReset();
    push.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign, href: "http://localhost:3000/sign-in" },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders with an accessible name on sign-in and sign-up", () => {
    const { unmount } = render(<SignInPage />);
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /continue onboarding/i })).toBeNull();
    expect(screen.queryByText(/continue onboarding/i)).toBeNull();
    expect(screen.getByRole("link", { name: /create an account/i })).toBeInTheDocument();
    unmount();

    render(<SignUpPage />);
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
  });

  it("navigates once to the Google start route without page-specific next intent", async () => {
    const user = userEvent.setup();
    render(<GoogleAuthButton />);
    const button = screen.getByRole("button", { name: /continue with google/i });
    await user.click(button);
    await waitFor(() => {
      expect(assign).toHaveBeenCalledTimes(1);
    });
    expect(assign.mock.calls[0]![0]).toBe("/api/v1/auth/google/start");
    expect(button).toBeDisabled();
    await user.click(button);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("shows safe messages for known codes and a generic message for unknown codes", () => {
    searchParams.set("google_error", "GOOGLE_AUTH_NOT_CONFIGURED");
    const { rerender } = render(<GoogleAuthErrorBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent(/not available/i);

    searchParams.set("google_error", "TOTALLY_UNKNOWN");
    rerender(<GoogleAuthErrorBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent(/failed/i);
    expect(googleErrorMessage("TOTALLY_UNKNOWN")).toMatch(/failed/i);
  });

  it("keeps the password form usable beside the Google button", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <div>
        <GoogleAuthButton />
        <AuthDivider />
        <form onSubmit={onSubmit}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" />
          <button type="submit">Sign in</button>
        </form>
      </div>,
    );
    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    await user.type(screen.getByLabelText(/password/i), "Password!12345");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });
});
