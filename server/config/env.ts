import { z } from "zod";

const bool = (v: string | undefined, fallback: boolean) => {
  if (v === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
};

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CANDIDARC_DATA_MODE: z.enum(["memory", "postgres"]).default("memory"),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  SESSION_SECRET: z.string().min(32).default("candidarc-dev-session-secret-change-me!!"),
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
  DEMO_MODE: z.string().optional(),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().default(120),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(overrides?: Partial<Record<string, string>>): Env {
  if (cached && !overrides) return cached;
  const source = { ...process.env, ...overrides };
  const parsed = envSchema.safeParse({
    ...source,
    DEMO_MODE: source.DEMO_MODE ?? String(bool(source.DEMO_MODE, true)),
  });
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  if (parsed.data.CANDIDARC_DATA_MODE === "postgres" && !parsed.data.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when CANDIDARC_DATA_MODE=postgres");
  }
  if (!overrides) cached = parsed.data;
  return parsed.data;
}

export function resetEnvCache() {
  cached = null;
}

export function isDemoMode(env = getEnv()) {
  return bool(env.DEMO_MODE, env.NODE_ENV !== "production");
}
