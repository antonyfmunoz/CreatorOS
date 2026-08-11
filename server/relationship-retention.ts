import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "./db";
import {
  relationshipAgentSuggestions,
  relationshipAuditEvents,
  relationshipMemoryFacts,
  relationshipOperationalAlerts,
  relationshipProviderEvents,
  relationshipTenantPolicies,
  relationshipUsageLedger,
  relationshipVoiceGenerationJobs,
} from "../shared/schema";
import { removeStoredAsset } from "./asset-storage";

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60_000);
}

export async function cleanupRelationshipHubRetention() {
  const providerPayloadDays = Math.max(1, Math.min(90, Number(process.env.RELATIONSHIP_PROVIDER_PAYLOAD_RETENTION_DAYS || 30)));
  const auditDays = Math.max(30, Math.min(2_555, Number(process.env.RELATIONSHIP_AUDIT_RETENTION_DAYS || 365)));
  const now = new Date();
  const expiredVoice = await db.select({ id: relationshipVoiceGenerationJobs.id, storageKey: relationshipVoiceGenerationJobs.storageKey }).from(relationshipVoiceGenerationJobs).where(and(lt(relationshipVoiceGenerationJobs.expiresAt, now), inArray(relationshipVoiceGenerationJobs.status, ["completed", "failed", "canceled"])));
  let voiceAssetsRemoved = 0;
  for (const job of expiredVoice) {
    if (job.storageKey) {
      await removeStoredAsset(job.storageKey, "private").catch(() => undefined);
      voiceAssetsRemoved += 1;
    }
    await db.update(relationshipVoiceGenerationJobs).set({ status: "expired", storageKey: null, providerRequestId: null, errorMessage: null, provenance: { redacted: true }, updatedAt: now }).where(eq(relationshipVoiceGenerationJobs.id, job.id));
  }
  const expiredSuggestions = await db.update(relationshipAgentSuggestions).set({ status: "expired", reviewedAt: now }).where(and(eq(relationshipAgentSuggestions.status, "proposed"), lt(relationshipAgentSuggestions.expiresAt, now))).returning({ id: relationshipAgentSuggestions.id });
  const expiredMemories = await db.update(relationshipMemoryFacts).set({ status: "expired", value: { redacted: true }, updatedAt: now }).where(and(eq(relationshipMemoryFacts.status, "proposed"), lt(relationshipMemoryFacts.expiresAt, now))).returning({ id: relationshipMemoryFacts.id });
  const redactedEvents = await db.update(relationshipProviderEvents).set({ normalizedPayload: { redacted: true }, rawStorageKey: null, errorMessage: null }).where(and(
    inArray(relationshipProviderEvents.status, ["processed", "dead_letter"]),
    sql`${relationshipProviderEvents.receivedAt} < now() - (coalesce((select ${relationshipTenantPolicies.providerPayloadRetentionDays} from ${relationshipTenantPolicies} where ${relationshipTenantPolicies.businessId} = ${relationshipProviderEvents.businessId}), ${providerPayloadDays}) * interval '1 day')`,
    sql`${relationshipProviderEvents.normalizedPayload}::text <> '{"redacted":true}'`,
  )).returning({ id: relationshipProviderEvents.id });
  const removedAudits = await db.delete(relationshipAuditEvents).where(sql`${relationshipAuditEvents.createdAt} < now() - (coalesce((select ${relationshipTenantPolicies.auditRetentionDays} from ${relationshipTenantPolicies} where ${relationshipTenantPolicies.businessId} = ${relationshipAuditEvents.businessId}), ${auditDays}) * interval '1 day')`).returning({ id: relationshipAuditEvents.id });
  const removedUsage = await db.delete(relationshipUsageLedger).where(lt(relationshipUsageLedger.createdAt, daysAgo(2_555))).returning({ id: relationshipUsageLedger.id });
  const removedAlerts = await db.delete(relationshipOperationalAlerts).where(and(eq(relationshipOperationalAlerts.status, "resolved"), lt(relationshipOperationalAlerts.resolvedAt, daysAgo(365)))).returning({ id: relationshipOperationalAlerts.id });
  return { voiceAssetsRemoved, expiredSuggestions: expiredSuggestions.length, expiredMemories: expiredMemories.length, redactedProviderEvents: redactedEvents.length, removedAuditEvents: removedAudits.length, removedUsageEntries: removedUsage.length, removedOperationalAlerts: removedAlerts.length };
}
