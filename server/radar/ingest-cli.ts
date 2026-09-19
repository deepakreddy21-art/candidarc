/** Queue a bounded public ATS board import; workers perform and persist the ingestion. */
import "dotenv/config";
import { z } from "zod";
import { getEnv } from "../config/env";
import { getRuntime } from "../bootstrap";
import { closeDb } from "../database/client";

async function main() {
  const [providerId, boardToken, ...companyParts] = process.argv.slice(2);
  const board = z.object({ providerId: z.enum(["greenhouse", "lever", "ashby"]),
    boardToken: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), companyName: z.string().min(1).max(160),
  }).parse({ providerId, boardToken, companyName: companyParts.join(" ") });
  const env = getEnv();
  if (env.APP_MODE !== "production" || env.CANDIDARC_DATA_MODE !== "postgres" || env.QUEUE_BACKEND !== "redis") {
    throw new Error("Live board ingestion requires production app mode, PostgreSQL and Redis. No demo jobs were imported.");
  }
  const runtime = await getRuntime();
  try {
    const job = await runtime.queue.enqueue("source-discovery", "radar-public-board", { boards: [board] }, {
      idempotencyKey: `public-board:${board.providerId}:${board.boardToken}:${new Date().toISOString().slice(0, 13)}`,
    });
    console.log(`Queued ${board.providerId}/${board.boardToken}: ${job.id}. Check worker completion before treating the board as refreshed.`);
  } finally {
    await runtime.queue.stop();
    await closeDb();
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof z.ZodError ? "Usage: npm run radar:ingest -- greenhouse|lever|ashby BOARD_TOKEN Company Name" : error instanceof Error ? error.message : "Board ingestion could not be queued");
  process.exitCode = 1;
});
