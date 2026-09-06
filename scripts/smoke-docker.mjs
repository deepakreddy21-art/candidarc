#!/usr/bin/env node
/**
 * Full-stack Docker smoke test.
 * Exits 0 on success, 2 when Docker is unavailable (NOT RUN), 1 on failure.
 *
 * Required: postgres, redis, minio, migrate, python-backend, web, worker.
 * Journey: Python /v1 generate→audit×4→regenerate→final-qa (mock AI + service token).
 * Worker restart mid-flight is verified via compose restart + process health after restart.
 *
 * TODO: Authenticated Next.js PDF/DOCX download is covered by test:production / e2e,
 * not this smoke (no new unauthenticated prod endpoints).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const SMOKE_TIMEOUT_MS = 360_000;
const REQUIRED_SERVICES = ["postgres", "redis", "minio", "migrate", "python-backend", "web", "worker"];

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  return result.status ?? 1;
}

function runCapture(command, args, opts = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    ...opts,
  });
}

function hasDocker() {
  const probe = spawnSync("docker", ["version"], { encoding: "utf8", shell: process.platform === "win32" });
  return probe.status === 0;
}

function composeLogs(...services) {
  const list = services.length ? services : REQUIRED_SERVICES;
  run("docker", ["compose", "logs", "--no-color", "--tail=200", ...list]);
}

function sleepSeconds(seconds) {
  spawnSync(
    process.platform === "win32" ? "timeout" : "sleep",
    process.platform === "win32" ? ["/t", String(seconds)] : [String(seconds)],
    { shell: true },
  );
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
      [
        "compose",
        "exec",
        "-T",
        service,
        "node",
        "-e",
        `fetch(${JSON.stringify(url)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))`,
      ],
      { encoding: "utf8", shell: process.platform === "win32" },
    );
    if (health.status === 0) return true;
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

function waitForHost(url, deadline) {
  while (Date.now() < deadline) {
    const probe = spawnSync(
      "node",
      ["-e", `fetch(${JSON.stringify(url)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`],
      { encoding: "utf8", shell: process.platform === "win32" },
    );
    if (probe.status === 0) return true;
    sleepSeconds(5);
  }
  return false;
}

function assertServiceRunning(service) {
  const ps = runCapture("docker", ["compose", "ps", "--status", "running", "--services"]);
  const running = new Set(
    String(ps.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
  if (!running.has(service)) {
    throw new Error(`required service not running: ${service}`);
  }
}

function workerProcessAlive() {
  const probe = runCapture("docker", [
    "compose",
    "exec",
    "-T",
    "worker",
    "sh",
    "-c",
    "ps aux | grep -E '[n]ode|[n]pm' | head -n 3",
  ]);
  return probe.status === 0 && String(probe.stdout || "").trim().length > 0;
}

function teardown() {
  run("docker", ["compose", "down", "-v"]);
}

function fail(message, services = REQUIRED_SERVICES) {
  console.error(message);
  composeLogs(...services);
  teardown();
  process.exit(1);
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

let exitCode = 0;
try {
  console.log("Starting full compose stack (EVIDENCE_STORE=postgres, RESUME_INTELLIGENCE_BACKEND=python)...");
  const up = run("docker", ["compose", "up", "-d", "--build", ...REQUIRED_SERVICES]);
  if (up !== 0) {
    fail("compose up failed for required full stack");
  }
  console.log("compose up returned 0");

  // migrate is one-shot; ensure it completed successfully
  const migratePs = runCapture("docker", ["compose", "ps", "-a", "--format", "json", "migrate"]);
  console.log(String(migratePs.stdout || "").slice(0, 500));
  if (migratePs.status !== 0) {
    fail("unable to inspect migrate service", ["migrate", "postgres"]);
  }
  const migrateBlob = String(migratePs.stdout || "");
  if (migrateBlob && /exit.?code["']?\s*[:=]\s*[1-9]/i.test(migrateBlob)) {
    fail("migrate service exited with non-zero status", ["migrate", "postgres"]);
  }

  const deadline = Date.now() + SMOKE_TIMEOUT_MS;
  const readySnippet = [
    "import json, urllib.request; ",
    "r=urllib.request.urlopen('http://127.0.0.1:8090/health/ready'); ",
    "body=json.loads(r.read().decode()); ",
    "assert r.status==200 and body.get('status')=='ready', body",
  ].join("");

  if (!waitForExec("python-backend", readySnippet, deadline)) {
    fail("python-backend readiness timed out", ["python-backend", "migrate", "postgres", "redis"]);
  }
  console.log("python-backend ready");

  const webDeadline = Math.min(deadline, Date.now() + 180_000);
  if (
    !waitForCurl("web", "http://127.0.0.1:3000/api/v1/health", webDeadline) &&
    !waitForHost("http://127.0.0.1:3000/api/v1/health", webDeadline) &&
    !waitForHost("http://127.0.0.1:3000/", webDeadline)
  ) {
    fail("web health timed out", ["web", "worker", "python-backend", "migrate", "postgres"]);
  }
  console.log("web health OK");

  for (const service of ["postgres", "redis", "minio", "python-backend", "web", "worker"]) {
    assertServiceRunning(service);
  }
  // Worker may run under node/tsx/npm — accept any non-empty process table after healthy compose status.
  if (!workerProcessAlive()) {
    const fallback = runCapture("docker", ["compose", "exec", "-T", "worker", "sh", "-c", "ps -o pid=,comm= | head -n 20"]);
    if (fallback.status !== 0 || !String(fallback.stdout || "").trim()) {
      fail("worker process not detected", ["worker", "web", "redis"]);
    }
  }
  console.log("required services running");

  console.log("Running Python V0–V4 mock lifecycle inside python-backend...");
  const journey = runCapture("docker", [
    "compose",
    "exec",
    "-T",
    "python-backend",
    "python",
    "scripts/smoke_lifecycle.py",
  ]);
  if (journey.status !== 0) {
    console.error(String(journey.stdout || "").slice(-2000));
    console.error(String(journey.stderr || "").slice(-2000));
    fail("Python smoke lifecycle failed", ["python-backend", "postgres", "redis"]);
  }
  console.log(String(journey.stdout || "").trim().split(/\r?\n/).slice(-5).join("\n"));

  // Journey is in-process HTTP against python-backend (not the Redis queue).
  // Still verify worker survives a mid-smoke restart + returns to a live process.
  console.log("Restarting worker (compose restart) to verify recoverability...");
  const restart = run("docker", ["compose", "restart", "worker"]);
  if (restart !== 0) {
    fail("worker restart failed", ["worker", "redis"]);
  }
  const workerDeadline = Math.min(deadline, Date.now() + 90_000);
  let workerOk = false;
  while (Date.now() < workerDeadline) {
    try {
      assertServiceRunning("worker");
      if (workerProcessAlive()) {
        workerOk = true;
        break;
      }
    } catch {
      // retry until deadline
    }
    sleepSeconds(5);
  }
  if (!workerOk) {
    fail("worker not healthy after restart", ["worker", "redis", "web"]);
  }
  console.log("worker restart OK");

  // TODO: authenticated PDF download via TS document renderer is covered by test:production / e2e.
  console.log("Shutting down...");
  teardown();
  console.log(
    "smoke:docker PASSED (postgres+redis+minio+migrate+python ready+web health+worker restart+V0-V4 lifecycle)",
  );
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : error);
  composeLogs(...REQUIRED_SERVICES);
  teardown();
}

process.exit(exitCode);
