import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isRetryableOfflineStatus,
  retryDelayMs,
} from "../client/src/lib/offline-queue";

const migration = readFileSync(
  new URL("../migrations/0102_offline_resilience.sql", import.meta.url),
  "utf8",
);
const routes = readFileSync(
  new URL("../server/routes.ts", import.meta.url),
  "utf8",
);
const worker = readFileSync(
  new URL("../client/public/creativesos-sw.js", import.meta.url),
  "utf8",
);

describe("offline mutation resilience", () => {
  it("retries transient failures with bounded exponential delay", () => {
    expect([0, 408, 425, 429, 500, 503].every(isRetryableOfflineStatus)).toBe(true);
    expect([400, 403, 404, 409, 422].some(isRetryableOfflineStatus)).toBe(false);
    expect(retryDelayMs(0)).toBe(1_000);
    expect(retryDelayMs(4)).toBe(16_000);
    expect(retryDelayMs(20)).toBe(300_000);
  });

  it("deduplicates retryable creator writes at the database boundary", () => {
    expect(migration).toContain('ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "client_mutation_id"');
    expect(migration).toContain('"posts" ("user_id", "client_mutation_id")');
    expect(migration).toContain('"direct_messages" ("sender_id", "client_mutation_id")');
    expect(migration).toContain('"assets" ("owner_user_id", "client_mutation_id")');
    expect(migration.match(/WHERE "client_mutation_id" IS NOT NULL/g)).toHaveLength(3);
    expect(routes).toContain("normalizeClientMutationId");
    expect(routes).toContain("message.replayed ? 200 : 201");
    expect(routes).toContain("alreadyComplete: true");
  });

  it("keeps background sync as a client wake-up and never caches private API data", () => {
    expect(worker).toContain('event.tag !== "creativesos-offline-outbox"');
    expect(worker).toContain('type: "creativesos:flush-offline-outbox"');
    expect(worker).toContain('url.pathname.startsWith("/api/")');
    expect(worker).not.toContain("cache.put(event.request, response.clone())\n    return;\n  }\n  if (event.request.mode");
  });
});
