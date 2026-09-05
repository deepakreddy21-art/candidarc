import { z } from "zod";

export const DEMO_SESSION_SECRET = "candidarc-dev-session-secret-change-me!!";

/** EICAR standard test string — used by mock/clamav scanners in tests only. */
export const EICAR_TEST_STRING =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

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
  AI_MODE: z.enum(["mock", "live"]).default("mock"),
  AI_GENERATION_PROVIDER: z.enum(["openai", "anthropic", "mock"]).default("openai"),
  AI_HR_AUDIT_PROVIDER: z.enum(["anthropic", "openai", "mock"]).default("anthropic"),
  AI_EM_AUDIT_PROVIDER: z.enum(["anthropic", "openai", "mock"]).default("anthropic"),
  AI_FINAL_REVIEW_PROVIDER: z.enum(["openai", "anthropic", "mock"]).default("openai"),
  /** @deprecated Compatibility input; use AI_MODE and role providers. */
  AI_PROVIDER: z.enum(["mock", "openai"]).optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_GENERATION_MODEL: z.string().default("gpt-4o-mini"),
  ANTHROPIC_AUDIT_MODEL: z.string().default("claude-sonnet-4-20250514"),
  OPENAI_FINAL_MODEL: z.string().default("gpt-4o-mini"),
  /** typescript = current TS pipeline; shadow = compare Python without customer effect; python = Python authoritative for intelligence. */
  RESUME_INTELLIGENCE_BACKEND: z.enum(["typescript", "python", "shadow"]).default("typescript"),
  PYTHON_BACKEND_URL: z.string().default("http://127.0.0.1:8090"),
  PYTHON_BACKEND_TOKEN: z.string().default("dev-python-backend-token-change-me"),
  /** Percent of shadow-mode stages that also call Python for comparison metrics (0–100). */
  SHADOW_SAMPLE_PERCENT: z.coerce.number().min(0).max(100).default(0),
  WORKFLOW_ENGINE: z.enum(["db", "temporal"]).default("db"),
  TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().default(120),
  FEATURE_RADAR: z.coerce.boolean().optional(),
  FEATURE_COPILOT: z.coerce.boolean().optional(),
  MALWARE_SCANNER: z.enum(["clamav", "mock"]).optional(),
  CLAMAV_HOST: z.string().default("127.0.0.1:3310"),
});

export type Env = Omit<
  z.infer<typeof envSchema>,
  "SESSION_SECRET" | "CSRF_SECRET" | "FEATURE_RADAR" | "FEATURE_COPILOT" | "MALWARE_SCANNER"
> & {
  SESSION_SECRET: string;
  CSRF_SECRET: string;
  FEATURE_RADAR: boolean;
  FEATURE_COPILOT: boolean;
  MALWARE_SCANNER: "clamav" | "mock";
};

let cached: Env | null = null;

/** True during `next build` — secrets are not validated until runtime startup. */
export function isBuildPhase(): boolean {
  return (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  );
}

const PUBLIC_EXFIL_HOST_MARKERS = [
  "webhook.site",
  "requestbin.com",
  "requestbin.net",
  "pipedream.net",
  "ngrok-free.app",
  "ngrok.io",
  "loca.lt",
  "burpcollaborator.net",
  "oastify.com",
];

function isObviouslyPublicExfilUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    return PUBLIC_EXFIL_HOST_MARKERS.some((marker) => host === marker || host.endsWith(`.${marker}`));
  } catch {
    return true;
  }
}

export function assertSafeRuntime(env: Env): void {
  const unsafe: string[] = [];
  const production = env.APP_MODE === "production";
  if (production) {
    if (env.CANDIDARC_DATA_MODE === "memory") unsafe.push("CANDIDARC_DATA_MODE=memory");
    if (env.AI_MODE !== "live") unsafe.push("AI_MODE must be live");
    if (env.STORAGE_DRIVER === "local") unsafe.push("STORAGE_DRIVER=local");
    if (env.QUEUE_BACKEND !== "redis") unsafe.push("QUEUE_BACKEND must be redis");
    if (env.SESSION_SECRET === DEMO_SESSION_SECRET) unsafe.push("demo SESSION_SECRET");
    if (env.SESSION_SECRET.length < 32) unsafe.push("SESSION_SECRET must be at least 32 characters");
    if (env.MALWARE_SCANNER !== "clamav") unsafe.push("MALWARE_SCANNER must be clamav in production");
    const pythonOrShadow =
      env.RESUME_INTELLIGENCE_BACKEND === "python" || env.RESUME_INTELLIGENCE_BACKEND === "shadow";
    if (pythonOrShadow) {
      if (env.PYTHON_BACKEND_TOKEN.startsWith("dev-") || env.PYTHON_BACKEND_TOKEN.length < 24) {
        unsafe.push("PYTHON_BACKEND_TOKEN must be a non-dev secret for production python/shadow mode");
      }
      if (isObviouslyPublicExfilUrl(env.PYTHON_BACKEND_URL)) {
        unsafe.push("PYTHON_BACKEND_URL looks like a public exfiltration endpoint");
      }
    }
  }
  if (production || env.AI_MODE === "live") {
    const selected = [
      env.AI_GENERATION_PROVIDER,
      env.AI_HR_AUDIT_PROVIDER,
      env.AI_EM_AUDIT_PROVIDER,
      env.AI_FINAL_REVIEW_PROVIDER,
    ];
    if (selected.includes("mock")) unsafe.push("mock AI provider selected in live runtime");
    if (selected.includes("openai") && !env.OPENAI_API_KEY) unsafe.push("OPENAI_API_KEY is required");
    if (selected.includes("anthropic") && !env.ANTHROPIC_API_KEY) unsafe.push("ANTHROPIC_API_KEY is required");
  }
  if (unsafe.length) throw new Error(`Unsafe production runtime: ${unsafe.join(", ")}`);
}

function resolveFeatureFlags(
  source: Record<string, string | undefined>,
  appMode: "demo" | "production",
  nodeEnv: string,
): { FEATURE_RADAR: boolean; FEATURE_COPILOT: boolean; MALWARE_SCANNER: "clamav" | "mock" } {
  const isDemoOrTest = appMode === "demo" || nodeEnv === "test";
  const featureRadar =
    source.FEATURE_RADAR !== undefined
      ? source.FEATURE_RADAR === "true" || source.FEATURE_RADAR === "1"
      : isDemoOrTest;
  const featureCopilot =
    source.FEATURE_COPILOT !== undefined
      ? source.FEATURE_COPILOT === "true" || source.FEATURE_COPILOT === "1"
      : false;
  const malwareScanner =
    (source.MALWARE_SCANNER as "clamav" | "mock" | undefined) ??
    (isDemoOrTest ? "mock" : "clamav");
  return { FEATURE_RADAR: featureRadar, FEATURE_COPILOT: featureCopilot, MALWARE_SCANNER: malwareScanner };
}

function parseEnvSource(overrides?: Partial<Record<string, string>>): Env {
  const source = { ...process.env, ...overrides };
  const appMode = (source.APP_MODE ?? (source.NODE_ENV === "production" ? "production" : "demo")) as
    | "demo"
    | "production";
  const legacyProvider = source.AI_PROVIDER;
  const aiMode =
    source.AI_MODE ??
    (legacyProvider === "mock" ? "mock" : legacyProvider === "openai" ? "live" : appMode === "production" ? "live" : "mock");
  const legacyLiveProvider = legacyProvider === "openai" ? "openai" : undefined;
  const buildPhase = isBuildPhase();
  const sessionSecret =
    source.SESSION_SECRET ??
    (buildPhase || appMode === "demo" || source.NODE_ENV === "test" ? DEMO_SESSION_SECRET : undefined);
  const flags = resolveFeatureFlags(source, appMode, source.NODE_ENV ?? "development");
  const parsed = envSchema.safeParse({
    ...source,
    APP_MODE: appMode,
    AI_MODE: aiMode,
    AI_GENERATION_PROVIDER: source.AI_GENERATION_PROVIDER ?? legacyLiveProvider,
    AI_HR_AUDIT_PROVIDER: source.AI_HR_AUDIT_PROVIDER ?? legacyLiveProvider,
    AI_EM_AUDIT_PROVIDER: source.AI_EM_AUDIT_PROVIDER ?? legacyLiveProvider,
    AI_FINAL_REVIEW_PROVIDER: source.AI_FINAL_REVIEW_PROVIDER ?? legacyLiveProvider,
    SESSION_SECRET: sessionSecret,
  });
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  if (!parsed.data.SESSION_SECRET && !buildPhase) {
    throw new Error("SESSION_SECRET is required when APP_MODE=production");
  }
  if (parsed.data.CANDIDARC_DATA_MODE === "postgres" && !parsed.data.DATABASE_URL && !buildPhase) {
    throw new Error("DATABASE_URL is required when CANDIDARC_DATA_MODE=postgres");
  }
  const env: Env = {
    ...parsed.data,
    SESSION_SECRET: parsed.data.SESSION_SECRET ?? DEMO_SESSION_SECRET,
    CSRF_SECRET: parsed.data.CSRF_SECRET ?? parsed.data.SESSION_SECRET ?? DEMO_SESSION_SECRET,
    ...flags,
  };
  return env;
}

/**
 * Validates production secrets and safety invariants.
 * Call from worker startup and production web `next start` — NOT during `next build`.
 */
export function assertRuntimeEnv(env: Env = getEnv()): void {
  assertSafeRuntime(env);
}

export function getEnv(overrides?: Partial<Record<string, string>>): Env {
  if (cached && !overrides) return cached;
  const env = parseEnvSource(overrides);
  if (!isBuildPhase()) {
    assertSafeRuntime(env);
  }
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

export function isFeatureRadarEnabled(env = getEnv()) {
  return env.FEATURE_RADAR;
}

export function isFeatureCopilotEnabled(env = getEnv()) {
  return env.FEATURE_COPILOT;
}

export function getAiMode(env = getEnv()): "mock" | "live" {
  return env.AI_MODE;
}

export function isLiveAi(env = getEnv()): boolean {
  return getAiMode(env) === "live";
}

