/**
 * One-command local stack: FastAPI + Next.js + BullMQ worker.
 * - Uses Python AI_MODE=mock when OPENAI_API_KEY is absent
 * - Avoids uvicorn --reload (prevents .venv watch loops)
 * - Detects occupied ports with actionable errors
 * - Tears down the process tree on Ctrl+C
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendRoot = path.join(repoRoot, "services", "python-backend");
const win = process.platform === "win32";
const venvPython = win
  ? path.join(backendRoot, ".venv", "Scripts", "python.exe")
  : path.join(backendRoot, ".venv", "bin", "python");

const PYTHON_PORT = Number(process.env.PYTHON_PORT || 8090);
const WEB_PORT = Number(process.env.PORT || 3000);
const TOKEN = process.env.PYTHON_BACKEND_TOKEN || "dev-python-backend-token-change-me";
const hasLiveKey = Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

const children = [];

function log(msg) {
  console.log(`[dev:stack] ${msg}`);
}

function fail(msg) {
  console.error(`[dev:stack] ERROR: ${msg}`);
  shutdown(1);
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function waitHttp(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function spawnChild(name, command, args, opts = {}) {
  log(`starting ${name}: ${command} ${args.join(" ")}`);
  const child = spawn(command, args, {
    cwd: opts.cwd || repoRoot,
    env: { ...process.env, ...opts.env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: opts.shell ?? win,
  });
  child.stdout?.on("data", (buf) => process.stdout.write(`[${name}] ${buf}`));
  child.stderr?.on("data", (buf) => process.stderr.write(`[${name}] ${buf}`));
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(`[dev:stack] ${name} exited code=${code} signal=${signal}`);
      shutdown(code || 1);
    }
  });
  children.push({ name, child });
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("shutting down child processes…");
  for (const { name, child } of children) {
    try {
      if (win && child.pid) {
        spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], { stdio: "ignore" });
      } else if (child.pid) {
        child.kill("SIGTERM");
      }
    } catch (err) {
      console.error(`[dev:stack] failed to stop ${name}:`, err);
    }
  }
  setTimeout(() => process.exit(code), 500).unref?.();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  if (!existsSync(venvPython)) {
    fail(`Python venv missing at ${venvPython}. Run setup in services/python-backend first.`);
  }

  if (!(await portFree(PYTHON_PORT))) {
    fail(`Port ${PYTHON_PORT} is occupied. Stop the other process or set PYTHON_PORT.`);
  }
  if (!(await portFree(WEB_PORT))) {
    fail(`Port ${WEB_PORT} is occupied. Stop the other Next.js process or set PORT.`);
  }

  const pythonEnv = {
    AI_MODE: hasLiveKey ? process.env.AI_MODE || "live" : "mock",
    APP_MODE: process.env.APP_MODE || "demo",
    PYTHON_BACKEND_TOKEN: TOKEN,
    RESUME_INTELLIGENCE_BACKEND: "python",
  };
  if (!hasLiveKey) {
    log("No OPENAI/ANTHROPIC key detected — Python AI_MODE=mock");
  }

  spawnChild(
    "python",
    venvPython,
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(PYTHON_PORT)],
    { cwd: backendRoot, env: pythonEnv, shell: false },
  );

  await waitHttp(`http://127.0.0.1:${PYTHON_PORT}/health/live`);
  log(`FastAPI ready on :${PYTHON_PORT}`);

  const appEnv = {
    RESUME_INTELLIGENCE_BACKEND: "python",
    PYTHON_BACKEND_URL: `http://127.0.0.1:${PYTHON_PORT}`,
    PYTHON_BACKEND_TOKEN: TOKEN,
    AI_MODE: process.env.AI_MODE || "mock",
    APP_MODE: process.env.APP_MODE || "demo",
  };

  spawnChild("web", win ? "npx.cmd" : "npx", ["next", "dev", "--turbopack", "-p", String(WEB_PORT)], {
    env: appEnv,
  });
  spawnChild("worker", win ? "npx.cmd" : "npx", ["tsx", "server/worker/main.ts"], { env: appEnv });

  log("stack starting — Ctrl+C to stop all");
}

main().catch((err) => {
  console.error(err);
  shutdown(1);
});
