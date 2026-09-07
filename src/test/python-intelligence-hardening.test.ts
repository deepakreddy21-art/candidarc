/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "../../server/config/env";
import {
  PythonBackendError,
  PythonIntelligenceClient,
  mapProviderUsage,
  sanitizeErrorDetails,
  shouldSampleShadow,
} from "../../server/intelligence/python-client";

const CONTEXT = { tenantId: "tenant-1", userId: "user-1", requestId: "req-1" };

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function probe(client: PythonIntelligenceClient) {
  return client.parseJob({ context: CONTEXT, jobText: "Engineer role" });
}

describe("python intelligence production hardening", () => {
  beforeEach(() => {
    resetEnvCache();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetEnvCache();
  });

  it("five 422s do not open the circuit", async () => {
    const client = new PythonIntelligenceClient("http://python.test", "token", 5_000);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(422, { detail: { code: "GUARDRAIL_VIOLATION", message: "unsupported" } }),
      ),
    );
    for (let i = 0; i < 5; i += 1) {
      await expect(probe(client)).rejects.toBeInstanceOf(PythonBackendError);
    }
    expect(client.getCircuitState()).toBe("closed");
  });

  it("parses top-level VALIDATION_ERROR envelopes from FastAPI", async () => {
    const client = new PythonIntelligenceClient("http://python.test", "token", 5_000);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(422, {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: [{ type: "url_parsing" }],
        }),
      ),
    );
    await expect(probe(client)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 422,
      retryable: false,
    });
    expect(client.getCircuitState()).toBe("closed");
  });

  it("five 503s open the circuit", async () => {
    const client = new PythonIntelligenceClient("http://python.test", "token", 5_000);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(503, { detail: { code: "PYTHON_BACKEND_503", message: "down" } })),
    );
    for (let i = 0; i < 5; i += 1) {
      await expect(probe(client)).rejects.toMatchObject({
        code: "PYTHON_BACKEND_503",
        retryable: true,
      });
    }
    expect(client.getCircuitState()).toBe("open");
    await expect(probe(client)).rejects.toMatchObject({ code: "PYTHON_BACKEND_CIRCUIT_OPEN" });
  });

  it("half-open success closes the circuit", async () => {
    vi.useFakeTimers();
    const client = new PythonIntelligenceClient("http://python.test", "token", 5_000);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { detail: { code: "PYTHON_BACKEND_503", message: "down" } }))
      .mockResolvedValueOnce(jsonResponse(503, { detail: { code: "PYTHON_BACKEND_503", message: "down" } }))
      .mockResolvedValueOnce(jsonResponse(503, { detail: { code: "PYTHON_BACKEND_503", message: "down" } }))
      .mockResolvedValueOnce(jsonResponse(503, { detail: { code: "PYTHON_BACKEND_503", message: "down" } }))
      .mockResolvedValueOnce(jsonResponse(503, { detail: { code: "PYTHON_BACKEND_503", message: "down" } }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          title: "Engineer",
          company: "Acme",
          role: "Engineer",
          warnings: [],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    for (let i = 0; i < 5; i += 1) {
      await expect(probe(client)).rejects.toBeInstanceOf(PythonBackendError);
    }
    expect(client.getCircuitState()).toBe("open");

    await vi.advanceTimersByTimeAsync(30_000);
    const ok = await probe(client);
    expect(ok.title).toBe("Engineer");
    expect(client.getCircuitState()).toBe("closed");
  });

  it("mapProviderUsage keeps null estimated cost as null", () => {
    const usage = mapProviderUsage({
      provider: "mock",
      model: "mock-v1",
      prompt_version: "v1",
      latency_ms: 10,
      input_tokens: 5,
      output_tokens: 7,
      estimated_cost_cents: null,
    });
    expect(usage.estimatedCostCents).toBeNull();
    expect(usage.costUnknown).toBe(true);
  });

  it("shouldSampleShadow is stable for the same seed", () => {
    const a = shouldSampleShadow("tenant:app:run", 50);
    const b = shouldSampleShadow("tenant:app:run", 50);
    expect(a).toBe(b);
    expect(shouldSampleShadow("tenant:app:run", 0)).toBe(false);
    expect(shouldSampleShadow("tenant:app:run", 100)).toBe(true);
  });

  it("PythonBackendError sanitization strips secrets and truncates long strings", () => {
    const long = "x".repeat(250);
    const err = new PythonBackendError({
      status: 400,
      code: "VALIDATION_ERROR",
      sanitizedMessage: "bad request",
      details: {
        resume: "SECRET_RESUME",
        api_key: "sk-live",
        authorization: "Bearer x",
        token: "abc",
        password: "pw",
        secret: "s",
        evidence: [{ id: "e1" }],
        job_description: "jd",
        safeField: long,
        nested: { api_key: "nested-secret", ok: "yes" },
      },
      retryable: false,
    });
    const details = err.details as Record<string, unknown>;
    expect(details.resume).toBeUndefined();
    expect(details.api_key).toBeUndefined();
    expect(details.authorization).toBeUndefined();
    expect(details.token).toBeUndefined();
    expect(details.password).toBeUndefined();
    expect(details.secret).toBeUndefined();
    expect(details.evidence).toBeUndefined();
    expect(details.job_description).toBeUndefined();
    expect(details.safeField).toBe("x".repeat(200));
    expect((details.nested as Record<string, unknown>).api_key).toBeUndefined();
    expect((details.nested as Record<string, unknown>).ok).toBe("yes");
    expect(sanitizeErrorDetails({ resume_text: "hidden", note: "ok" })).toEqual({ note: "ok" });
  });
});
