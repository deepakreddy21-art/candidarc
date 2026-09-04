import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("removed interview product", () => {
  it("has no interview routes or UI module", () => {
    const root = process.cwd();
    const removedFeature = ["inter", "views"].join("");
    expect(existsSync(join(root, "src/app/app", removedFeature))).toBe(false);
    expect(existsSync(join(root, "src/app/api/v1", removedFeature))).toBe(false);
    expect(existsSync(join(root, "src/components", removedFeature))).toBe(false);
    expect(existsSync(join(root, "server/modules", removedFeature))).toBe(false);
  });
});
