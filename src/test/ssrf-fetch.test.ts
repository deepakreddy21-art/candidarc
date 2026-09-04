/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import {
  assertPublicHostname,
  htmlToPlainText,
  ssrfFetch,
  SsrfBlockedError,
} from "../../server/security/ssrf-fetch";

describe("ssrfFetch", () => {
  it("blocks private IPv4 addresses including metadata endpoint", async () => {
    const resolveDns = vi.fn(async () => [{ address: "169.254.169.254", family: 4 }]);
    await expect(assertPublicHostname("example.com", resolveDns)).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("blocks loopback IPv6", async () => {
    const resolveDns = vi.fn(async () => [{ address: "::1", family: 6 }]);
    await expect(assertPublicHostname("example.com", resolveDns)).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("blocks unique-local IPv6", async () => {
    const resolveDns = vi.fn(async () => [{ address: "fd12:3456:789a:1::1", family: 6 }]);
    await expect(assertPublicHostname("example.com", resolveDns)).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("allows public IPv4 and fetches with redirect revalidation", async () => {
    const resolveDns = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        status: 302,
        ok: false,
        headers: { get: (key: string) => (key === "location" ? "https://example.com/final" : null) },
        body: null,
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: {
          get: (key: string) => {
            if (key === "content-type") return "text/html; charset=utf-8";
            if (key === "content-length") return "20";
            return null;
          },
        },
        body: {
          getReader: () => {
            const payload = new TextEncoder().encode("<html><body>Hello</body></html>");
            let done = false;
            return {
              read: async () => {
                if (done) return { done: true, value: undefined };
                done = true;
                return { done: false, value: payload };
              },
              cancel: async () => undefined,
            };
          },
        },
      });

    const result = await ssrfFetch("https://example.com/start", {
      resolveDns,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.url).toBe("https://example.com/final");
    expect(htmlToPlainText(result.body.toString("utf8"))).toContain("Hello");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects non-http(s) protocols and unsafe ports", async () => {
    await expect(ssrfFetch("ftp://example.com/job")).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(ssrfFetch("http://example.com:8080/job")).rejects.toBeInstanceOf(SsrfBlockedError);
  });
});
