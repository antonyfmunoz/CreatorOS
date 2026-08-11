import { eq } from "drizzle-orm";
import { db } from "../server/db";
import {
  businesses,
  communities,
  communityRooms,
  relationshipChannelConnections,
  relationshipConversations,
  relationshipMessages,
  relationshipNotes,
  relationshipRoomBindings,
  relationships,
  relationshipTenantPolicies,
  users,
} from "../shared/schema";
import {
  assertRelationshipUsageAvailable,
  ensureRelationshipTenantPolicy,
  finalizeRelationshipUsage,
  recordRelationshipUsage,
  releaseRelationshipUsage,
  reserveRelationshipUsage,
  relationshipOperationsSnapshot,
  withRelationshipConnectionCapacity,
} from "../server/relationship-operations";
import { relationshipRoomContext } from "../server/relationship-room-context";
import { cleanupRelationshipHubRetention } from "../server/relationship-retention";

async function qualify() {
  const suffix = Date.now().toString(36);
  const [existingUser] = await db.select().from(users).limit(1);
  const user = existingUser ?? (await db.insert(users).values({ clerkId: `qualification-${suffix}`, username: `qualification_${suffix}`, displayName: "Relationship qualification" }).returning())[0];
  const [existingBusiness] = await db.select().from(businesses).where(eq(businesses.ownerUserId, user.id)).limit(1);
  const business = existingBusiness ?? (await db.insert(businesses).values({ ownerUserId: user.id, name: "Relationship qualification", handle: `relationship-${suffix}`, isDefault: true }).returning())[0];
  const [community] = await db.insert(communities).values({ name: "Qualification community", description: "Ephemeral qualification", iconColor: "#000000" }).returning();
  const [room] = await db.insert(communityRooms).values({ communityId: community.id, hostUserId: user.id, title: "Relationship qualification room", startsAt: new Date(), provider: "livekit" }).returning();
  const [relationship] = await db.insert(relationships).values({ businessId: business.id, createdByUserId: user.id, displayName: "Qualification customer", lifecycleStage: "lead", aiSummary: "Customer asked for a documented implementation plan." }).returning();
  const [conversation] = await db.insert(relationshipConversations).values({ businessId: business.id, relationshipId: relationship.id, title: "Qualification conversation", aiMode: "suggest" }).returning();
  await db.insert(relationshipMessages).values({ businessId: business.id, conversationId: conversation.id, provider: "native", direction: "inbound", authorType: "customer", body: "Please show the delivery evidence.", occurredAt: new Date() });
  await db.insert(relationshipNotes).values({ businessId: business.id, relationshipId: relationship.id, authorUserId: user.id, body: "Private qualification note", visibility: "private" });
  await db.insert(relationshipRoomBindings).values({ businessId: business.id, roomId: room.id, relationshipId: relationship.id, conversationId: conversation.id, createdByUserId: user.id, contextPolicy: { includeTimeline: true, includePrivateNotes: false } });

  const policy = await ensureRelationshipTenantPolicy(business.id);
  if (policy.monthlyOutboundMessages !== 10_000) throw new Error("Default tenant policy was not provisioned");
  await recordRelationshipUsage({ businessId: business.id, metric: "message.outbound", sourceType: "qualification", sourceId: "delivery-1", idempotencyKey: "qualification:delivery-1" });
  await recordRelationshipUsage({ businessId: business.id, metric: "message.outbound", sourceType: "qualification", sourceId: "delivery-1", idempotencyKey: "qualification:delivery-1" });
  const snapshot = await relationshipOperationsSnapshot(business.id);
  if (snapshot.capacity["message.outbound"].used !== 1) throw new Error("Usage idempotency qualification failed");

  await db.update(relationshipTenantPolicies).set({ monthlyAiRuns: 1 }).where(eq(relationshipTenantPolicies.businessId, business.id));
  const reservationKeys = [`qualification:ai:${suffix}:a`, `qualification:ai:${suffix}:b`];
  const reservationAttempts = await Promise.allSettled(reservationKeys.map((idempotencyKey) => reserveRelationshipUsage({
    businessId: business.id,
    metric: "ai.run",
    sourceType: "qualification",
    sourceId: idempotencyKey,
    idempotencyKey,
  })));
  const acceptedReservations = reservationAttempts.flatMap((result, index) => result.status === "fulfilled" ? [reservationKeys[index]] : []);
  const rejectedReservations = reservationAttempts.filter((result) => result.status === "rejected" && result.reason instanceof Error && result.reason.name === "RelationshipQuotaError");
  if (acceptedReservations.length !== 1 || rejectedReservations.length !== 1) throw new Error("Concurrent reservation serialization qualification failed");
  const reservedSnapshot = await relationshipOperationsSnapshot(business.id);
  if (reservedSnapshot.capacity["ai.run"].reserved !== 1 || reservedSnapshot.capacity["ai.run"].used !== 0) throw new Error("Reserved capacity snapshot qualification failed");
  await finalizeRelationshipUsage({ businessId: business.id, idempotencyKey: acceptedReservations[0], quantity: 1, provider: "qualification" });
  await finalizeRelationshipUsage({ businessId: business.id, idempotencyKey: acceptedReservations[0], quantity: 1, provider: "qualification" });
  let mismatchedFinalizationBlocked = false;
  try {
    await finalizeRelationshipUsage({ businessId: business.id, idempotencyKey: acceptedReservations[0], quantity: 2, provider: "qualification" });
  } catch (error) {
    mismatchedFinalizationBlocked = error instanceof Error && /different data/i.test(error.message);
  }
  if (!mismatchedFinalizationBlocked) throw new Error("Mismatched reservation finalization was not rejected");
  const finalizedSnapshot = await relationshipOperationsSnapshot(business.id);
  if (finalizedSnapshot.capacity["ai.run"].reserved !== 0 || finalizedSnapshot.capacity["ai.run"].used !== 1) throw new Error("Reservation finalization idempotency qualification failed");
  const [otherBusiness] = await db.insert(businesses).values({ ownerUserId: user.id, name: "Relationship isolation qualification", handle: `relationship-isolation-${suffix}`, isDefault: false }).returning();
  await db.insert(relationshipTenantPolicies).values({ businessId: otherBusiness.id, monthlyAiRuns: 1, maxActiveConnections: 1 });
  const sharedTenantKey = `qualification:tenant-isolation:${suffix}`;
  await reserveRelationshipUsage({ businessId: otherBusiness.id, metric: "ai.run", sourceType: "qualification", sourceId: sharedTenantKey, idempotencyKey: sharedTenantKey });
  const isolatedSnapshot = await relationshipOperationsSnapshot(otherBusiness.id);
  if (isolatedSnapshot.capacity["ai.run"].reserved !== 1 || isolatedSnapshot.capacity["ai.run"].used !== 0) throw new Error("Tenant-scoped reservation qualification failed");
  await releaseRelationshipUsage({ businessId: otherBusiness.id, idempotencyKey: sharedTenantKey });
  const releasedSnapshot = await relationshipOperationsSnapshot(otherBusiness.id);
  if (releasedSnapshot.capacity["ai.run"].reserved !== 0) throw new Error("Failed-work reservation release qualification failed");
  const connectionAccounts = [`qualification-${suffix}-a`, `qualification-${suffix}-b`];
  const connectionAttempts = await Promise.allSettled(connectionAccounts.map((providerAccountId) => withRelationshipConnectionCapacity({ businessId: otherBusiness.id, provider: "qualification", providerAccountId }, async (tx) => {
    const [connection] = await tx.insert(relationshipChannelConnections).values({ businessId: otherBusiness.id, connectedByUserId: user.id, provider: "qualification", providerAccountId, providerAccountName: providerAccountId, status: "active", scopes: [], capabilities: {}, metadata: {} }).returning();
    return connection;
  })));
  if (connectionAttempts.filter((result) => result.status === "fulfilled").length !== 1 || connectionAttempts.filter((result) => result.status === "rejected").length !== 1) throw new Error("Concurrent connection capacity serialization qualification failed");

  const context = await relationshipRoomContext(room.id);
  if (!context || context.relationship.id !== relationship.id || context.recentMessages.length !== 1) throw new Error("Relationship room context qualification failed");
  if (context.privateNotes.length !== 0 || JSON.stringify(context).includes("Private qualification note")) throw new Error("Private note was exposed without explicit context permission");

  await db.update(relationshipTenantPolicies).set({ monthlyAiRuns: 0 }).where(eq(relationshipTenantPolicies.businessId, business.id));
  let quotaBlocked = false;
  try {
    await assertRelationshipUsageAvailable({ businessId: business.id, metric: "ai.run" });
  } catch (error) {
    quotaBlocked = error instanceof Error && error.name === "RelationshipQuotaError";
  }
  if (!quotaBlocked) throw new Error("Enforced quota qualification failed");
  const retention = await cleanupRelationshipHubRetention();

  console.log(JSON.stringify({ status: "qualified", usageIdempotency: true, concurrentReservationsSerialized: true, reservationFinalizationIdempotent: true, mismatchedFinalizationBlocked: true, reservationReleaseVerified: true, tenantIsolationVerified: true, concurrentConnectionsSerialized: true, privateNotesExcluded: true, quotaEnforced: true, retentionQuery: Boolean(retention), relationshipContext: context.protocol }));
}

qualify().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
