import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const { getEnv, assertRuntimeEnv } = await import("../config/env");
  const { BullMqQueueAdapter, setQueueAdapter } = await import("../workflows/queues");
  const env = getEnv();
  assertRuntimeEnv(env);
  if (env.QUEUE_BACKEND === "redis" && env.WORKER_KIND !== "all") {
    const groups = {
      general: ["research", "evidence-matching", "resume-generation", "resume-audit", "notifications", "maintenance", "job-matching", "job-alerting", "job-expiration"],
      ingestion: ["source-discovery", "ats-ingestion", "job-normalization", "job-deduplication", "job-verification", "job-indexing"],
      document: ["document-parsing", "pdf-rendering"],
    } as const;
    setQueueAdapter(new BullMqQueueAdapter(new Set(groups[env.WORKER_KIND])));
  }
  const { getRuntime } = await import("../bootstrap");
  const { logger } = await import("../observability/logger");

  const runtime = await getRuntime();
  await runtime.queue.start();
  const recovered = await runtime.engine.recoverIncomplete();
  logger.info({ mode: runtime.mode, workerKind: env.WORKER_KIND, recovered }, "CandidArc worker started — draining queues");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down worker");
    try {
      await runtime.queue.stop();
    } catch (err) {
      logger.warn({ err }, "queue stop error");
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // Keep process alive
  await new Promise(() => undefined);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
