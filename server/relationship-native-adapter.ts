import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import {
  conversationReadStates,
  conversationParticipants,
  conversations,
  directMessages,
  relationshipNativeActionReceipts,
  relationshipNativeDeliveryReceipts,
} from "../shared/schema";
import type {
  RelationshipChannelAdapter,
  RelationshipDeliveryResult,
} from "./relationship-channel-adapters";
import {
  normalizedRelationshipEventSchema,
  type RelationshipOutboundAction,
} from "./relationship-hub-policy";

function integerMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Native delivery requires ${key}`);
  }
  return value;
}

function nativeTargetMessageId(action: RelationshipOutboundAction) {
  const match = /^native:(\d+)$/.exec(action.targetExternalMessageId ?? "");
  const value = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw Object.assign(new Error("Native message actions require a native target message"), {
      errorClass: "invalid_content" as const,
      code: "native_target_message_invalid",
    });
  }
  return value;
}

function nativeActionRequestHash(action: RelationshipOutboundAction) {
  return crypto.createHash("sha256").update(JSON.stringify(action)).digest("hex");
}

function serializeNativeResult(result: RelationshipDeliveryResult) {
  return {
    ...result,
    occurredAt: result.occurredAt.toISOString(),
  } satisfies Record<string, unknown>;
}

function restoreNativeResult(result: Record<string, unknown>): RelationshipDeliveryResult {
  const status = result.status;
  const externalMessageId = result.externalMessageId;
  const occurredAt = new Date(String(result.occurredAt ?? ""));
  if (
    !["accepted", "sent", "delivered"].includes(String(status)) ||
    typeof externalMessageId !== "string" ||
    !externalMessageId ||
    Number.isNaN(occurredAt.getTime())
  ) {
    throw new Error("Native action receipt is invalid");
  }
  return {
    status: status as RelationshipDeliveryResult["status"],
    providerRequestId:
      typeof result.providerRequestId === "string"
        ? result.providerRequestId
        : undefined,
    externalMessageId,
    occurredAt,
    metadata:
      result.metadata && typeof result.metadata === "object"
        ? (result.metadata as Record<string, unknown>)
        : undefined,
  };
}

export const nativeRelationshipCapabilities = {
  "message.receive": true,
  "message.send": true,
  "message.edit": true,
  "message.delete": true,
  "message.react": true,
  "message.mark_read": true,
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
    const nativeConversationId = integerMetadata(action.metadata, "nativeConversationId");
    const senderUserId = integerMetadata(action.metadata, "senderUserId");
    if (action.externalThreadId !== `native:${nativeConversationId}`) {
      throw Object.assign(new Error("Native thread authority mismatch"), {
        errorClass: "permission" as const,
        code: "native_thread_authority_mismatch",
      });
    }

    if (action.actionType !== "message.send") {
      const targetMessageId = nativeTargetMessageId(action);
      const requestHash = nativeActionRequestHash(action);
      return db.transaction(async (tx) => {
        const lockKey = `${context.businessId}:${action.idempotencyKey}`;
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
        const [receipt] = await tx
          .select()
          .from(relationshipNativeActionReceipts)
          .where(and(
            eq(relationshipNativeActionReceipts.businessId, context.businessId),
            eq(relationshipNativeActionReceipts.idempotencyKey, action.idempotencyKey),
          ))
          .limit(1);
        if (receipt) {
          if (receipt.requestHash !== requestHash) {
            throw Object.assign(new Error("Native action idempotency key was reused with different input"), {
              errorClass: "invalid_content" as const,
              code: "native_idempotency_conflict",
            });
          }
          return restoreNativeResult(receipt.result);
        }

        const [participant] = await tx
          .select({ id: conversationParticipants.id })
          .from(conversationParticipants)
          .where(and(
            eq(conversationParticipants.conversationId, nativeConversationId),
            eq(conversationParticipants.userId, senderUserId),
          ))
          .limit(1);
        if (!participant) {
          throw Object.assign(new Error("Native actor is not a conversation participant"), {
            errorClass: "permission" as const,
            code: "native_actor_not_participant",
          });
        }
        const [target] = await tx
          .select()
          .from(directMessages)
          .where(eq(directMessages.id, targetMessageId))
          .limit(1);
        if (!target || target.conversationId !== nativeConversationId) {
          throw Object.assign(new Error("Native target message is outside this conversation"), {
            errorClass: "permission" as const,
            code: "native_target_outside_conversation",
          });
        }
        if (
          ["message.edit", "message.delete"].includes(action.actionType) &&
          target.senderId !== senderUserId
        ) {
          throw Object.assign(new Error("Native actors can only change their own messages"), {
            errorClass: "permission" as const,
            code: "native_target_not_owned",
          });
        }

        const occurredAt = new Date();
        let metadata: Record<string, unknown> = {
          actionType: action.actionType,
          nativeConversationId,
          nativeMessageId: target.id,
          actorUserId: senderUserId,
        };
        if (action.actionType === "message.edit") {
          await tx
            .update(directMessages)
            .set({ content: action.body.trim(), isEdited: true })
            .where(eq(directMessages.id, target.id));
        } else if (action.actionType === "message.delete") {
          await tx.delete(directMessages).where(eq(directMessages.id, target.id));
        } else if (action.actionType === "message.react") {
          const reactions = {
            ...((target.reactions as Record<string, string> | null) ?? {}),
          };
          const actorKey = String(senderUserId);
          if (reactions[actorKey] === action.reaction) delete reactions[actorKey];
          else reactions[actorKey] = action.reaction!;
          await tx
            .update(directMessages)
            .set({ reactions })
            .where(eq(directMessages.id, target.id));
          metadata = { ...metadata, reaction: action.reaction, reactions };
        } else if (action.actionType === "message.mark_read") {
          await tx
            .insert(conversationReadStates)
            .values({
              conversationId: nativeConversationId,
              userId: senderUserId,
              lastReadMessageId: target.id,
              updatedAt: occurredAt,
            })
            .onConflictDoUpdate({
              target: [
                conversationReadStates.conversationId,
                conversationReadStates.userId,
              ],
              set: {
                lastReadMessageId: sql`greatest(${conversationReadStates.lastReadMessageId}, ${target.id})`,
                updatedAt: occurredAt,
              },
            });
        } else {
          throw Object.assign(new Error(`Native adapter does not execute ${action.actionType}`), {
            errorClass: "permanent" as const,
            code: "native_action_not_supported",
          });
        }

        const result: RelationshipDeliveryResult = {
          status: "delivered",
          providerRequestId: action.idempotencyKey,
          externalMessageId: `native:${target.id}`,
          occurredAt,
          metadata,
        };
        await tx.insert(relationshipNativeActionReceipts).values({
          businessId: context.businessId,
          idempotencyKey: action.idempotencyKey,
          actionType: action.actionType,
          requestHash,
          targetDirectMessageId:
            action.actionType === "message.delete" ? null : target.id,
          result: serializeNativeResult(result),
        });
        return result;
      });
    }

    if (action.attachments.length > 1 || (action.attachments[0] && !["audio", "voice_note"].includes(action.attachments[0].type))) {
      throw Object.assign(new Error("Native delivery supports one audio or voice-note attachment"), {
        errorClass: "invalid_content" as const,
        code: "native_attachment_not_supported",
      });
    }
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
