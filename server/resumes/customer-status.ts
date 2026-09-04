export type CustomerResumeStatus = "queued" | "creating" | "completed" | "failed";

export type CustomerPipelineStage = "understanding" | "tailoring" | "preparing";

const STAGE_COPY: Record<CustomerPipelineStage, string> = {
  understanding: "Understanding role",
  tailoring: "Tailoring experience",
  preparing: "Preparing documents",
};

export function mapInternalStageToPipeline(stage: string): CustomerPipelineStage {
  if (
    stage === "APPLICATION_CREATED" ||
    stage === "RESEARCH_QUEUED" ||
    stage.startsWith("RESEARCH") ||
    stage === "research"
  ) {
    return "understanding";
  }
  if (
    stage === "FINAL_READY" ||
    stage.startsWith("PDF") ||
    stage.includes("DOCUMENT") ||
    stage.includes("FINAL_QA")
  ) {
    return "preparing";
  }
  return "tailoring";
}

export function mapInternalStageToCustomer(
  stage: string,
  opts: { failed?: boolean; documentsReady?: boolean; startedAt?: string } = {},
): {
  status: CustomerResumeStatus;
  message: string;
  pipelineStage: CustomerPipelineStage;
  pipelineLabel: string;
  elapsedMs?: number;
} {
  if (opts.failed || stage === "FAILED" || stage === "FINAL_QA_FAILED" || stage === "CANCELLED") {
    return {
      status: "failed",
      message: "We couldn’t create your resume. Please try again.",
      pipelineStage: mapInternalStageToPipeline(stage),
      pipelineLabel: STAGE_COPY[mapInternalStageToPipeline(stage)],
    };
  }
  const pipelineStage = mapInternalStageToPipeline(stage);
  const pipelineLabel = STAGE_COPY[pipelineStage];
  const elapsedMs = opts.startedAt ? Math.max(0, Date.now() - Date.parse(opts.startedAt)) : undefined;

  if (stage === "FINAL_READY" && opts.documentsReady) {
    return {
      status: "completed",
      message: "Your tailored resume is ready.",
      pipelineStage: "preparing",
      pipelineLabel: STAGE_COPY.preparing,
      elapsedMs,
    };
  }
  if (stage === "APPLICATION_CREATED" || stage === "RESEARCH_QUEUED") {
    return {
      status: "queued",
      message: pipelineLabel,
      pipelineStage,
      pipelineLabel,
      elapsedMs,
    };
  }
  return {
    status: "creating",
    message: pipelineLabel,
    pipelineStage,
    pipelineLabel,
    elapsedMs,
  };
}
