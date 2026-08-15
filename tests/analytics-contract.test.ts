import { describe, expect, it } from "vitest";
import { analyticsEventSchema, experimentSchema } from "../shared/analytics";

describe("first-party analytics contracts", () => {
  it("accepts a bounded attributable event and rejects unknown event families", () => {
    expect(analyticsEventSchema.safeParse({ eventName: "content.engaged", sessionId: "session-123", deduplicationKey: "event-12345", occurredAt: new Date(), properties: { action: "save" }, attribution: { source: "creativesos", medium: "native_feed", touchType: "engagement", postId: 1 } }).success).toBe(true);
    expect(analyticsEventSchema.safeParse({ eventName: "arbitrary.payload", sessionId: "session-123", deduplicationKey: "event-12345", occurredAt: new Date(), properties: {} }).success).toBe(false);
  });

  it("requires deterministic experiments to have distinct weighted variants", () => {
    expect(experimentSchema.safeParse({ key: "feed.rank.v1", name: "Feed rank", variants: [{ key: "control", weight: 50 }, { key: "candidate", weight: 50 }], guardrails: ["report_rate"] }).success).toBe(true);
    expect(experimentSchema.safeParse({ key: "feed.rank.v1", name: "Bad", variants: [{ key: "same", weight: 50 }, { key: "same", weight: 50 }] }).success).toBe(false);
  });
});
