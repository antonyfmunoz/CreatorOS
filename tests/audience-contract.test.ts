import { describe, expect, it } from "vitest";
import { createNotificationEventSchema, notificationPreferenceSchema, upsertAudienceProfileSchema } from "../shared/audience";

describe("audience and notification contracts", () => {
  it("normalizes interests and requires exactly one notification recipient", () => {
    const profile = upsertAudienceProfileSchema.parse({ subscriberStatus: "subscribed", lifecycleState: "engaged", acquisitionSource: "landing_page", interests: ["Video", "video"], engagementScore: 50, fields: {} });
    expect(profile.interests).toEqual(["video"]);
    expect(createNotificationEventSchema.safeParse({ recipientUserId: 1, relationshipId: crypto.randomUUID(), eventType: "test", title: "Test", body: "Test", purpose: "product", channels: ["in_app"], dedupeKey: "test-key-123" }).success).toBe(false);
  });
  it("validates quiet hours and deduplicates requested channels", () => {
    expect(notificationPreferenceSchema.safeParse({ recipientUserId: 1, channel: "push", purpose: "product", enabled: true, quietHoursStart: "22:00", quietHoursEnd: "07:00", timezone: "America/Los_Angeles", digestCadence: "daily" }).success).toBe(true);
    const event = createNotificationEventSchema.parse({ recipientUserId: 1, eventType: "release.ready", title: "Ready", body: "Your release is ready", purpose: "product", channels: ["in_app", "in_app"], dedupeKey: "release-ready-1" });
    expect(event.channels).toEqual(["in_app"]);
  });
});
