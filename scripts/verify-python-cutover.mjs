/**
 * Deterministic local verification for the Python-only cutover.
 * Does not require live provider keys.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const win = process.platform === "win32";

function run(label, command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n=== ${label} ===`);
    const child = spawn(command, args, {
      cwd: opts.cwd || repoRoot,
      env: { ...process.env, ...opts.env },
      stdio: "inherit",
      shell: win,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with exit ${code}`));
    });
  });
}

async function main() {
  await run("typecheck", win ? "npx.cmd" : "npx", ["tsc", "--noEmit"]);
  await run("architecture + routing + final-qa", win ? "npx.cmd" : "npx", [
    "vitest",
    "run",
    "src/test/architecture-python-only.test.ts",
    "src/test/python-cutover-routing.test.ts",
    "src/test/final-qa-authority.test.ts",
    "src/test/usage-transaction.test.ts",
  ]);
  await run("python-mode (real FastAPI HTTP journey)", win ? "npm.cmd" : "npm", ["run", "test:python-mode"]);
  await run("python unit (refinement+idempotency+ranker)", "node", [
    "scripts/python.mjs",
    "-m",
    "pytest",
    "-q",
    "tests/unit/test_refinement.py",
    "tests/unit/test_idempotency.py",
    "tests/unit/test_ranker_heuristic.py",
    "tests/unit/test_semantic_claims.py",
  ]);
  await run("resume eval", win ? "npm.cmd" : "npm", ["run", "eval:resume"]);
  console.log("\nverify:python-cutover PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
