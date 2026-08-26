import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import {
  businesses,
  conversationParticipants,
  conversations,
  directMessages,
  relationshipConversationBindings,
  relationshipConversationParticipants,
  relationshipConversations,
  relationshipExternalIdentities,
  relationshipMessageAttachments,
  relationshipMessages,
  relationships,
  users,
} from "../shared/schema";
import { ensureNativeRelationshipConnection } from "./relationship-hub";

export async function syncLegacyNativeConversation(input: {
  businessId: string;
  nativeConversationId: number;
  currentUserId: number;
}) {
  const [business] = await db.select().from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
  if (!business) throw new Error("Native sync business not found");
  const [legacyConversation] = await db.select().from(conversations).where(eq(conversations.id, input.nativeConversationId)).limit(1);
  if (!legacyConversation) throw new Error("Native conversation not found");
  const participantRows = await db
    .select({ participant: conversationParticipants, user: users })
    .from(conversationParticipants)
    .innerJoin(users, eq(conversationParticipants.userId, users.id))
    .where(eq(conversationParticipants.conversationId, input.nativeConversationId));
  if (!participantRows.some((row) => row.user.id === input.currentUserId)) {
    throw new Error("Native sync user is not a conversation participant");
  }
  const connection = await ensureNativeRelationshipConnection({
    businessId: business.id,
    userId: input.currentUserId,
    businessName: business.name,
  });

  return db.transaction(async (tx) => {
    const externalParticipants = participantRows.filter((row) => row.user.id !== input.currentUserId);
    const identityByUserId = new Map<number, { relationshipId: string; identityId: string }>();
    for (const row of externalParticipants) {
      const lockKey = `${business.id}:native:${row.user.id}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
      let [identity] = await tx.select().from(relationshipExternalIdentities).where(and(
        eq(relationshipExternalIdentities.businessId, business.id),
        eq(relationshipExternalIdentities.provider, "native"),
        eq(relationshipExternalIdentities.providerSubjectId, String(row.user.id)),
      )).limit(1);
      if (!identity) {
        const [relationship] = await tx.insert(relationships).values({
          businessId: business.id,
          createdByUserId: input.currentUserId,
          ownerUserId: input.currentUserId,
          displayName: row.user.displayName,
          avatarUrl: row.user.profileImageUrl,
          source: "native",
          lastInteractionAt: legacyConversation.updatedAt,
        }).returning();
        [identity] = await tx.insert(relationshipExternalIdentities).values({
          businessId: business.id,
          relationshipId: relationship.id,
          connectionId: connection.id,
          provider: "native",
          providerSubjectId: String(row.user.id),
          username: row.user.username,
          displayName: row.user.displayName,
          avatarUrl: row.user.profileImageUrl,
          verificationStatus: "verified",
          verifiedAt: row.user.createdAt,
          lastSeenAt: legacyConversation.updatedAt,
          metadata: { nativeUserId: row.user.id },
        }).returning();
      }
      identityByUserId.set(row.user.id, { relationshipId: identity.relationshipId, identityId: identity.id });
    }

    const threadLock = `${business.id}:native-conversation:${legacyConversation.id}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${threadLock}))`);
    let [canonicalConversation] = await tx.select().from(relationshipConversations).where(and(
      eq(relationshipConversations.businessId, business.id),
      eq(relationshipConversations.nativeConversationId, legacyConversation.id),
    )).limit(1);
    const primaryRelationshipId = identityByUserId.values().next().value?.relationshipId ?? null;
    const title = legacyConversation.name || externalParticipants.map((row) => row.user.displayName).join(", ") || "CreativesOS conversation";
    if (!canonicalConversation) {
      [canonicalConversation] = await tx.insert(relationshipConversations).values({
        businessId: business.id,
        relationshipId: primaryRelationshipId,
        nativeConversationId: legacyConversation.id,
        title,
        kind: legacyConversation.isGroup ? "group" : "direct",
        status: "open",
        queue: "mine",
        assignedToUserId: input.currentUserId,
        lastMessageAt: legacyConversation.updatedAt,
      }).returning();
    }

    let [binding] = await tx.select().from(relationshipConversationBindings).where(and(
      eq(relationshipConversationBindings.businessId, business.id),
      eq(relationshipConversationBindings.connectionId, connection.id),
      eq(relationshipConversationBindings.externalThreadId, `native:${legacyConversation.id}`),
    )).limit(1);
    if (!binding) {
      [binding] = await tx.insert(relationshipConversationBindings).values({
        businessId: business.id,
        conversationId: canonicalConversation.id,
        connectionId: connection.id,
        provider: "native",
        externalThreadId: `native:${legacyConversation.id}`,
        capabilities: connection.capabilities,
        metadata: { nativeConversationId: legacyConversation.id },
        lastSyncedAt: new Date(),
      }).returning();
    }

    const canonicalParticipants = await tx.select().from(relationshipConversationParticipants).where(eq(
      relationshipConversationParticipants.conversationId,
      canonicalConversation.id,
    ));
    if (!canonicalParticipants.some((participant) => participant.userId === input.currentUserId)) {
      await tx.insert(relationshipConversationParticipants).values({
        businessId: business.id,
        conversationId: canonicalConversation.id,
        userId: input.currentUserId,
        role: "teammate",
      });
    }
    for (const row of externalParticipants) {
      const linked = identityByUserId.get(row.user.id)!;
      if (!canonicalParticipants.some((participant) => participant.externalIdentityId === linked.identityId)) {
        await tx.insert(relationshipConversationParticipants).values({
          businessId: business.id,
          conversationId: canonicalConversation.id,
          relationshipId: linked.relationshipId,
          externalIdentityId: linked.identityId,
          role: "customer",
        });
      }
    }

    const legacyMessages = await tx.select().from(directMessages).where(eq(
      directMessages.conversationId,
      legacyConversation.id,
    )).orderBy(asc(directMessages.sentAt));
    const canonicalNativeMessages = await tx.select().from(relationshipMessages).where(and(
      eq(relationshipMessages.businessId, business.id),
      eq(relationshipMessages.conversationId, canonicalConversation.id),
      eq(relationshipMessages.bindingId, binding.id),
      eq(relationshipMessages.provider, "native"),
    ));
    const canonicalByExternalId = new Map(canonicalNativeMessages
      .filter((message) => message.externalMessageId)
      .map((message) => [message.externalMessageId!, message]));
    const legacyExternalIds = new Set<string>();
    for (const legacyMessage of legacyMessages) {
      const senderIdentity = identityByUserId.get(legacyMessage.senderId);
      const externalMessageId = `native:${legacyMessage.id}`;
      legacyExternalIds.add(externalMessageId);
      const values = {
        businessId: business.id,
        conversationId: canonicalConversation.id,
        bindingId: binding.id,
        authorUserId: legacyMessage.senderId === input.currentUserId ? input.currentUserId : null,
        authorExternalIdentityId: senderIdentity?.identityId ?? null,
        provider: "native",
        externalMessageId,
        direction: legacyMessage.senderId === input.currentUserId ? "outbound" : "inbound",
        authorType: legacyMessage.senderId === input.currentUserId ? "human" : "customer",
        messageType: "text",
        body: legacyMessage.content,
        bodyFormat: "plain",
        status: legacyMessage.read ? "read" : "delivered",
        occurredAt: legacyMessage.sentAt,
        editedAt: legacyMessage.isEdited ? legacyMessage.sentAt : null,
        metadata: {
          nativeMessageId: legacyMessage.id,
          nativeReplyToMessageId: legacyMessage.replyToMessageId,
          reactions: legacyMessage.reactions,
        },
      };
      const existingCanonical = canonicalByExternalId.get(externalMessageId);
      if (existingCanonical) {
        await tx.update(relationshipMessages).set({
          authorUserId: values.authorUserId,
          authorExternalIdentityId: values.authorExternalIdentityId,
          direction: values.direction,
          authorType: values.authorType,
          body: values.body,
          status: values.status,
          editedAt: values.editedAt,
          deletedAt: null,
          metadata: { ...existingCanonical.metadata, ...values.metadata },
          updatedAt: new Date(),
        }).where(eq(relationshipMessages.id, existingCanonical.id));
      } else {
        await tx.insert(relationshipMessages).values(values).onConflictDoNothing();
      }
    }
    const removedCanonicalMessages = canonicalNativeMessages.filter((message) =>
      message.externalMessageId?.startsWith("native:") && !legacyExternalIds.has(message.externalMessageId),
    );
    if (removedCanonicalMessages.length) {
      const removedIds = removedCanonicalMessages.map((message) => message.id);
      await tx.delete(relationshipMessageAttachments).where(inArray(relationshipMessageAttachments.messageId, removedIds));
      await tx.update(relationshipMessages).set({
        body: "",
        status: "deleted",
        deletedAt: new Date(),
        updatedAt: new Date(),
      }).where(inArray(relationshipMessages.id, removedIds));
    }

    await tx.update(relationshipConversationBindings).set({ capabilities: connection.capabilities, lastSyncedAt: new Date(), updatedAt: new Date() }).where(eq(relationshipConversationBindings.id, binding.id));
    await tx.update(relationshipConversations).set({ title, relationshipId: primaryRelationshipId, lastMessageAt: legacyMessages.at(-1)?.sentAt ?? legacyConversation.updatedAt, updatedAt: new Date() }).where(eq(relationshipConversations.id, canonicalConversation.id));
    return { conversation: canonicalConversation, binding, messagesSynchronized: legacyMessages.length };
  });
}

export async function syncAllLegacyNativeConversations(input: {
  businessId: string;
  currentUserId: number;
}) {
  const rows = await db.select({ conversationId: conversationParticipants.conversationId }).from(conversationParticipants).where(eq(conversationParticipants.userId, input.currentUserId));
  const results = [];
  for (const row of rows) {
    results.push(await syncLegacyNativeConversation({ ...input, nativeConversationId: row.conversationId }));
  }
  return results;
}
