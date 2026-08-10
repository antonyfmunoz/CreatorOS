import { db } from "./db";
import {
  automationActionReceipts,
  automationContactStates,
  automationTriggerEvents,
  campaigns,
  comments,
  contentDrafts,
  conversationParticipants,
  conversations,
  directMessages,
  notifications,
  posts,
} from "../shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { NATIVE_COMMENT_CREATED_EVENT, NATIVE_DM_RECEIVED_EVENT } from "./social-automation";

export type AutomationActionContext = {
  runId: string;
  stepRunId: string;
  triggerEventId: string | null;
  ownerUserId: number;
  businessId: string | null;
  input: Record<string, unknown>;
  previousOutput: Record<string, unknown>;
  config: Record<string, unknown>;
};

export type AutomationActionResult = {
  output: Record<string, unknown>;
  costUnits: number;
  summary: string;
};

export type AutomationActionDefinition = {
  type: string;
  label: string;
  description: string;
  consequential: boolean;
  defaultCostUnits: number;
  execute: (context: AutomationActionContext) => Promise<AutomationActionResult>;
};

function renderTemplate(template: string, values: Record<string, unknown>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = key.split(".").reduce<unknown>((current, part) => {
      if (!current || typeof current !== "object") return undefined;
      return (current as Record<string, unknown>)[part];
    }, values);
    return value == null ? "" : String(value);
  });
}

const composeSchema = z.object({ template: z.string().min(1).max(20_000) });
const notificationSchema = z.object({
  message: z.string().min(1).max(1_000),
  linkTo: z.string().max(500).optional(),
  type: z.string().max(80).default("automation"),
});
const draftSchema = z.object({
  content: z.string().max(20_000).default(""),
  kind: z.enum(["post", "story", "video", "audio", "article"]).default("post"),
  audience: z.enum(["public", "followers", "community", "private"]).default("public"),
});
const campaignSchema = z.object({
  name: z.string().min(1).max(120),
  objective: z.string().max(120).default("awareness"),
  channel: z.string().max(120).default("organic"),
  description: z.string().max(2_000).default(""),
});
const nativeCommentReplySchema = z.object({
  content: z.string().trim().min(1).max(2_000),
});
const nativeDmSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
  cooldownMinutes: z.number().int().min(0).max(10_080).default(0),
});

function requiredInputInteger(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Native messaging action requires ${key}`);
  }
  return value;
}

async function requireNativeSocialEvent(context: AutomationActionContext, allowedEventTypes: string[]) {
  if (!context.triggerEventId) throw new Error("Native social actions require a verified inbound event");
  const [event] = await db.select().from(automationTriggerEvents).where(eq(automationTriggerEvents.id, context.triggerEventId)).limit(1);
  if (!event || event.ownerUserId !== context.ownerUserId || !allowedEventTypes.includes(event.eventType)) {
    throw new Error("Native social action event authority is invalid");
  }
  if (event.payload.actorUserId !== context.input.actorUserId) throw new Error("Native social action contact does not match its inbound event");
  return event;
}

async function directConversationId(ownerUserId: number, contactUserId: number, requestedConversationId: unknown) {
  if (typeof requestedConversationId === "number" && Number.isInteger(requestedConversationId)) {
    const participants = await db.select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, requestedConversationId));
    const ids = new Set(participants.map((participant) => participant.userId));
    if (!ids.has(ownerUserId) || !ids.has(contactUserId)) throw new Error("Automation cannot use a conversation outside its participants");
    return requestedConversationId;
  }

  const ownerRows = await db.select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.userId, ownerUserId));
  if (ownerRows.length === 0) return null;
  const ownerConversationIds = ownerRows.map((row) => row.conversationId);
  const candidates = await db.select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
    .where(and(
      eq(conversationParticipants.userId, contactUserId),
      inArray(conversationParticipants.conversationId, ownerConversationIds),
      eq(conversations.isGroup, false),
    ));
  return candidates[0]?.conversationId ?? null;
}

const actions: AutomationActionDefinition[] = [
  {
    type: "text.compose",
    label: "Compose text",
    description: "Create deterministic text from run input and prior step output.",
    consequential: false,
    defaultCostUnits: 1,
    async execute(context) {
      const config = composeSchema.parse(context.config);
      const content = renderTemplate(config.template, {
        input: context.input,
        previous: context.previousOutput,
      });
      return { output: { content }, costUnits: 1, summary: "Text composed" };
    },
  },
  {
    type: "notification.create",
    label: "Create notification",
    description: "Send an in-app notification to the workflow owner.",
    consequential: false,
    defaultCostUnits: 1,
    async execute(context) {
      const [receipt] = await db.select().from(automationActionReceipts).where(eq(automationActionReceipts.stepRunId, context.stepRunId)).limit(1);
      if (receipt) return { output: receipt.output, costUnits: receipt.costUnits, summary: receipt.summary };
      const config = notificationSchema.parse(context.config);
      const message = renderTemplate(config.message, { input: context.input, previous: context.previousOutput });
      return db.transaction(async (tx) => {
        const [created] = await tx.insert(notifications).values({
          userId: context.ownerUserId,
          type: config.type,
          message,
          linkTo: config.linkTo,
          sourceType: "automation_step",
          sourceId: context.stepRunId,
        }).onConflictDoNothing().returning();
        const notification = created ?? (await tx.select().from(notifications).where(and(eq(notifications.sourceType, "automation_step"), eq(notifications.sourceId, context.stepRunId))).limit(1))[0];
        const output = { notificationId: notification?.id ?? null, message };
        await tx.insert(automationActionReceipts).values({ stepRunId: context.stepRunId, actionType: "notification.create", output, summary: "Notification created", costUnits: 1 });
        return { output, costUnits: 1, summary: "Notification created" };
      });
    },
  },
  {
    type: "content_draft.create",
    label: "Create content draft",
    description: "Create an editable CreativesOS draft without publishing it.",
    consequential: false,
    defaultCostUnits: 2,
    async execute(context) {
      const [receipt] = await db.select().from(automationActionReceipts).where(eq(automationActionReceipts.stepRunId, context.stepRunId)).limit(1);
      if (receipt) return { output: receipt.output, costUnits: receipt.costUnits, summary: receipt.summary };
      const config = draftSchema.parse(context.config);
      const content = renderTemplate(config.content, { input: context.input, previous: context.previousOutput });
      return db.transaction(async (tx) => {
        const [draft] = await tx.insert(contentDrafts).values({
          userId: context.ownerUserId,
          businessId: context.businessId,
          kind: config.kind,
          content,
          audience: config.audience,
          status: "draft",
        }).returning();
        const output = { draftId: draft.id, content };
        await tx.insert(automationActionReceipts).values({ stepRunId: context.stepRunId, actionType: "content_draft.create", output, summary: "Draft created", costUnits: 2 });
        return { output, costUnits: 2, summary: "Draft created" };
      });
    },
  },
  {
    type: "campaign.create",
    label: "Create campaign",
    description: "Create a campaign plan. This requires explicit approval.",
    consequential: true,
    defaultCostUnits: 3,
    async execute(context) {
      const [receipt] = await db.select().from(automationActionReceipts).where(eq(automationActionReceipts.stepRunId, context.stepRunId)).limit(1);
      if (receipt) return { output: receipt.output, costUnits: receipt.costUnits, summary: receipt.summary };
      if (!context.businessId) throw new Error("Campaign actions require a business workspace");
      const businessId = context.businessId;
      const config = campaignSchema.parse(context.config);
      return db.transaction(async (tx) => {
        const [campaign] = await tx.insert(campaigns).values({
          businessId,
          ownerUserId: context.ownerUserId,
          name: renderTemplate(config.name, { input: context.input, previous: context.previousOutput }),
          objective: config.objective,
          channel: config.channel,
          description: config.description,
          status: "draft",
        }).returning();
        const output = { campaignId: campaign.id, name: campaign.name };
        await tx.insert(automationActionReceipts).values({ stepRunId: context.stepRunId, actionType: "campaign.create", output, summary: "Campaign created", costUnits: 3 });
        return { output, costUnits: 3, summary: "Campaign created" };
      });
    },
  },
  {
    type: "native.comment.reply",
    label: "Reply to native comment",
    description: "Reply from the post owner to the CreativesOS comment that triggered this run.",
    consequential: true,
    defaultCostUnits: 1,
    async execute(context) {
      const [receipt] = await db.select().from(automationActionReceipts).where(eq(automationActionReceipts.stepRunId, context.stepRunId)).limit(1);
      if (receipt) return { output: receipt.output, costUnits: receipt.costUnits, summary: receipt.summary };
      const config = nativeCommentReplySchema.parse(context.config);
      await requireNativeSocialEvent(context, [NATIVE_COMMENT_CREATED_EVENT]);
      const commentId = requiredInputInteger(context.input, "commentId");
      const postId = requiredInputInteger(context.input, "postId");
      const content = renderTemplate(config.content, { input: context.input, previous: context.previousOutput });
      const [source] = await db.select({ commentId: comments.id, postId: comments.postId, postOwnerUserId: posts.userId })
        .from(comments)
        .innerJoin(posts, eq(posts.id, comments.postId))
        .where(eq(comments.id, commentId))
        .limit(1);
      if (!source || source.postId !== postId || source.postOwnerUserId !== context.ownerUserId) {
        throw new Error("Automation can only reply to comments on the owner's post");
      }
      return db.transaction(async (tx) => {
        const [reply] = await tx.insert(comments).values({ postId, userId: context.ownerUserId, parentId: commentId, content }).returning();
        const output = { commentId: reply.id, parentId: commentId, postId, content };
        await tx.insert(automationActionReceipts).values({ stepRunId: context.stepRunId, actionType: "native.comment.reply", output, summary: "Comment reply sent", costUnits: 1 });
        return { output, costUnits: 1, summary: "Comment reply sent" };
      });
    },
  },
  {
    type: "native.dm.send",
    label: "Send native direct message",
    description: "Send a governed CreativesOS DM to the person who triggered this run.",
    consequential: true,
    defaultCostUnits: 1,
    async execute(context) {
      const [receipt] = await db.select().from(automationActionReceipts).where(eq(automationActionReceipts.stepRunId, context.stepRunId)).limit(1);
      if (receipt) return { output: receipt.output, costUnits: receipt.costUnits, summary: receipt.summary };
      const config = nativeDmSchema.parse(context.config);
      await requireNativeSocialEvent(context, [NATIVE_COMMENT_CREATED_EVENT, NATIVE_DM_RECEIVED_EVENT]);
      const contactUserId = requiredInputInteger(context.input, "actorUserId");
      if (contactUserId === context.ownerUserId) throw new Error("Automation cannot direct-message its owner");
      const content = renderTemplate(config.content, { input: context.input, previous: context.previousOutput });
      let conversationId = await directConversationId(context.ownerUserId, contactUserId, context.input.conversationId);
      const [state] = await db.select().from(automationContactStates).where(and(
        eq(automationContactStates.ownerUserId, context.ownerUserId),
        eq(automationContactStates.contactUserId, contactUserId),
        eq(automationContactStates.channel, "native"),
      )).limit(1);
      if (state?.optedOut) {
        const output = { sent: false, reason: "contact_opted_out", contactUserId };
        await db.insert(automationActionReceipts).values({ stepRunId: context.stepRunId, actionType: "native.dm.send", output, summary: "DM skipped because contact opted out", costUnits: 0 });
        return { output, costUnits: 0, summary: "DM skipped because contact opted out" };
      }
      if (state?.cooldownUntil && state.cooldownUntil > new Date()) {
        const output = { sent: false, reason: "contact_cooldown", contactUserId, cooldownUntil: state.cooldownUntil.toISOString() };
        await db.insert(automationActionReceipts).values({ stepRunId: context.stepRunId, actionType: "native.dm.send", output, summary: "DM skipped during contact cooldown", costUnits: 0 });
        return { output, costUnits: 0, summary: "DM skipped during contact cooldown" };
      }

      return db.transaction(async (tx) => {
        if (!conversationId) {
          const [conversation] = await tx.insert(conversations).values({ isGroup: false }).returning();
          conversationId = conversation.id;
          await tx.insert(conversationParticipants).values([
            { conversationId, userId: context.ownerUserId, isAdmin: false },
            { conversationId, userId: contactUserId, isAdmin: false },
          ]);
        }
        const [message] = await tx.insert(directMessages).values({ conversationId, senderId: context.ownerUserId, content }).returning();
        const now = new Date();
        const cooldownUntil = config.cooldownMinutes > 0 ? new Date(now.getTime() + config.cooldownMinutes * 60_000) : null;
        await tx.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, conversationId));
        await tx.insert(automationContactStates).values({
          ownerUserId: context.ownerUserId,
          contactUserId,
          channel: "native",
          conversationId,
          optedOut: false,
          lastOutboundAt: now,
          cooldownUntil,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: [automationContactStates.ownerUserId, automationContactStates.contactUserId, automationContactStates.channel],
          set: { conversationId, lastOutboundAt: now, cooldownUntil, updatedAt: now },
        });
        const output = { sent: true, messageId: message.id, conversationId, contactUserId, content };
        await tx.insert(automationActionReceipts).values({ stepRunId: context.stepRunId, actionType: "native.dm.send", output, summary: "Direct message sent", costUnits: 1 });
        return { output, costUnits: 1, summary: "Direct message sent" };
      });
    },
  },
];

const actionRegistry = new Map(actions.map((action) => [action.type, action]));

export function listAutomationActions() {
  return actions.map(({ execute: _execute, ...action }) => action);
}

export function getAutomationAction(type: string) {
  return actionRegistry.get(type);
}

export async function executeAutomationAction(type: string, context: AutomationActionContext) {
  const action = getAutomationAction(type);
  if (!action) throw new Error(`Unsupported automation action: ${type}`);
  return action.execute(context);
}
