import crypto from "node:crypto";
import type { Express } from "express";
import { and, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { analyticsEventSchema, experimentSchema } from "@shared/analytics";
import {
  analyticsEvents, analyticsExperimentAssignments, analyticsExperiments, analyticsIdentityLinks,
  assets, attributionTouches, businesses, conversionAttributions, mediaPlaybackSessions,
  orderItems, orders, postViews, posts, products,
} from "@shared/schema";
import { attachUser } from "./auth";
import { ensureDefaultBusiness, userCanManageBusiness } from "./businesses";
import { db } from "./db";

async function businessForAttribution(input: { assetId?: string | null; postId?: number | null; objectType?: string | null; objectId?: string | null }) {
  if (input.assetId) {
    const [asset] = await db.select({ businessId: assets.businessId, ownerUserId: assets.ownerUserId }).from(assets).where(eq(assets.id, input.assetId)).limit(1);
    if (asset?.businessId) return asset.businessId;
    if (asset) return (await db.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.ownerUserId, asset.ownerUserId), eq(businesses.isDefault, true))).limit(1))[0]?.id ?? null;
  }
  const postId = input.postId ?? (input.objectType === "post" ? Number(input.objectId) : null);
  if (postId && Number.isInteger(postId)) {
    const [post] = await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, postId)).limit(1);
    if (post) return (await db.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.ownerUserId, post.userId), eq(businesses.isDefault, true))).limit(1))[0]?.id ?? null;
  }
  if (input.objectType === "product" && input.objectId) {
    const [product] = await db.select({ userId: products.userId }).from(products).where(eq(products.id, Number(input.objectId))).limit(1);
    if (product) return (await db.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.ownerUserId, product.userId), eq(businesses.isDefault, true))).limit(1))[0]?.id ?? null;
  }
  return null;
}

export async function emitAnalyticsEvent(input: {
  userId: number;
  businessId?: string | null;
  eventName: typeof analyticsEvents.$inferInsert.eventName;
  sessionId: string;
  deduplicationKey: string;
  objectType?: string | null;
  objectId?: string | null;
  properties?: Record<string, unknown>;
  source?: string;
  occurredAt?: Date;
}) {
  const [event] = await db.insert(analyticsEvents).values({
    userId: input.userId, businessId: input.businessId ?? null, eventName: input.eventName,
    sessionId: input.sessionId, deduplicationKey: input.deduplicationKey, objectType: input.objectType ?? null,
    objectId: input.objectId ?? null, properties: input.properties ?? {}, source: input.source ?? "server",
    occurredAt: input.occurredAt ?? new Date(), consentState: "essential",
  }).onConflictDoNothing().returning();
  return event ?? null;
}

export async function latestAttributionTouch(userId: number) {
  const [touch] = await db.select().from(attributionTouches).where(and(eq(attributionTouches.userId, userId), gt(attributionTouches.expiresAt, new Date()))).orderBy(desc(attributionTouches.occurredAt)).limit(1);
  return touch ?? null;
}

export async function attributeOrderConversion(order: typeof orders.$inferSelect) {
  const touchId = typeof order.attributionContext?.touchId === "string" ? order.attributionContext.touchId : null;
  if (!touchId) return null;
  const [touch] = await db.select().from(attributionTouches).where(and(eq(attributionTouches.id, touchId), gt(attributionTouches.expiresAt, new Date()))).limit(1);
  if (!touch) return null;
  const [saved] = await db.insert(conversionAttributions).values({ orderId: order.id, touchId: touch.id, model: "last_touch_30d", credit: 1, attributedRevenueCents: Math.max(0, Math.round((order.totalAmount - order.refundedAmount) * 100)) }).onConflictDoUpdate({
    target: [conversionAttributions.orderId, conversionAttributions.touchId, conversionAttributions.model],
    set: { attributedRevenueCents: Math.max(0, Math.round((order.totalAmount - order.refundedAmount) * 100)) },
  }).returning();
  return saved;
}

export function registerAnalyticsRoutes(app: Express) {
  app.post("/api/analytics/events", attachUser, async (req, res) => {
    const parsed = analyticsEventSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid analytics event" });
    const now = Date.now();
    if (parsed.data.occurredAt.getTime() < now - 7 * 24 * 60 * 60_000 || parsed.data.occurredAt.getTime() > now + 5 * 60_000) return res.status(400).json({ message: "Event time is outside the accepted window" });
    if (parsed.data.consentState === "denied" && parsed.data.eventName !== "funnel.step") return res.status(202).json({ status: "suppressed" });
    const businessId = await businessForAttribution({ assetId: parsed.data.attribution?.assetId, postId: parsed.data.attribution?.postId, objectType: parsed.data.objectType, objectId: parsed.data.objectId });
    const [event] = await db.insert(analyticsEvents).values({ ...parsed.data, userId: req.dbUser!.id, businessId, anonymousId: parsed.data.anonymousId, properties: parsed.data.properties }).onConflictDoNothing().returning();
    if (parsed.data.anonymousId) await db.insert(analyticsIdentityLinks).values({ businessId, anonymousId: parsed.data.anonymousId, userId: req.dbUser!.id }).onConflictDoUpdate({ target: [analyticsIdentityLinks.businessId, analyticsIdentityLinks.anonymousId, analyticsIdentityLinks.userId], set: { lastSeenAt: new Date(), confidence: 1 } });
    let touch = null;
    if (parsed.data.attribution) {
      const value = parsed.data.attribution;
      [touch] = await db.insert(attributionTouches).values({ businessId, userId: req.dbUser!.id, anonymousId: parsed.data.anonymousId, assetId: value.assetId, postId: value.postId, campaignId: value.campaignId, distributionJobId: value.distributionJobId, source: value.source, medium: value.medium, campaignName: value.campaignName, touchType: value.touchType, confidence: value.confidence, deduplicationKey: `touch:${parsed.data.deduplicationKey}`, occurredAt: parsed.data.occurredAt, expiresAt: new Date(parsed.data.occurredAt.getTime() + 30 * 24 * 60 * 60_000) }).onConflictDoNothing().returning();
    }
    return res.status(event ? 201 : 200).json({ event: event ?? { status: "duplicate" }, touch });
  });

  app.get("/api/analytics/overview", attachUser, async (req, res) => {
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);
    const business = await ensureDefaultBusiness(req.dbUser!);
    const ownedPostIds = (await db.select({ id: posts.id }).from(posts).where(eq(posts.userId, req.dbUser!.id))).map((row) => row.id);
    const [eventCounts, views, playback, sales, attribution, topPosts] = await Promise.all([
      db.select({ eventName: analyticsEvents.eventName, value: count() }).from(analyticsEvents).where(and(eq(analyticsEvents.businessId, business.id), gt(analyticsEvents.occurredAt, since))).groupBy(analyticsEvents.eventName),
      ownedPostIds.length ? db.select({ value: count() }).from(postViews).where(and(inArray(postViews.postId, ownedPostIds), gt(postViews.viewedAt, since))) : Promise.resolve([{ value: 0 }]),
      db.select({ sessions: count(), watchMs: sql<number>`coalesce(sum(${mediaPlaybackSessions.watchMs}), 0)::bigint`, rebufferMs: sql<number>`coalesce(sum(${mediaPlaybackSessions.rebufferMs}), 0)::bigint` }).from(mediaPlaybackSessions).innerJoin(assets, eq(mediaPlaybackSessions.assetId, assets.id)).where(and(eq(assets.ownerUserId, req.dbUser!.id), gt(mediaPlaybackSessions.startedAt, since))),
      db.select({ orders: sql<number>`count(distinct ${orders.id})::int`, revenueCents: sql<number>`coalesce(sum(${orderItems.unitAmount} * ${orderItems.quantity} * 100), 0)::bigint` }).from(orderItems).innerJoin(products, eq(orderItems.productId, products.id)).innerJoin(orders, eq(orderItems.orderId, orders.id)).where(and(eq(products.userId, req.dbUser!.id), inArray(orders.financialStatus, ["paid", "partially_refunded", "dispute_won"]), gt(orders.createdAt, since))),
      db.select({ conversions: count(), revenueCents: sql<number>`coalesce(sum(${conversionAttributions.attributedRevenueCents}), 0)::bigint` }).from(conversionAttributions).innerJoin(attributionTouches, eq(conversionAttributions.touchId, attributionTouches.id)).where(and(eq(attributionTouches.businessId, business.id), gt(conversionAttributions.createdAt, since))),
      ownedPostIds.length ? db.select({ postId: postViews.postId, views: count() }).from(postViews).where(and(inArray(postViews.postId, ownedPostIds), gt(postViews.viewedAt, since))).groupBy(postViews.postId).orderBy(desc(count())).limit(10) : Promise.resolve([]),
    ]);
    const events = Object.fromEntries(eventCounts.map((row) => [row.eventName, Number(row.value)]));
    const watchMs = Number(playback[0]?.watchMs ?? 0); const rebufferMs = Number(playback[0]?.rebufferMs ?? 0);
    return res.json({ periodDays: days, metrics: { reach: Number(views[0]?.value ?? 0), playbackSessions: Number(playback[0]?.sessions ?? 0), watchMs, rebufferRatio: watchMs + rebufferMs ? rebufferMs / (watchMs + rebufferMs) : 0, conversions: Number(sales[0]?.orders ?? 0), revenueCents: Number(sales[0]?.revenueCents ?? 0), attributedConversions: Number(attribution[0]?.conversions ?? 0), attributedRevenueCents: Number(attribution[0]?.revenueCents ?? 0) }, events, topPosts });
  });

  app.post("/api/analytics/experiments", attachUser, async (req, res) => {
    const parsed = experimentSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid experiment" });
    const business = await ensureDefaultBusiness(req.dbUser!);
    const [experiment] = await db.insert(analyticsExperiments).values({ businessId: business.id, ...parsed.data }).returning();
    return res.status(201).json(experiment);
  });

  app.post("/api/analytics/experiments/:id/status", attachUser, async (req, res) => {
    const status = typeof req.body?.status === "string" ? req.body.status : "";
    if (!["draft", "running", "paused", "completed", "rolled_back"].includes(status)) return res.status(400).json({ message: "Invalid experiment status" });
    const [experiment] = await db.select().from(analyticsExperiments).where(eq(analyticsExperiments.id, req.params.id)).limit(1);
    if (!experiment || !(await userCanManageBusiness(req.dbUser!.id, experiment.businessId))) return res.status(404).json({ message: "Experiment not found" });
    const [updated] = await db.update(analyticsExperiments).set({ status, startsAt: status === "running" ? experiment.startsAt ?? new Date() : experiment.startsAt, endsAt: ["completed", "rolled_back"].includes(status) ? new Date() : experiment.endsAt, updatedAt: new Date() }).where(eq(analyticsExperiments.id, experiment.id)).returning();
    return res.json(updated);
  });

  app.post("/api/analytics/experiments/:id/assign", attachUser, async (req, res) => {
    const [experiment] = await db.select().from(analyticsExperiments).where(eq(analyticsExperiments.id, req.params.id)).limit(1);
    if (!experiment) return res.status(404).json({ message: "Experiment not found" });
    if (experiment.status !== "running") return res.status(409).json({ message: "Experiment is not running" });
    const total = experiment.variants.reduce((sum, variant) => sum + variant.weight, 0);
    const bucket = Number.parseInt(crypto.createHash("sha256").update(`${experiment.id}:${req.dbUser!.id}`).digest("hex").slice(0, 12), 16) % total;
    let cursor = 0; const variant = experiment.variants.find((candidate) => { cursor += candidate.weight; return bucket < cursor; })?.key ?? experiment.variants[0].key;
    const [created] = await db.insert(analyticsExperimentAssignments).values({ experimentId: experiment.id, userId: req.dbUser!.id, variant }).onConflictDoNothing().returning();
    const assignment = created ?? (await db.select().from(analyticsExperimentAssignments).where(and(eq(analyticsExperimentAssignments.experimentId, experiment.id), eq(analyticsExperimentAssignments.userId, req.dbUser!.id))).limit(1))[0];
    return res.json(assignment);
  });
}
