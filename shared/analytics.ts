import { z } from "zod";

export const analyticsEventNames = [
  "content.exposed", "content.engaged", "media.played", "relationship.started",
  "funnel.step", "product.viewed", "checkout.started", "purchase.completed",
  "entitlement.activated", "refund.completed", "revenue.allocated", "experiment.exposed",
  "podcast.start", "podcast.progress", "podcast.complete",
  "site.view", "site.click", "site.subscribe",
] as const;

const properties = z.record(z.unknown()).refine((value) => JSON.stringify(value).length <= 8_000, "Event properties are too large");

export const analyticsEventSchema = z.object({
  eventName: z.enum(analyticsEventNames),
  schemaVersion: z.number().int().min(1).max(20).default(1),
  sessionId: z.string().trim().min(8).max(180),
  anonymousId: z.string().trim().min(8).max(180).nullable().default(null),
  objectType: z.enum(["post", "asset", "product", "campaign", "distribution", "relationship", "order", "entitlement", "experiment", "podcast_episode", "site"]).nullable().default(null),
  objectId: z.string().trim().max(180).nullable().default(null),
  source: z.string().trim().min(1).max(80).default("web"),
  deduplicationKey: z.string().trim().min(8).max(200),
  consentState: z.enum(["essential", "analytics", "denied"]).default("essential"),
  occurredAt: z.coerce.date(),
  properties,
  attribution: z.object({
    source: z.string().trim().min(1).max(120),
    medium: z.string().trim().min(1).max(120),
    campaignName: z.string().trim().max(200).nullable().default(null),
    touchType: z.enum(["view", "engagement", "conversation", "click", "checkout"]),
    assetId: z.string().uuid().nullable().default(null),
    postId: z.number().int().positive().nullable().default(null),
    campaignId: z.string().uuid().nullable().default(null),
    distributionJobId: z.string().uuid().nullable().default(null),
    confidence: z.number().min(0).max(1).default(1),
  }).nullable().default(null),
});

export const experimentSchema = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_.-]{2,79}$/),
  name: z.string().trim().min(1).max(160),
  variants: z.array(z.object({ key: z.string().trim().regex(/^[a-z0-9_-]{1,40}$/), weight: z.number().int().positive().max(10_000) })).min(2).max(10)
    .refine((items) => new Set(items.map((item) => item.key)).size === items.length, "Variant keys must be unique"),
  guardrails: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});
