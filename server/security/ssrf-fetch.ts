import dns from "dns/promises";
import net from "net";

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

export type SsrfFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  allowedContentTypes?: RegExp;
  resolveDns?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
};

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 300_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_CONTENT_TYPES = /^(text\/|application\/(json|xml|xhtml\+xml|javascript))/i;

const ALLOWED_PORTS = new Set([80, 443]);

function isBlockedIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedIp(address: string): boolean {
  const kind = net.isIP(address);
  if (kind === 4) {
    const octets = address.split(".").map(Number);
    if (octets.length !== 4 || octets.some((value) => Number.isNaN(value))) return true;
    return isBlockedIpv4(octets);
  }
  if (kind === 6) {
    const normalized = address.toLowerCase();
    if (normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice("::ffff:".length);
      if (net.isIP(mapped) === 4) return isBlockedIp(mapped);
    }
    return false;
  }
  return true;
}

function assertAllowedPort(url: URL): void {
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!Number.isFinite(port) || !ALLOWED_PORTS.has(port)) {
    throw new SsrfBlockedError(`Blocked port: ${port}`);
  }
}

function assertAllowedProtocol(url: URL): void {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new SsrfBlockedError(`Blocked protocol: ${url.protocol}`);
  }
}

async function defaultResolve(hostname: string): Promise<Array<{ address: string; family: number }>> {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((entry) => ({ address: entry.address, family: entry.family }));
}

export async function assertPublicHostname(
  hostname: string,
  resolveDns: SsrfFetchOptions["resolveDns"] = defaultResolve,
): Promise<void> {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new SsrfBlockedError("Blocked hostname");
  }

  const literalKind = net.isIP(host);
  if (literalKind && isBlockedIp(host)) {
    throw new SsrfBlockedError("Blocked IP literal");
  }

  const resolved = await resolveDns(host);
  if (!resolved.length) {
    throw new SsrfBlockedError("DNS resolution failed");
  }
  for (const entry of resolved) {
    if (isBlockedIp(entry.address)) {
      throw new SsrfBlockedError(`Blocked resolved address: ${entry.address}`);
    }
  }
}

async function readLimitedBody(
  response: Response,
  maxBytes: number,
): Promise<{ body: Buffer; contentType: string }> {
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > maxBytes) {
    throw new SsrfBlockedError("Response too large");
  }

  const reader = response.body?.getReader();
  if (!reader) return { body: Buffer.alloc(0), contentType };

  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new SsrfBlockedError("Response too large");
    }
    chunks.push(value);
  }
  return { body: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))), contentType };
}

export type SsrfFetchResult = {
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
};

export async function ssrfFetch(urlString: string, options: SsrfFetchOptions = {}): Promise<SsrfFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const allowedContentTypes = options.allowedContentTypes ?? DEFAULT_CONTENT_TYPES;
  const resolveDns = options.resolveDns ?? defaultResolve;
  const fetchImpl = options.fetchImpl ?? fetch;

  let current = new URL(urlString);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    assertAllowedProtocol(current);
    assertAllowedPort(current);
    await assertPublicHostname(current.hostname, resolveDns);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": "CandidArcSsrfFetch/1.0",
          ...(options.headers ?? {}),
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new SsrfBlockedError("Redirect missing location");
      if (hop >= maxRedirects) throw new SsrfBlockedError("Too many redirects");
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const { body, contentType } = await readLimitedBody(response, maxBytes);
    if (!allowedContentTypes.test(contentType.split(";")[0]?.trim() ?? "")) {
      throw new SsrfBlockedError(`Blocked content type: ${contentType}`);
    }

    return {
      url: current.toString(),
      status: response.status,
      contentType,
      body,
    };
  }

  throw new SsrfBlockedError("Too many redirects");
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}
