import { and, eq, gt, gte, inArray, ne, sql } from "drizzle-orm";
import { db } from "./db";
import {
  relationshipChannelConnections,
  relationshipDeliveryJobs,
  relationshipOperationalAlerts,
  relationshipProviderEvents,
  relationshipTenantPolicies,
  relationshipUsageLedger,
  relationshipUsageReservations,
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

export async function relationshipMetricReserved(businessId: string, metric: RelationshipUsageMetric, date = new Date()) {
  const periodStart = relationshipBillingPeriod(date);
  const [result] = await db.select({ quantity: sql<number>`coalesce(sum(${relationshipUsageReservations.quantity}), 0)::int` }).from(relationshipUsageReservations).where(and(
    eq(relationshipUsageReservations.businessId, businessId),
    eq(relationshipUsageReservations.metric, metric),
    eq(relationshipUsageReservations.periodStart, periodStart),
    eq(relationshipUsageReservations.status, "reserved"),
    gt(relationshipUsageReservations.expiresAt, date),
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
  const [used, reserved] = await Promise.all([
    relationshipMetricUsage(input.businessId, input.metric),
    relationshipMetricReserved(input.businessId, input.metric),
  ]);
  const current = used + reserved;
  if (current + (input.quantity ?? 1) > limit) throw new RelationshipQuotaError(input.metric, limit);
}

export type RelationshipUsageReservationInput = {
  businessId: string;
  metric: Exclude<RelationshipUsageMetric, "message.inbound">;
  quantity?: number;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  occurredAt?: Date;
  expiresInMs?: number;
};

function normalizedRelationshipUsageQuantity(quantity = 1) {
  return Math.max(1, Math.trunc(quantity));
}

function relationshipUsageLockKey(businessId: string, metric: RelationshipUsageMetric, periodStart: Date) {
  return `relationship-usage:${businessId}:${metric}:${periodStart.toISOString()}`;
}

/**
 * Atomically holds tenant capacity before paid/provider work begins. The
 * advisory transaction lock serializes reservations across every app machine.
 */
export async function reserveRelationshipUsage(input: RelationshipUsageReservationInput) {
  const now = input.occurredAt ?? new Date();
  const periodStart = relationshipBillingPeriod(now);
  const quantity = normalizedRelationshipUsageQuantity(input.quantity);
  const expiresAt = new Date(now.getTime() + Math.max(60_000, input.expiresInMs ?? 15 * 60_000));
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${relationshipUsageLockKey(input.businessId, input.metric, periodStart)}))`);
    await tx.insert(relationshipTenantPolicies).values({ businessId: input.businessId }).onConflictDoNothing();
    const [policy] = await tx.select().from(relationshipTenantPolicies).where(eq(relationshipTenantPolicies.businessId, input.businessId)).limit(1);
    if (!policy) throw new Error("Relationship tenant policy could not be provisioned");
    const [existing] = await tx.select().from(relationshipUsageReservations).where(and(
      eq(relationshipUsageReservations.businessId, input.businessId),
      eq(relationshipUsageReservations.idempotencyKey, input.idempotencyKey),
    )).limit(1);
    if (existing && (existing.metric !== input.metric || existing.quantity !== quantity || existing.sourceType !== input.sourceType || existing.sourceId !== input.sourceId)) {
      throw new Error("Relationship usage idempotency key was reused with different reservation data");
    }
    if (existing && (existing.status === "consumed" || (existing.status === "reserved" && existing.expiresAt > now))) {
      return { reservation: existing, duplicate: true };
    }
    const limit = relationshipMetricLimit(policy, input.metric);
    if (policy.enforcementMode === "enforce" && limit != null && limit >= 0) {
      const [[usage], [reservations]] = await Promise.all([
        tx.select({ quantity: sql<number>`coalesce(sum(${relationshipUsageLedger.quantity}), 0)::int` }).from(relationshipUsageLedger).where(and(
          eq(relationshipUsageLedger.businessId, input.businessId),
          eq(relationshipUsageLedger.metric, input.metric),
          eq(relationshipUsageLedger.periodStart, periodStart),
        )),
        tx.select({ quantity: sql<number>`coalesce(sum(${relationshipUsageReservations.quantity}), 0)::int` }).from(relationshipUsageReservations).where(and(
          eq(relationshipUsageReservations.businessId, input.businessId),
          eq(relationshipUsageReservations.metric, input.metric),
          eq(relationshipUsageReservations.periodStart, periodStart),
          eq(relationshipUsageReservations.status, "reserved"),
          gt(relationshipUsageReservations.expiresAt, now),
          existing ? ne(relationshipUsageReservations.id, existing.id) : sql`true`,
        )),
      ]);
      if (Number(usage?.quantity ?? 0) + Number(reservations?.quantity ?? 0) + quantity > limit) {
        throw new RelationshipQuotaError(input.metric, limit);
      }
    }
    const values = {
      businessId: input.businessId,
      metric: input.metric,
      quantity,
      status: "reserved",
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      idempotencyKey: input.idempotencyKey,
      periodStart,
      expiresAt,
      finalizedAt: null,
      updatedAt: now,
    };
    const [reservation] = existing
      ? await tx.update(relationshipUsageReservations).set(values).where(eq(relationshipUsageReservations.id, existing.id)).returning()
      : await tx.insert(relationshipUsageReservations).values(values).returning();
    return { reservation, duplicate: false };
  });
}

export async function finalizeRelationshipUsage(input: {
  businessId: string;
  idempotencyKey: string;
  quantity?: number;
  costUnits?: number;
  provider?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}) {
  const now = input.occurredAt ?? new Date();
  const quantity = normalizedRelationshipUsageQuantity(input.quantity);
  const costUnits = Math.max(0, Math.trunc(input.costUnits ?? 0));
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`relationship-usage-finalize:${input.businessId}:${input.idempotencyKey}`}))`);
    const [reservation] = await tx.select().from(relationshipUsageReservations).where(and(
      eq(relationshipUsageReservations.businessId, input.businessId),
      eq(relationshipUsageReservations.idempotencyKey, input.idempotencyKey),
    )).limit(1);
    if (!reservation) throw new Error("Relationship usage reservation not found");
    if (reservation.status === "released") throw new Error("Relationship usage reservation was already released");
    if (reservation.status === "consumed") {
      const [existing] = await tx.select().from(relationshipUsageLedger).where(and(
        eq(relationshipUsageLedger.businessId, input.businessId),
        eq(relationshipUsageLedger.idempotencyKey, input.idempotencyKey),
      )).limit(1);
      if (!existing) throw new Error("Consumed relationship usage reservation is missing its ledger entry");
      if (existing.quantity !== quantity || existing.costUnits !== costUnits || (existing.provider ?? null) !== (input.provider ?? null)) {
        throw new Error("Relationship usage finalization was retried with different data");
      }
      return { reservation, entry: existing, duplicate: true };
    }
    const [entry] = await tx.insert(relationshipUsageLedger).values({
      businessId: input.businessId,
      metric: reservation.metric,
      quantity,
      costUnits,
      provider: input.provider ?? null,
      sourceType: reservation.sourceType,
      sourceId: reservation.sourceId,
      idempotencyKey: input.idempotencyKey,
      periodStart: reservation.periodStart,
      occurredAt: now,
      metadata: input.metadata ?? {},
    }).onConflictDoNothing().returning();
    const [finalized] = await tx.update(relationshipUsageReservations).set({
      status: "consumed",
      quantity,
      finalizedAt: now,
      updatedAt: now,
    }).where(eq(relationshipUsageReservations.id, reservation.id)).returning();
    return { reservation: finalized, entry: entry ?? null, duplicate: !entry };
  });
}

export async function releaseRelationshipUsage(input: { businessId: string; idempotencyKey: string }) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`relationship-usage-finalize:${input.businessId}:${input.idempotencyKey}`}))`);
    const [released] = await tx.update(relationshipUsageReservations).set({ status: "released", finalizedAt: new Date(), updatedAt: new Date() }).where(and(
      eq(relationshipUsageReservations.businessId, input.businessId),
      eq(relationshipUsageReservations.idempotencyKey, input.idempotencyKey),
      eq(relationshipUsageReservations.status, "reserved"),
    )).returning();
    return released ?? null;
  });
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

type RelationshipDbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Serializes the final provider-account upsert so connection limits cannot race. */
export async function withRelationshipConnectionCapacity<T>(
  input: { businessId: string; provider: string; providerAccountId: string },
  operation: (tx: RelationshipDbTransaction) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`relationship-connections:${input.businessId}`}))`);
    await tx.insert(relationshipTenantPolicies).values({ businessId: input.businessId }).onConflictDoNothing();
    const [[policy], [existing]] = await Promise.all([
      tx.select().from(relationshipTenantPolicies).where(eq(relationshipTenantPolicies.businessId, input.businessId)).limit(1),
      tx.select({ id: relationshipChannelConnections.id }).from(relationshipChannelConnections).where(and(
        eq(relationshipChannelConnections.businessId, input.businessId),
        eq(relationshipChannelConnections.provider, input.provider),
        eq(relationshipChannelConnections.providerAccountId, input.providerAccountId),
      )).limit(1),
    ]);
    if (!policy) throw new Error("Relationship tenant policy could not be provisioned");
    if (!existing && policy.enforcementMode === "enforce" && policy.maxActiveConnections >= 0) {
      const [row] = await tx.select({ count: sql<number>`count(*)::int` }).from(relationshipChannelConnections).where(and(
        eq(relationshipChannelConnections.businessId, input.businessId),
        inArray(relationshipChannelConnections.status, ["active", "testing", "reauthorization_required"]),
      ));
      if (Number(row?.count ?? 0) >= policy.maxActiveConnections) {
        throw new Error(`Active channel connection allowance reached (${policy.maxActiveConnections.toLocaleString()}). Disconnect an account or update the business plan.`);
      }
    }
    return operation(tx);
  });
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
  const [usageRows, reservationRows, connectionRows, deliveryRows, eventRows, alerts] = await Promise.all([
    db.select({ metric: relationshipUsageLedger.metric, quantity: sql<number>`coalesce(sum(${relationshipUsageLedger.quantity}), 0)::int`, costUnits: sql<number>`coalesce(sum(${relationshipUsageLedger.costUnits}), 0)::int` }).from(relationshipUsageLedger).where(and(eq(relationshipUsageLedger.businessId, businessId), eq(relationshipUsageLedger.periodStart, periodStart))).groupBy(relationshipUsageLedger.metric),
    db.select({ metric: relationshipUsageReservations.metric, quantity: sql<number>`coalesce(sum(${relationshipUsageReservations.quantity}), 0)::int` }).from(relationshipUsageReservations).where(and(eq(relationshipUsageReservations.businessId, businessId), eq(relationshipUsageReservations.periodStart, periodStart), eq(relationshipUsageReservations.status, "reserved"), gt(relationshipUsageReservations.expiresAt, new Date()))).groupBy(relationshipUsageReservations.metric),
    db.select({ status: relationshipChannelConnections.status, count: sql<number>`count(*)::int` }).from(relationshipChannelConnections).where(eq(relationshipChannelConnections.businessId, businessId)).groupBy(relationshipChannelConnections.status),
    db.select({ status: relationshipDeliveryJobs.status, count: sql<number>`count(*)::int` }).from(relationshipDeliveryJobs).where(eq(relationshipDeliveryJobs.businessId, businessId)).groupBy(relationshipDeliveryJobs.status),
    db.select({ status: relationshipProviderEvents.status, count: sql<number>`count(*)::int` }).from(relationshipProviderEvents).where(and(eq(relationshipProviderEvents.businessId, businessId), gte(relationshipProviderEvents.receivedAt, periodStart))).groupBy(relationshipProviderEvents.status),
    db.select().from(relationshipOperationalAlerts).where(and(eq(relationshipOperationalAlerts.businessId, businessId), inArray(relationshipOperationalAlerts.status, ["open", "acknowledged"]))).limit(100),
  ]);
  const usage = Object.fromEntries(usageRows.map((row) => [row.metric, { quantity: Number(row.quantity), costUnits: Number(row.costUnits) }]));
  const reservations = Object.fromEntries(reservationRows.map((row) => [row.metric, Number(row.quantity)]));
  return {
    periodStart: periodStart.toISOString(),
    policy,
    usage,
    capacity: {
      "message.outbound": { used: usage["message.outbound"]?.quantity ?? 0, reserved: reservations["message.outbound"] ?? 0, limit: policy.monthlyOutboundMessages },
      "ai.run": { used: usage["ai.run"]?.quantity ?? 0, reserved: reservations["ai.run"] ?? 0, limit: policy.monthlyAiRuns },
      "voice.second": { used: usage["voice.second"]?.quantity ?? 0, reserved: reservations["voice.second"] ?? 0, limit: policy.monthlyVoiceSeconds },
      "realtime.minute": { used: usage["realtime.minute"]?.quantity ?? 0, reserved: reservations["realtime.minute"] ?? 0, limit: policy.monthlyRealtimeMinutes },
    },
    connections: Object.fromEntries(connectionRows.map((row) => [row.status, Number(row.count)])),
    deliveries: Object.fromEntries(deliveryRows.map((row) => [row.status, Number(row.count)])),
    providerEvents: Object.fromEntries(eventRows.map((row) => [row.status, Number(row.count)])),
    alerts,
  };
}
