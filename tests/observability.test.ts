import { describe, expect, it, vi } from "vitest";
import { requestObservability, structuredLog } from "../server/observability";

describe("production observability", () => {
  it("accepts a safe request id and emits it on the response", () => {
    const headers = new Map<string, string>();
    const listeners = new Map<string, () => void>();
    const req = { get: () => "request-qualification-123", path: "/api/health", method: "GET" } as never;
    const res = {
      locals: {}, statusCode: 200,
      setHeader: (name: string, value: string) => headers.set(name, value),
      on: (event: string, listener: () => void) => listeners.set(event, listener),
    } as never;
    requestObservability(req, res, () => undefined);
    expect(headers.get("X-Request-Id")).toBe("request-qualification-123");
    listeners.get("finish")?.();
  });

  it("redacts secret-shaped fields from structured logs", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    structuredLog("info", "qualification", { token: "do-not-log", safe: "visible" });
    expect(log.mock.calls[0][0]).not.toContain("do-not-log");
    expect(log.mock.calls[0][0]).toContain("visible");
    log.mockRestore();
  });
});
