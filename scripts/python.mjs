import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendRoot = path.join(repoRoot, "services", "python-backend");
const win = process.platform === "win32";
const venvPython = win
  ? path.join(backendRoot, ".venv", "Scripts", "python.exe")
  : path.join(backendRoot, ".venv", "bin", "python");
const python = existsSync(venvPython) ? venvPython : "python3";
const fallback = existsSync(venvPython) ? venvPython : "python";
const resolved = existsSync(venvPython) ? venvPython : spawnSync(python, ["--version"], { encoding: "utf8" }).status === 0 ? python : fallback;

const result = spawnSync(resolved, process.argv.slice(2), {
  cwd: backendRoot,
  stdio: "inherit",
  env: process.env,
  shell: false,
});

process.exit(result.status ?? 1);
