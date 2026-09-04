import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApplicationCopilot } from "@/components/copilot/application-copilot";

describe("ApplicationCopilot", () => {
  it("renders review modes and protects sensitive answers", () => {
    render(<ApplicationCopilot opportunityId="app-cisco" />);
    expect(screen.getByText("Prepare Only")).toBeInTheDocument();
    expect(screen.getByText("Autofill and Review")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve autofill" })).toBeInTheDocument();
  });
});
