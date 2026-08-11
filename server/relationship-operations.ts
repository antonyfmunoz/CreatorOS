import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import {
  relationshipChannelConnections,
  relationshipDeliveryJobs,
  relationshipOperationalAlerts,
  relationshipProviderEvents,
  relationshipTenantPolicies,
  relationshipUsageLedger,
} from "../shared/schema";

export const relationshipUsageMetrics = [
  "message.inbound",
  "message.outbound",
  "ai.run",
  "voice.second",
  "realtime.minute",
] as const;

export type RelationshipUsageMetric = (typeof relationshipUsageMetrics)[number];

export class RelationshipQuotaError extends Error {
  readonly code = "RELATIONSHIP_QUOTA_EXCEEDED";
  constructor(readonly metric: RelationshipUsageMetric, readonly limit: number) {
    super(`Monthly ${metric} allowance reached (${limit.toLocaleString()}). Update the business plan or wait for the next billing period.`);
    this.name = "RelationshipQuotaError";
  }
}

export function relationshipBillingPeriod(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function relationshipMetricLimit(policy: typeof relationshipTenantPolicies.$inferSelect, metric: RelationshipUsageMetric) {
  if (metric === "message.outbound") return policy.monthlyOutboundMessages;
  if (metric === "ai.run") return policy.monthlyAiRuns;
  if (metric === "voice.second") return policy.monthlyVoiceSeconds;
  if (metric === "realtime.minute") return policy.monthlyRealtimeMinutes;
  return null;
}

export async function ensureRelationshipTenantPolicy(businessId: string) {
  await db.insert(relationshipTenantPolicies).values({ businessId }).onConflictDoNothing();
  const [policy] = await db.select().from(relationshipTenantPolicies).where(eq(relationshipTenantPolicies.businessId, businessId)).limit(1);
  if (!policy) throw new Error("Relationship tenant policy could not be provisioned");
  return policy;
}

export async function relationshipMetricUsage(businessId: string, metric: RelationshipUsageMetric, date = new Date()) {
  const periodStart = relationshipBillingPeriod(date);
  const [result] = await db.select({ quantity: sql<number>`coalesce(sum(${relationshipUsageLedger.quantity}), 0)::int` }).from(relationshipUsageLedger).where(and(
    eq(relationshipUsageLedger.businessId, businessId),
    eq(relationshipUsageLedger.metric, metric),
    eq(relationshipUsageLedger.periodStart, periodStart),
  ));
  return Number(result?.quantity ?? 0);
}

export async function assertRelationshipUsageAvailable(input: {
  businessId: string;
  metric: RelationshipUsageMetric;
  quantity?: number;
}) {
  if (input.metric === "message.inbound") return;
  const policy = await ensureRelationshipTenantPolicy(input.businessId);
  if (policy.enforcementMode !== "enforce") return;
  const limit = relationshipMetricLimit(policy, input.metric);
  if (limit == null || limit < 0) return;
  const current = await relationshipMetricUsage(input.businessId, input.metric);
  if (current + (input.quantity ?? 1) > limit) throw new RelationshipQuotaError(input.metric, limit);
}

export async function assertRelationshipConnectionAvailable(businessId: string) {
  const policy = await ensureRelationshipTenantPolicy(businessId);
  if (policy.enforcementMode !== "enforce" || policy.maxActiveConnections < 0) return;
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(relationshipChannelConnections).where(and(
    eq(relationshipChannelConnections.businessId, businessId),
    inArray(relationshipChannelConnections.status, ["active", "testing", "reauthorization_required"]),
  ));
  if (Number(row?.count ?? 0) >= policy.maxActiveConnections) {
    throw new Error(`Active channel connection allowance reached (${policy.maxActiveConnections.toLocaleString()}). Disconnect an account or update the business plan.`);
  }
}

export async function recordRelationshipUsage(input: {
  businessId: string;
  metric: RelationshipUsageMetric;
  quantity?: number;
  costUnits?: number;
  provider?: string | null;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
}) {
  const occurredAt = input.occurredAt ?? new Date();
  const [entry] = await db.insert(relationshipUsageLedger).values({
    businessId: input.businessId,
    metric: input.metric,
    quantity: Math.max(0, Math.trunc(input.quantity ?? 1)),
    costUnits: Math.max(0, Math.trunc(input.costUnits ?? 0)),
    provider: input.provider ?? null,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    idempotencyKey: input.idempotencyKey,
    periodStart: relationshipBillingPeriod(occurredAt),
    occurredAt,
    metadata: input.metadata ?? {},
  }).onConflictDoNothing().returning();
  return entry ?? null;
}

export async function upsertRelationshipAlert(input: {
  businessId: string;
  fingerprint: string;
  category: string;
  title: string;
  detail?: string;
  severity?: "info" | "warning" | "critical";
  metadata?: Record<string, unknown>;
}) {
  const now = new Date();
  const [alert] = await db.insert(relationshipOperationalAlerts).values({
    ...input,
    detail: input.detail ?? "",
    severity: input.severity ?? "warning",
    metadata: input.metadata ?? {},
  }).onConflictDoUpdate({
    target: [relationshipOperationalAlerts.businessId, relationshipOperationalAlerts.fingerprint],
    set: { title: input.title, detail: input.detail ?? "", severity: input.severity ?? "warning", category: input.category, metadata: input.metadata ?? {}, status: "open", lastSeenAt: now, resolvedAt: null, updatedAt: now },
  }).returning();
  return alert;
}

export async function relationshipOperationsSnapshot(businessId: string) {
  const policy = await ensureRelationshipTenantPolicy(businessId);
  const periodStart = relationshipBillingPeriod();
  const [usageRows, connectionRows, deliveryRows, eventRows, alerts] = await Promise.all([
    db.select({ metric: relationshipUsageLedger.metric, quantity: sql<number>`coalesce(sum(${relationshipUsageLedger.quantity}), 0)::int`, costUnits: sql<number>`coalesce(sum(${relationshipUsageLedger.costUnits}), 0)::int` }).from(relationshipUsageLedger).where(and(eq(relationshipUsageLedger.businessId, businessId), eq(relationshipUsageLedger.periodStart, periodStart))).groupBy(relationshipUsageLedger.metric),
    db.select({ status: relationshipChannelConnections.status, count: sql<number>`count(*)::int` }).from(relationshipChannelConnections).where(eq(relationshipChannelConnections.businessId, businessId)).groupBy(relationshipChannelConnections.status),
    db.select({ status: relationshipDeliveryJobs.status, count: sql<number>`count(*)::int` }).from(relationshipDeliveryJobs).where(eq(relationshipDeliveryJobs.businessId, businessId)).groupBy(relationshipDeliveryJobs.status),
    db.select({ status: relationshipProviderEvents.status, count: sql<number>`count(*)::int` }).from(relationshipProviderEvents).where(and(eq(relationshipProviderEvents.businessId, businessId), gte(relationshipProviderEvents.receivedAt, periodStart))).groupBy(relationshipProviderEvents.status),
    db.select().from(relationshipOperationalAlerts).where(and(eq(relationshipOperationalAlerts.businessId, businessId), inArray(relationshipOperationalAlerts.status, ["open", "acknowledged"]))).limit(100),
  ]);
  const usage = Object.fromEntries(usageRows.map((row) => [row.metric, { quantity: Number(row.quantity), costUnits: Number(row.costUnits) }]));
  return {
    periodStart: periodStart.toISOString(),
    policy,
    usage,
    capacity: {
      "message.outbound": { used: usage["message.outbound"]?.quantity ?? 0, limit: policy.monthlyOutboundMessages },
      "ai.run": { used: usage["ai.run"]?.quantity ?? 0, limit: policy.monthlyAiRuns },
      "voice.second": { used: usage["voice.second"]?.quantity ?? 0, limit: policy.monthlyVoiceSeconds },
      "realtime.minute": { used: usage["realtime.minute"]?.quantity ?? 0, limit: policy.monthlyRealtimeMinutes },
    },
    connections: Object.fromEntries(connectionRows.map((row) => [row.status, Number(row.count)])),
    deliveries: Object.fromEntries(deliveryRows.map((row) => [row.status, Number(row.count)])),
    providerEvents: Object.fromEntries(eventRows.map((row) => [row.status, Number(row.count)])),
    alerts,
  };
}
