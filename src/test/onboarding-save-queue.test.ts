/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import { createOnboardingSaveQueue } from "@/lib/onboarding-save-queue";

type Form = { value: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("onboarding save queue", () => {
  it("serializes rapid edits and keeps the latest snapshot", async () => {
    const calls: Array<{ value: string; step?: number; version: number }> = [];
    let version = 1;
    const gate = deferred<void>();
    let releaseCount = 0;

    const queue = createOnboardingSaveQueue<Form, { version: number }>({
      getExpectedVersion: () => version,
      setVersion: (v) => {
        version = v;
      },
      isStaleError: () => false,
      onStale: async () => undefined,
      save: async (job) => {
        calls.push({ value: job.form.value, step: job.step, version: job.expectedVersion });
        if (releaseCount === 0) {
          releaseCount += 1;
          await gate.promise;
        }
        return { version: job.expectedVersion + 1 };
      },
    });

    const first = queue.enqueue({ form: { value: "a" }, step: 0 });
    queue.enqueue({ form: { value: "b" }, step: 0 });
    const continueFlush = queue.flush({ form: { value: "c" }, step: 1 });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.value).toBe("a");

    gate.resolve();
    await first;
    await continueFlush;

    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ value: "c", step: 1, version: 2 });
    expect(version).toBe(3);
  });

  it("does not let a delayed older response overwrite a newer version", async () => {
    let version = 1;
    const older = deferred<{ version: number }>();
    const newer = deferred<{ version: number }>();
    let call = 0;

    const queue = createOnboardingSaveQueue<Form, { version: number }>({
      getExpectedVersion: () => version,
      setVersion: (v) => {
        version = v;
      },
      isStaleError: () => false,
      onStale: async () => undefined,
      save: async (job) => {
        call += 1;
        if (call === 1) return older.promise.then(() => ({ version: job.expectedVersion + 1 }));
        return newer.promise.then(() => ({ version: job.expectedVersion + 1 }));
      },
    });

    const first = queue.enqueue({ form: { value: "old" } });
    // Force second job after first starts by resolving first only after enqueue of second
    // Actually first holds drain; enqueue second while first in flight:
    void queue.enqueue({ form: { value: "new" } });

    newer.resolve({ version: 3 });
    // Resolve older after newer path would have been scheduled — first must finish before second runs
    older.resolve({ version: 2 });
    await first;
    await queue.drain();

    expect(version).toBe(3);
  });

  it("Continue waits for an active autosave before sending the step advance", async () => {
    const order: string[] = [];
    let version = 5;
    const autosaveHold = deferred<void>();

    const queue = createOnboardingSaveQueue<Form, { version: number }>({
      getExpectedVersion: () => version,
      setVersion: (v) => {
        version = v;
      },
      isStaleError: () => false,
      onStale: async () => undefined,
      save: async (job) => {
        if (job.step === undefined) {
          order.push(`auto:${job.form.value}`);
          await autosaveHold.promise;
        } else {
          order.push(`step:${job.step}:${job.form.value}:v${job.expectedVersion}`);
        }
        return { version: job.expectedVersion + 1 };
      },
    });

    const auto = queue.enqueue({ form: { value: "draft" } });
    const cont = queue.flush({ form: { value: "final" }, step: 2 });
    expect(order).toEqual(["auto:draft"]);
    autosaveHold.resolve();
    await auto;
    await cont;
    expect(order).toEqual(["auto:draft", "step:2:final:v6"]);
    expect(version).toBe(7);
  });

  it("save failure prevents treating the step as advanced (throws before version bump)", async () => {
    let version = 1;
    const queue = createOnboardingSaveQueue<Form, { version: number }>({
      getExpectedVersion: () => version,
      setVersion: (v) => {
        version = v;
      },
      isStaleError: () => false,
      onStale: async () => undefined,
      save: async () => {
        throw new Error("network");
      },
    });

    await expect(queue.flush({ form: { value: "x" }, step: 2 })).rejects.toThrow(/network/);
    expect(version).toBe(1);
  });

  it("stale 409 does not erase the queued local form and does not retry blindly", async () => {
    let version = 1;
    const localForms: Form[] = [];
    const onStale = vi.fn(async () => {
      version = 9;
    });
    const save = vi.fn(async () => {
      const err = Object.assign(new Error("stale"), { status: 409 });
      throw err;
    });

    const queue = createOnboardingSaveQueue<Form, { version: number }>({
      getExpectedVersion: () => version,
      setVersion: (v) => {
        version = v;
      },
      isStaleError: (err) => Boolean(err && typeof err === "object" && (err as { status?: number }).status === 409),
      onStale,
      save,
    });

    const local = { value: "user-typed-keep-me" };
    localForms.push(local);
    await expect(queue.flush({ form: local, step: 1 })).rejects.toMatchObject({ status: 409 });
    expect(onStale).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
    expect(localForms[0]?.value).toBe("user-typed-keep-me");
    expect(queue.hasQueued()).toBe(false);
  });

  it("coalesces double Finish into serialized completions using fresh versions", async () => {
    const calls: number[] = [];
    let version = 4;
    let completions = 0;
    const hold = deferred<void>();

    const queue = createOnboardingSaveQueue<Form, { version: number }>({
      getExpectedVersion: () => version,
      setVersion: (v) => {
        version = v;
      },
      isStaleError: () => false,
      onStale: async () => undefined,
      save: async (job) => {
        calls.push(job.expectedVersion);
        if (job.completed) completions += 1;
        if (completions === 1) await hold.promise;
        return { version: job.expectedVersion + 1 };
      },
    });

    const a = queue.flush({ form: { value: "done" }, step: 3, completed: true });
    const b = queue.flush({ form: { value: "done" }, step: 3, completed: true });
    hold.resolve();
    await a;
    await b;
    expect(calls).toEqual([4, 5]);
    expect(completions).toBe(2);
    expect(version).toBe(6);
  });
});
