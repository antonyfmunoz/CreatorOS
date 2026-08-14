import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import {
  conversationParticipants,
  conversations,
  directMessages,
  relationshipNativeDeliveryReceipts,
} from "../shared/schema";
import type { RelationshipChannelAdapter } from "./relationship-channel-adapters";
import { normalizedRelationshipEventSchema } from "./relationship-hub-policy";

function integerMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Native delivery requires ${key}`);
  }
  return value;
}

export const nativeRelationshipCapabilities = {
  "message.receive": true,
  "message.send": true,
  // Native chat supports these operations through its participant-authorized
  // conversation routes. They are deliberately not advertised by the
  // provider-neutral delivery adapter until RelationshipOutboundAction carries
  // their required native message/conversation identifiers and idempotency
  // receipts.
  "message.edit": false,
  "message.delete": false,
  "message.react": false,
  "message.mark_read": false,
  "media.audio": true,
  "media.voice_note": true,
  "receipt.delivered": true,
  "receipt.read": true,
  "outbound.proactive": true,
  "reconcile.history": true,
} as const;

export const nativeRelationshipAdapter: RelationshipChannelAdapter = {
  provider: "native",
  capabilities: nativeRelationshipCapabilities,
  async normalizeWebhook({ body }) {
    return Array.isArray(body)
      ? body.map((event) => normalizedRelationshipEventSchema.parse(event))
      : [normalizedRelationshipEventSchema.parse(body)];
  },
  async deliver({ action, context }) {
    if (action.actionType !== "message.send") {
      throw Object.assign(new Error(`Native adapter does not yet execute ${action.actionType}`), {
        errorClass: "permanent" as const,
        code: "native_action_not_implemented",
      });
    }
    if (action.attachments.length > 1 || (action.attachments[0] && !["audio", "voice_note"].includes(action.attachments[0].type))) {
      throw Object.assign(new Error("Native delivery supports one audio or voice-note attachment"), {
        errorClass: "invalid_content" as const,
        code: "native_attachment_not_supported",
      });
    }
    const nativeConversationId = integerMetadata(action.metadata, "nativeConversationId");
    const senderUserId = integerMetadata(action.metadata, "senderUserId");
    const attachment = action.attachments[0];
    const content = attachment
      ? JSON.stringify({ type: "voice_note", url: attachment.sourceUrl, mimeType: attachment.mimeType, durationMs: attachment.durationMs, disclosure: action.metadata.disclosure, caption: action.body.trim() })
      : action.body.trim();
    if (!content) {
      throw Object.assign(new Error("Native messages require text"), {
        errorClass: "invalid_content" as const,
        code: "native_message_empty",
      });
    }
    const directMessage = await db.transaction(async (tx) => {
      const lockKey = `${context.businessId}:${action.idempotencyKey}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
      const [existing] = await tx
        .select({ message: directMessages })
        .from(relationshipNativeDeliveryReceipts)
        .innerJoin(
          directMessages,
          eq(relationshipNativeDeliveryReceipts.directMessageId, directMessages.id),
        )
        .where(and(
          eq(relationshipNativeDeliveryReceipts.businessId, context.businessId),
          eq(relationshipNativeDeliveryReceipts.idempotencyKey, action.idempotencyKey),
        ))
        .limit(1);
      if (existing) return existing.message;

      const [participant] = await tx
        .select({ id: conversationParticipants.id })
        .from(conversationParticipants)
        .where(and(
          eq(conversationParticipants.conversationId, nativeConversationId),
          eq(conversationParticipants.userId, senderUserId),
        ))
        .limit(1);
      if (!participant) {
        throw Object.assign(new Error("Native sender is not a conversation participant"), {
          errorClass: "permission" as const,
          code: "native_sender_not_participant",
        });
      }
      const [message] = await tx.insert(directMessages).values({
        conversationId: nativeConversationId,
        senderId: senderUserId,
        content,
      }).returning();
      await tx.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, nativeConversationId));
      await tx.insert(relationshipNativeDeliveryReceipts).values({
        businessId: context.businessId,
        idempotencyKey: action.idempotencyKey,
        directMessageId: message.id,
      });
      return message;
    });
    return {
      status: "delivered",
      providerRequestId: action.idempotencyKey,
      externalMessageId: `native:${directMessage.id}`,
      occurredAt: directMessage.sentAt,
      metadata: { directMessageId: directMessage.id },
    };
  },
  async reconcile() {
    return { events: [], hasMore: false };
  },
  async health() {
    return { healthy: true, capabilities: nativeRelationshipCapabilities };
  },
  classifyError(error) {
    const typed = error as Error & { errorClass?: "retryable" | "rate_limited" | "authentication" | "permission" | "invalid_recipient" | "invalid_content" | "policy" | "permanent"; code?: string; retryAfterMs?: number };
    return {
      errorClass: typed.errorClass ?? "retryable",
      code: typed.code,
      retryAfterMs: typed.retryAfterMs,
    };
  },
};
