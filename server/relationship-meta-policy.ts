import { z } from "zod";
import type { RelationshipOutboundAction } from "./relationship-hub-policy";

export const META_STANDARD_REPLY_WINDOW_MS = 24 * 60 * 60_000;
export const INSTAGRAM_PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60_000;

const whatsappTemplateParameterSchema = z.record(z.string(), z.unknown());

const whatsappTemplateComponentSchema = z.object({
  type: z.enum(["header", "body", "button"]),
  sub_type: z.string().trim().min(1).max(100).optional(),
  index: z.union([z.string(), z.number().int().nonnegative()]).optional(),
  parameters: z.array(whatsappTemplateParameterSchema).max(20).optional(),
}).strict();

export const whatsappTemplateSchema = z.object({
  name: z.string().trim().min(1).max(512).regex(/^[a-z0-9_]+$/),
  languageCode: z.string().trim().min(2).max(35),
  components: z.array(whatsappTemplateComponentSchema).max(20).optional(),
}).strict();

export type WhatsAppTemplateSelection = z.infer<typeof whatsappTemplateSchema>;

export function whatsappTemplateFromAction(action: RelationshipOutboundAction) {
  const candidate = action.metadata.whatsappTemplate;
  if (candidate == null) return null;
  return whatsappTemplateSchema.parse(candidate);
}

function policyError(message: string, code: string) {
  return Object.assign(new Error(message), {
    errorClass: "policy" as const,
    code,
  });
}

function isWithinWindow(occurredAt: Date | null | undefined, windowMs: number, now: Date) {
  if (!occurredAt) return false;
  const age = now.getTime() - occurredAt.getTime();
  return age >= 0 && age <= windowMs;
}

export function assertMetaOutboundPolicy(input: {
  provider: string;
  action: RelationshipOutboundAction;
  latestInboundAt?: Date | null;
  now?: Date;
}) {
  const provider = input.provider.trim().toLowerCase();
  const now = input.now ?? new Date();

  if (provider === "instagram" && input.action.actionType === "comment.private_reply") {
    if (!isWithinWindow(input.latestInboundAt, INSTAGRAM_PRIVATE_REPLY_WINDOW_MS, now)) {
      throw policyError(
        "Instagram private replies must be sent within seven days of the original comment",
        "instagram_private_reply_window_closed",
      );
    }
    return;
  }

  if (input.action.actionType !== "message.send") return;

  if (provider === "whatsapp" && whatsappTemplateFromAction(input.action)) return;

  if (["instagram", "messenger", "whatsapp"].includes(provider) && !isWithinWindow(input.latestInboundAt, META_STANDARD_REPLY_WINDOW_MS, now)) {
    const message = provider === "whatsapp"
      ? "The WhatsApp customer-service window is closed; send an approved template instead"
      : `The ${provider === "instagram" ? "Instagram" : "Messenger"} standard reply window is closed`;
    throw policyError(message, `${provider}_reply_window_closed`);
  }
}

export function whatsappTemplatePayload(action: RelationshipOutboundAction) {
  const template = whatsappTemplateFromAction(action);
  if (!template) return null;
  return {
    type: "template" as const,
    template: {
      name: template.name,
      language: { code: template.languageCode },
      ...(template.components?.length ? { components: template.components } : {}),
    },
  };
}
