export type CustomerResumeStatus = "queued" | "creating" | "completed" | "failed";

const CREATING_MESSAGE = "Creating your tailored resume…";

export function mapInternalStageToCustomer(
  stage: string,
  opts: { failed?: boolean; documentsReady?: boolean } = {},
): { status: CustomerResumeStatus; message: string } {
  if (opts.failed || stage === "FAILED" || stage === "FINAL_QA_FAILED" || stage === "CANCELLED") {
    return { status: "failed", message: "We couldn’t create your resume. Please try again." };
  }
  if (stage === "FINAL_READY" && opts.documentsReady) {
    return { status: "completed", message: "Your tailored resume is ready." };
  }
  if (stage === "APPLICATION_CREATED" || stage === "RESEARCH_QUEUED") {
    return { status: "queued", message: CREATING_MESSAGE };
  }
  return { status: "creating", message: CREATING_MESSAGE };
}
