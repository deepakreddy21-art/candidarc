#!/usr/bin/env node
/**
 * Mock-stack Docker smoke test.
 * Exits 0 on success, 2 when Docker is unavailable (NOT RUN), 1 on failure.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  return result.status ?? 1;
}

function hasDocker() {
  const probe = spawnSync("docker", ["version"], { encoding: "utf8", shell: process.platform === "win32" });
  return probe.status === 0;
}

if (!hasDocker()) {
  console.error("smoke:docker NOT RUN — Docker is not available on this machine.");
  process.exit(2);
}

const composeFile = "docker-compose.yml";
if (!existsSync(composeFile)) {
  console.error("docker-compose.yml missing");
  process.exit(1);
}

console.log("Starting compose stack...");
let code = run("docker", ["compose", "up", "-d", "--build", "postgres", "redis", "minio", "migrate", "python-backend"]);
if (code !== 0) {
  console.error("compose up failed");
  process.exit(1);
}

const deadline = Date.now() + 180_000;
let ready = false;
while (Date.now() < deadline) {
  const health = spawnSync(
    "docker",
    ["compose", "exec", "-T", "python-backend", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8090/health/ready')"],
    { encoding: "utf8", shell: process.platform === "win32" },
  );
  if (health.status === 0) {
    ready = true;
    break;
  }
  spawnSync(process.platform === "win32" ? "timeout" : "sleep", process.platform === "win32" ? ["/t", "5"] : ["5"], {
    shell: true,
  });
}

if (!ready) {
  console.error("python-backend readiness timed out");
  run("docker", ["compose", "logs", "python-backend", "migrate", "postgres"]);
  run("docker", ["compose", "down", "-v"]);
  process.exit(1);
}

console.log("Running Python eval + unit smoke inside container...");
code = run("docker", [
  "compose",
  "exec",
  "-T",
  "python-backend",
  "python",
  "-c",
  "from app.main import app; from fastapi.testclient import TestClient; c=TestClient(app); r=c.get('/health/live'); assert r.status_code==200",
]);
if (code !== 0) {
  run("docker", ["compose", "down", "-v"]);
  process.exit(1);
}

console.log("Shutting down...");
run("docker", ["compose", "down", "-v"]);
console.log("smoke:docker PASSED (infra readiness + Python live health)");
process.exit(0);
