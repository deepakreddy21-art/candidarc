import { QUEUE_NAMES, type QueueName } from "../domain/types";
import { getEnv } from "../config/env";
import { logger } from "../observability/logger";

export type QueueJob<T = unknown> = {
  id: string;
  queue: QueueName;
  name: string;
  payload: T;
  attempt: number;
  maxAttempts: number;
  availableAt: number;
  createdAt: number;
  idempotencyKey?: string;
};

export type EnqueueOptions = {
  delayMs?: number;
  maxAttempts?: number;
  idempotencyKey?: string;
};

export type QueueHandler<T = unknown> = (job: QueueJob<T>) => Promise<void>;

export interface QueueAdapter {
  enqueue<T>(queue: QueueName, name: string, payload: T, opts?: EnqueueOptions): Promise<QueueJob<T>>;
  registerHandler<T>(queue: QueueName, handler: QueueHandler<T>): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type QueueConcurrencyConfig = {
  concurrency: number;
  timeoutMs: number;
  maxAttempts: number;
  rateLimitPerMinute: number;
  maxPayloadBytes: number;
};

export const DEFAULT_QUEUE_CONFIG: Record<QueueName, QueueConcurrencyConfig> = {
  research: { concurrency: 2, timeoutMs: 120_000, maxAttempts: 5, rateLimitPerMinute: 30, maxPayloadBytes: 64_000 },
  "evidence-matching": { concurrency: 2, timeoutMs: 90_000, maxAttempts: 5, rateLimitPerMinute: 40, maxPayloadBytes: 64_000 },
  "resume-generation": { concurrency: 1, timeoutMs: 180_000, maxAttempts: 4, rateLimitPerMinute: 20, maxPayloadBytes: 32_000 },
  "resume-audit": { concurrency: 1, timeoutMs: 180_000, maxAttempts: 4, rateLimitPerMinute: 20, maxPayloadBytes: 32_000 },
  "document-parsing": { concurrency: 2, timeoutMs: 120_000, maxAttempts: 3, rateLimitPerMinute: 20, maxPayloadBytes: 16_000 },
  "pdf-rendering": { concurrency: 1, timeoutMs: 120_000, maxAttempts: 3, rateLimitPerMinute: 10, maxPayloadBytes: 16_000 },
  notifications: { concurrency: 4, timeoutMs: 30_000, maxAttempts: 5, rateLimitPerMinute: 120, maxPayloadBytes: 16_000 },
  maintenance: { concurrency: 1, timeoutMs: 300_000, maxAttempts: 2, rateLimitPerMinute: 5, maxPayloadBytes: 16_000 },
  "source-discovery": { concurrency: 1, timeoutMs: 120_000, maxAttempts: 3, rateLimitPerMinute: 20, maxPayloadBytes: 32_000 },
  "ats-ingestion": { concurrency: 2, timeoutMs: 180_000, maxAttempts: 4, rateLimitPerMinute: 30, maxPayloadBytes: 64_000 },
  "job-normalization": { concurrency: 2, timeoutMs: 60_000, maxAttempts: 3, rateLimitPerMinute: 60, maxPayloadBytes: 64_000 },
  "job-deduplication": { concurrency: 1, timeoutMs: 90_000, maxAttempts: 3, rateLimitPerMinute: 40, maxPayloadBytes: 64_000 },
  "job-verification": { concurrency: 2, timeoutMs: 60_000, maxAttempts: 4, rateLimitPerMinute: 40, maxPayloadBytes: 16_000 },
  "job-indexing": { concurrency: 1, timeoutMs: 120_000, maxAttempts: 3, rateLimitPerMinute: 20, maxPayloadBytes: 16_000 },
  "job-matching": { concurrency: 2, timeoutMs: 90_000, maxAttempts: 3, rateLimitPerMinute: 40, maxPayloadBytes: 32_000 },
  "job-alerting": { concurrency: 2, timeoutMs: 60_000, maxAttempts: 4, rateLimitPerMinute: 60, maxPayloadBytes: 32_000 },
  "job-expiration": { concurrency: 1, timeoutMs: 120_000, maxAttempts: 2, rateLimitPerMinute: 10, maxPayloadBytes: 8_000 },
};

function backoffMs(attempt: number): number {
  const base = Math.min(60_000, 500 * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

export class InProcessQueueAdapter implements QueueAdapter {
  private queues = new Map<QueueName, QueueJob[]>();
  private handlers = new Map<QueueName, QueueHandler>();
  private inflight = new Map<QueueName, number>();
  private timers = new Map<QueueName, ReturnType<typeof setInterval>>();
  private idempotency = new Map<string, string>();
  private running = false;
  private config: Record<QueueName, QueueConcurrencyConfig>;
  private seq = 0;

  constructor(config: Partial<Record<QueueName, Partial<QueueConcurrencyConfig>>> = {}) {
    this.config = { ...DEFAULT_QUEUE_CONFIG };
    for (const name of QUEUE_NAMES) {
      this.queues.set(name, []);
      this.inflight.set(name, 0);
      this.config[name] = { ...DEFAULT_QUEUE_CONFIG[name], ...config[name] };
    }
  }

  async enqueue<T>(queue: QueueName, name: string, payload: T, opts?: EnqueueOptions): Promise<QueueJob<T>> {
    if (opts?.idempotencyKey) {
      const existingId = this.idempotency.get(`${queue}:${opts.idempotencyKey}`);
      if (existingId) {
        const existing = this.queues.get(queue)?.find((j) => j.id === existingId);
        if (existing) return existing as QueueJob<T>;
      }
    }

    const cfg = this.config[queue];
    const size = Buffer.byteLength(JSON.stringify(payload));
    if (size > cfg.maxPayloadBytes) {
      throw new Error(`Queue payload too large for ${queue}: ${size} > ${cfg.maxPayloadBytes}`);
    }

    const job: QueueJob<T> = {
      id: `job_${Date.now()}_${++this.seq}`,
      queue,
      name,
      payload,
      attempt: 0,
      maxAttempts: opts?.maxAttempts ?? cfg.maxAttempts,
      availableAt: Date.now() + (opts?.delayMs ?? 0),
      createdAt: Date.now(),
      idempotencyKey: opts?.idempotencyKey,
    };
    this.queues.get(queue)!.push(job as QueueJob);
    if (opts?.idempotencyKey) this.idempotency.set(`${queue}:${opts.idempotencyKey}`, job.id);
    logger.debug({ queue, jobId: job.id, name }, "enqueued job");
    return job;
  }

  registerHandler<T>(queue: QueueName, handler: QueueHandler<T>): void {
    this.handlers.set(queue, handler as QueueHandler);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    for (const name of QUEUE_NAMES) {
      const timer = setInterval(() => void this.pump(name), 50);
      this.timers.set(name, timer);
    }
    logger.info("InProcessQueueAdapter started");
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
    logger.info("InProcessQueueAdapter stopped");
  }

  private async pump(queue: QueueName) {
    if (!this.running) return;
    const handler = this.handlers.get(queue);
    if (!handler) return;
    const cfg = this.config[queue];
    const current = this.inflight.get(queue) ?? 0;
    if (current >= cfg.concurrency) return;

    const list = this.queues.get(queue)!;
    const now = Date.now();
    const idx = list.findIndex((j) => j.availableAt <= now);
    if (idx === -1) return;
    const job = list.splice(idx, 1)[0]!;
    this.inflight.set(queue, current + 1);

    try {
      const work = handler(job);
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Queue job timeout after ${cfg.timeoutMs}ms`)), cfg.timeoutMs),
      );
      await Promise.race([work, timeout]);
    } catch (err) {
      job.attempt += 1;
      logger.warn({ err, queue, jobId: job.id, attempt: job.attempt }, "queue job failed");
      if (job.attempt < job.maxAttempts) {
        job.availableAt = Date.now() + backoffMs(job.attempt);
        list.push(job);
      } else {
        logger.error({ queue, jobId: job.id }, "queue job exhausted retries");
      }
    } finally {
      this.inflight.set(queue, Math.max(0, (this.inflight.get(queue) ?? 1) - 1));
    }
  }
}

/**
 * Redis-backed adapter stub. Falls back to in-process when Redis is unavailable.
 */
export class RedisQueueAdapter implements QueueAdapter {
  private fallback: InProcessQueueAdapter;
  private redisOk = false;

  constructor(fallback = new InProcessQueueAdapter()) {
    this.fallback = fallback;
  }

  async connect(): Promise<void> {
    const env = getEnv();
    try {
      const { default: Redis } = await import("ioredis");
      const client = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        connectTimeout: 1500,
      });
      await client.connect();
      await client.ping();
      await client.quit();
      this.redisOk = true;
      logger.info("Redis reachable; RedisQueueAdapter still delegates to in-process in Phase 2");
    } catch (err) {
      this.redisOk = false;
      logger.warn({ err }, "Redis unavailable; using InProcessQueueAdapter");
    }
  }

  get usingRedis() {
    return this.redisOk;
  }

  enqueue<T>(queue: QueueName, name: string, payload: T, opts?: EnqueueOptions) {
    return this.fallback.enqueue(queue, name, payload, opts);
  }

  registerHandler<T>(queue: QueueName, handler: QueueHandler<T>) {
    this.fallback.registerHandler(queue, handler);
  }

  start() {
    return this.fallback.start();
  }

  stop() {
    return this.fallback.stop();
  }
}

let sharedQueue: QueueAdapter | null = null;

export async function getQueueAdapter(): Promise<QueueAdapter> {
  if (sharedQueue) return sharedQueue;
  const adapter = new RedisQueueAdapter();
  await adapter.connect();
  sharedQueue = adapter;
  return sharedQueue;
}

export function setQueueAdapter(adapter: QueueAdapter) {
  sharedQueue = adapter;
}

