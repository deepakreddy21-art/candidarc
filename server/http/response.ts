import { NextResponse } from "next/server";
import type { z } from "zod";
import { AppError } from "../domain/types";
import { formatApiError } from "../contracts/api";
import { createRequestId } from "../observability/logger";

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, { status: init?.status ?? 200, headers: init?.headers });
}

function isAppError(err: unknown): err is AppError {
  if (err instanceof AppError) return true;
  return Boolean(
    err &&
      typeof err === "object" &&
      (err as { name?: string }).name === "AppError" &&
      typeof (err as { code?: unknown }).code === "string" &&
      typeof (err as { status?: unknown }).status === "number",
  );
}

export function jsonError(err: AppError | unknown, requestId?: string): NextResponse {
  const rid = requestId ?? createRequestId();

  if (isAppError(err)) {
    return NextResponse.json(formatApiError(err.code, err.message, rid, err.details), {
      status: err.status,
    });
  }

  if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "ZodError") {
    const zodErr = err as { issues?: unknown };
    return NextResponse.json(formatApiError("VALIDATION_ERROR", "Invalid request body", rid, zodErr.issues), {
      status: 400,
    });
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  return NextResponse.json(formatApiError("INTERNAL_ERROR", message, rid), { status: 500 });
}

export async function parseJsonBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new AppError("VALIDATION_ERROR", "Invalid JSON body", 400);
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw Object.assign(parsed.error, { name: "ZodError" });
  }
  return parsed.data;
}
