import { z } from "zod";

export const relationshipCapabilities = [
  "message.receive",
  "message.send",
  "message.edit",
  "message.delete",
  "message.react",
  "message.mark_read",
  "comment.receive",
  "comment.reply",
  "comment.private_reply",
  "comment.hide",
  "media.image",
  "media.video",
  "media.audio",
  "media.voice_note",
  "media.file",
  "receipt.delivered",
  "receipt.read",
  "outbound.proactive",
  "outbound.template_required",
  "reconcile.history",
] as const;

export type RelationshipCapability = (typeof relationshipCapabilities)[number];

export const relationshipEventTypes = [
  "social.comment.created",
  "social.dm.received",
  "social.story.reply.received",
  "social.mention.created",
  "social.reaction.created",
  "message.received",
  "message.updated",
  "message.deleted",
  "message.delivered",
  "message.read",
  "contact.updated",
  "connection.revoked",
] as const;

export type RelationshipEventType = (typeof relationshipEventTypes)[number];

export const relationshipActionTypes = [
  "message.send",
  "message.edit",
  "message.delete",
  "message.react",
  "message.mark_read",
  "comment.reply",
  "comment.private_reply",
  "comment.hide",
] as const;

export type RelationshipActionType = (typeof relationshipActionTypes)[number];

export const relationshipAttachmentSchema = z.object({
  externalMediaId: z.string().trim().min(1).max(500).optional(),
  type: z.enum(["image", "video", "audio", "voice_note", "file"]),
  sourceUrl: z.string().url().max(4_000).optional(),
  filename: z.string().trim().max(500).optional(),
  mimeType: z.string().trim().max(200).optional(),
  sizeBytes: z.number().int().nonnegative().max(2_000_000_000).optional(),
  durationMs: z.number().int().nonnegative().max(86_400_000).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).refine((attachment) => attachment.externalMediaId || attachment.sourceUrl, {
  message: "An attachment needs a provider media ID or source URL",
});

export const normalizedRelationshipEventSchema = z.object({
  version: z.literal("relationship.event.v1"),
  provider: z.string().trim().min(1).max(100),
  externalEventId: z.string().trim().min(1).max(1_000),
  eventType: z.enum(relationshipEventTypes),
  occurredAt: z.coerce.date(),
  actor: z.object({
    providerSubjectId: z.string().trim().min(1).max(1_000),
    address: z.string().trim().max(1_000).optional(),
    username: z.string().trim().max(500).optional(),
    displayName: z.string().trim().max(500).optional(),
    avatarUrl: z.string().url().max(4_000).optional(),
    verified: z.boolean().default(false),
    metadata: z.record(z.string(), z.unknown()).default({}),
  }),
  thread: z.object({
    externalThreadId: z.string().trim().min(1).max(1_000),
    title: z.string().trim().max(500).optional(),
    kind: z.enum(["direct", "group", "comment", "email", "community"]).default("direct"),
    metadata: z.record(z.string(), z.unknown()).default({}),
  }),
  message: z.object({
    externalMessageId: z.string().trim().min(1).max(1_000),
    type: z.enum(["text", "image", "video", "audio", "voice_note", "file", "system"]).default("text"),
    body: z.string().max(100_000).default(""),
    bodyFormat: z.enum(["plain", "markdown", "html"]).default("plain"),
    replyToExternalMessageId: z.string().trim().max(1_000).optional(),
    attachments: z.array(relationshipAttachmentSchema).max(20).default([]),
    metadata: z.record(z.string(), z.unknown()).default({}),
  }).optional(),
  receipt: z.object({
    externalMessageId: z.string().trim().min(1).max(1_000),
    type: z.enum(["accepted", "sent", "delivered", "read", "failed"]),
    metadata: z.record(z.string(), z.unknown()).default({}),
  }).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).superRefine((event, context) => {
  const messageEvent = !event.eventType.startsWith("contact.") && event.eventType !== "connection.revoked";
  if (messageEvent && !event.message && !event.receipt) {
    context.addIssue({ code: "custom", message: "Messaging events need a message or receipt" });
  }
});

export type NormalizedRelationshipEvent = z.infer<typeof normalizedRelationshipEventSchema>;

export const relationshipOutboundActionSchema = z.object({
  version: z.literal("relationship.action.v1"),
  actionType: z.enum(relationshipActionTypes),
  idempotencyKey: z.string().trim().min(8).max(500),
  externalThreadId: z.string().trim().min(1).max(1_000),
  body: z.string().max(100_000).default(""),
  bodyFormat: z.enum(["plain", "markdown", "html"]).default("plain"),
  replyToExternalMessageId: z.string().trim().max(1_000).optional(),
  attachments: z.array(relationshipAttachmentSchema).max(20).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type RelationshipOutboundAction = z.infer<typeof relationshipOutboundActionSchema>;

const actionCapability: Record<RelationshipActionType, RelationshipCapability> = {
  "message.send": "message.send",
  "message.edit": "message.edit",
  "message.delete": "message.delete",
  "message.react": "message.react",
  "message.mark_read": "message.mark_read",
  "comment.reply": "comment.reply",
  "comment.private_reply": "comment.private_reply",
  "comment.hide": "comment.hide",
};

export function capabilityRequiredForAction(action: RelationshipActionType) {
  return actionCapability[action];
}

export function assertRelationshipCapability(
  capabilities: Partial<Record<RelationshipCapability, boolean>>,
  actionType: RelationshipActionType,
) {
  const capability = capabilityRequiredForAction(actionType);
  if (capabilities[capability] !== true) {
    throw new Error(`This connection does not support ${capability}`);
  }
}

export type RelationshipProviderErrorClass =
  | "retryable"
  | "rate_limited"
  | "authentication"
  | "permission"
  | "invalid_recipient"
  | "invalid_content"
  | "policy"
  | "permanent";

export function relationshipDeliveryBackoffMs(attempt: number, retryAfterMs?: number) {
  if (retryAfterMs && retryAfterMs > 0) return Math.min(retryAfterMs, 24 * 60 * 60_000);
  return Math.min(1_000 * 2 ** Math.max(0, attempt - 1), 60 * 60_000);
}

export function sanitizeRelationshipProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [redacted]")
    .replace(/(?:token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 1_000);
}

export const voiceUseCases = [
  "relationship_follow_up",
  "customer_support",
  "community_update",
  "meeting_recap",
  "sales_follow_up",
] as const;

export const prohibitedVoiceUseCases = [
  "authentication",
  "financial_transfer_instruction",
  "legal_consent",
  "medical_direction",
  "emergency_instruction",
  "political_persuasion",
  "impersonation",
] as const;

export function assertVoiceGenerationAllowed(input: {
  ownershipVerified: boolean;
  consentActive: boolean;
  revoked: boolean;
  useCase: string;
  approvedByUserId?: number | null;
  sourceType: string;
}) {
  if (!input.ownershipVerified) throw new Error("Voice ownership must be verified");
  if (!input.consentActive || input.revoked) throw new Error("Voice consent is not active");
  if ((prohibitedVoiceUseCases as readonly string[]).includes(input.useCase)) {
    throw new Error("This voice use case is prohibited");
  }
  if (input.sourceType !== "human" && !input.approvedByUserId) {
    throw new Error("AI-authored voice messages require human approval");
  }
}
