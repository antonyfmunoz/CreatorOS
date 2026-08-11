import { and, count, eq, like, or } from "drizzle-orm";
import { db } from "../server/db";
import {
  communities,
  relationshipChannelConnections,
  relationshipMessages,
  relationshipTenantPolicies,
  relationshipUsageLedger,
  relationships,
} from "../shared/schema";

async function audit() {
  const [[relationshipRows], [communityRows], [connectionRows], [usageRows], [zeroPolicyRows], [messageRows]] = await Promise.all([
    db.select({ count: count() }).from(relationships).where(eq(relationships.displayName, "Qualification customer")),
    db.select({ count: count() }).from(communities).where(eq(communities.name, "Qualification community")),
    db.select({ count: count() }).from(relationshipChannelConnections).where(eq(relationshipChannelConnections.provider, "qualification")),
    db.select({ count: count() }).from(relationshipUsageLedger).where(like(relationshipUsageLedger.idempotencyKey, "qualification:%")),
    db.select({ count: count() }).from(relationshipTenantPolicies).where(eq(relationshipTenantPolicies.monthlyAiRuns, 0)),
    db.select({ count: count() }).from(relationshipMessages).where(and(eq(relationshipMessages.provider, "native"), or(eq(relationshipMessages.body, "Please show the delivery evidence."), eq(relationshipMessages.body, "Qualification customer")))),
  ]);
  console.log(JSON.stringify({
    qualificationRelationships: Number(relationshipRows.count),
    qualificationCommunities: Number(communityRows.count),
    qualificationConnections: Number(connectionRows.count),
    qualificationUsageEntries: Number(usageRows.count),
    zeroAiPolicies: Number(zeroPolicyRows.count),
    qualificationMessages: Number(messageRows.count),
  }));
}

audit().then(() => process.exit(0)).catch((error) => {
  const primary = error instanceof Error ? error.message : "Qualification residue audit failed";
  const cause = error && typeof error === "object" && "cause" in error
    ? (error as { cause?: unknown }).cause
    : undefined;
  const causeMessage = cause instanceof Error
    ? cause.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database-url-redacted]")
    : undefined;
  const causeCode = cause && typeof cause === "object" && "code" in cause
    ? String((cause as { code?: unknown }).code)
    : undefined;
  console.error(JSON.stringify({ error: primary, cause: causeMessage, code: causeCode }));
  process.exit(1);
});
