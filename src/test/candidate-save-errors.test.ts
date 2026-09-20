import { afterEach, describe, expect, it, vi } from "vitest";
import { api, clearClientRequestCaches } from "@/services/api";

afterEach(() => { clearClientRequestCaches(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("real saves in demo mode", () => {
  it("preserves the status conflict rather than pretending a local update succeeded", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "demo");
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK_API", "false");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "APPLICATION_STALE", message: "Changed elsewhere" } }), { status: 409 })));
    await expect(api.updateApplication("app-real", { candidateStatus: "Applied", expectedVersion: 2 })).rejects.toMatchObject({ status: 409, code: "APPLICATION_STALE" });
  });
  it("never reports onboarding saved after a network failure", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "demo");
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK_API", "false");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Network unavailable"); }));
    await expect(api.updateOnboardingProgress({ expectedVersion: 2, data: { fullName: "Jordan" } })).rejects.toThrow(/Could not save/);
  });
});
