import type { Repositories } from "../database/repositories";
import { nowIso } from "../database/repositories";
import type { WorkflowStage } from "../domain/types";
import { logger } from "../observability/logger";
import type { DurableWorkflowEngine } from "./engine";
import type { QueueJob } from "./queues";

export type WorkflowJobPayload = {
  workflowRunId?: string;
  tenantId?: string;
  workflowPublicId?: string;
  applicationPublicId?: string;
  stage?: WorkflowStage;
  attempt?: number;
};

function safeErrorCode(error: unknown): string {
  if (error instanceof Error) {
    const code = error.message.match(/^[A-Z][A-Z0-9_]{2,48}$/)?.[0];
    if (code) return code;
    if (error.message.includes("timeout")) return "QUEUE_JOB_TIMEOUT";
    return "QUEUE_JOB_FAILED";
  }
  return "QUEUE_JOB_FAILED";
}

/** Transition workflow to FAILED after queue retries are exhausted. */
export async function handleWorkflowJobExhausted(
  repos: Repositories,
  engine: DurableWorkflowEngine,
  job: QueueJob,
  error?: unknown,
): Promise<void> {
  const payload = (job.payload ?? {}) as WorkflowJobPayload;
  let run = payload.workflowRunId ? await repos.workflows.getById(payload.workflowRunId) : null;
  if (!run && payload.tenantId && payload.workflowPublicId) {
    run = await repos.workflows.getByPublicId(payload.tenantId, payload.workflowPublicId);
  }
  if (!run || run.stage === "FAILED" || run.status === "failed") return;

  const failedAtStage = (payload.stage ?? run.stage) as WorkflowStage;
  const errorClass = safeErrorCode(error);

  await repos.usage.releaseReservedForWorkflowRun(run.id);

  const updated = await engine.transition(run.id, "FAILED", {
    status: "failed",
    message: "Workflow failed after queue retries exhausted",
    patch: {
      errorClass,
      completedAt: nowIso(),
      payload: {
        ...run.payload,
        failedAtStage,
        queueFailure: {
          queue: job.queue,
          jobName: job.name,
          errorClass,
          attempt: job.attempt,
        },
      },
    },
  });

  const applicationPublicId =
    run.applicationPublicId ||
    payload.applicationPublicId ||
    (typeof run.payload.applicationPublicId === "string" ? run.payload.applicationPublicId : "");
  if (applicationPublicId) {
    await repos.applications.update(run.tenantId, applicationPublicId, {
      stage: "FAILED",
      workflowStage: "FAILED",
      status: "failed",
      nextAction: "Retry resume generation",
    });
  }

  logger.error(
    { workflowId: updated.publicId, failedAtStage, errorClass, queue: job.queue, jobId: job.id },
    "workflow marked failed after exhausted queue retries",
  );
}
