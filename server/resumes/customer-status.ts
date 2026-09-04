export type CustomerResumeStatus = "queued" | "creating" | "completed" | "failed" | "needs_input";



export type CustomerPipelineStage = "understanding" | "tailoring" | "preparing";



const STAGE_COPY: Record<CustomerPipelineStage, string> = {

  understanding: "Understanding role",

  tailoring: "Tailoring experience",

  preparing: "Preparing documents",

};



const PRE_GENERATION_STAGES = new Set([

  "APPLICATION_CREATED",

  "RESEARCH_QUEUED",

  "RESEARCH_RUNNING",

  "RESEARCH_REVIEW_REQUIRED",

  "RESEARCH_COMPLETED",

  "EVIDENCE_MATCHING_RUNNING",

  "EVIDENCE_MATCHING_COMPLETED",

]);



export function isPreGenerationStage(stage: string): boolean {

  return PRE_GENERATION_STAGES.has(stage);

}

export function needsInputForTechQuestions(
  stage: string,
  questions: Array<{ evidenceStatus?: string; answer?: string }>,
): boolean {
  const unanswered = questions.some((question) => question.evidenceStatus === "unanswered" || !question.evidenceStatus);
  return unanswered && (isPreGenerationStage(stage) || stage === "RESEARCH_COMPLETED");
}



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

  opts: {

    failed?: boolean;

    documentsReady?: boolean;

    startedAt?: string;

    needsInput?: boolean;

    needsInputMessage?: string;

  } = {},

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



  if (opts.needsInput) {

    return {

      status: "needs_input",

      message: opts.needsInputMessage ?? "We need a quick confirmation before continuing.",

      pipelineStage,

      pipelineLabel,

      elapsedMs,

    };

  }



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

