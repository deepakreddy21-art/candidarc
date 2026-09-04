import { z } from "zod";

export const DEMO_SESSION_SECRET = "candidarc-dev-session-secret-change-me!!";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_MODE: z.enum(["demo", "production"]).default("demo"),
  WORKER_KIND: z.enum(["all", "general", "ingestion", "document"]).default("all"),
  CANDIDARC_DATA_MODE: z.enum(["memory", "postgres"]).default("memory"),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  QUEUE_BACKEND: z.enum(["inprocess", "redis"]).default("inprocess"),
  SESSION_SECRET: z.string().optional(),
  CSRF_SECRET: z.string().optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default(".data/storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("candidarc"),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  AI_PROVIDER: z.enum(["mock", "openai"]).default("mock"),
  OPENAI_API_KEY: z.string().optional(),
  WORKFLOW_ENGINE: z.enum(["db", "temporal"]).default("db"),
  TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().default(120),
});

export type Env = Omit<z.infer<typeof envSchema>, "SESSION_SECRET" | "CSRF_SECRET"> & {
  SESSION_SECRET: string;
  CSRF_SECRET: string;
};

let cached: Env | null = null;

export function assertSafeRuntime(env: Env): void {
  if (env.APP_MODE !== "production") return;
  const unsafe: string[] = [];
  if (env.CANDIDARC_DATA_MODE === "memory") unsafe.push("CANDIDARC_DATA_MODE=memory");
  if (env.AI_PROVIDER === "mock") unsafe.push("AI_PROVIDER=mock");
  if (env.STORAGE_DRIVER === "local") unsafe.push("STORAGE_DRIVER=local");
  if (env.QUEUE_BACKEND !== "redis") unsafe.push("QUEUE_BACKEND must be redis");
  if (env.SESSION_SECRET === DEMO_SESSION_SECRET) unsafe.push("demo SESSION_SECRET");
  if (env.SESSION_SECRET.length < 32) unsafe.push("SESSION_SECRET must be at least 32 characters");
  if (env.AI_PROVIDER === "openai" && !env.OPENAI_API_KEY) unsafe.push("OPENAI_API_KEY is required");
  if (unsafe.length) throw new Error(`Unsafe production runtime: ${unsafe.join(", ")}`);
}

export function getEnv(overrides?: Partial<Record<string, string>>): Env {
  if (cached && !overrides) return cached;
  const source = { ...process.env, ...overrides };
  const appMode = source.APP_MODE ?? (source.NODE_ENV === "production" ? "production" : "demo");
  const sessionSecret = source.SESSION_SECRET ?? (appMode === "demo" ? DEMO_SESSION_SECRET : undefined);
  const parsed = envSchema.safeParse({
    ...source,
    APP_MODE: appMode,
    SESSION_SECRET: sessionSecret,
  });
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  if (!parsed.data.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required when APP_MODE=production");
  }
  if (parsed.data.CANDIDARC_DATA_MODE === "postgres" && !parsed.data.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when CANDIDARC_DATA_MODE=postgres");
  }
  const env: Env = {
    ...parsed.data,
    SESSION_SECRET: parsed.data.SESSION_SECRET,
    CSRF_SECRET: parsed.data.CSRF_SECRET ?? parsed.data.SESSION_SECRET,
  };
  assertSafeRuntime(env);
  if (!overrides) cached = env;
  return env;
}

export function resetEnvCache() {
  cached = null;
}

export function isDemoMode(env = getEnv()) {
  return env.APP_MODE === "demo";
}

export function isProductionApp(env = getEnv()) {
  return env.APP_MODE === "production";
}
