export class RequestCancelledError extends Error {
  constructor(message = "Request cancelled") {
    super(message);
    this.name = "RequestCancelledError";
  }
}

export function isCancelledError(error: unknown): boolean {
  if (error instanceof RequestCancelledError) return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return error instanceof Error && (error.name === "AbortError" || /aborted|cancelled/i.test(error.message));
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

function mergeSignals(user?: AbortSignal | null, timeoutMs?: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer =
    typeof timeoutMs === "number" && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;
  const onUserAbort = () => controller.abort();
  if (user) {
    if (user.aborted) controller.abort();
    else user.addEventListener("abort", onUserAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cancel: () => {
      if (timer) clearTimeout(timer);
      if (user) user.removeEventListener("abort", onUserAbort);
    },
  };
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
    const { signal, cancel } = mergeSignals(init.signal, timeoutMs);
    try {
      return await fetch(input, {
        ...init,
        signal,
        credentials: init.credentials ?? "include",
        headers: {
          ...csrfHeader(),
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      if (isCancelledError(error) || signal.aborted) {
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
