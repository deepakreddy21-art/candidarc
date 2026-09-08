/**
 * Single-flight coalescing save queue for onboarding PATCH requests.
 * Only one save runs at a time; while in flight, newer snapshots replace the queue.
 */

export type OnboardingSaveJob<TForm> = {
  form: TForm;
  step?: number;
  completed?: boolean;
};

export type OnboardingSaveQueueOptions<TForm, TResult> = {
  getExpectedVersion: () => number | undefined;
  setVersion: (version: number) => void;
  save: (job: OnboardingSaveJob<TForm> & { expectedVersion: number }) => Promise<TResult & { version: number }>;
  onStale: () => Promise<void>;
  isStaleError: (err: unknown) => boolean;
  onSavingChange?: (saving: boolean) => void;
  onSaved?: () => void;
  onSaveFailed?: () => void;
};

export function createOnboardingSaveQueue<TForm, TResult extends { version: number }>(
  options: OnboardingSaveQueueOptions<TForm, TResult>,
) {
  let queued: OnboardingSaveJob<TForm> | null = null;
  let drainPromise: Promise<void> | null = null;

  async function runSave(job: OnboardingSaveJob<TForm>) {
    const expectedVersion = options.getExpectedVersion();
    if (typeof expectedVersion !== "number") {
      throw new Error("Missing onboarding version. Reload and try again.");
    }
    const result = await options.save({ ...job, expectedVersion });
    options.setVersion(result.version);
    return result;
  }

  async function drain(): Promise<void> {
    if (drainPromise) return drainPromise;
    const run = (async () => {
      options.onSavingChange?.(true);
      try {
        while (queued) {
          const job = queued;
          queued = null;
          try {
            await runSave(job);
            options.onSaved?.();
          } catch (err) {
            if (options.isStaleError(err)) {
              queued = null;
              await options.onStale();
              throw err;
            }
            options.onSaveFailed?.();
            throw err;
          }
        }
      } finally {
        drainPromise = null;
        // A flush may have queued work after the while-check and before we cleared drainPromise.
        if (queued) {
          await drain();
        } else {
          options.onSavingChange?.(false);
        }
      }
    })();
    drainPromise = run;
    return run;
  }

  function enqueue(job: OnboardingSaveJob<TForm>): Promise<void> {
    queued = {
      form: job.form,
      step: job.step ?? queued?.step,
      completed: job.completed || queued?.completed,
    };
    return drain();
  }

  function replaceQueue(job: OnboardingSaveJob<TForm>): void {
    queued = {
      form: job.form,
      step: job.step,
      completed: job.completed,
    };
  }

  function hasQueued(): boolean {
    return queued != null;
  }

  function isDraining(): boolean {
    return drainPromise != null;
  }

  return {
    enqueue,
    replaceQueue,
    drain,
    hasQueued,
    isDraining,
    /** Flush: ensure job is queued (or use provided), then wait until fully drained. */
    async flush(job?: OnboardingSaveJob<TForm>) {
      if (job) replaceQueue(job);
      else if (!queued) {
        throw new Error("flush requires a job when the queue is empty");
      }
      await drain();
    },
  };
}

export type OnboardingSaveQueue<TForm, TResult extends { version: number }> = ReturnType<
  typeof createOnboardingSaveQueue<TForm, TResult>
>;
