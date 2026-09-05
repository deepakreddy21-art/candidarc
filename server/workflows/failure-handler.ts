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
  workflowId?: string;
  applicationPublicId?: string;
  applicationId?: string;
  stage?: WorkflowStage;
  attempt?: number;
  versionId?: string;
  versionPublicId?: string;
};

/** Customer-safe copy only — never raw provider/database errors. */
export const CUSTOMER_DOCUMENT_FAILURE_MESSAGE =
  "We couldn’t finish preparing your resume documents. Your job details are saved — please retry generation.";

export const CUSTOMER_QUEUE_FAILURE_MESSAGE =
  "We couldn’t create your resume. Please try again.";

/** Hard ceiling for FINAL_READY without downloadable documents before auto-fail. */
export const DOCUMENT_PREPARATION_STALE_MS = 3 * 60 * 1000;

function safeErrorCode(error: unknown): string {
  if (error instanceof Error) {
    if (/PDF content verification failed/i.test(error.message)) return "PDF_CONTENT_VERIFICATION_FAILED";
    if (/startxref/i.test(error.message)) return "PDF_INVALID_XREF";
    const code = error.message.match(/^[A-Z][A-Z0-9_]{2,48}$/)?.[0];
    if (code) return code;
    if (error.message.includes("timeout")) return "QUEUE_JOB_TIMEOUT";
    return "QUEUE_JOB_FAILED";
  }
  return "QUEUE_JOB_FAILED";
}

async function markApplicationFailed(
  repos: Repositories,
  tenantId: string,
  applicationPublicId: string,
  opts: { customerMessage: string; errorClass: string; failedAtStage: string },
): Promise<void> {
  const app = await repos.applications.getByPublicId(tenantId, applicationPublicId);
  if (!app) return;
  await repos.applications.update(tenantId, applicationPublicId, {
    stage: "FAILED",
    workflowStage: "FAILED",
    status: "failed",
    nextAction: "Retry Generation",
    metadata: {
      ...app.metadata,
      customerFiles: undefined,
      documentRenderFailed: true,
      customerError: opts.customerMessage,
      documentRenderErrorClass: opts.errorClass,
      documentRenderFailedAt: nowIso(),
      failedAtStage: opts.failedAtStage,
    },
  });
}

/** Transition workflow to FAILED after queue retries are exhausted. */
export async function handleWorkflowJobExhausted(
  repos: Repositories,
  engine: DurableWorkflowEngine,
  job: QueueJob,
  error?: unknown,
): Promise<void> {
  const payload = (job.payload ?? {}) as WorkflowJobPayload;
  const errorClass = safeErrorCode(error);

  // PDF/DOCX rendering jobs do not always carry workflowRunId — resolve via application + workflowId.
  if (job.queue === "pdf-rendering") {
    const tenantId = payload.tenantId;
    const applicationPublicId = payload.applicationId ?? payload.applicationPublicId;
    const workflowPublicId = payload.workflowId ?? payload.workflowPublicId;
    if (!tenantId || !applicationPublicId) {
      logger.error({ jobId: job.id, queue: job.queue }, "pdf-rendering exhausted without application identity");
      return;
    }

    let run =
      (payload.workflowRunId ? await repos.workflows.getById(payload.workflowRunId) : null) ??
      (workflowPublicId ? await repos.workflows.getByPublicId(tenantId, workflowPublicId) : null);

    if (!run) {
      const runs = await repos.workflows.listByApplication(tenantId, applicationPublicId);
      run = runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
    }

    if (run && run.stage !== "FAILED" && run.status !== "failed") {
      await repos.usage.releaseReservedForWorkflowRun(run.id);
      await engine.transition(run.id, "FAILED", {
        status: "failed",
        message: "Document rendering failed after retries",
        patch: {
          errorClass,
          completedAt: nowIso(),
          payload: {
            ...run.payload,
            failedAtStage: "FINAL_QA_RUNNING",
            documentRenderFailed: true,
            queueFailure: {
              queue: job.queue,
              jobName: job.name,
              errorClass,
              attempt: job.attempt,
            },
          },
        },
      });
    }

    await markApplicationFailed(repos, tenantId, applicationPublicId, {
      customerMessage: CUSTOMER_DOCUMENT_FAILURE_MESSAGE,
      errorClass,
      failedAtStage: "FINAL_QA_RUNNING",
    });

    logger.error(
      {
        workflowId: run?.publicId ?? workflowPublicId,
        applicationPublicId,
        errorClass,
        queue: job.queue,
        jobId: job.id,
      },
      "document rendering marked failed after exhausted queue retries",
    );
    return;
  }

  let run = payload.workflowRunId ? await repos.workflows.getById(payload.workflowRunId) : null;
  if (!run && payload.tenantId && (payload.workflowPublicId || payload.workflowId)) {
    run = await repos.workflows.getByPublicId(payload.tenantId, payload.workflowPublicId ?? payload.workflowId!);
  }
  if (!run || run.stage === "FAILED" || run.status === "failed") return;

  const failedAtStage = (payload.stage ?? run.stage) as WorkflowStage;

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
    payload.applicationId ||
    (typeof run.payload.applicationPublicId === "string" ? run.payload.applicationPublicId : "");
  if (applicationPublicId) {
    await markApplicationFailed(repos, run.tenantId, applicationPublicId, {
      customerMessage: CUSTOMER_QUEUE_FAILURE_MESSAGE,
      errorClass,
      failedAtStage,
    });
  }

  logger.error(
    { workflowId: updated.publicId, failedAtStage, errorClass, queue: job.queue, jobId: job.id },
    "workflow marked failed after exhausted queue retries",
  );
}

/**
 * Fail customer-facing generations that remain FINAL_READY without documents past the watchdog window.
 * Returns true when the application was marked failed.
 */
export async function failStaleDocumentPreparation(
  repos: Repositories,
  engine: DurableWorkflowEngine,
  opts: {
    tenantId: string;
    applicationPublicId: string;
    workflowPublicId: string;
    startedAt?: string;
    nowMs?: number;
    staleAfterMs?: number;
  },
): Promise<boolean> {
  const app = await repos.applications.getByPublicId(opts.tenantId, opts.applicationPublicId);
  if (!app || app.workflowStage !== "FINAL_READY") return false;
  if (app.metadata?.customerFiles && typeof app.metadata.customerFiles === "object") return false;
  if (app.metadata?.documentRenderFailed === true) return false;

  const startedMs = opts.startedAt ? Date.parse(opts.startedAt) : Date.parse(app.updatedAt);
  if (!Number.isFinite(startedMs)) return false;
  const age = (opts.nowMs ?? Date.now()) - startedMs;
  if (age < (opts.staleAfterMs ?? DOCUMENT_PREPARATION_STALE_MS)) return false;

  const run = await repos.workflows.getByPublicId(opts.tenantId, opts.workflowPublicId);
  if (run && run.stage !== "FAILED" && run.status !== "failed") {
    await engine.transition(run.id, "FAILED", {
      status: "failed",
      message: "Document preparation timed out",
      patch: {
        errorClass: "DOCUMENT_PREPARATION_TIMEOUT",
        completedAt: nowIso(),
        payload: {
          ...run.payload,
          failedAtStage: "FINAL_QA_RUNNING",
          documentRenderFailed: true,
        },
      },
    });
  }

  await markApplicationFailed(repos, opts.tenantId, opts.applicationPublicId, {
    customerMessage: CUSTOMER_DOCUMENT_FAILURE_MESSAGE,
    errorClass: "DOCUMENT_PREPARATION_TIMEOUT",
    failedAtStage: "FINAL_QA_RUNNING",
  });

  logger.error(
    { applicationPublicId: opts.applicationPublicId, workflowPublicId: opts.workflowPublicId, ageMs: age },
    "stale document preparation marked failed by watchdog",
  );
  return true;
}
