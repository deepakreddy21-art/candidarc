import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clientFetch,
  clearClientRequestCaches,
  isCancelledError,
  isTimeoutError,
  READ_TIMEOUT_MS,
  RequestCancelledError,
  RequestTimeoutError,
} from "@/lib/http-client";

describe("clientFetch timeout vs cancel", () => {
  afterEach(() => {
    clearClientRequestCaches();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("throws RequestTimeoutError when no response headers arrive before the deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new DOMException("The operation was aborted.", "AbortError");
            Object.assign(err, { reason: init.signal?.reason });
            reject(err);
          });
        });
      }),
    );

    const pending = clientFetch("/api/v1/applications", { timeoutMs: 50, dedupeKey: "t-headers" });
    const expectation = expect(pending).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(60);
    await expectation;
  });

  it("throws RequestTimeoutError when headers arrive but the body stalls", async () => {
    vi.useFakeTimers();
    const stream = new ReadableStream({
      start() {
        /* never enqueue */
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(stream, { status: 200, headers: { "content-type": "application/json" } })),
    );

    const pending = clientFetch("/api/v1/applications", { timeoutMs: 40, dedupeKey: "t-body" });
    const expectation = expect(pending).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(80);
    await expectation;
  });

  it("throws RequestCancelledError for intentional abort without treating it as timeout", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new DOMException("The operation was aborted.", "AbortError");
            Object.assign(err, { reason: init.signal?.reason });
            reject(err);
          });
        });
      }),
    );

    const pending = clientFetch("/api/v1/applications", {
      signal: controller.signal,
      timeoutMs: 30_000,
      dedupeKey: undefined,
    });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(RequestCancelledError);
    expect(isTimeoutError(new RequestCancelledError())).toBe(false);
    expect(isCancelledError(new RequestTimeoutError())).toBe(false);
  });

  it("preserves GET response cloning for deduped callers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const a = await clientFetch("/api/v1/profile", { timeoutMs: READ_TIMEOUT_MS, dedupeKey: "clone-a" });
    const b = await clientFetch("/api/v1/profile", { timeoutMs: READ_TIMEOUT_MS, dedupeKey: "clone-a" });
    expect(await a.json()).toEqual({ ok: true });
    expect(await b.json()).toEqual({ ok: true });
  });
});
