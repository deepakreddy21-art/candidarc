export class RequestCancelledError extends Error {
  constructor(message = "Request cancelled") {
    super(message);
    this.name = "RequestCancelledError";
  }
}

export class RequestTimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "RequestTimeoutError";
  }
}

export type AbortReason = "timeout" | "cancelled";

export function isTimeoutError(error: unknown): boolean {
  if (error instanceof RequestTimeoutError) return true;
  if (error instanceof DOMException && error.name === "TimeoutError") return true;
  if (error instanceof Error && error.name === "RequestTimeoutError") return true;
  const reason = (error as { reason?: unknown } | null)?.reason;
  if (reason === "timeout") return true;
  if (reason && typeof reason === "object" && (reason as { type?: string }).type === "timeout") return true;
  return false;
}

export function isCancelledError(error: unknown): boolean {
  if (isTimeoutError(error)) return false;
  if (error instanceof RequestCancelledError) return true;
  if (error instanceof DOMException && error.name === "AbortError") {
    const reason = (error as DOMException & { reason?: unknown }).reason;
    if (reason === "timeout" || (reason && typeof reason === "object" && (reason as { type?: string }).type === "timeout")) {
      return false;
    }
    return true;
  }
  if (error instanceof Error && error.name === "AbortError") {
    const reason = (error as Error & { reason?: unknown }).reason;
    if (reason === "timeout" || (reason && typeof reason === "object" && (reason as { type?: string }).type === "timeout")) {
      return false;
    }
    return true;
  }
  return error instanceof Error && /aborted|cancelled/i.test(error.message) && !/timed?\s*out/i.test(error.message);
}

export const READ_TIMEOUT_MS = 15_000;
export const WRITE_TIMEOUT_MS = 30_000;
export const UPLOAD_TIMEOUT_MS = 60_000;
export const LONG_WRITE_TIMEOUT_MS = 90_000;

const inflightGets = new Map<string, Promise<Response>>();

export function clearClientRequestCaches() {
  inflightGets.clear();
}

function csrfHeader(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const raw =
    document.cookie.split("; ").find((item) => item.startsWith("candidarc_csrf="))?.split("=")[1] ?? "";
  return raw ? { "x-csrf-token": decodeURIComponent(raw) } : {};
}

function mergeSignals(
  user?: AbortSignal | null,
  timeoutMs?: number,
): { signal: AbortSignal; cancel: () => void; wasTimeout: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;
  const timer =
    typeof timeoutMs === "number" && timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort({ type: "timeout" satisfies AbortReason });
        }, timeoutMs)
      : undefined;
  const onUserAbort = () => {
    if (!timedOut) controller.abort({ type: "cancelled" satisfies AbortReason });
  };
  if (user) {
    if (user.aborted) onUserAbort();
    else user.addEventListener("abort", onUserAbort, { once: true });
  }
  return {
    signal: controller.signal,
    wasTimeout: () => timedOut,
    cancel: () => {
      if (timer) clearTimeout(timer);
      if (user) user.removeEventListener("abort", onUserAbort);
    },
  };
}

function abortReasonIsTimeout(signal: AbortSignal): boolean {
  const reason = signal.reason;
  if (reason === "timeout") return true;
  if (reason && typeof reason === "object" && (reason as { type?: string }).type === "timeout") return true;
  return false;
}

async function readWithDeadline(res: Response, timeoutMs: number, user?: AbortSignal | null): Promise<Response> {
  // Headers already received; still bound body consumption so stalled bodies cannot hang forever.
  if (!res.body) return res;
  const { signal, cancel, wasTimeout } = mergeSignals(user, timeoutMs);
  try {
    const buffer = await Promise.race([
      res.arrayBuffer(),
      new Promise<never>((_, reject) => {
        const onAbort = () => {
          if (wasTimeout() || abortReasonIsTimeout(signal)) reject(new RequestTimeoutError());
          else reject(new RequestCancelledError());
        };
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
    return new Response(buffer, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  } catch (error) {
    if (wasTimeout() || abortReasonIsTimeout(signal) || isTimeoutError(error)) {
      throw new RequestTimeoutError();
    }
    if (user?.aborted || isCancelledError(error)) {
      throw new RequestCancelledError();
    }
    throw error;
  } finally {
    cancel();
  }
}

export type ClientRequestInit = RequestInit & {
  timeoutMs?: number;
  dedupeKey?: string;
};

export async function clientFetch(input: string, init: ClientRequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const timeoutMs =
    init.timeoutMs ??
    (method === "GET" || method === "HEAD" ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS);
  const dedupeKey =
    method === "GET" && !init.signal ? (init.dedupeKey ?? input) : undefined;

  const run = async () => {
    const started = Date.now();
    const { signal, cancel, wasTimeout } = mergeSignals(init.signal, timeoutMs);
    try {
      const res = await fetch(input, {
        ...init,
        signal,
        credentials: init.credentials ?? "include",
        headers: {
          ...csrfHeader(),
          ...(init.headers ?? {}),
        },
      });
      // Remaining budget for body — headers alone must not leave stalled bodies hanging.
      const remaining = Math.max(1, timeoutMs - (Date.now() - started));
      return await readWithDeadline(res, remaining, init.signal);
    } catch (error) {
      if (wasTimeout() || abortReasonIsTimeout(signal) || isTimeoutError(error)) {
        throw new RequestTimeoutError();
      }
      if (isCancelledError(error) || signal.aborted || init.signal?.aborted) {
        throw new RequestCancelledError();
      }
      throw error;
    } finally {
      cancel();
    }
  };

  if (!dedupeKey) return run();
  const existing = inflightGets.get(dedupeKey);
  const pending = existing ?? run().finally(() => inflightGets.delete(dedupeKey));
  if (!existing) inflightGets.set(dedupeKey, pending);
  const res = await pending;
  return res.clone();
}

export function jsonHeaders(extra?: HeadersInit, opts?: { jsonBody?: boolean }): HeadersInit {
  return {
    ...(opts?.jsonBody ? { "Content-Type": "application/json" } : {}),
    ...csrfHeader(),
    ...(extra ?? {}),
  };
}
