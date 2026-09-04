/** @vitest-environment node */
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { CSRF_EXEMPT_PATHS } from "../../server/http/csrf";

function listRouteFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...listRouteFiles(full));
    else if (entry === "route.ts") files.push(full);
  }
  return files;
}

function apiPathFromFile(file: string): string {
  const rel = file.replace(/\\/g, "/").split("/src/app")[1]!.replace(/\/route\.ts$/, "");
  return rel;
}

function mutationHandlers(source: string): string[] {
  return [...source.matchAll(/export async function (POST|PUT|PATCH|DELETE)/g)].map((m) => m[1]!);
}

describe("CSRF route inventory", () => {
  it("requires withMutationGuards or assertCsrf on authenticated mutations", () => {
    const apiRoot = path.resolve("src/app/api/v1");
    const missing: string[] = [];

    for (const file of listRouteFiles(apiRoot)) {
      const apiPath = apiPathFromFile(file);
      if (CSRF_EXEMPT_PATHS.some((exempt) => apiPath.startsWith(exempt))) continue;
      if (apiPath.includes("/files/signed/")) continue;

      const source = readFileSync(file, "utf8");
      const methods = mutationHandlers(source);
      if (!methods.length) continue;

      const guarded =
        /withMutationGuards\s*\(\s*request/.test(source) ||
        /withMutationGuards\s*\(\s*req/.test(source) ||
        /assertCsrf\s*\(\s*request\s*\)/.test(source) ||
        /assertCsrf\s*\(\s*req\s*\)/.test(source);
      if (!guarded) missing.push(`${apiPath} [${methods.join(",")}]`);
    }

    expect(missing, `Unprotected mutation routes:\n${missing.join("\n")}`).toEqual([]);
  });
});
