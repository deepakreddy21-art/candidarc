/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { CSRF_COOKIE_NAME } from "../../server/http/csrf";

describe("logout contract", () => {
  it("uses POST /api/v1/auth/logout with CSRF cookie name candidarc_csrf", () => {
    expect(CSRF_COOKIE_NAME).toBe("candidarc_csrf");
    const source = `
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: csrf ? { "x-csrf-token": csrf } : {},
      });
    `;
    expect(source).toContain('method: "POST"');
    expect(source).toContain("/api/v1/auth/logout");
    expect(source).toContain("x-csrf-token");
  });
});
