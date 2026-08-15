import { expect, test } from "@playwright/test";

test("audience identity resolves consent, preferences, dedupe, batching and suppression", async ({ page }) => {
  await page.goto("/"); const current = await (await page.request.get("/api/user")).json() as { id: number };
  const stamp = Date.now();
  const relationship = await (await page.request.post("/api/relationship-hub/relationships", { data: { displayName: `Audience ${stamp}`, source: "field_test", timezone: "UTC" } })).json() as { id: string };
  expect((await page.request.put(`/api/audience/relationships/${relationship.id}/profile`, { data: { subscriberStatus: "subscribed", lifecycleState: "engaged", acquisitionSource: "field_test", interests: ["video", "business"], engagementScore: 75, fields: { cohort: "qualification" } } })).status()).toBe(200);
  const segment = await (await page.request.post("/api/audience/segments", { data: { name: `Engaged ${stamp}`, filter: { subscriberStatus: "subscribed", lifecycleState: "engaged", interestsAny: ["video"], minimumEngagementScore: 50 } } })).json() as { memberCount: number };
  expect(segment.memberCount).toBeGreaterThanOrEqual(1);

  const denied = await (await page.request.post("/api/audience/notifications", { data: { relationshipId: relationship.id, eventType: "newsletter.issue", title: "Issue", body: "Consent is required", purpose: "marketing", channels: ["email"], dedupeKey: `audience-denied-${stamp}` } })).json() as { event: { status: string }; deliveries: Array<{ status: string; errorCode: string }> };
  expect(denied.event.status).toBe("suppressed"); expect(denied.deliveries[0]).toMatchObject({ status: "suppressed", errorCode: "consent_not_granted" });
  expect((await page.request.post(`/api/relationship-hub/relationships/${relationship.id}/consents`, { data: { channel: "email", purpose: "marketing", status: "granted", evidenceNote: "Audience field-test explicit opt-in" } })).status()).toBe(201);
  const authorized = await (await page.request.post("/api/audience/notifications", { data: { relationshipId: relationship.id, eventType: "newsletter.issue", title: "Issue", body: "Authorized provider handoff", purpose: "marketing", channels: ["email"], dedupeKey: `audience-authorized-${stamp}` } })).json() as { deliveries: Array<{ status: string; errorCode: string }> };
  expect(authorized.deliveries[0]).toMatchObject({ status: "provider_pending", errorCode: "provider_unconfigured" });

  expect((await page.request.put("/api/audience/notification-preferences", { data: { recipientUserId: current.id, channel: "in_app", purpose: "product", enabled: true, quietHoursStart: null, quietHoursEnd: null, timezone: "UTC", digestCadence: "immediate" } })).status()).toBe(200);
  const key = `native-notice-${stamp}`; const first = await (await page.request.post("/api/audience/notifications", { data: { recipientUserId: current.id, eventType: "release.ready", title: "Ready", body: "Native delivery", purpose: "product", channels: ["in_app"], dedupeKey: key } })).json() as { event: { id: string }; deliveries: Array<{ status: string }> };
  const duplicate = await (await page.request.post("/api/audience/notifications", { data: { recipientUserId: current.id, eventType: "release.ready", title: "Ready", body: "Native delivery", purpose: "product", channels: ["in_app"], dedupeKey: key } })).json() as { event: { id: string }; deliveries: Array<{ status: string }> };
  expect(first.event.id).toBe(duplicate.event.id); expect(first.deliveries).toHaveLength(1); expect(first.deliveries[0].status).toBe("delivered");

  expect((await page.request.put("/api/audience/notification-preferences", { data: { recipientUserId: current.id, channel: "push", purpose: "product", enabled: true, quietHoursStart: null, quietHoursEnd: null, timezone: "UTC", digestCadence: "daily" } })).status()).toBe(200);
  const batched = await (await page.request.post("/api/audience/notifications", { data: { recipientUserId: current.id, eventType: "digest.item", title: "Digest", body: "Batch me", purpose: "product", channels: ["push"], dedupeKey: `audience-batched-${stamp}` } })).json() as { event: { status: string }; deliveries: Array<{ status: string }> };
  expect(batched.event.status).toBe("batched"); expect(batched.deliveries[0].status).toBe("batched");
  expect((await page.request.post("/api/audience/suppressions", { data: { userId: current.id, channel: "in_app", purpose: "product", reason: "field_test_opt_out" } })).status()).toBe(201);
  const suppressed = await (await page.request.post("/api/audience/notifications", { data: { recipientUserId: current.id, eventType: "release.ready", title: "Blocked", body: "Do not deliver", purpose: "product", channels: ["in_app"], dedupeKey: `audience-suppressed-${stamp}` } })).json() as { event: { status: string }; deliveries: Array<{ status: string }> };
  expect(suppressed.event.status).toBe("suppressed"); expect(suppressed.deliveries[0].status).toBe("suppressed");
});
