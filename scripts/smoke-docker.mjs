#!/usr/bin/env node
/**
 * Mock-stack Docker smoke test.
 * Exits 0 on success, 2 when Docker is unavailable (NOT RUN), 1 on failure.
 *
 * Minimum path: postgres + redis + migrate + python ready with EVIDENCE_STORE=postgres.
 * Also starts web (+ worker when image builds succeed) and waits for web health when present.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const SMOKE_TIMEOUT_MS = 240_000;

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

function composeLogs(...services) {
  run("docker", ["compose", "logs", "--no-color", "--tail=200", ...services]);
}

function sleepSeconds(seconds) {
  spawnSync(process.platform === "win32" ? "timeout" : "sleep", process.platform === "win32" ? ["/t", String(seconds)] : [String(seconds)], {
    shell: true,
  });
}

function waitForExec(service, pythonSnippet, deadline) {
  while (Date.now() < deadline) {
    const health = spawnSync(
      "docker",
      ["compose", "exec", "-T", service, "python", "-c", pythonSnippet],
      { encoding: "utf8", shell: process.platform === "win32" },
    );
    if (health.status === 0) return true;
    sleepSeconds(5);
  }
  return false;
}

function waitForCurl(service, url, deadline) {
  while (Date.now() < deadline) {
    const health = spawnSync(
      "docker",
      ["compose", "exec", "-T", service, "node", "-e", `fetch(${JSON.stringify(url)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))`],
      { encoding: "utf8", shell: process.platform === "win32" },
    );
    if (health.status === 0) return true;
    // Fallback: wget/curl inside container if node fetch unavailable
    const curl = spawnSync(
      "docker",
      ["compose", "exec", "-T", service, "sh", "-c", `wget -q -O - ${url} >/dev/null 2>&1 || curl -fsS ${url} >/dev/null`],
      { encoding: "utf8", shell: process.platform === "win32" },
    );
    if (curl.status === 0) return true;
    sleepSeconds(5);
  }
  return false;
}

function teardown() {
  run("docker", ["compose", "down", "-v"]);
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

const coreServices = ["postgres", "redis", "minio", "migrate", "python-backend"];
console.log("Starting compose core stack (EVIDENCE_STORE=postgres)...");
let code = run("docker", ["compose", "up", "-d", "--build", ...coreServices]);
if (code !== 0) {
  console.error("compose up (core) failed");
  composeLogs("python-backend", "migrate", "postgres", "redis");
  teardown();
  process.exit(1);
}

const deadline = Date.now() + SMOKE_TIMEOUT_MS;
const readySnippet =
  "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8090/health/ready')";

if (!waitForExec("python-backend", readySnippet, deadline)) {
  console.error("python-backend readiness timed out");
  composeLogs("python-backend", "migrate", "postgres", "redis");
  teardown();
  process.exit(1);
}

console.log("Running Python health/live + /health/ready (postgres evidence store)...");
code = run("docker", [
  "compose",
  "exec",
  "-T",
  "python-backend",
  "python",
  "-c",
  (
    "from app.main import app; from fastapi.testclient import TestClient; "
    "c=TestClient(app); "
    "live=c.get('/health/live'); assert live.status_code==200, live.text; "
    "ready=c.get('/health/ready'); assert ready.status_code==200, ready.text; "
    "body=ready.json(); assert body.get('status')=='ready', body"
  ),
]);
if (code !== 0) {
  composeLogs("python-backend", "migrate", "postgres");
  teardown();
  process.exit(1);
}

// Optional web/worker when Dockerfile targets exist (bounded; do not fail core if build is too heavy — try once).
let webStarted = false;
console.log("Attempting web (+ worker) smoke path...");
const webUp = run("docker", ["compose", "up", "-d", "--build", "web"]);
if (webUp === 0) {
  webStarted = true;
  run("docker", ["compose", "up", "-d", "--build", "worker"]);
  const webDeadline = Math.min(deadline, Date.now() + 120_000);
  if (!waitForCurl("web", "http://127.0.0.1:3000/api/v1/health", webDeadline) &&
      !waitForCurl("web", "http://127.0.0.1:3000/", webDeadline)) {
    // Host-side probe as fallback
    let hostOk = false;
    while (Date.now() < webDeadline) {
      const probe = spawnSync(
        "node",
        ["-e", "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],
        { encoding: "utf8", shell: process.platform === "win32" },
      );
      if (probe.status === 0) {
        hostOk = true;
        break;
      }
      const root = spawnSync(
        "node",
        ["-e", "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"],
        { encoding: "utf8", shell: process.platform === "win32" },
      );
      if (root.status === 0) {
        hostOk = true;
        break;
      }
      sleepSeconds(5);
    }
    if (!hostOk) {
      console.error("web health timed out");
      composeLogs("web", "worker", "python-backend", "migrate", "postgres");
      teardown();
      process.exit(1);
    }
  }
  console.log("web health OK");
} else {
  console.warn("web image/build unavailable — core postgres+python smoke still passed");
  composeLogs("web");
}

console.log("Shutting down...");
teardown();
console.log(
  webStarted
    ? "smoke:docker PASSED (postgres evidence + python ready + web health)"
    : "smoke:docker PASSED (postgres evidence + python ready; web skipped)",
);
process.exit(0);
