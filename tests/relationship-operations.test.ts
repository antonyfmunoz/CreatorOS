import { describe, expect, it } from "vitest";
import {
  RelationshipQuotaError,
  relationshipBillingPeriod,
  relationshipMetricLimit,
} from "../server/relationship-operations";

const policy = {
  monthlyOutboundMessages: 10_000,
  monthlyAiRuns: 1_000,
  monthlyVoiceSeconds: 3_600,
  monthlyRealtimeMinutes: 600,
} as Parameters<typeof relationshipMetricLimit>[0];

describe("relationship operations policy", () => {
  it("uses stable UTC calendar billing periods", () => {
    expect(relationshipBillingPeriod(new Date("2026-08-31T23:59:59-07:00")).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("maps every enforced metric to the intended tenant allowance", () => {
    expect(relationshipMetricLimit(policy, "message.inbound")).toBeNull();
    expect(relationshipMetricLimit(policy, "message.outbound")).toBe(10_000);
    expect(relationshipMetricLimit(policy, "ai.run")).toBe(1_000);
    expect(relationshipMetricLimit(policy, "voice.second")).toBe(3_600);
    expect(relationshipMetricLimit(policy, "realtime.minute")).toBe(600);
  });

  it("returns a public-safe quota error without provider or tenant secrets", () => {
    const error = new RelationshipQuotaError("voice.second", 3_600);
    expect(error.code).toBe("RELATIONSHIP_QUOTA_EXCEEDED");
    expect(error.message).toContain("3,600");
    expect(error.message).not.toMatch(/token|secret|key/i);
  });
});
