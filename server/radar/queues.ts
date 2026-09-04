/**
 * Radar worker queues.
 *
 * Conceptual queue names (independent concurrency / rate limits in production):
 * - source-discovery
 * - ats-ingestion
 * - career-page-ingestion
 * - licensed-feed-ingestion
 * - job-normalization
 * - job-deduplication
 * - job-verification
 * - job-indexing
 * - job-matching
 * - job-alerting
 * - job-expiration
 *
 * These extend QUEUE_NAMES in server/domain/types.ts and use InProcessQueueAdapter
 * from server/workflows/queues.ts.
 */

import type { QueueAdapter } from "../workflows/queues";
import { logger } from "../observability/logger";
import type { CanonicalJobCatalog } from "./catalog";
import type { RadarSearchIndex } from "./search-index";
import type { QueueName } from "../domain/types";

export const RADAR_QUEUE_NAMES = [
  "source-discovery",
  "ats-ingestion",
  "job-normalization",
  "job-deduplication",
  "job-verification",
  "job-indexing",
  "job-matching",
  "job-alerting",
  "job-expiration",
] as const satisfies readonly QueueName[];

export type RadarQueueName = (typeof RADAR_QUEUE_NAMES)[number];

export function registerRadarQueueHandlers(
  queue: QueueAdapter,
  catalog: CanonicalJobCatalog,
  index: RadarSearchIndex,
): void {
  queue.registerHandler("source-discovery", async (job) => {
    logger.info({ jobId: job.id, payload: job.payload }, "radar source-discovery");
  });

  queue.registerHandler("ats-ingestion", async (job) => {
    logger.info({ jobId: job.id }, "radar ats-ingestion acknowledged");
  });

  queue.registerHandler("job-normalization", async (job) => {
    logger.info({ jobId: job.id }, "radar job-normalization acknowledged");
  });

  queue.registerHandler("job-deduplication", async (job) => {
    logger.info({ jobId: job.id }, "radar job-deduplication acknowledged");
  });

  queue.registerHandler("job-verification", async (job) => {
    const payload = job.payload as { jobPublicId?: string };
    if (payload.jobPublicId) {
      const j = catalog.getJob(payload.jobPublicId);
      if (j) {
        j.lastVerifiedAt = new Date().toISOString();
        j.verificationState = "VERIFIED_OPEN";
        catalog.canonicalJobs.set(j.id, j);
      }
    }
    logger.info({ jobId: job.id }, "radar job-verification");
  });

  queue.registerHandler("job-indexing", async (job) => {
    index.reindexAll();
    logger.info({ jobId: job.id, stats: index.stats() }, "radar job-indexing complete");
  });

  queue.registerHandler("job-matching", async (job) => {
    logger.info({ jobId: job.id }, "radar job-matching acknowledged");
  });

  queue.registerHandler("job-alerting", async (job) => {
    const payload = job.payload as { jobPublicId?: string };
    if (payload.jobPublicId) {
      const j = catalog.getJob(payload.jobPublicId);
      if (j) catalog.evaluateAlertsForJob(j);
    } else {
      for (const j of catalog.canonicalJobs.values()) {
        catalog.evaluateAlertsForJob(j);
      }
    }
    logger.info({ jobId: job.id }, "radar job-alerting evaluated");
  });

  queue.registerHandler("job-expiration", async (job) => {
    const now = Date.now();
    for (const sighting of catalog.sightings.values()) {
      if (sighting.validThrough && new Date(sighting.validThrough).getTime() < now) {
        const cj = catalog.canonicalJobs.get(sighting.canonicalJobId);
        if (cj && cj.status === "open") {
          cj.status = "expired";
          cj.classification = "EXPIRED";
          cj.updatedAt = new Date().toISOString();
          catalog.canonicalJobs.set(cj.id, cj);
        }
      }
    }
    logger.info({ jobId: job.id }, "radar job-expiration sweep");
  });
}
