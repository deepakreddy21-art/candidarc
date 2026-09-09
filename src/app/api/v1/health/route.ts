import { getEnv } from "@server/config/env";
import { jsonOk } from "@server/http/response";
import { getPythonIntelligenceClient } from "@server/intelligence/python-client";

type DependencyStatus = {
  status: "ok" | "unavailable" | "not_required";
  detail?: string;
};

/**
 * Liveness + dependency readiness without secrets.
 * Clients/upload gates use `dependencies.pythonResumeIntelligence` and `dependencies.queue`.
 */
export async function GET() {
  const env = getEnv();
  const dependencies: Record<string, DependencyStatus> = {
    storage: { status: "ok", detail: env.STORAGE_DRIVER },
    queue: {
      status: "ok",
      detail:
        env.QUEUE_BACKEND === "redis"
          ? "redis"
          : env.CANDIDARC_DATA_MODE === "memory"
            ? "inprocess-same-process"
            : "misconfigured",
    },
    dataMode: { status: "ok", detail: env.CANDIDARC_DATA_MODE },
    pythonResumeIntelligence: { status: "unavailable" },
  };

  if (env.CANDIDARC_DATA_MODE === "postgres" && env.QUEUE_BACKEND === "inprocess") {
    dependencies.queue = {
      status: "unavailable",
      detail: "postgres requires QUEUE_BACKEND=redis",
    };
  }

  if (env.QUEUE_BACKEND === "redis") {
    try {
      const { default: IORedis } = await import("ioredis");
      const redis = new IORedis(env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 1500,
        lazyConnect: true,
      });
      await redis.connect();
      const pong = await redis.ping();
      await redis.quit().catch(() => undefined);
      dependencies.redis = {
        status: pong === "PONG" ? "ok" : "unavailable",
        detail: "ping",
      };
    } catch (err) {
      dependencies.redis = {
        status: "unavailable",
        detail: err instanceof Error ? err.message.slice(0, 120) : "unreachable",
      };
      dependencies.queue = { status: "unavailable", detail: "redis unreachable" };
    }
  } else {
    dependencies.redis = { status: "not_required" };
  }

  try {
    const ready = await getPythonIntelligenceClient().ready();
    dependencies.pythonResumeIntelligence = ready
      ? { status: "ok", detail: "health/ready" }
      : { status: "unavailable", detail: "health/ready returned not ready" };
  } catch (err) {
    dependencies.pythonResumeIntelligence = {
      status: "unavailable",
      detail: err instanceof Error ? err.message.slice(0, 120) : "unreachable",
    };
  }

  const criticalOk =
    dependencies.pythonResumeIntelligence.status === "ok" &&
    dependencies.queue.status === "ok" &&
    (env.QUEUE_BACKEND !== "redis" || dependencies.redis?.status === "ok");

  return jsonOk({
    ok: true,
    ready: criticalOk,
    mode: env.CANDIDARC_DATA_MODE,
    queueBackend: env.QUEUE_BACKEND,
    aiMode: env.AI_MODE,
    dependencies,
  });
}
