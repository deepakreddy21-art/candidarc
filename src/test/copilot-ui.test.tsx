import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApplicationCopilot } from "@/components/copilot/application-copilot";
import type { ReusableAnswer } from "@server/copilot/types";

const fixtureAnswers: ReusableAnswer[] = [
  {
    id: "answer_work_authorization",
    tenantId: "demo",
    userId: "demo",
    intent: "work_authorization",
    label: "US work authorization",
    answer: true,
    confidence: "SENSITIVE",
    source: "user",
    sensitive: true,
    requiresApproval: true,
    approvedForOpportunityIds: [],
    updatedAt: "2026-09-04T12:00:00Z",
  },
];

describe("ApplicationCopilot", () => {
  it("renders review modes and protects sensitive answers", () => {
    render(<ApplicationCopilot opportunityId="app-demo" answers={fixtureAnswers} />);
    expect(screen.getByText("Prepare Only")).toBeInTheDocument();
    expect(screen.getByText("Autofill and Review")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve autofill" })).toBeInTheDocument();
  });
});
