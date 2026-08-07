import { db } from "./db";
import { automationActionReceipts, campaigns, contentDrafts, notifications } from "../shared/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export type AutomationActionContext = {
  runId: string;
  stepRunId: string;
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
