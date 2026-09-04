import { getEnv } from "../config/env";
import { AppError } from "../domain/types";

type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();
let redis: import("ioredis").default | null = null;

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
}

export async function assertRateLimit(request: Request, scope = new URL(request.url).pathname): Promise<void> {
  const env = getEnv();
  const key = `rate:${clientIp(request)}:${scope}`;
  const now = Date.now();
  let count: number;

  if (env.APP_MODE === "production" || env.QUEUE_BACKEND === "redis") {
    const Redis = (await import("ioredis")).default;
    redis ??= new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
    count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);
  } else {
    const bucket = buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((time) => time > now - 60_000);
    bucket.hits.push(now);
    buckets.set(key, bucket);
    count = bucket.hits.length;
  }

  if (count > env.RATE_LIMIT_PER_MINUTE) {
    throw new AppError("RATE_LIMITED", "Too many requests; try again shortly", 429);
  }
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
}
