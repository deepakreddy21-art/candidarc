/**
 * Starts FastAPI (mock AI) and runs python-mode Vitest suites.
 * Fails if the venv or FastAPI server cannot start.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendRoot = path.join(repoRoot, "services", "python-backend");
const win = process.platform === "win32";
const venvPython = win
  ? path.join(backendRoot, ".venv", "Scripts", "python.exe")
  : path.join(backendRoot, ".venv", "bin", "python");

const TOKEN = process.env.PYTHON_BACKEND_TOKEN || "dev-python-backend-token-change-me";
const PORT = process.env.PYTHON_MODE_TEST_PORT || "8091";
const BASE = `http://127.0.0.1:${PORT}`;

if (!existsSync(venvPython)) {
  console.error(`Python venv missing: ${venvPython}`);
  process.exit(1);
}

const child = spawn(
  venvPython,
  ["-m", "uvicorn", "app.main:app", "--port", String(PORT), "--host", "127.0.0.1"],
  {
    cwd: backendRoot,
    env: {
      ...process.env,
      AI_MODE: "mock",
      APP_MODE: "demo",
      PYTHON_BACKEND_TOKEN: TOKEN,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let settled = false;
function shutdown(code = 0) {
  if (settled) return;
  settled = true;
  if (child.pid) {
    try {
      if (win) {
        spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"]);
      } else {
        child.kill("SIGTERM");
      }
    } catch {
      /* ignore */
    }
  }
  process.exit(code);
}

async function waitReady(timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`FastAPI exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${BASE}/health/live`);
      if (response.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("FastAPI failed to become ready for python-mode tests");
}

try {
  await waitReady();
  const vitest = spawn(
    win ? "npx.cmd" : "npx",
    [
      "vitest",
      "run",
      "--config",
      "vitest.python-mode.config.ts",
      "src/test/python-mode-generate.test.ts",
      "src/test/python-intelligence-client.test.ts",
      "--reporter=dot",
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        APP_MODE: "demo",
        AI_MODE: "mock",
        PYTHON_BACKEND_TOKEN: TOKEN,
        PYTHON_BACKEND_URL: BASE,
      },
      stdio: "inherit",
      shell: win,
    },
  );
  vitest.on("exit", (code) => shutdown(code ?? 1));
} catch (error) {
  console.error(error);
  shutdown(1);
}

process.on("SIGINT", () => shutdown(1));
process.on("SIGTERM", () => shutdown(1));
