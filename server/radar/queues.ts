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
 *
 * IMPORTANT: LinkedIn and Indeed ingestion are DISABLED without proper credentials.
 */

import type { QueueAdapter } from "../workflows/queues";
import { logger } from "../observability/logger";
import type { CanonicalJobCatalog } from "./catalog";
import type { RadarSearchIndex } from "./search-index";
import type { QueueName } from "../domain/types";
import { normalizeTitle, normalizeCompany, descriptionHash } from "./repost";
import { setCheckpoint, createCheckpoint } from "./providers/checkpoints";

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
    const payload = job.payload as { providerId?: string };
    const providerId = payload.providerId;

    // IMPORTANT: LinkedIn and Indeed are disabled without proper credentials
    if (providerId === "linkedin-licensed" || providerId === "indeed-partner") {
      logger.warn(
        { jobId: job.id, providerId },
        "radar source-discovery: provider disabled without license",
      );
      return;
    }

    logger.info({ jobId: job.id, payload: job.payload }, "radar source-discovery");
  });

  queue.registerHandler("ats-ingestion", async (job) => {
    const payload = job.payload as { sourceId?: string; jobCount?: number };

    // Update checkpoint on successful ingestion
    if (payload.sourceId) {
      await setCheckpoint(
        createCheckpoint(payload.sourceId, {
          lastJobCount: payload.jobCount,
          metadata: { queueJobId: job.id },
        }),
      );
    }

    logger.info({ jobId: job.id, sourceId: payload.sourceId }, "radar ats-ingestion acknowledged");
  });

  queue.registerHandler("job-normalization", async (job) => {
    const payload = job.payload as { jobId?: string };

    // Actually normalize the job if specified
    if (payload.jobId) {
      const cj = catalog.canonicalJobs.get(payload.jobId);
      if (cj) {
        // Re-normalize title
        const newNormalizedTitle = normalizeTitle(cj.title);
        if (cj.normalizedTitle !== newNormalizedTitle) {
          cj.normalizedTitle = newNormalizedTitle;
          cj.updatedAt = new Date().toISOString();
          catalog.canonicalJobs.set(cj.id, cj);
          logger.debug({ jobId: cj.id }, "radar job-normalization: updated normalized title");
        }
      }
    }

    logger.info({ jobId: job.id }, "radar job-normalization acknowledged");
  });

  queue.registerHandler("job-deduplication", async (job) => {
    const payload = job.payload as { jobId?: string };

    // Check for duplicates based on description hash
    if (payload.jobId) {
      const targetJob = catalog.canonicalJobs.get(payload.jobId);
      if (targetJob && targetJob.status === "open") {
        const targetHash = descriptionHash(targetJob.description);

        for (const other of catalog.canonicalJobs.values()) {
          if (other.id === targetJob.id || other.status !== "open") continue;
          if (other.companyId !== targetJob.companyId) continue;

          const otherHash = descriptionHash(other.description);
          if (targetHash === otherHash && other.classification !== "DUPLICATE") {
            // Mark as duplicate
            other.classification = "DUPLICATE";
            other.updatedAt = new Date().toISOString();
            catalog.canonicalJobs.set(other.id, other);
            logger.info(
              { duplicateId: other.id, originalId: targetJob.id },
              "radar job-deduplication: marked duplicate",
            );
          }
        }
      }
    }

    logger.info({ jobId: job.id }, "radar job-deduplication acknowledged");
  });

  queue.registerHandler("job-verification", async (job) => {
    const payload = job.payload as { jobPublicId?: string };
    if (payload.jobPublicId) {
      const j = catalog.getJob(payload.jobPublicId);
      if (j) {
        j.lastVerifiedAt = new Date().toISOString();
        j.verificationState = "VERIFIED_OPEN";
        j.lastVerifiedPrecision = "EXACT_TIMESTAMP";
        catalog.canonicalJobs.set(j.id, j);
        logger.debug({ jobId: j.id }, "radar job-verification: marked verified open");
      }
    }
    logger.info({ jobId: job.id }, "radar job-verification");
  });

  queue.registerHandler("job-indexing", async (job) => {
    index.reindexAll();
    logger.info({ jobId: job.id, stats: index.stats() }, "radar job-indexing complete");
  });

  queue.registerHandler("job-matching", async (job) => {
    // Job matching is handled on-demand in search/getJob
    // This queue is for batch pre-computation when needed
    logger.info({ jobId: job.id }, "radar job-matching acknowledged");
  });

  queue.registerHandler("job-alerting", async (job) => {
    const payload = job.payload as { jobPublicId?: string };
    if (payload.jobPublicId) {
      const j = catalog.getJob(payload.jobPublicId);
      if (j) {
        const deliveries = catalog.evaluateAlertsForJob(j);
        logger.debug(
          { jobId: j.id, deliveryCount: deliveries.length },
          "radar job-alerting: evaluated for specific job",
        );
      }
    } else {
      // Sweep all jobs
      let totalDeliveries = 0;
      for (const j of catalog.canonicalJobs.values()) {
        if (j.status !== "open") continue;
        const deliveries = catalog.evaluateAlertsForJob(j);
        totalDeliveries += deliveries.length;
      }
      logger.info(
        { jobId: job.id, totalDeliveries },
        "radar job-alerting: full sweep completed",
      );
    }
  });

  queue.registerHandler("job-expiration", async (job) => {
    const now = Date.now();
    let expiredCount = 0;

    for (const sighting of catalog.sightings.values()) {
      if (sighting.validThrough && new Date(sighting.validThrough).getTime() < now) {
        const cj = catalog.canonicalJobs.get(sighting.canonicalJobId);
        if (cj && cj.status === "open") {
          cj.status = "expired";
          cj.classification = "EXPIRED";
          cj.closedAt = new Date().toISOString();
          cj.updatedAt = new Date().toISOString();
          catalog.canonicalJobs.set(cj.id, cj);
          expiredCount++;
        }
      }
    }

    logger.info({ jobId: job.id, expiredCount }, "radar job-expiration sweep");
  });
}
