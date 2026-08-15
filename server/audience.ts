import type { Express } from "express";
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { createAudienceSegmentSchema, createNotificationEventSchema, notificationPreferenceSchema, upsertAudienceProfileSchema } from "@shared/audience";
import { audienceProfiles, audienceSegmentMemberships, audienceSegments, notificationDeliveries, notificationEvents, notificationPreferences, notificationSuppressions, notifications, relationshipConsents, relationships } from "@shared/schema";
import { attachUser } from "./auth";
import { ensureDefaultBusiness, userCanManageBusiness } from "./businesses";
import { db } from "./db";
import { effectiveRelationshipConsent } from "./relationship-governance";

async function ownedRelationship(userId: number, id: string) {
  const [relationship] = await db.select().from(relationships).where(eq(relationships.id, id)).limit(1);
  return relationship && await userCanManageBusiness(userId, relationship.businessId) ? relationship : null;
}

function localMinutes(date: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
    return Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  } catch { return 0; }
}
function clockMinutes(value: string | null) { if (!value) return null; const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; }
function isQuietNow(preference: typeof notificationPreferences.$inferSelect | undefined, at: Date) {
  const start = clockMinutes(preference?.quietHoursStart ?? null); const end = clockMinutes(preference?.quietHoursEnd ?? null); if (start === null || end === null || start === end) return false;
  const now = localMinutes(at, preference?.timezone ?? "UTC"); return start < end ? now >= start && now < end : now >= start || now < end;
}

async function channelDecision(event: typeof notificationEvents.$inferSelect, channel: "in_app" | "email" | "push") {
  const recipientCondition = event.recipientUserId ? eq(notificationPreferences.userId, event.recipientUserId) : eq(notificationPreferences.relationshipId, event.relationshipId!);
  const [preference] = await db.select().from(notificationPreferences).where(and(eq(notificationPreferences.businessId, event.businessId), recipientCondition, eq(notificationPreferences.channel, channel), eq(notificationPreferences.purpose, event.purpose))).limit(1);
  if (preference && (!preference.enabled || preference.digestCadence === "off")) return { status: "suppressed" as const, code: "preference_disabled" };
  const suppressionRecipient = event.recipientUserId ? eq(notificationSuppressions.userId, event.recipientUserId) : eq(notificationSuppressions.relationshipId, event.relationshipId!);
  const [suppression] = await db.select().from(notificationSuppressions).where(and(eq(notificationSuppressions.businessId, event.businessId), suppressionRecipient, inArray(notificationSuppressions.channel, [channel, "all"]), inArray(notificationSuppressions.purpose, [event.purpose, "all"]), or(isNull(notificationSuppressions.expiresAt), gt(notificationSuppressions.expiresAt, new Date()))!)).limit(1);
  if (suppression) return { status: "suppressed" as const, code: `suppressed:${suppression.reason}` };
  if (event.relationshipId && event.purpose !== "essential") {
    const consents = await db.select().from(relationshipConsents).where(and(eq(relationshipConsents.relationshipId, event.relationshipId), eq(relationshipConsents.channel, channel), eq(relationshipConsents.purpose, event.purpose))).orderBy(desc(relationshipConsents.updatedAt), desc(relationshipConsents.createdAt));
    const consent = effectiveRelationshipConsent(consents);
    if (consent?.status !== "granted" || (consent.expiresAt && consent.expiresAt <= new Date())) return { status: "suppressed" as const, code: "consent_not_granted" };
  }
  if (preference?.digestCadence && preference.digestCadence !== "immediate") return { status: "batched" as const, code: `digest:${preference.digestCadence}` };
  if (event.urgency !== "critical" && isQuietNow(preference, new Date())) return { status: "batched" as const, code: "quiet_hours" };
  if (channel === "in_app" && !event.recipientUserId) return { status: "suppressed" as const, code: "no_native_account" };
  return { status: channel === "in_app" ? "delivered" as const : "provider_pending" as const, code: channel === "in_app" ? "native" : "provider_unconfigured" };
}

export async function emitGovernedNotification(input: typeof notificationEvents.$inferInsert & { channels: Array<"in_app" | "email" | "push"> }) {
  const { channels, ...eventValues } = input;
  let [event] = await db.insert(notificationEvents).values(eventValues).onConflictDoNothing().returning();
  if (!event) [event] = await db.select().from(notificationEvents).where(and(eq(notificationEvents.businessId, input.businessId), eq(notificationEvents.dedupeKey, input.dedupeKey))).limit(1);
  const deliveries = [];
  for (const channel of channels) {
    const decision = await channelDecision(event, channel);
    const [delivery] = await db.insert(notificationDeliveries).values({ eventId: event.id, channel, adapter: channel === "in_app" ? "native" : "unconfigured", status: decision.status, errorCode: decision.status === "suppressed" || decision.status === "provider_pending" ? decision.code : null, deliveredAt: decision.status === "delivered" ? new Date() : null, nextAttemptAt: decision.status === "batched" ? new Date(Date.now() + 60 * 60_000) : new Date() }).onConflictDoNothing().returning();
    if (decision.status === "delivered" && event.recipientUserId) await db.insert(notifications).values({ userId: event.recipientUserId, type: event.eventType, message: event.body, read: false, linkTo: event.linkTo, sourceType: "notification_event", sourceId: event.id }).onConflictDoNothing();
    if (delivery) deliveries.push(delivery);
  }
  const persisted = await db.select().from(notificationDeliveries).where(eq(notificationDeliveries.eventId, event.id));
  const status = persisted.every((delivery) => delivery.status === "suppressed") ? "suppressed" : persisted.every((delivery) => ["delivered", "suppressed"].includes(delivery.status)) ? "completed" : persisted.some((delivery) => delivery.status === "batched") ? "batched" : "accepted";
  if (event.status !== status) [event] = await db.update(notificationEvents).set({ status }).where(eq(notificationEvents.id, event.id)).returning();
  return { event, deliveries: persisted.length ? persisted : deliveries };
}

export function registerAudienceRoutes(app: Express) {
  app.get("/api/audience", attachUser, async (req, res) => {
    const business = await ensureDefaultBusiness(req.dbUser!);
    const [profiles, segments, preferences, recentEvents] = await Promise.all([db.select({ profile: audienceProfiles, relationship: relationships }).from(audienceProfiles).innerJoin(relationships, eq(audienceProfiles.relationshipId, relationships.id)).where(eq(audienceProfiles.businessId, business.id)).orderBy(desc(audienceProfiles.updatedAt)).limit(1_000), db.select().from(audienceSegments).where(eq(audienceSegments.businessId, business.id)).orderBy(desc(audienceSegments.updatedAt)), db.select().from(notificationPreferences).where(eq(notificationPreferences.businessId, business.id)), db.select().from(notificationEvents).where(eq(notificationEvents.businessId, business.id)).orderBy(desc(notificationEvents.createdAt)).limit(100)]);
    return res.json({ profiles, segments, preferences, recentEvents });
  });

  app.put("/api/audience/relationships/:relationshipId/profile", attachUser, async (req, res) => {
    const parsed = upsertAudienceProfileSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid audience profile" });
    const relationship = await ownedRelationship(req.dbUser!.id, req.params.relationshipId); if (!relationship) return res.status(404).json({ message: "Relationship not found" });
    const now = new Date(); const [profile] = await db.insert(audienceProfiles).values({ businessId: relationship.businessId, relationshipId: relationship.id, ...parsed.data, subscribedAt: parsed.data.subscriberStatus === "subscribed" ? now : null, unsubscribedAt: parsed.data.subscriberStatus === "unsubscribed" ? now : null }).onConflictDoUpdate({ target: [audienceProfiles.businessId, audienceProfiles.relationshipId], set: { ...parsed.data, subscribedAt: parsed.data.subscriberStatus === "subscribed" ? now : null, unsubscribedAt: parsed.data.subscriberStatus === "unsubscribed" ? now : null, updatedAt: now } }).returning();
    return res.json(profile);
  });

  app.post("/api/audience/segments", attachUser, async (req, res) => {
    const parsed = createAudienceSegmentSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid segment" }); const business = await ensureDefaultBusiness(req.dbUser!);
    const [segment] = await db.insert(audienceSegments).values({ businessId: business.id, createdByUserId: req.dbUser!.id, ...parsed.data }).returning();
    const conditions = [eq(audienceProfiles.businessId, business.id)]; const filter = parsed.data.filter; if (filter.subscriberStatus) conditions.push(eq(audienceProfiles.subscriberStatus, filter.subscriberStatus)); if (filter.lifecycleState) conditions.push(eq(audienceProfiles.lifecycleState, filter.lifecycleState)); if (filter.acquisitionSource) conditions.push(eq(audienceProfiles.acquisitionSource, filter.acquisitionSource));
    const matching = await db.select().from(audienceProfiles).where(and(...conditions)); const filtered = matching.filter((profile) => (filter.minimumEngagementScore === undefined || profile.engagementScore >= filter.minimumEngagementScore) && (!filter.interestsAny?.length || filter.interestsAny.some((interest) => profile.interests.includes(interest.toLowerCase()))));
    if (filtered.length) await db.insert(audienceSegmentMemberships).values(filtered.map((profile) => ({ segmentId: segment.id, relationshipId: profile.relationshipId, source: "filter_snapshot" }))).onConflictDoNothing();
    return res.status(201).json({ ...segment, memberCount: filtered.length });
  });

  app.put("/api/audience/notification-preferences", attachUser, async (req, res) => {
    const parsed = notificationPreferenceSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid notification preference" }); const business = await ensureDefaultBusiness(req.dbUser!);
    if (parsed.data.recipientUserId !== req.dbUser!.id) return res.status(403).json({ message: "You can only edit your own notification preferences" });
    const [preference] = await db.insert(notificationPreferences).values({ businessId: business.id, userId: parsed.data.recipientUserId, relationshipId: null, ...parsed.data }).onConflictDoUpdate({ target: [notificationPreferences.businessId, notificationPreferences.userId, notificationPreferences.channel, notificationPreferences.purpose], targetWhere: sql`${notificationPreferences.userId} is not null`, set: { enabled: parsed.data.enabled, quietHoursStart: parsed.data.quietHoursStart, quietHoursEnd: parsed.data.quietHoursEnd, timezone: parsed.data.timezone, digestCadence: parsed.data.digestCadence, updatedAt: new Date() } }).returning();
    return res.json(preference);
  });

  app.post("/api/audience/notifications", attachUser, async (req, res) => {
    const parsed = createNotificationEventSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid notification event" }); const business = await ensureDefaultBusiness(req.dbUser!);
    if (parsed.data.recipientUserId !== req.dbUser!.id && !await userCanManageBusiness(req.dbUser!.id, business.id)) return res.status(403).json({ message: "Recipient is outside your authority" });
    if (parsed.data.relationshipId && !(await ownedRelationship(req.dbUser!.id, parsed.data.relationshipId))) return res.status(404).json({ message: "Relationship not found" });
    const result = await emitGovernedNotification({ businessId: business.id, recipientUserId: parsed.data.recipientUserId ?? null, relationshipId: parsed.data.relationshipId ?? null, eventType: parsed.data.eventType, title: parsed.data.title, body: parsed.data.body, linkTo: parsed.data.linkTo, purpose: parsed.data.purpose, urgency: parsed.data.urgency, data: parsed.data.data, dedupeKey: parsed.data.dedupeKey, scheduledAt: parsed.data.scheduledAt, channels: parsed.data.channels });
    return res.status(202).json(result);
  });

  app.post("/api/audience/suppressions", attachUser, async (req, res) => {
    const business = await ensureDefaultBusiness(req.dbUser!); const userId = Number.isInteger(req.body?.userId) ? req.body.userId : null; const relationshipId = typeof req.body?.relationshipId === "string" ? req.body.relationshipId : null; if (Number(Boolean(userId)) + Number(Boolean(relationshipId)) !== 1) return res.status(400).json({ message: "Choose exactly one recipient" }); if (userId !== req.dbUser!.id && !await userCanManageBusiness(req.dbUser!.id, business.id)) return res.status(403).json({ message: "Recipient is outside your authority" });
    const channel = ["in_app", "email", "push", "all"].includes(req.body?.channel) ? req.body.channel : "all"; const purpose = typeof req.body?.purpose === "string" ? req.body.purpose.slice(0, 80) : "all"; const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : "manual"; const [suppression] = await db.insert(notificationSuppressions).values({ businessId: business.id, userId, relationshipId, channel, purpose, reason, source: "manual" }).returning(); return res.status(201).json(suppression);
  });

  app.post("/api/audience/deliveries/:id/receipt", attachUser, async (req, res) => {
    const status = typeof req.body?.status === "string" ? req.body.status : ""; if (!["sent", "delivered", "opened", "clicked", "failed"].includes(status)) return res.status(400).json({ message: "Invalid receipt status" }); const [delivery] = await db.select({ delivery: notificationDeliveries, event: notificationEvents }).from(notificationDeliveries).innerJoin(notificationEvents, eq(notificationDeliveries.eventId, notificationEvents.id)).where(eq(notificationDeliveries.id, req.params.id)).limit(1); if (!delivery || !await userCanManageBusiness(req.dbUser!.id, delivery.event.businessId)) return res.status(404).json({ message: "Delivery not found" }); const now = new Date(); const [updated] = await db.update(notificationDeliveries).set({ status, providerReceiptId: typeof req.body?.providerReceiptId === "string" ? req.body.providerReceiptId.slice(0, 300) : delivery.delivery.providerReceiptId, sentAt: status === "sent" ? now : delivery.delivery.sentAt, deliveredAt: status === "delivered" ? now : delivery.delivery.deliveredAt, openedAt: status === "opened" ? now : delivery.delivery.openedAt, clickedAt: status === "clicked" ? now : delivery.delivery.clickedAt, errorCode: status === "failed" ? String(req.body?.errorCode ?? "provider_error").slice(0, 120) : null, updatedAt: now }).where(eq(notificationDeliveries.id, delivery.delivery.id)).returning(); return res.json(updated);
  });
}
