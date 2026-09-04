import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const { getRuntime } = await import("../bootstrap");
  const { logger } = await import("../observability/logger");

  const runtime = await getRuntime();
  await runtime.queue.start();
  logger.info({ mode: runtime.mode }, "CandidArc worker started — draining queues");

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
