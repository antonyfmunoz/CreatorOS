import crypto from "node:crypto";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { decryptSocialToken } from "./social-oauth";
import {
  automationTriggerEvents,
  relationshipAuditEvents,
  relationshipChannelConnections,
  relationshipConsents,
  relationshipConversationBindings,
  relationshipConversationParticipants,
  relationshipConversations,
  relationshipDeliveryJobs,
  relationshipExternalIdentities,
  relationshipMessageAttachments,
  relationshipMessageReceipts,
  relationshipMessages,
  relationshipProviderEvents,
  relationships,
  type RelationshipChannelConnection,
  type RelationshipDeliveryJob,
} from "../shared/schema";
import {
  normalizedRelationshipEventSchema,
  capabilityRequiredForAction,
  relationshipDeliveryBackoffMs,
  relationshipOutboundActionSchema,
  sanitizeRelationshipProviderError,
  type NormalizedRelationshipEvent,
  type RelationshipOutboundAction,
} from "./relationship-hub-policy";
import {
  deliverRelationshipAction,
  normalizeRelationshipWebhook,
  requireRelationshipAdapter,
  type RelationshipAdapterContext,
} from "./relationship-channel-adapters";
import { nativeRelationshipCapabilities } from "./relationship-native-adapter";
import {
  messagingConsentCommand,
  RELATIONSHIP_COMMENT_CREATED_EVENT,
  RELATIONSHIP_MESSAGE_RECEIVED_EVENT,
} from "./social-automation";

function hashJson(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function eventRecord(event: NormalizedRelationshipEvent) {
  return JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
}

function relationshipName(event: NormalizedRelationshipEvent) {
  return event.actor.displayName || event.actor.username || event.actor.address || `${event.provider} contact`;
}

async function recordRelationshipAutomationTrigger(input: {
  connection: RelationshipChannelConnection;
  providerEventId: string;
  event: NormalizedRelationshipEvent;
  relationshipId: string;
  conversationId: string;
}) {
  if (!input.event.message || input.event.receipt) return;
  const command = messagingConsentCommand(input.event.message.body);
  if (command) {
    const status = command === "opt_out" ? "withdrawn" : "granted";
    const [existing] = await db.select().from(relationshipConsents).where(and(
      eq(relationshipConsents.businessId, input.connection.businessId),
      eq(relationshipConsents.relationshipId, input.relationshipId),
      eq(relationshipConsents.channel, input.event.provider),
      eq(relationshipConsents.purpose, "messaging"),
    )).limit(1);
    if (existing) {
      await db.update(relationshipConsents).set({ status, source: "inbound_command", grantedAt: command === "opt_in" ? input.event.occurredAt : existing.grantedAt, withdrawnAt: command === "opt_out" ? input.event.occurredAt : null, updatedAt: new Date(), evidence: { providerEventId: input.providerEventId, command } }).where(eq(relationshipConsents.id, existing.id));
    } else {
      await db.insert(relationshipConsents).values({ businessId: input.connection.businessId, relationshipId: input.relationshipId, purpose: "messaging", channel: input.event.provider, status, source: "inbound_command", grantedAt: command === "opt_in" ? input.event.occurredAt : null, withdrawnAt: command === "opt_out" ? input.event.occurredAt : null, evidence: { providerEventId: input.providerEventId, command } });
    }
  }
  const eventType = input.event.eventType === "social.comment.created"
    ? RELATIONSHIP_COMMENT_CREATED_EVENT
    : RELATIONSHIP_MESSAGE_RECEIVED_EVENT;
  await db.insert(automationTriggerEvents).values({
    ownerUserId: input.connection.connectedByUserId,
    businessId: input.connection.businessId,
    eventType,
    payload: {
      provider: input.event.provider,
      connectionId: input.connection.id,
      relationshipId: input.relationshipId,
      conversationId: input.conversationId,
      externalThreadId: input.event.thread.externalThreadId,
      externalMessageId: input.event.message.externalMessageId,
      content: input.event.message.body,
      actorProviderSubjectId: input.event.actor.providerSubjectId,
      automated: input.event.metadata.automated === true,
      optedOut: command === "opt_out",
      occurredAt: input.event.occurredAt.toISOString(),
    },
    idempotencyKey: `relationship:${input.providerEventId}`,
  }).onConflictDoNothing();
}

function connectionContext(connection: RelationshipChannelConnection): RelationshipAdapterContext {
  return {
    businessId: connection.businessId,
    connectionId: connection.id,
    providerAccountId: connection.providerAccountId,
    accessToken: connection.accessTokenCiphertext
      ? decryptSocialToken(connection.accessTokenCiphertext)
      : undefined,
    webhookSecret: connection.webhookSecretCiphertext
      ? decryptSocialToken(connection.webhookSecretCiphertext)
      : undefined,
    metadata: connection.metadata,
  };
}

async function connectionForEvent(connectionId: string) {
  const [connection] = await db
    .select()
    .from(relationshipChannelConnections)
    .where(eq(relationshipChannelConnections.id, connectionId))
    .limit(1);
  if (!connection) throw new Error("Relationship channel connection not found");
  if (connection.status !== "active" && connection.status !== "testing") {
    throw new Error("Relationship channel connection is not active");
  }
  return connection;
}

export async function ensureNativeRelationshipConnection(input: {
  businessId: string;
  userId: number;
  businessName: string;
}) {
  const [created] = await db
    .insert(relationshipChannelConnections)
    .values({
      businessId: input.businessId,
      connectedByUserId: input.userId,
      provider: "native",
      providerAccountId: input.businessId,
      providerAccountName: `${input.businessName} on CreativesOS`,
      status: "active",
      scopes: ["native:messages"],
      capabilities: nativeRelationshipCapabilities,
      lastValidatedAt: new Date(),
      metadata: { authority: "creativesos" },
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [existing] = await db
    .select()
    .from(relationshipChannelConnections)
    .where(and(
      eq(relationshipChannelConnections.businessId, input.businessId),
      eq(relationshipChannelConnections.provider, "native"),
      eq(relationshipChannelConnections.providerAccountId, input.businessId),
    ))
    .limit(1);
  if (!existing) throw new Error("Unable to provision native relationship connection");
  return existing;
}

async function processStoredProviderEvent(eventId: string) {
  const [stored] = await db
    .select()
    .from(relationshipProviderEvents)
    .where(eq(relationshipProviderEvents.id, eventId))
    .limit(1);
  if (!stored) throw new Error("Relationship provider event not found");
  if (stored.status === "processed") return { duplicate: true, providerEvent: stored };
  const event = normalizedRelationshipEventSchema.parse(stored.normalizedPayload);
  const connection = await connectionForEvent(stored.connectionId);
  if (connection.businessId !== stored.businessId || connection.provider !== event.provider) {
    throw new Error("Provider event authority mismatch");
  }

  try {
    const result = await db.transaction(async (tx) => {
      const identityLock = `${stored.businessId}:${event.provider}:${event.actor.providerSubjectId}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${identityLock}))`);

      let [identity] = await tx
        .select()
        .from(relationshipExternalIdentities)
        .where(and(
          eq(relationshipExternalIdentities.businessId, stored.businessId),
          eq(relationshipExternalIdentities.provider, event.provider),
          eq(relationshipExternalIdentities.providerSubjectId, event.actor.providerSubjectId),
        ))
        .limit(1);

      let relationship;
      if (!identity) {
        [relationship] = await tx
          .insert(relationships)
          .values({
            businessId: stored.businessId,
            displayName: relationshipName(event),
            avatarUrl: event.actor.avatarUrl ?? null,
            source: event.provider,
            lastInteractionAt: event.occurredAt,
          })
          .returning();
        [identity] = await tx
          .insert(relationshipExternalIdentities)
          .values({
            businessId: stored.businessId,
            relationshipId: relationship.id,
            connectionId: connection.id,
            provider: event.provider,
            providerSubjectId: event.actor.providerSubjectId,
            address: event.actor.address ?? null,
            username: event.actor.username ?? null,
            displayName: event.actor.displayName ?? null,
            avatarUrl: event.actor.avatarUrl ?? null,
            verificationStatus: event.actor.verified ? "verified" : "observed",
            verifiedAt: event.actor.verified ? event.occurredAt : null,
            lastSeenAt: event.occurredAt,
            metadata: event.actor.metadata,
          })
          .returning();
      } else {
        [relationship] = await tx
          .select()
          .from(relationships)
          .where(and(
            eq(relationships.id, identity.relationshipId),
            eq(relationships.businessId, stored.businessId),
          ))
          .limit(1);
        if (!relationship) throw new Error("Relationship identity is orphaned");
        await tx
          .update(relationshipExternalIdentities)
          .set({
            address: event.actor.address ?? identity.address,
            username: event.actor.username ?? identity.username,
            displayName: event.actor.displayName ?? identity.displayName,
            avatarUrl: event.actor.avatarUrl ?? identity.avatarUrl,
            lastSeenAt: event.occurredAt,
            metadata: { ...identity.metadata, ...event.actor.metadata },
            updatedAt: new Date(),
          })
          .where(eq(relationshipExternalIdentities.id, identity.id));
      }

      const threadLock = `${connection.id}:${event.thread.externalThreadId}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${threadLock}))`);
      let [binding] = await tx
        .select()
        .from(relationshipConversationBindings)
        .where(and(
          eq(relationshipConversationBindings.connectionId, connection.id),
          eq(relationshipConversationBindings.externalThreadId, event.thread.externalThreadId),
        ))
        .limit(1);

      let conversation;
      if (!binding) {
        [conversation] = await tx
          .insert(relationshipConversations)
          .values({
            businessId: stored.businessId,
            relationshipId: relationship.id,
            title: event.thread.title || relationship.displayName,
            kind: event.thread.kind,
            lastMessageAt: event.message ? event.occurredAt : null,
          })
          .returning();
        [binding] = await tx
          .insert(relationshipConversationBindings)
          .values({
            businessId: stored.businessId,
            conversationId: conversation.id,
            connectionId: connection.id,
            provider: event.provider,
            externalThreadId: event.thread.externalThreadId,
            capabilities: connection.capabilities,
            metadata: event.thread.metadata,
            lastSyncedAt: new Date(),
          })
          .returning();
        await tx.insert(relationshipConversationParticipants).values({
          businessId: stored.businessId,
          conversationId: conversation.id,
          relationshipId: relationship.id,
          externalIdentityId: identity.id,
          role: "customer",
        });
      } else {
        [conversation] = await tx
          .select()
          .from(relationshipConversations)
          .where(and(
            eq(relationshipConversations.id, binding.conversationId),
            eq(relationshipConversations.businessId, stored.businessId),
          ))
          .limit(1);
        if (!conversation) throw new Error("Conversation binding is orphaned");
      }

      let message = null;
      if (event.message) {
        [message] = await tx
          .insert(relationshipMessages)
          .values({
            businessId: stored.businessId,
            conversationId: conversation.id,
            bindingId: binding.id,
            authorExternalIdentityId: identity.id,
            provider: event.provider,
            externalMessageId: event.message.externalMessageId,
            direction: "inbound",
            authorType: "customer",
            messageType: event.message.type,
            body: event.message.body,
            bodyFormat: event.message.bodyFormat,
            status: "received",
            occurredAt: event.occurredAt,
            metadata: event.message.metadata,
          })
          .onConflictDoNothing()
          .returning();

        if (!message) {
          [message] = await tx
            .select()
            .from(relationshipMessages)
            .where(and(
              eq(relationshipMessages.bindingId, binding.id),
              eq(relationshipMessages.externalMessageId, event.message.externalMessageId),
            ))
            .limit(1);
        } else if (event.message.attachments.length) {
          await tx.insert(relationshipMessageAttachments).values(
            event.message.attachments.map((attachment) => ({
              businessId: stored.businessId,
              messageId: message!.id,
              attachmentType: attachment.type,
              providerMediaId: attachment.externalMediaId ?? null,
              sourceUrl: attachment.sourceUrl ?? null,
              filename: attachment.filename ?? null,
              mimeType: attachment.mimeType ?? null,
              sizeBytes: attachment.sizeBytes ?? null,
              durationMs: attachment.durationMs ?? null,
              scanStatus: "remote_pending",
              metadata: attachment.metadata,
            })),
          );
        }
      }

      if (event.receipt) {
        const [receiptMessage] = await tx
          .select()
          .from(relationshipMessages)
          .where(and(
            eq(relationshipMessages.bindingId, binding.id),
            eq(relationshipMessages.externalMessageId, event.receipt.externalMessageId),
          ))
          .limit(1);
        if (receiptMessage) {
          await tx.insert(relationshipMessageReceipts).values({
            businessId: stored.businessId,
            messageId: receiptMessage.id,
            receiptType: event.receipt.type,
            occurredAt: event.occurredAt,
            metadata: event.receipt.metadata,
          });
          await tx
            .update(relationshipMessages)
            .set({ status: event.receipt.type, updatedAt: new Date() })
            .where(eq(relationshipMessages.id, receiptMessage.id));
        }
      }

      await Promise.all([
        tx.update(relationships).set({
          displayName: relationshipName(event),
          avatarUrl: event.actor.avatarUrl ?? relationship.avatarUrl,
          lastInteractionAt: event.occurredAt,
          updatedAt: new Date(),
        }).where(eq(relationships.id, relationship.id)),
        tx.update(relationshipConversations).set({
          lastMessageAt: event.message ? event.occurredAt : conversation.lastMessageAt,
          updatedAt: new Date(),
        }).where(eq(relationshipConversations.id, conversation.id)),
        tx.update(relationshipConversationBindings).set({
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(relationshipConversationBindings.id, binding.id)),
      ]);

      await tx.insert(relationshipAuditEvents).values({
        businessId: connection.businessId,
        action: "provider_event.ingested",
        targetType: "conversation",
        targetId: conversation.id,
        metadata: { provider: event.provider, eventType: event.eventType, providerEventId: stored.id, relationshipId: relationship.id },
      });

      return { relationship, identity, conversation, binding, message };
    });

    const [providerEvent] = await db
      .update(relationshipProviderEvents)
      .set({ status: "processed", processedAt: new Date(), errorCode: null, errorMessage: null })
      .where(eq(relationshipProviderEvents.id, stored.id))
      .returning();
    await db
      .update(relationshipChannelConnections)
      .set({ lastInboundAt: event.occurredAt, updatedAt: new Date() })
      .where(eq(relationshipChannelConnections.id, connection.id));
    await recordRelationshipAutomationTrigger({ connection, providerEventId: stored.id, event, relationshipId: result.relationship.id, conversationId: result.conversation.id });
    return { duplicate: false, providerEvent, ...result };
  } catch (error) {
    await db
      .update(relationshipProviderEvents)
      .set({
        status: "retrying",
        attemptCount: stored.attemptCount + 1,
        nextAttemptAt: new Date(Date.now() + relationshipDeliveryBackoffMs(stored.attemptCount + 1)),
        errorCode: error instanceof Error ? error.name : "provider_event_error",
        errorMessage: sanitizeRelationshipProviderError(error),
      })
      .where(eq(relationshipProviderEvents.id, stored.id));
    throw error;
  }
}

export async function ingestRelationshipProviderEvent(input: {
  connectionId: string;
  event: unknown;
  rawStorageKey?: string;
}) {
  const event = normalizedRelationshipEventSchema.parse(input.event);
  const connection = await connectionForEvent(input.connectionId);
  if (connection.provider !== event.provider) throw new Error("Provider event does not match its connection");
  const [inserted] = await db
    .insert(relationshipProviderEvents)
    .values({
      businessId: connection.businessId,
      connectionId: connection.id,
      provider: event.provider,
      externalEventId: event.externalEventId,
      eventType: event.eventType,
      payloadHash: hashJson(eventRecord(event)),
      normalizedPayload: eventRecord(event),
      rawStorageKey: input.rawStorageKey ?? null,
      status: "received",
      occurredAt: event.occurredAt,
    })
    .onConflictDoNothing()
    .returning();
  if (!inserted) {
    const [existing] = await db
      .select()
      .from(relationshipProviderEvents)
      .where(and(
        eq(relationshipProviderEvents.connectionId, connection.id),
        eq(relationshipProviderEvents.externalEventId, event.externalEventId),
      ))
      .limit(1);
    if (!existing) throw new Error("Provider event idempotency conflict");
    if (existing.payloadHash !== hashJson(eventRecord(event))) {
      throw new Error("Provider event idempotency key was reused with different content");
    }
    return { duplicate: true, providerEvent: existing };
  }
  return processStoredProviderEvent(inserted.id);
}

export async function ingestRelationshipWebhook(input: {
  connectionId: string;
  rawBody: Buffer;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}) {
  const connection = await connectionForEvent(input.connectionId);
  const adapter = requireRelationshipAdapter(connection.provider);
  const context = connectionContext(connection);
  if (adapter.verifyWebhook) {
    const verified = await adapter.verifyWebhook({ rawBody: input.rawBody, headers: input.headers, context });
    if (!verified) throw new Error("Relationship webhook signature is invalid");
  } else if (connection.provider !== "native" && connection.status !== "testing") {
    throw new Error("Relationship provider does not implement webhook verification");
  }
  const events = await normalizeRelationshipWebhook(adapter, { body: input.body, headers: input.headers, context });
  const results = [];
  for (const event of events) {
    results.push(await ingestRelationshipProviderEvent({ connectionId: connection.id, event }));
  }
  return results;
}

export async function queueRelationshipMessage(input: {
  businessId: string;
  conversationId: string;
  connectionId: string;
  authorUserId: number;
  action: RelationshipOutboundAction;
  authorType?: "human" | "agent" | "automation";
  syntheticMedia?: boolean;
  disclosure?: string;
}) {
  const action = relationshipOutboundActionSchema.parse(input.action);
  return db.transaction(async (tx) => {
    const [connection] = await tx.select().from(relationshipChannelConnections).where(and(
      eq(relationshipChannelConnections.id, input.connectionId),
      eq(relationshipChannelConnections.businessId, input.businessId),
    )).limit(1);
    if (!connection || (connection.status !== "active" && connection.status !== "testing")) {
      throw new Error("Relationship channel connection is not active");
    }
    const adapter = requireRelationshipAdapter(connection.provider);
    const capability = capabilityRequiredForAction(action.actionType);
    if (adapter.capabilities[capability] !== true || connection.capabilities[capability] !== true) {
      throw new Error(`This connection does not support ${capability}`);
    }
    const [binding] = await tx.select().from(relationshipConversationBindings).where(and(
      eq(relationshipConversationBindings.conversationId, input.conversationId),
      eq(relationshipConversationBindings.connectionId, connection.id),
      eq(relationshipConversationBindings.businessId, input.businessId),
    )).limit(1);
    if (!binding) throw new Error("Conversation is not bound to this channel connection");
    if (binding.externalThreadId !== action.externalThreadId) throw new Error("Outbound thread authority mismatch");
    const authoritativeAction = relationshipOutboundActionSchema.parse({
      ...action,
      metadata: {
        ...action.metadata,
        ...binding.metadata,
        senderUserId: input.authorUserId,
      },
    });
    const requestHash = hashJson(authoritativeAction);

    const [existing] = await tx.select().from(relationshipDeliveryJobs).where(and(
      eq(relationshipDeliveryJobs.businessId, input.businessId),
      eq(relationshipDeliveryJobs.idempotencyKey, action.idempotencyKey),
    )).limit(1);
    if (existing) {
      if (existing.requestHash !== requestHash) throw new Error("Message idempotency key was reused with different content");
      const [message] = await tx.select().from(relationshipMessages).where(eq(relationshipMessages.id, existing.messageId)).limit(1);
      return { duplicate: true, job: existing, message };
    }

    const now = new Date();
    const [message] = await tx.insert(relationshipMessages).values({
      businessId: input.businessId,
      conversationId: input.conversationId,
      bindingId: binding.id,
      authorUserId: input.authorUserId,
      provider: connection.provider,
      direction: "outbound",
      authorType: input.authorType ?? "human",
      messageType: authoritativeAction.attachments[0]?.type ?? "text",
      body: authoritativeAction.body,
      bodyFormat: authoritativeAction.bodyFormat,
      status: "queued",
      syntheticMedia: input.syntheticMedia ?? false,
      disclosure: input.disclosure ?? null,
      occurredAt: now,
      metadata: authoritativeAction.metadata,
    }).returning();
    if (authoritativeAction.attachments.length) {
      await tx.insert(relationshipMessageAttachments).values(authoritativeAction.attachments.map((attachment) => ({
        businessId: input.businessId,
        messageId: message.id,
        attachmentType: attachment.type,
        providerMediaId: attachment.externalMediaId ?? null,
        sourceUrl: attachment.sourceUrl ?? null,
        filename: attachment.filename ?? null,
        mimeType: attachment.mimeType ?? null,
        sizeBytes: attachment.sizeBytes ?? null,
        durationMs: attachment.durationMs ?? null,
        scanStatus: "pending",
        metadata: attachment.metadata,
      })));
    }
    const [job] = await tx.insert(relationshipDeliveryJobs).values({
      businessId: input.businessId,
      connectionId: connection.id,
      conversationId: input.conversationId,
      messageId: message.id,
      actionType: action.actionType,
      idempotencyKey: action.idempotencyKey,
      requestHash,
      payload: authoritativeAction,
      status: "queued",
      nextAttemptAt: now,
    }).returning();
    await tx.insert(relationshipAuditEvents).values({
      businessId: input.businessId,
      actorUserId: input.authorUserId,
      action: "message.queued",
      targetType: "relationship_message",
      targetId: message.id,
      metadata: { conversationId: input.conversationId, connectionId: connection.id, provider: connection.provider, authorType: input.authorType ?? "human", syntheticMedia: input.syntheticMedia ?? false },
    });
    await tx.update(relationshipConversations).set({ updatedAt: now }).where(eq(relationshipConversations.id, input.conversationId));
    return { duplicate: false, job, message };
  });
}

export async function processRelationshipDeliveryJob(jobOrId: RelationshipDeliveryJob | string) {
  const jobId = typeof jobOrId === "string" ? jobOrId : jobOrId.id;
  const workerId = `relationship-worker:${process.pid}:${crypto.randomUUID()}`;
  const [claimed] = await db
    .update(relationshipDeliveryJobs)
    .set({ status: "sending", claimedAt: new Date(), claimedBy: workerId, updatedAt: new Date() })
    .where(and(
      eq(relationshipDeliveryJobs.id, jobId),
      inArray(relationshipDeliveryJobs.status, ["queued", "retrying"]),
      lte(relationshipDeliveryJobs.nextAttemptAt, new Date()),
    ))
    .returning();
  if (!claimed) {
    const [existing] = await db.select().from(relationshipDeliveryJobs).where(eq(relationshipDeliveryJobs.id, jobId)).limit(1);
    return existing ?? null;
  }

  const [connection] = await db.select().from(relationshipChannelConnections).where(eq(relationshipChannelConnections.id, claimed.connectionId)).limit(1);
  if (!connection) throw new Error("Relationship delivery connection was removed");
  const adapter = requireRelationshipAdapter(connection.provider);
  const action = relationshipOutboundActionSchema.parse(claimed.payload);
  try {
    const result = await deliverRelationshipAction(adapter, {
      action,
      context: connectionContext(connection),
    });
    const [completed] = await db.transaction(async (tx) => {
      const [updatedJob] = await tx.update(relationshipDeliveryJobs).set({
        status: "completed",
        attemptCount: claimed.attemptCount + 1,
        providerRequestId: result.providerRequestId ?? null,
        providerMessageId: result.externalMessageId,
        errorClass: null,
        errorCode: null,
        errorMessage: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(relationshipDeliveryJobs.id, claimed.id)).returning();
      await tx.update(relationshipMessages).set({
        externalMessageId: result.externalMessageId,
        status: result.status,
        updatedAt: new Date(),
      }).where(eq(relationshipMessages.id, claimed.messageId));
      await tx.insert(relationshipMessageReceipts).values({
        businessId: claimed.businessId,
        messageId: claimed.messageId,
        receiptType: result.status,
        providerReceiptId: result.providerRequestId ?? null,
        occurredAt: result.occurredAt,
        metadata: result.metadata ?? {},
      });
      await tx.update(relationshipChannelConnections).set({ lastOutboundAt: result.occurredAt, updatedAt: new Date() }).where(eq(relationshipChannelConnections.id, connection.id));
      await tx.insert(relationshipAuditEvents).values({ businessId: claimed.businessId, action: "message.delivered", targetType: "relationship_message", targetId: claimed.messageId, metadata: { deliveryJobId: claimed.id, connectionId: connection.id, provider: connection.provider, status: result.status } });
      return [updatedJob];
    });
    return completed;
  } catch (error) {
    const classified = adapter.classifyError(error);
    const attemptCount = claimed.attemptCount + 1;
    const retryable = (classified.errorClass === "retryable" || classified.errorClass === "rate_limited") && attemptCount < claimed.maxAttempts;
    const [failed] = await db.transaction(async (tx) => {
      const [updatedJob] = await tx.update(relationshipDeliveryJobs).set({
        status: retryable ? "retrying" : "dead_letter",
        attemptCount,
        nextAttemptAt: retryable ? new Date(Date.now() + relationshipDeliveryBackoffMs(attemptCount, classified.retryAfterMs)) : claimed.nextAttemptAt,
        claimedAt: null,
        claimedBy: null,
        errorClass: classified.errorClass,
        errorCode: classified.code ?? null,
        errorMessage: sanitizeRelationshipProviderError(error),
        updatedAt: new Date(),
      }).where(eq(relationshipDeliveryJobs.id, claimed.id)).returning();
      await tx.update(relationshipMessages).set({ status: retryable ? "retrying" : "failed", updatedAt: new Date() }).where(eq(relationshipMessages.id, claimed.messageId));
      await tx.update(relationshipChannelConnections).set({
        status: classified.errorClass === "authentication" ? "reauthorization_required" : connection.status,
        lastErrorCode: classified.code ?? classified.errorClass,
        lastErrorMessage: sanitizeRelationshipProviderError(error),
        updatedAt: new Date(),
      }).where(eq(relationshipChannelConnections.id, connection.id));
      return [updatedJob];
    });
    return failed;
  }
}

export async function processDueRelationshipDeliveries(limit = 25) {
  const candidates = await db
    .select()
    .from(relationshipDeliveryJobs)
    .where(and(
      inArray(relationshipDeliveryJobs.status, ["queued", "retrying"]),
      lte(relationshipDeliveryJobs.nextAttemptAt, new Date()),
    ))
    .orderBy(asc(relationshipDeliveryJobs.createdAt))
    .limit(Math.max(limit * 4, limit));
  const perConnection = new Map<string, RelationshipDeliveryJob>();
  for (const job of candidates) {
    if (!perConnection.has(job.connectionId)) perConnection.set(job.connectionId, job);
    if (perConnection.size >= limit) break;
  }
  return Promise.all(Array.from(perConnection.values()).map(processRelationshipDeliveryJob));
}

export async function recoverStaleRelationshipDeliveries(staleAfterMs = 5 * 60_000) {
  const cutoff = new Date(Date.now() - staleAfterMs);
  return db
    .update(relationshipDeliveryJobs)
    .set({ status: "retrying", claimedAt: null, claimedBy: null, nextAttemptAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(relationshipDeliveryJobs.status, "sending"),
      lte(relationshipDeliveryJobs.claimedAt, cutoff),
    ))
    .returning();
}

export async function retryDueRelationshipProviderEvents(limit = 25) {
  const due = await db
    .select({ id: relationshipProviderEvents.id })
    .from(relationshipProviderEvents)
    .where(and(
      inArray(relationshipProviderEvents.status, ["received", "retrying"]),
      lte(relationshipProviderEvents.nextAttemptAt, new Date()),
    ))
    .orderBy(asc(relationshipProviderEvents.receivedAt))
    .limit(limit);
  const results = [];
  for (const event of due) results.push(await processStoredProviderEvent(event.id));
  return results;
}

let relationshipHubTimer: NodeJS.Timeout | undefined;

export function scheduleRelationshipHubProcessing() {
  if (relationshipHubTimer) return;
  const tick = async () => {
    try {
      await recoverStaleRelationshipDeliveries();
      await retryDueRelationshipProviderEvents();
      await processDueRelationshipDeliveries();
    } catch (error) {
      console.error("Relationship Hub processing failed:", sanitizeRelationshipProviderError(error));
    }
  };
  void tick();
  relationshipHubTimer = setInterval(() => void tick(), 5_000);
  relationshipHubTimer.unref();
}
