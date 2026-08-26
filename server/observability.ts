import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { posthog } from "./posthog";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const REDACTED_FIELD = /(authorization|cookie|password|secret|token|credential|key|signature|session|prompt|transcript|content|body)/i;

function safeValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 50).map(([key, item]) => [
      key,
      REDACTED_FIELD.test(key) ? "[redacted]" : safeValue(item, depth + 1),
    ]));
  }
  return String(value);
}

export function structuredLog(
  level: "debug" | "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown> = {},
) {
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(safeValue(fields) as Record<string, unknown>),
  });
  if (level === "error") console.error(record);
  else if (level === "warn") console.warn(record);
  else console.log(record);
}

export function requestObservability(req: Request, res: Response, next: NextFunction) {
  const supplied = req.get("x-request-id")?.trim();
  const requestId = supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
  const startedAt = performance.now();
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  res.on("finish", () => {
    if (!req.path.startsWith("/api/")) return;
    structuredLog(res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info", "http.request", {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      userId: req.dbUser?.id,
    });
  });
  next();
}

export function captureServerException(error: unknown, fields: Record<string, unknown> = {}) {
  const exception = error instanceof Error ? error : new Error(String(error));
  const cause = exception.cause instanceof Error ? exception.cause : null;
  const causeCode = cause && "code" in cause && typeof cause.code === "string"
    ? cause.code
    : undefined;
  const safeFields = safeValue(fields) as Record<string, unknown>;
  structuredLog("error", "server.exception", {
    ...safeFields,
    errorType: exception.name,
    errorMessage: exception.message,
    errorCauseType: cause?.name,
    errorCauseMessage: cause?.message,
    errorCauseCode: causeCode,
  });
  posthog?.captureException(exception, "creativesos-server", safeFields);
}
