/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "../../server/config/env";
import {
  PythonBackendError,
  PythonIntelligenceClient,
  mapPythonBackendErrorToAppError,
  resolveIntelligenceBackendForTenant,
  shouldSampleShadow,
} from "../../server/intelligence/python-client";
import { createEmptyMemoryStore, MemoryRepositories } from "../../server/database/repositories";

const CONTEXT = { tenantId: "tenant-1", userId: "user-1", requestId: "req-1" };

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("intelligence routing (allowlist only)", () => {
  beforeEach(() => {
    resetEnvCache();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  it("global typescript kill switch ignores allowlist", () => {
    vi.stubEnv("RESUME_INTELLIGENCE_BACKEND", "typescript");
    vi.stubEnv("PYTHON_INTELLIGENCE_TENANT_ALLOWLIST", "ten_a");
    resetEnvCache();
    expect(resolveIntelligenceBackendForTenant({ tenantId: "ten_a" })).toBe("typescript");
  });

  it("allowlisted tenant gets python when env is python", () => {
    vi.stubEnv("RESUME_INTELLIGENCE_BACKEND", "python");
    vi.stubEnv("PYTHON_INTELLIGENCE_TENANT_ALLOWLIST", "ten_a,ten_b");
    resetEnvCache();
    expect(resolveIntelligenceBackendForTenant({ tenantId: "ten_a" })).toBe("python");
    expect(resolveIntelligenceBackendForTenant({ tenantId: "ten_other" })).toBe("typescript");
  });

  it("tenant A allowlist does not leak to tenant B", () => {
    vi.stubEnv("RESUME_INTELLIGENCE_BACKEND", "shadow");
    vi.stubEnv("PYTHON_INTELLIGENCE_TENANT_ALLOWLIST", "ten_a");
    resetEnvCache();
    expect(resolveIntelligenceBackendForTenant({ tenantId: "ten_a" })).toBe("shadow");
    expect(resolveIntelligenceBackendForTenant({ tenantId: "ten_b" })).toBe("typescript");
  });

  it("shadow sampling is deterministic across retries", () => {
    vi.stubEnv("SHADOW_SAMPLE_PERCENT", "100");
    resetEnvCache();
    const seed = "ten_a:app_1:wf_1";
    expect(shouldSampleShadow(seed)).toBe(true);
    expect(shouldSampleShadow(seed)).toBe(true);
  });
});

describe("IDEMPOTENCY_IN_PROGRESS circuit and mapping", () => {
  beforeEach(() => {
    resetEnvCache();
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetEnvCache();
  });

  it("five IDEMPOTENCY_IN_PROGRESS 409s never open the circuit", async () => {
    const client = new PythonIntelligenceClient("http://python.test", "token", 5_000);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(409, { detail: { code: "IDEMPOTENCY_IN_PROGRESS", message: "in progress" } }),
      ),
    );
    for (let i = 0; i < 5; i += 1) {
      await expect(
        client.parseJob({ context: CONTEXT, jobText: "Engineer role" }),
      ).rejects.toMatchObject({
        code: "IDEMPOTENCY_IN_PROGRESS",
        status: 409,
        retryable: true,
      });
    }
    expect(client.getCircuitState()).toBe("closed");
  });

  it("maps IDEMPOTENCY_IN_PROGRESS to retryable 409 AppError", () => {
    const mapped = mapPythonBackendErrorToAppError(
      new PythonBackendError({
        status: 409,
        code: "IDEMPOTENCY_IN_PROGRESS",
        sanitizedMessage: "in progress",
        retryable: true,
      }),
    );
    expect(mapped.code).toBe("IDEMPOTENCY_IN_PROGRESS");
    expect(mapped.status).toBe(409);
    expect(mapped.retryable).toBe(true);
  });
});

describe("tenant-scoped usage ledger", () => {
  it("two tenants with the same idempotency key get separate rows and cannot cross-update", async () => {
    const store = createEmptyMemoryStore();
    const repos = new MemoryRepositories(store);
    const key = "shared-key";
    const a = await repos.usage.append({
      tenantId: "tenant-a",
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: key,
      status: "reserved",
      metadata: {},
    });
    const b = await repos.usage.append({
      tenantId: "tenant-b",
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: key,
      status: "reserved",
      metadata: {},
    });
    expect(a.id).not.toBe(b.id);
    expect(await repos.usage.findByIdempotency("tenant-a", key)).toMatchObject({ tenantId: "tenant-a" });
    expect(await repos.usage.findByIdempotency("tenant-b", key)).toMatchObject({ tenantId: "tenant-b" });
    await repos.usage.updateStatus("tenant-a", key, "committed");
    expect((await repos.usage.findByIdempotency("tenant-a", key))?.status).toBe("committed");
    expect((await repos.usage.findByIdempotency("tenant-b", key))?.status).toBe("reserved");
  });

  it("known cost creates one provider_cost row; token row stays at zero cost", async () => {
    const store = createEmptyMemoryStore();
    const repos = new MemoryRepositories(store);
    const key = "tenant-a:usage:wf:stage:research";
    await repos.usage.append({
      tenantId: "tenant-a",
      kind: "research",
      units: "1",
      costCents: "0",
      idempotencyKey: key,
      status: "reserved",
      metadata: {},
    });
    await repos.usage.updateStatus("tenant-a", key, "committed");
    await repos.usage.append({
      tenantId: "tenant-a",
      kind: "input_tokens",
      units: "100",
      costCents: "0",
      idempotencyKey: `${key}:provider-usage`,
      status: "committed",
      metadata: { costStatus: "known", billable: true },
    });
    await repos.usage.append({
      tenantId: "tenant-a",
      kind: "provider_cost",
      units: "0",
      costCents: "12",
      idempotencyKey: `${key}:cost`,
      status: "committed",
      metadata: { costStatus: "known", billable: true },
    });
    // replay must not duplicate
    const again = await repos.usage.append({
      tenantId: "tenant-a",
      kind: "provider_cost",
      units: "0",
      costCents: "12",
      idempotencyKey: `${key}:cost`,
      status: "committed",
      metadata: { costStatus: "known", billable: true },
    });
    const costs = [...store.usageLedger.values()].filter(
      (row) => row.tenantId === "tenant-a" && row.kind === "provider_cost",
    );
    expect(costs).toHaveLength(1);
    expect(again.costCents).toBe("12");
    const tokens = [...store.usageLedger.values()].find((row) => row.kind === "input_tokens");
    expect(tokens?.costCents).toBe("0");
  });

  it("unknown cost is marked non-billable and distinct from known zero", async () => {
    const store = createEmptyMemoryStore();
    const repos = new MemoryRepositories(store);
    const key = "tenant-a:usage:unknown";
    await repos.usage.append({
      tenantId: "tenant-a",
      kind: "provider_cost",
      units: "0",
      costCents: "0",
      idempotencyKey: `${key}:cost-unknown`,
      status: "committed",
      metadata: { costStatus: "unknown", billable: false },
    });
    const row = await repos.usage.findByIdempotency("tenant-a", `${key}:cost-unknown`);
    expect(row?.metadata.costStatus).toBe("unknown");
    expect(row?.metadata.billable).toBe(false);
  });
});
