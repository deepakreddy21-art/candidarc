import { describe, expect, it } from "vitest";
import { CopilotService } from "../service";
import { SubmissionState } from "../types";

describe("Application Copilot core", () => {
  it("blocks sensitive answers from autofill without approval", () => {
    const service = new CopilotService();
    const pkg = service.preparePackage("tenant", "user", "opp-1", {
      mode: "autofill_review",
    });
    expect(service.recordAttempt(pkg.id).state).toBe(SubmissionState.BLOCKED);
  });

  it("warns when the same opportunity was already applied to", () => {
    const service = new CopilotService();
    const answers = service.listAnswers("tenant", "user");
    for (const answer of answers.filter((item) => item.sensitive)) {
      service.approveAnswer("tenant", "user", answer.id, "opp-2");
    }
    const pkg = service.preparePackage("tenant", "user", "opp-2", {
      mode: "autofill_review",
    });
    const attempt = service.recordAttempt(pkg.id);
    service.confirmReceipt(attempt.id, {
      confirmationId: "confirmation-123",
      verificationEvidence: "Employer confirmation page",
    });
    expect(service.checkDuplicateApplication("opp-2")).toContain("already");
  });

  it("does not confirm a receipt without a confirmation id", () => {
    const service = new CopilotService();
    const pkg = service.preparePackage("tenant", "user", "opp-3", {
      mode: "autofill_review",
      requiredIntents: ["email"],
    });
    const attempt = service.recordAttempt(pkg.id);
    expect(
      service.confirmReceipt(attempt.id, { verificationEvidence: "page text" }).state,
    ).toBe(SubmissionState.SUBMITTED_UNVERIFIED);
  });

  it("never submits in prepare_only mode", () => {
    const service = new CopilotService();
    const pkg = service.preparePackage("tenant", "user", "opp-4");
    expect(service.recordAttempt(pkg.id)).toMatchObject({
      mode: "prepare_only",
      state: SubmissionState.BLOCKED,
    });
  });
});
