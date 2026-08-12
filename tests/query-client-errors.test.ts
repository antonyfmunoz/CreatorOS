import { describe, expect, it } from "vitest";
import { apiRequest } from "../client/src/lib/queryClient";

describe("API error messages", () => {
  it("preserves a JSON server message", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "Provider is not activated yet" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });

    try {
      await expect(apiRequest("POST", "/api/test", {})).rejects.toThrow(
        "Provider is not activated yet",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to the HTTP status for an empty error response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 502, statusText: "Bad Gateway" });

    try {
      await expect(apiRequest("GET", "/api/test")).rejects.toThrow("502: Bad Gateway");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
