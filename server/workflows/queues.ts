import { QUEUE_NAMES, type QueueName } from "../domain/types";
import { getEnv } from "../config/env";
import { logger } from "../observability/logger";
import { createHash } from "crypto";
import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";

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

function deterministicJobId(queue: QueueName, key: string): string {
  return `${queue}-${createHash("sha256").update(key).digest("hex").slice(0, 32)}`;
}

export class BullMqQueueAdapter implements QueueAdapter {
  private readonly connection: IORedis;
  private readonly queues = new Map<QueueName, Queue>();
  private readonly handlers = new Map<QueueName, QueueHandler>();
  private readonly workers: Worker[] = [];
  private dlq: Queue | null = null;

  constructor(private readonly consumeQueues: ReadonlySet<QueueName> = new Set(QUEUE_NAMES)) {
    this.connection = new IORedis(getEnv().REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  }

  private queue(name: QueueName): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;
    const queue = new Queue(`candidarc-${name}`, { connection: this.connection });
    this.queues.set(name, queue);
    return queue;
  }

  async enqueue<T>(queue: QueueName, name: string, payload: T, opts?: EnqueueOptions): Promise<QueueJob<T>> {
    const cfg = DEFAULT_QUEUE_CONFIG[queue];
    const size = Buffer.byteLength(JSON.stringify(payload));
    if (size > cfg.maxPayloadBytes) throw new Error(`Queue payload too large for ${queue}`);
    const id = opts?.idempotencyKey
      ? deterministicJobId(queue, opts.idempotencyKey)
      : deterministicJobId(queue, `${name}:${Date.now()}:${Math.random()}`);
    const maxAttempts = opts?.maxAttempts ?? cfg.maxAttempts;
    await this.queue(queue).add(name, payload, {
      jobId: id,
      delay: opts?.delayMs,
      attempts: maxAttempts,
      backoff: { type: "exponential", delay: 500 },
      removeOnComplete: 1000,
      removeOnFail: false,
    });
    return { id, queue, name, payload, attempt: 0, maxAttempts, availableAt: Date.now() + (opts?.delayMs ?? 0), createdAt: Date.now(), idempotencyKey: opts?.idempotencyKey };
  }

  registerHandler<T>(queue: QueueName, handler: QueueHandler<T>): void {
    this.handlers.set(queue, handler as QueueHandler);
  }

  async start(): Promise<void> {
    if (this.workers.length) return;
    for (const [name, handler] of this.handlers) {
      if (!this.consumeQueues.has(name)) continue;
      const cfg = DEFAULT_QUEUE_CONFIG[name];
      const worker = new Worker(
        `candidarc-${name}`,
        async (job: Job) => {
          const wrapped: QueueJob = {
            id: job.id ?? deterministicJobId(name, String(job.timestamp)),
            queue: name,
            name: job.name,
            payload: job.data,
            attempt: job.attemptsMade,
            maxAttempts: job.opts.attempts ?? cfg.maxAttempts,
            availableAt: job.timestamp + (job.delay ?? 0),
            createdAt: job.timestamp,
          };
          await Promise.race([
            handler(wrapped),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Queue job timeout after ${cfg.timeoutMs}ms`)), cfg.timeoutMs)),
          ]);
        },
        { connection: this.connection, concurrency: cfg.concurrency, limiter: { max: cfg.rateLimitPerMinute, duration: 60_000 } },
      );
      worker.on("failed", (job, error) => {
        if (job && job.attemptsMade >= (job.opts.attempts ?? cfg.maxAttempts)) {
          this.dlq ??= new Queue("candidarc-dlq", { connection: this.connection });
          void this.dlq.add(job.name, { queue: name, payload: job.data, error: error.message, sourceJobId: job.id });
          logger.error({ queue: name, jobId: job.id, err: error }, "job moved to dead letter queue");
        }
      });
      this.workers.push(worker);
    }
    logger.info({ queues: [...this.consumeQueues] }, "BullMQ workers started");
  }

  async stop(): Promise<void> {
    await Promise.all(this.workers.splice(0).map((worker) => worker.close()));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    if (this.dlq) await this.dlq.close();
    if (this.connection.status !== "end") await this.connection.quit();
  }
}

/** @deprecated Use BullMqQueueAdapter. */
export const RedisQueueAdapter = BullMqQueueAdapter;

let sharedQueue: QueueAdapter | null = null;

export async function getQueueAdapter(): Promise<QueueAdapter> {
  if (sharedQueue) return sharedQueue;
  const env = getEnv();
  sharedQueue = env.QUEUE_BACKEND === "redis"
    ? new BullMqQueueAdapter()
    : new InProcessQueueAdapter();
  return sharedQueue;
}

export function setQueueAdapter(adapter: QueueAdapter) {
  sharedQueue = adapter;
}

export function resetQueueAdapterForTests() {
  sharedQueue = null;
}

