import { randomUUID } from "crypto";
import pino from "pino";
import { getEnv } from "../config/env";

const SENSITIVE = /(password|secret|token|authorization|cookie|resume|transcript|evidence|api[_-]?key)/i;

export function createLogger(bindings?: Record<string, unknown>) {
  const env = getEnv();
  return pino({
    level: env.LOG_LEVEL,
    base: bindings,
    redact: {
      paths: ["password", "token", "authorization", "cookie", "req.headers.authorization", "req.headers.cookie"],
      censor: "[REDACTED]",
    },
    serializers: {
      err: pino.stdSerializers.err,
    },
    hooks: {
      logMethod(inputArgs, method) {
        const [obj, msg, ...rest] = inputArgs as [Record<string, unknown> | string, string?, ...unknown[]];
        if (typeof obj === "object" && obj) {
          for (const key of Object.keys(obj)) {
            if (SENSITIVE.test(key)) obj[key] = "[REDACTED]";
          }
        }
        return method.apply(this, [obj, msg, ...rest] as Parameters<typeof method>);
      },
    },
  });
}

export const logger = createLogger({ service: "candidarc" });

export function createRequestId() {
  return `req_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function createTraceId() {
  return `tr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
