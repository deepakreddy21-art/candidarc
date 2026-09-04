import { createTraceId, logger } from "../observability/logger";
import type { QueueName, WorkflowStage } from "../domain/types";
import { AppError } from "../domain/types";
import type { QueueAdapter } from "./queues";
import type { WorkflowEventRecord, WorkflowRepository, WorkflowRunRecord } from "../database/repositories";
import { newId, nowIso } from "../database/repositories";
import { assertTransition, isTerminalStage, queueForStage } from "./stages";

export type StartWorkflowInput = {
  tenantId: string;
  applicationId: string;
  applicationPublicId: string;
  stage: WorkflowStage;
  idempotencyKey: string;
  inputVersion?: string;
  payload?: Record<string, unknown>;
  message?: string;
  maxAttempts?: number;
};

export interface DurableWorkflowEngine {
  start(input: StartWorkflowInput): Promise<WorkflowRunRecord>;
  transition(
    runId: string,
    toStage: WorkflowStage,
    opts?: { status?: WorkflowRunRecord["status"]; message?: string; outputVersion?: string; patch?: Partial<WorkflowRunRecord> },
  ): Promise<WorkflowRunRecord>;
  cancel(tenantId: string, workflowPublicId: string, reason?: string): Promise<WorkflowRunRecord>;
  retry(tenantId: string, workflowPublicId: string): Promise<WorkflowRunRecord>;
  getStatus(tenantId: string, workflowPublicId: string): Promise<WorkflowRunRecord | null>;
  listEvents(tenantId: string, workflowPublicId: string, sinceSeq?: number): Promise<WorkflowEventRecord[]>;
  /** Re-enqueue durable runs after a worker or process restart. */
  recoverIncomplete(): Promise<number>;
}

function computeBackoffMs(attempt: number): number {
  return Math.min(300_000, 1_000 * 2 ** Math.max(0, attempt - 1));
}

export class DbWorkflowEngine implements DurableWorkflowEngine {
  constructor(
    private readonly workflows: WorkflowRepository,
    private readonly queue: QueueAdapter,
  ) {}

  async start(input: StartWorkflowInput): Promise<WorkflowRunRecord> {
    const existing = await this.workflows.findByIdempotency(input.tenantId, input.idempotencyKey);
    if (existing) {
      logger.info(
        { workflowId: existing.publicId, idempotencyKey: input.idempotencyKey },
        "idempotent workflow start",
      );
      return existing;
    }

    const run = await this.workflows.createRun({
      id: newId("wr"),
      publicId: newId("wrp"),
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      applicationPublicId: input.applicationPublicId,
      stage: input.stage,
      status: "queued",
      attempt: 1,
      idempotencyKey: input.idempotencyKey,
      inputVersion: input.inputVersion,
      maxAttempts: input.maxAttempts ?? 5,
      traceId: createTraceId(),
      payload: { ...(input.payload ?? {}), applicationPublicId: input.applicationPublicId },
      startedAt: nowIso(),
    });

    await this.workflows.appendEvent({
      workflowRunId: run.id,
      workflowRunPublicId: run.publicId,
      tenantId: run.tenantId,
      applicationId: run.applicationId,
      applicationPublicId: run.applicationPublicId,
      stage: run.stage,
      status: run.status,
      message: input.message ?? `Workflow started at ${run.stage}`,
      metadata: {},
    });

    await this.enqueueStage(run);
    return run;
  }

  async transition(
    runId: string,
    toStage: WorkflowStage,
    opts?: {
      status?: WorkflowRunRecord["status"];
      message?: string;
      outputVersion?: string;
      patch?: Partial<WorkflowRunRecord>;
    },
  ): Promise<WorkflowRunRecord> {
    const run = await this.workflows.getById(runId);
    if (!run) throw new AppError("WORKFLOW_NOT_FOUND", "Workflow run not found", 404);
    if (run.status === "cancelled") {
      throw new AppError("WORKFLOW_CANCELLED", "Cannot transition a cancelled workflow", 409);
    }

    assertTransition(run.stage, toStage);

    let status = opts?.status;
    if (!status) {
      if (toStage.endsWith("_REVIEW") || toStage.endsWith("_READY") || toStage === "RESEARCH_REVIEW_REQUIRED") {
        status = "waiting_review";
      } else if (isTerminalStage(toStage)) {
        status = toStage === "CANCELLED" ? "cancelled" : toStage === "FAILED" ? "failed" : "completed";
      } else if (toStage.endsWith("_RUNNING") || toStage.endsWith("_GENERATING") || toStage.endsWith("_QUEUED")) {
        status = toStage.endsWith("_QUEUED") ? "queued" : "running";
      } else {
        status = "running";
      }
    }

    const updated = await this.workflows.updateRun(runId, {
      stage: toStage,
      status,
      outputVersion: opts?.outputVersion ?? run.outputVersion,
      completedAt: isTerminalStage(toStage) ? nowIso() : run.completedAt,
      ...opts?.patch,
    });

    await this.workflows.appendEvent({
      workflowRunId: updated.id,
      workflowRunPublicId: updated.publicId,
      tenantId: updated.tenantId,
      applicationId: updated.applicationId,
      applicationPublicId: updated.applicationPublicId,
      stage: updated.stage,
      status: updated.status,
      message: opts?.message ?? `Moved to ${toStage}`,
      metadata: {},
    });

    if (!isTerminalStage(toStage) && (status === "queued" || status === "running")) {
      // The active queue job that advanced *_QUEUED → *_RUNNING must not enqueue a duplicate.
      const fromFamily = run.stage.replace(/_QUEUED$/, "").replace(/_RUNNING$/, "").replace(/_GENERATING$/, "");
      const toFamily = toStage.replace(/_QUEUED$/, "").replace(/_RUNNING$/, "").replace(/_GENERATING$/, "");
      const sameFamilyQueuedToRunning =
        run.stage.endsWith("_QUEUED") &&
        (toStage.endsWith("_RUNNING") || toStage.endsWith("_GENERATING")) &&
        fromFamily === toFamily;
      if (!sameFamilyQueuedToRunning) {
        await this.enqueueStage(updated);
      }
    }

    return updated;
  }

  async cancel(tenantId: string, workflowPublicId: string, reason?: string): Promise<WorkflowRunRecord> {
    const run = await this.workflows.getByPublicId(tenantId, workflowPublicId);
    if (!run) throw new AppError("WORKFLOW_NOT_FOUND", "Workflow run not found", 404);
    if (isTerminalStage(run.stage) && run.status === "completed") {
      throw new AppError("WORKFLOW_ALREADY_COMPLETE", "Completed workflow cannot be cancelled", 409);
    }

    const updated = await this.workflows.updateRun(run.id, {
      stage: "CANCELLED",
      status: "cancelled",
      errorClass: "cancelled",
      completedAt: nowIso(),
      payload: { ...run.payload, cancelReason: reason ?? "user_cancelled" },
    });

    await this.workflows.appendEvent({
      workflowRunId: updated.id,
      workflowRunPublicId: updated.publicId,
      tenantId: updated.tenantId,
      applicationId: updated.applicationId,
      applicationPublicId: updated.applicationPublicId,
      stage: "CANCELLED",
      status: "cancelled",
      message: reason ?? "Workflow cancelled",
      metadata: {},
    });

    return updated;
  }

  async retry(tenantId: string, workflowPublicId: string): Promise<WorkflowRunRecord> {
    const run = await this.workflows.getByPublicId(tenantId, workflowPublicId);
    if (!run) throw new AppError("WORKFLOW_NOT_FOUND", "Workflow run not found", 404);
    if (run.status === "cancelled") {
      throw new AppError("WORKFLOW_CANCELLED", "Cancelled workflow cannot be retried", 409);
    }

    const attempt = run.attempt + 1;
    if (attempt > run.maxAttempts) {
      throw new AppError("MAX_ATTEMPTS_EXCEEDED", "Workflow exceeded max attempts", 409);
    }

    const backoffMs = computeBackoffMs(attempt);
    const updated = await this.workflows.updateRun(run.id, {
      attempt,
      status: "retrying",
      retryStatus: "scheduled",
      backoffMs,
      nextRetryAt: new Date(Date.now() + backoffMs).toISOString(),
      errorClass: undefined,
    });

    await this.workflows.appendEvent({
      workflowRunId: updated.id,
      workflowRunPublicId: updated.publicId,
      tenantId: updated.tenantId,
      applicationId: updated.applicationId,
      applicationPublicId: updated.applicationPublicId,
      stage: updated.stage,
      status: "retrying",
      message: `Manual retry scheduled (attempt ${attempt}, backoff ${backoffMs}ms)`,
      metadata: { backoffMs, attempt },
    });

    await this.queue.enqueue(
      (queueForStage(updated.stage) as QueueName) ?? "maintenance",
      "workflow.retry",
      {
        workflowRunId: updated.id,
        workflowPublicId: updated.publicId,
        tenantId: updated.tenantId,
        applicationPublicId: updated.applicationPublicId,
        stage: updated.stage,
      },
      {
        delayMs: backoffMs,
        idempotencyKey: `${updated.idempotencyKey}:retry:${attempt}`,
      },
    );

    return updated;
  }

  async getStatus(tenantId: string, workflowPublicId: string) {
    return this.workflows.getByPublicId(tenantId, workflowPublicId);
  }

  async listEvents(tenantId: string, workflowPublicId: string, sinceSeq?: number) {
    return this.workflows.listEvents(tenantId, workflowPublicId, sinceSeq);
  }

  async recoverIncomplete(): Promise<number> {
    const incomplete = await this.workflows.listIncomplete();
    for (const run of incomplete) {
      const applicationPublicId =
        run.applicationPublicId ||
        (typeof run.payload?.applicationPublicId === "string" ? run.payload.applicationPublicId : "");
      await this.enqueueStage({ ...run, applicationPublicId });
    }
    if (incomplete.length) {
      logger.info({ recovered: incomplete.length }, "re-enqueued incomplete workflows after restart");
    }
    return incomplete.length;
  }

  /** Enqueue only — never run long AI work on the HTTP path. */
  private async enqueueStage(run: WorkflowRunRecord) {
    const queueName = queueForStage(run.stage);
    if (!queueName) return;
    const applicationPublicId =
      run.applicationPublicId ||
      (typeof run.payload?.applicationPublicId === "string" ? run.payload.applicationPublicId : "");

    await this.queue.enqueue(
      queueName as QueueName,
      `workflow.${run.stage}`,
      {
        workflowRunId: run.id,
        workflowPublicId: run.publicId,
        tenantId: run.tenantId,
        applicationId: run.applicationId,
        applicationPublicId,
        stage: run.stage,
        attempt: run.attempt,
        payload: run.payload,
      },
      {
        idempotencyKey: `${run.idempotencyKey}:${run.stage}:${run.attempt}`,
        delayMs: run.backoffMs && run.status === "retrying" ? run.backoffMs : 0,
      },
    );
  }
}
