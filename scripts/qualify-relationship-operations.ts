import { eq } from "drizzle-orm";
import { db } from "../server/db";
import {
  businesses,
  communities,
  communityRooms,
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
  recordRelationshipUsage,
  relationshipOperationsSnapshot,
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

  console.log(JSON.stringify({ status: "qualified", usageIdempotency: true, privateNotesExcluded: true, quotaEnforced: true, retentionQuery: Boolean(retention), relationshipContext: context.protocol }));
}

qualify().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
