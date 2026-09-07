/**
 * Starts FastAPI (mock AI) and runs python-mode Vitest suites.
 * Phase 2 restarts FastAPI with fail_until_repair for Final-QA repair proof.
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

/** @type {import('node:child_process').ChildProcess | null} */
let child = null;
let settled = false;

function killChild() {
  if (!child?.pid) return;
  try {
    if (win) {
      spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"]);
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    /* ignore */
  }
  child = null;
}

function shutdown(code = 0) {
  if (settled) return;
  settled = true;
  killChild();
  process.exit(code);
}

function startFastApi(extraEnv = {}) {
  killChild();
  const env = {
    ...process.env,
    AI_MODE: "mock",
    APP_MODE: "demo",
    PYTHON_BACKEND_TOKEN: TOKEN,
    ...extraEnv,
  };
  // Deterministic local FastAPI tests must not depend on Redis being up.
  delete env.REDIS_URL;
  child = spawn(
    venvPython,
    ["-m", "uvicorn", "app.main:app", "--port", String(PORT), "--host", "127.0.0.1"],
    {
      cwd: backendRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stderr?.on("data", (chunk) => {
    const text = String(chunk);
    if (/ERROR|Traceback|Exception/i.test(text)) {
      process.stderr.write(`[fastapi] ${text}`);
    }
  });
}

async function waitReady(timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child?.exitCode != null) {
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

function runVitest(files, extraEnv = {}) {
  return new Promise((resolve) => {
    const vitest = spawn(
      win ? "npx.cmd" : "npx",
      ["vitest", "run", "--config", "vitest.python-mode.config.ts", ...files, "--reporter=dot"],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          APP_MODE: "demo",
          AI_MODE: "mock",
          RESUME_INTELLIGENCE_BACKEND: "python",
          PYTHON_BACKEND_TOKEN: TOKEN,
          PYTHON_BACKEND_URL: BASE,
          ...extraEnv,
        },
        stdio: "inherit",
        shell: win,
      },
    );
    vitest.on("exit", (code) => resolve(code ?? 1));
  });
}

try {
  startFastApi();
  await waitReady();
  const phase1 = await runVitest([
    "src/test/python-mode-generate.test.ts",
    "src/test/python-intelligence-client.test.ts",
    "src/test/python-mode-pipeline-journey.test.ts",
  ]);
  if (phase1 !== 0) shutdown(phase1);

  startFastApi({ CANDIDARC_MOCK_FINAL_QA_FORCE: "fail_until_repair" });
  await waitReady();
  const phase2 = await runVitest(
    ["src/test/final-qa-repair-pipeline.test.ts", "src/test/python-mode-v4r1-acceptance.test.ts"],
    {
      CANDIDARC_MOCK_FINAL_QA_FORCE: "fail_until_repair",
    },
  );
  shutdown(phase2);
} catch (error) {
  console.error(error);
  shutdown(1);
}

process.on("SIGINT", () => shutdown(1));
process.on("SIGTERM", () => shutdown(1));
